import Docker from 'dockerode';
import { connectWithRetry, setupDatabase } from './db_tools.js';
import Arweave from 'arweave';
import { checkAndFetchIfNeeded, cleanupFulfilledEntries, getProviderRequests, processChallengeRequests, processOutputRequests, shutdown, initializeAutoUpdateTimer } from './helperFunctions.js';
import { monitorDockerContainers } from './containerManagment.js';
import logger, { LogLevel, Logger } from './logger';
import { monitoring } from './monitoring';

export const docker = new Docker();
export const DOCKER_NETWORK = process.env.DOCKER_NETWORK || "backend";
export const TIME_PUZZLE_JOB_IMAGE = 'randao/puzzle-gen:v0.1.5';

export const DOCKER_MONITORING_TIME= 30000;
export const POLLING_INTERVAL_MS = 0; //0 second
export const DATABASE_CHECK_TIME = 60000; //60 seconds
export const MINIMUM_ENTRIES = 5000;
export const DRYRUNTIMEOUT = 30000; // 30 seconds
export const MAX_RETRIES = 10;
export const RETRY_DELAY_MS = 10000;
export const COMPLETION_RETENTION_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
export const UNCHAIN_VS_OFFCHAIN_MAX_DIF = 50;

let PROVIDER_ID = "";
let pollingInProgress = false;
let lastPollingId: string | null = null;

const arweave = Arweave.init({});

interface StepTracking {
    step1?: { completed: boolean; timeTaken: number };
    step2?: { completed: boolean; timeTaken: number };
    step3?: { completed: boolean; timeTaken: number };
    step4?: { completed: boolean; timeTaken: number };
}
let stepTracking: StepTracking = {}; // Tracks the status and time for each step

// Function to reset step tracking data
function resetStepTracking() {
    stepTracking = {
        step1: { completed: false, timeTaken: 0 },
        step2: { completed: false, timeTaken: 0 },
        step3: { completed: false, timeTaken: 0 },
        step4: { completed: false, timeTaken: 0 },
    };
}

function getLogId(): string {
    const randomId = Math.floor(10000 + Math.random() * 90000); // 5-digit random number
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false }); // HH:MM:SS format
    return `[LogID: ${randomId} | ${timestamp}]`;
}

