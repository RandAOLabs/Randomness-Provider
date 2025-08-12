import Docker from 'dockerode';
import { connectWithRetry, setupDatabase, performDatabaseMaintenance, performAggressiveCleanup } from './db_tools.js';
import Arweave from "arweave";
import { getWalletAddress, ensureWalletConfiguration } from "./walletUtils";
import { checkAndFetchIfNeeded, cleanupFulfilledEntries, crank, getProviderRequests, processChallengeRequests, processOutputRequests, gracefulShutdown } from './helperFunctions.js';
import logger, { LogLevel, Logger } from './logger';
import { monitoring } from './monitoring';

export const VERSION = "1.0.16";

export const docker = new Docker();
export const DOCKER_NETWORK = process.env.DOCKER_NETWORK || "backend";
export const TIME_PUZZLE_JOB_IMAGE = 'randao/puzzle-gen:v0.1.6';
export const ORCHESTRATOR_IMAGE = 'randao/orchestrator:latest';

// Optional network monitoring variables
export const NETWORK_IP = process.env.NETWORK_IP;
export const NETWORK_MODE = process.env.NETWORK_MODE; // "wifi", "ethernet", or "disconnected"

export const DOCKER_MONITORING_TIME = 30000;
export const POLLING_INTERVAL_MS = 0; //0 second
export const DATABASE_CHECK_TIME = 60000; //60 seconds
export const DATABASE_MAINTENANCE_INTERVAL = 10 * 60 * 1000; // 10 minutes
export const AGGRESSIVE_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
export const MINIMUM_ENTRIES = 10000;
export const DRYRUNTIMEOUT = 30000; // 30 seconds
export const MAX_RETRIES = 10;
export const RETRY_DELAY_MS = 10000;
export const COMPLETION_RETENTION_PERIOD_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds (reduced from 24h to prevent storage bloat)
export const UNCHAIN_VS_OFFCHAIN_MAX_DIF = 50;
export const MINIMUM_RANDOM_DELTA = 25;
export const SHUTDOWN_POLLING_DELAY = 10;

let PROVIDER_ID = "";
let pollingInProgress = false;
let lastPollingId: string | null = null;
let lastMaintenanceTime = 0;
let lastAggressiveCleanupTime = 0;

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

                crank(); //TODO find a better place for this
                
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
    logger.info("Orchestrator starting up");
    
    // Ensure wallet configuration exists, generate if needed
    await ensureWalletConfiguration();
    
    logger.debug("Environment variables loaded, initializing services");

    const client = await connectWithRetry();
    await setupDatabase(client);

    // Initialize wallet and set provider ID using wallet utilities
    getWalletAddress().then((address) => {
        logger.info(`Provider ID: ${address}`);
        PROVIDER_ID = address;
    }).catch(error => {
        logger.error('Failed to initialize wallet:', error);
        process.exit(1);
    });

    // Handle graceful shutdown before entering infinite loop
    process.on("SIGTERM", async () => {
        logger.info("SIGTERM received. Shutting down gracefully.");
        await client.end();
        await gracefulShutdown();
        for (let i = 0; i < SHUTDOWN_POLLING_DELAY; i++) {
            try {
                await polling(client);
            } catch (error) {
                logger.error(`Shutdown Polling iteration ${i + 1} failed:`, error);
            }
        }
        await Logger.close(); // Use the static close method on the Logger class
        process.exit(0);
    });
    //TODO SEE WHATS BETTER (This could possibly have a new tx queed up while the old one is in the works to keep it speeds but who knows)
    // setInterval(async () => {
    //     await polling(client);
    // }, POLLING_INTERVAL_MS);

    // Infinite polling loop with maintenance
    while (true) {
        try {
            const currentTime = Date.now();
            
            // Regular polling
            await polling(client);
            
            // Database maintenance every 10 minutes
            if (currentTime - lastMaintenanceTime >= DATABASE_MAINTENANCE_INTERVAL) {
                await performDatabaseMaintenance(client);
                lastMaintenanceTime = currentTime;
            }
            
            // Aggressive cleanup every 30 minutes
            if (currentTime - lastAggressiveCleanupTime >= AGGRESSIVE_CLEANUP_INTERVAL) {
                await performAggressiveCleanup(client);
                lastAggressiveCleanupTime = currentTime;
            }
            
        } catch (error) {
            logger.error("Polling error:", error);
        }
    }
}


run().catch((err) => logger.error(`Error in main function: ${err}`));