async function polling(client: any) {
    if (pollingInProgress) {
        const completedSteps = Object.entries(stepTracking)
            .filter(([_, data]) => data?.completed)
            .map(([step, data]) => `${step} (Time: ${data?.timeTaken}ms)`);

        logger.debug(`\n[SKIPPED] Polling already in progress for ${lastPollingId}. Skipping this run.`);
        logger.debug(`Completed steps so far: ${completedSteps.length > 0 ? completedSteps.join(", ") : "None"}`);
        logger.verbose("Current step tracking status:", stepTracking); // Debugging info to inspect tracking object
        return; // Prevent concurrent execution
    }

    resetStepTracking(); // Reset step tracking for fresh polling
    pollingInProgress = true; // Mark polling as in progress
    const logId = getLogId();
    lastPollingId = logId;
    logger.info(`${logId} Starting Polling...`);

    try {
        const startTime = Date.now(); // Start time of polling

        // Step 1: Fetch open requests
        const s1 = Date.now();
        logger.debug(`${logId} Step 1 started.`);
        const openRequests = await getProviderRequests(PROVIDER_ID, logId);
        const timeTaken = Date.now() - s1;
        stepTracking.step1 = { completed: true, timeTaken };
        // Update monitoring with step timing
        monitoring.updateStepTiming('step1', timeTaken);
        logger.debug(`${logId} Step 1: Open requests fetched. Time taken: ${stepTracking.step1.timeTaken}ms`);

        // Run Step 2, 3, and 4 concurrently
        await Promise.all([
            (async () => {
                const s2 = Date.now();
                logger.debug(`${logId} Step 2 started.`);
                await processChallengeRequests(client, openRequests.activeChallengeRequests, logId);
                const timeTaken = Date.now() - s2;
                stepTracking.step2 = { completed: true, timeTaken };
                // Update monitoring with step timing
                monitoring.updateStepTiming('step2', timeTaken);
                logger.debug(`${logId} Step 2 completed. Time taken: ${stepTracking.step2.timeTaken}ms`);
            })(),
            (async () => {
                const s3 = Date.now();
                logger.debug(`${logId} Step 3 started.`);
                await processOutputRequests(client, openRequests.activeOutputRequests, logId);
                const timeTaken = Date.now() - s3;
                stepTracking.step3 = { completed: true, timeTaken };
                // Update monitoring with step timing
                monitoring.updateStepTiming('step3', timeTaken);
                logger.debug(`${logId} Step 3 completed. Time taken: ${stepTracking.step3.timeTaken}ms`);
            })(),
            (async () => {
                const s4 = Date.now();
                logger.debug(`${logId} Step 4 started.`);
                //TODO enable this again later
                await cleanupFulfilledEntries(client, openRequests, logId);
                await checkAndFetchIfNeeded(client)
                const timeTaken = Date.now() - s4;
                stepTracking.step4 = { completed: true, timeTaken };
                // Update monitoring with step timing
                monitoring.updateStepTiming('step4', timeTaken);
                logger.debug(`${logId} Step 4 completed. Time taken: ${stepTracking.step4.timeTaken}ms`);
            })(),
        ]);

        const totalTime = Date.now() - startTime;
        // Update overall step timing in monitoring
        monitoring.updateStepTiming('overall', totalTime);
        logger.info(`${logId} Polling cycle completed successfully. Total time taken: ${totalTime}ms`);

    } catch (error) {
        logger.error(`${logId} An error occurred during polling:`, error);
        // Increment error count in monitoring
        monitoring.incrementErrorCount();
    } finally {
        pollingInProgress = false; // Reset flag after execution
    }
}

// Main function
async function run(): Promise<void> {
    // Initialize logger from environment variables
    logger.info("Orchestrator starting up");
    logger.debug("Environment variables loaded, initializing services");
    
    const client = await connectWithRetry();
    await setupDatabase(client);
    
    // Get database entry count on startup
    try {
        const res = await client.query('SELECT COUNT(*) as count FROM time_lock_puzzles WHERE request_id IS NULL');
        const entriesAvailable = parseInt(res.rows[0].count, 10);
        logger.info(`Initial database entry count: ${entriesAvailable}`);
    } catch (error) {
        logger.error("Error getting initial database count:", error);
    }

    arweave.wallets.jwkToAddress(JSON.parse(process.env.WALLET_JSON!)).then((address) => {
        logger.info(`Provider ID: ${address}`);
        PROVIDER_ID = address;
        
        // Initialize auto-update timer for provider values
        initializeAutoUpdateTimer();
    });

    // setInterval(async () => {
    //     const res = await client.query('SELECT COUNT(*) as count FROM time_lock_puzzles');
    //     logger.debug(`Periodic log - Current database size: ${res.rows[0].count}`);
    //     // Check and fetch entries for the database if needed
    //     logger.debug("Step 0: Checking and fetching database entries if below threshold.");
    //     checkAndFetchIfNeeded(client, PROVIDER_ID).catch((error) => {
    //         logger.error("Error in checkAndFetchIfNeeded:", error);
    //     });
    // }, DATABASE_CHECK_TIME);

    setInterval(async () => {
        await monitorDockerContainers();
    }, DOCKER_MONITORING_TIME); // Cleanup every 30 seconds

    setInterval(async () => {
        await polling(client);
    }, POLLING_INTERVAL_MS);

    process.on("SIGTERM", async () => {
        logger.info("SIGTERM received. Shutting down gracefully.");
        await client.end();
        await shutdown();
        await Logger.close(); // Use the static close method on the Logger class
        process.exit(0);
    });
}

run().catch((err) => logger.error(`Error in main function: ${err}`));
