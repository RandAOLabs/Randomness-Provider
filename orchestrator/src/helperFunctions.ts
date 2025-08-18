import { GetOpenRandomRequestsResponse, GetProviderAvailableValuesResponse, RandomClient, RequestList } from "ao-js-sdk";
import { Client } from "pg";
import { COMPLETION_RETENTION_PERIOD_MS, MINIMUM_ENTRIES, MINIMUM_RANDOM_DELTA, UNCHAIN_VS_OFFCHAIN_MAX_DIF, ORCHESTRATOR_IMAGE, docker } from "./app";
import { getMoreRandom, monitorDockerContainers, pullDockerImage } from "./containerManagment";
import logger, { LogLevel } from "./logger";
import { monitoring } from "./monitoring";
import { setTimeout, setInterval } from 'timers';
import { getWallet } from "./walletUtils";

let randomClientInstance: RandomClient | null = null;
let lastInitTime: number = 0;
const REINIT_INTERVAL = 60 * 1 * 1000; // 1 minute in milliseconds
let current_onchain_random = - 10

// Cooldown tracking for updateAvailableValuesAsync
let lastUpdatedOnChainTime = 0;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

// Cooldown tracking for fulfillRandomChallenge and fulfillRandomOutput (per request ID)
const challengeCooldowns = new Map<string, boolean>();
const outputCooldowns = new Map<string, boolean>();
// Track whether there's an ongoing random generation request
let ongoingRandomGeneration = false;
const MAX_RANDOM_PER_REQUEST = 500; // Maximum number of random values to generate in a single request

// Map to track request timestamps
const requestTimestamps: Map<string, number> = new Map();

let isInitializing = false; // Track if initialization is in progress
let initPromise: Promise<RandomClient> | null = null; // Store the initialization promise
let isFirstInitialization = true; // Track if this is the first initialization
let firstInitializationComplete = false; // Track if first initialization has completed

// Function to reset the ongoingRandomGeneration flag
export function resetOngoingRandomGeneration() {
    ongoingRandomGeneration = false;
    logger.info('Random generation flag reset. System ready for new random generation requests.');
}

export async function getRandomClient(): Promise<RandomClient> {
    const currentTime = Date.now();

    // For first initialization, always wait for completion
    if (isFirstInitialization || !firstInitializationComplete) {
        logger.info('[RandomClient] First initialization required - awaiting completion');
        return await initializeRandomClientWithLogging(true);
    }

    // Return the existing instance if it's valid and fresh
    if (randomClientInstance && (currentTime - lastInitTime) <= REINIT_INTERVAL) {
        return randomClientInstance;
    }

    // If reinitialization is already happening, wait for it if it's the first init, otherwise serve old instance
    if (isInitializing) {
        if (initPromise) {
            logger.info('[RandomClient] Reinitialization in progress - awaiting completion');
            return await initPromise;
        } else {
            logger.info('[RandomClient] Reinitialization in progress, serving old instance');
            return randomClientInstance!;
        }
    }

    // Start reinitialization (background for subsequent inits)
    logger.info('[RandomClient] Background reinitialization triggered');
    return await initializeRandomClientWithLogging(false);
}


/**
 * Initialize the random client with detailed step-by-step logging
 * @param awaitCompletion Whether to await completion or run in background
 * @returns Promise<RandomClient>
 */
async function initializeRandomClientWithLogging(awaitCompletion: boolean): Promise<RandomClient> {
    // If already initializing and we need to await, return the existing promise
    if (isInitializing && initPromise && awaitCompletion) {
        logger.info('[RandomClient] Initialization already in progress - awaiting existing promise');
        return await initPromise;
    }

    // If already initializing but not awaiting, return old instance
    if (isInitializing && !awaitCompletion && randomClientInstance) {
        logger.info('[RandomClient] Initialization in progress - serving old instance');
        return randomClientInstance;
    }

    // Start new initialization
    isInitializing = true;
    const initStartTime = Date.now();
    const initType = isFirstInitialization ? 'FIRST' : 'REINIT';
    
    logger.info(`[RandomClient] Starting ${initType} initialization...`);
    
    const initializationPromise = (async (): Promise<RandomClient> => {
        try {
            // Step 1: Wallet initialization
            logger.info('[RandomClient] Step 1/4: Initializing wallet configuration...');
            const stepStart = Date.now();
            const wallet = await getWallet();
            logger.info(`[RandomClient] Step 1/4: Wallet configuration complete (${Date.now() - stepStart}ms)`);
            
            // Step 2: Client builder initialization
            logger.info('[RandomClient] Step 2/4: Creating RandomClient builder...');
            const step2Start = Date.now();
            const builder = await RandomClient.defaultBuilder();
            logger.info(`[RandomClient] Step 2/4: RandomClient builder created (${Date.now() - step2Start}ms)`);
            
            // Step 3: Configuration setup
            logger.info('[RandomClient] Step 3/4: Configuring client with wallet and AO settings...');
            const step3Start = Date.now();
            const configuredBuilder = builder
                .withWallet(wallet)
                .withAOConfig({
                    CU_URL: process.env.CU_URL || "https://ur-cu.randao.net",
                    MU_URL: process.env.MU_URL || "https://ur-mu.randao.net",
                    MODE: "legacy" as const
                });
            logger.info(`[RandomClient] Step 3/4: Client configuration complete (${Date.now() - step3Start}ms)`);
            
            // Step 4: Build and finalize
            logger.info('[RandomClient] Step 4/4: Building final RandomClient instance...');
            const step4Start = Date.now();
            const newClient = await configuredBuilder.build();
            logger.info(`[RandomClient] Step 4/4: RandomClient build complete (${Date.now() - step4Start}ms)`);
            
            // Finalize initialization
            randomClientInstance = newClient;
            lastInitTime = Date.now();
            
            if (isFirstInitialization) {
                firstInitializationComplete = true;
                isFirstInitialization = false;
                logger.info(`[RandomClient] FIRST initialization completed successfully! Total time: ${Date.now() - initStartTime}ms`);
            } else {
                logger.info(`[RandomClient] Reinitialization completed successfully! Total time: ${Date.now() - initStartTime}ms`);
            }
            
            return newClient;
            
        } catch (err) {
            const errorMsg = `${initType} initialization failed after ${Date.now() - initStartTime}ms`;
            logger.error(`[RandomClient] ${errorMsg}:`, err);
            
            // If this is first initialization and it failed, we need to retry
            if (isFirstInitialization) {
                logger.error('[RandomClient] CRITICAL: First initialization failed - system cannot proceed without random client');
                throw new Error(`Critical random client initialization failure: ${err}`);
            }
            
            throw err;
        } finally {
            isInitializing = false;
            initPromise = null;
        }
    })();
    
    // Store the promise for potential awaiting
    initPromise = initializationPromise;
    
    if (awaitCompletion) {
        return await initializationPromise;
    } else {
        // Run in background, return old instance if available
        initializationPromise.catch(err => {
            logger.error('[RandomClient] Background initialization failed:', err);
        });
        
        if (randomClientInstance) {
            return randomClientInstance;
        } else {
            // No old instance available, must await
            logger.warn('[RandomClient] No existing instance available - forcing await of initialization');
            return await initializationPromise;
        }
    }
}

// Add a method to explicitly refresh the client if needed
export async function refreshRandomClient(): Promise<RandomClient> {
    logger.info('[RandomClient] Explicit refresh requested');
    randomClientInstance = null;
    lastInitTime = 0;
    isInitializing = false;
    initPromise = null;
    // Don't reset first initialization flags - this is just a refresh
    return await initializeRandomClientWithLogging(true);
}

// Step 2: Process Challenge Requests (Database selection & assigning is atomic)
export async function processChallengeRequests(
    client: Client,
    activeChallengeRequests: { request_ids: string[] } | undefined,
    parentLogId: string
): Promise<void> {
    logger.info(`${parentLogId} Step 2: Processing challenge requests.`);

    if (!activeChallengeRequests || activeChallengeRequests.request_ids.length === 0) {
        logger.info(`${parentLogId} No Challenge Requests to process.`);
        return;
    }

    const requestIds = activeChallengeRequests.request_ids;
    logger.info(`${parentLogId} Processing up to ${requestIds.length} requests.`);

    try {
        await client.query('BEGIN'); // Start transaction

        logger.debug(`${parentLogId} Fetching existing request mappings.`);

        // Fetch already assigned request_id -> dbId mappings
        const existingMappingsRes = await client.query(
            `SELECT request_id FROM time_lock_puzzles 
             WHERE request_id = ANY($1) 
             FOR UPDATE SKIP LOCKED`,
            [requestIds]
        );

        const existingRequestIds = new Set(existingMappingsRes.rows.map(row => row.request_id));
        logger.debug(`${parentLogId} Found ${existingRequestIds.size} already mapped requests.`);

        // Find only the unmapped requests (requestIds not in existingRequestIds)
        const unmappedRequestIds = requestIds.filter(requestId => !existingRequestIds.has(requestId));
        logger.debug(`${parentLogId} Unmapped requests: ${unmappedRequestIds.length}`);

        let mappedEntries: { requestId: string, dbId: number }[] = [];

        if (unmappedRequestIds.length > 0) {
            logger.debug(`${parentLogId} Fetching available DB entries.`);
            const dbRes = await client.query(
                `SELECT id FROM time_lock_puzzles 
                 WHERE request_id IS NULL 
                 ORDER BY id ASC 
                 LIMIT $1 
                 FOR UPDATE SKIP LOCKED`,
                [unmappedRequestIds.length]
            );

            const availableDbEntries = dbRes.rows.map(row => row.id);
            logger.debug(`${parentLogId} Found ${availableDbEntries.length} available DB entries.`);

            if (availableDbEntries.length > 0) {
                const numMappings = Math.min(unmappedRequestIds.length, availableDbEntries.length);

                for (let i = 0; i < numMappings; i++) {
                    await client.query(
                        `UPDATE time_lock_puzzles 
                         SET request_id = $1 
                         WHERE id = $2`,
                        [unmappedRequestIds[i], availableDbEntries[i]]
                    );
                    mappedEntries.push({ requestId: unmappedRequestIds[i], dbId: availableDbEntries[i] });
                    logger.debug(`${parentLogId} Assigned Request ID ${unmappedRequestIds[i]} to DB Entry ${availableDbEntries[i]}.`);
                }
            } else {
                logger.warn(`${parentLogId} No available DB entries for unmapped requests.`);
            }
        }

        // Collect all request IDs (previously mapped + newly mapped)
        const allRequestIds = [...existingRequestIds, ...mappedEntries.map(entry => entry.requestId)];

        if (allRequestIds.length === 0) {
            logger.info(`${parentLogId} No requests to process. Committing transaction.`);
            await client.query('COMMIT');
            return;
        }

        await client.query('COMMIT'); // Commit all updates at once
        logger.info(`${parentLogId} Committed all changes. Now fulfilling challenges.`);

        // Call fulfillRandomChallenge for all request IDs
        await Promise.all(
            allRequestIds.map(requestId =>
                fulfillRandomChallenge(client, requestId, parentLogId)
                    .catch(error => logger.error(`${parentLogId} Error fulfilling challenge for Request ID ${requestId}:`, error))
            )
        );

        logger.info(`${parentLogId} All challenges fulfilled`);
    } catch (error: any) {
        logger.error(`${parentLogId} Error in processChallengeRequests:`, error);
        await client.query('ROLLBACK'); // Rollback on failure

        logger.error(`SQL State: ${error.code}, Message: ${error.message}`);
    }
}

// Step 3: Process Output Requests
export async function processOutputRequests(
    client: Client,
    activeOutputRequests: { request_ids: string[] } | undefined,
    parentLogId: string
): Promise<void> {
    logger.info(`${parentLogId} Step 3: Processing output requests.`);

    if (!activeOutputRequests || activeOutputRequests.request_ids.length === 0) {
        logger.info(`${parentLogId} No Output Requests to process.`);
        return;
    }

    const outputPromises = activeOutputRequests.request_ids.map(async (requestId) => {
        logger.debug(`${parentLogId} Processing output request ID: ${requestId}`);

        // Run fulfillRandomOutput asynchronously (do not await)
        fulfillRandomOutput(client, requestId, parentLogId)
            .catch(error => logger.error(`${parentLogId} Error fulfilling output:`, error));
    });

    await Promise.all(outputPromises);
    logger.info(`${parentLogId} Step 3 completed.`);
}

// Step 4: Remove fulfilled entries no longer in use
export async function cleanupFulfilledEntries(
    client: Client,
    openRequests: any,
    parentLogId: string
): Promise<void> {
    logger.info(`${parentLogId} Step 4: Checking for fulfilled entries no longer in use.`);

    const now = new Date();
    const cutoffTime = new Date(now.getTime() - COMPLETION_RETENTION_PERIOD_MS);

    try {
        await client.query('BEGIN');

        // Fetch all entries with a request_id
        const result = await client.query(`
            SELECT id, request_id, detected_completed 
            FROM time_lock_puzzles 
            WHERE request_id IS NOT NULL
        `);

        let markForDeletion: string[] = [];
        let markAsCompleted: string[] = [];

        for (const row of result.rows) {
            const { id, request_id, detected_completed } = row;

            // Check if this request is still active in challenge or output
            const isStillInChallenge = openRequests.activeChallengeRequests?.request_ids.includes(request_id);
            const isStillInOutput = openRequests.activeOutputRequests?.request_ids.includes(request_id);

            if (!isStillInChallenge && !isStillInOutput) {
                if (!detected_completed) {
                    // Mark it for deletion by setting detected_completed timestamp
                    markAsCompleted.push(id);
                } else if (new Date(detected_completed) < cutoffTime) {
                    // If already marked and older than retention period, delete it
                    markForDeletion.push(id);
                }
            }
        }

        // Mark entries as completed
        if (markAsCompleted.length > 0) {
            await client.query(`
                UPDATE time_lock_puzzles
                SET detected_completed = NOW()
                WHERE id = ANY($1)
            `, [markAsCompleted]);
            logger.debug(`${parentLogId} Marked ${markAsCompleted.length} entries as completed.`);
        }

        // Delete old completed entries 
        if (markForDeletion.length > 0) {
            await client.query(`
                DELETE FROM rsa_keys
                WHERE id IN (
                    SELECT rsa_id FROM time_lock_puzzles WHERE id = ANY($1)
                );
            `, [markForDeletion]);

            await client.query(`
                DELETE FROM time_lock_puzzles
                WHERE id = ANY($1);
            `, [markForDeletion]);

            logger.info(`${parentLogId} Deleted ${markForDeletion.length} old completed entries and corresponding RSA keys.`);
        }

        await client.query('COMMIT');
    } catch (error) {
        logger.error(`${parentLogId} Error in cleanupFulfilledEntries:`, error);
        await client.query('ROLLBACK');
    }

    logger.info(`${parentLogId} Step 4 completed.`);
}


/**
 * Function to log request timestamps
 * Adds new request IDs to the tracking map and removes ones that are no longer present
 * @param allRequestIds Array of request IDs to track
 */
export function logRequestTimestamps(allRequestIds: string[]): void {
  const currentTime = Date.now();
  const existingIds = new Set(requestTimestamps.keys());
  
  // Add new request IDs with current timestamp
  for (const requestId of allRequestIds) {
    if (!requestTimestamps.has(requestId)) {
      logger.verbose(`Adding new request ID to tracking: ${requestId}`);
      requestTimestamps.set(requestId, currentTime);
    }
  }
  
  // Remove request IDs that are no longer present
  for (const existingId of existingIds) {
    if (!allRequestIds.includes(existingId)) {
      logger.verbose(`Removing request ID from tracking: ${existingId}`);
      requestTimestamps.delete(existingId);
    }
  }
}

// Function to check for defunct requests and crank if needed
export async function crank() {
  const currentTime = Date.now();
  const defunctRequestIds: string[] = [];
  const DEFUNCT_THRESHOLD_MS = 30 * 1000; // 30 seconds
  
  // Check for defunct request IDs (those that have been in the map for over 30 seconds)
  requestTimestamps.forEach((timestamp, requestId) => {
    const timeInMap = currentTime - timestamp;
    if (timeInMap > DEFUNCT_THRESHOLD_MS) {
      defunctRequestIds.push(requestId);
      logger.info(`Defunct request found: ${requestId} (in system for ${Math.floor(timeInMap / 1000)} seconds)`);
    }
  });
  
  // If there are any defunct requests, run the crank
// if (defunctRequestIds.length > 0) {
//   logger.info(`Cranking due to ${defunctRequestIds.length} defunct requests: ${defunctRequestIds.join(', ')}`);
//   (await getRandomClient()).crank();
// } else {
//   // 1 in 100 chance to crank
//   if (Math.floor(Math.random() * 100) === 0) {
//     logger.info("Cranking randomly (1 in 100 chance hit)");
//     //(await getRandomClient()).crank();
//   }
// }
}

export async function getProviderRequests(PROVIDER_ID: string, parentLogId: string): Promise<GetOpenRandomRequestsResponse> {
    const defaultResponse: GetOpenRandomRequestsResponse = {
        providerId: PROVIDER_ID,
        activeChallengeRequests: { request_ids: [] },
        activeOutputRequests: { request_ids: [] }
    };

    let client: RandomClient | null = null;
    let response;
    
    try {
        // Get client with error handling
        try {
            client = await getRandomClient();
            if (!client) {
                throw new Error('Failed to initialize RandomClient');
            }
        } catch (clientError) {
            logger.error(`${parentLogId} Failed to initialize RandomClient:`, clientError);
            return defaultResponse;
        }

        // Try to get provider activity with retry logic
        const maxRetries = 2;
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                response = await client.getAllProviderActivity();
                lastError = null;
                break; // Success, exit retry loop
            } catch (error) {
                lastError = error as Error;
                logger.warn(`${parentLogId} Attempt ${attempt}/${maxRetries} failed to fetch provider activity:`, error);
                
                if (attempt < maxRetries) {
                    // Only recreate the client if this isn't the last attempt
                    try {
                        randomClientInstance = null; // Force client recreation on next attempt
                        client = await getRandomClient();
                        logger.info(`${parentLogId} Recreated RandomClient for retry attempt ${attempt + 1}`);
                    } catch (retryError) {
                        logger.error(`${parentLogId} Failed to recreate RandomClient for retry:`, retryError);
                    }
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }

        // If we still have an error after retries, handle it
        if (lastError) {
            throw lastError;
        }
        
        if (!response) {
            throw new Error('No response from provider activity');
        }

        // Collect all request IDs from all providers for tracking
        const allRequestIds: string[] = [];
        
        // Process each provider to extract request IDs
        for (const provider of response) {
            try {
                // Extract challenge request IDs
                if (provider.active_challenge_requests && typeof provider.active_challenge_requests === 'string') {
                    try {
                        const parsedChallengeData = JSON.parse(provider.active_challenge_requests);
                        if (parsedChallengeData && typeof parsedChallengeData === 'object' && 'request_ids' in parsedChallengeData) {
                            const requestIds = parsedChallengeData.request_ids;
                            if (Array.isArray(requestIds)) {
                                for (const id of requestIds) {
                                    if (typeof id === 'string') {
                                        allRequestIds.push(id);
                                    }
                                }
                            }
                        }
                    } catch (parseErr) {
                        logger.warn(`${parentLogId} Warning: Failed to parse challenge requests JSON for provider ${provider.provider_id}:`, parseErr);
                    }
                }
                
                // Extract output request IDs
                if (provider.active_output_requests && typeof provider.active_output_requests === 'string') {
                    try {
                        const parsedOutputData = JSON.parse(provider.active_output_requests);
                        if (parsedOutputData && typeof parsedOutputData === 'object' && 'request_ids' in parsedOutputData) {
                            const requestIds = parsedOutputData.request_ids;
                            if (Array.isArray(requestIds)) {
                                for (const id of requestIds) {
                                    if (typeof id === 'string') {
                                        allRequestIds.push(id);
                                    }
                                }
                            }
                        }
                    } catch (parseErr) {
                        logger.warn(`${parentLogId} Warning: Failed to parse output requests JSON for provider ${provider.provider_id}:`, parseErr);
                    }
                }
            } catch (err) {
                logger.warn(`${parentLogId} Warning: Failed to process provider ${provider?.provider_id || 'unknown'}:`, err);
            }
        }
        
        // Log all the request IDs for tracking
        logger.debug(`${parentLogId} Found ${allRequestIds.length} request IDs across all providers`);
        
        // Update the request timestamps tracking
        logRequestTimestamps(allRequestIds);
        
        const provider = response.find((p: any) => p.provider_id === PROVIDER_ID);

        if (!provider) {
            logger.warn(`${parentLogId} Warning: Provider with ID ${PROVIDER_ID} not found.`);
            return defaultResponse;
        }

        // Attempt to parse fields if they exist, otherwise default to empty arrays
        let parsedChallengeRequests: RequestList = { request_ids: [] };
        let parsedOutputRequests: RequestList = { request_ids: [] };

        try {
            if (provider.active_challenge_requests && typeof provider.active_challenge_requests === 'string') {
                const parsed = JSON.parse(provider.active_challenge_requests);
                if (parsed && typeof parsed === 'object' && 'request_ids' in parsed) {
                    // Ensure we only include string values in the request_ids array
                    const validRequestIds = Array.isArray(parsed.request_ids) 
                        ? parsed.request_ids.filter((id: any) => typeof id === 'string')
                        : [];
                    parsedChallengeRequests = { request_ids: validRequestIds };
                }
            }
        } catch (err) {
            logger.warn(`${parentLogId} Warning: Failed to parse active_challenge_requests:`, err);
        }

        try {
            if (provider.active_output_requests && typeof provider.active_output_requests === 'string') {
                const parsed = JSON.parse(provider.active_output_requests);
                if (parsed && typeof parsed === 'object' && 'request_ids' in parsed) {
                    // Ensure we only include string values in the request_ids array
                    const validRequestIds = Array.isArray(parsed.request_ids) 
                        ? parsed.request_ids.filter((id: any) => typeof id === 'string')
                        : [];
                    parsedOutputRequests = { request_ids: validRequestIds };
                }
            }
        } catch (err) {
            logger.warn(`${parentLogId} Warning: Failed to parse active_output_requests:`, err);
        }

        // Only update current_onchain_random if successful
        if (typeof provider.random_balance === 'number') {
            current_onchain_random = provider.random_balance;
        }

        const result: GetOpenRandomRequestsResponse = {
            providerId: provider.provider_id || PROVIDER_ID,
            activeChallengeRequests: parsedChallengeRequests,
            activeOutputRequests: parsedOutputRequests,
        };

        logger.verbose(`${parentLogId} Step 1: Open Requests: ${JSON.stringify(result)}`);
        logger.info(`${parentLogId} Step 1: Open Challenge Requests count: ${result.activeChallengeRequests.request_ids.length}`);
        logger.info(`${parentLogId} Step 1: Open Output Requests count: ${result.activeOutputRequests.request_ids.length}`);

        return result;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`${parentLogId} Error in getProviderRequests:`, errorMessage);
        logger.debug(`${parentLogId} Error details:`, error);
        
        // If we have a client that might be in a bad state, try to clean it up
        if (client) {
            try {
                randomClientInstance = null;
            } catch (cleanupError) {
                logger.warn(`${parentLogId} Error during client cleanup:`, cleanupError);
            }
        }
        
        return defaultResponse;
    }
}

// Function to check and fetch database entries as needed
export async function checkAndFetchIfNeeded(client: Client) {
    try {
        // Query current count of usable DB entries
        const res = await client.query(
            'SELECT COUNT(*) AS count FROM time_lock_puzzles WHERE request_id IS NULL'
        );
        const currentCount = parseInt(res.rows[0].count, 10);
        logger.info(`Total usable DB entries: ${currentCount}`);

        switch (current_onchain_random) {
            case -1:
                logger.warn("Value is -1");
                logger.warn("Provider has been shut down by USER...");
                logger.warn("Go to the provider dashboard to turn back on");
                await updateAvailableValuesAsync(-1);
                break;
            case -2:
                logger.error("Value is -2");
                logger.error("Provider has been shut down by PROCESS...");
                logger.error("This is due to One of the following: ");
                logger.error("Failing to provide random fast enough (Provider is not responding to random requests and considered unhealthy NO SLASH)");
                logger.error("Failing to provide the proof for an outstanding random request within the time. (Provider was likely turned off mid random request SMALL SLASH)");
                logger.error("Failing to provide the correct proof for your original random (Provider was detected as malicious for tampering with the random LARGE SLASH)");
                logger.error("Go to the provider dashboard to turn back on");
                await updateAvailableValuesAsync(-2);
                break;
            case -3:
                logger.warn("Value is -3");
                logger.warn("Provider has been shut down by PROCESS...");
                logger.warn("This was likely done as a test or to get the maintainers attention. Contact team if you see this and are not sure why");
                logger.warn("Go to the provider dashboard to turn back on");
                await updateAvailableValuesAsync(-3);
                break;
            case -4:
                logger.warn("Value is -4");
                logger.warn("Nothing Set up for this yet");
                await updateAvailableValuesAsync(-4);
                break;
            case -5:
                logger.warn("Value is -5");
                logger.warn("Provider has been told to pull the latest image and restart. Taking action now");
                
                // Pull the randomrequester image
                logger.info(`Attempting to pull Docker image: ${ORCHESTRATOR_IMAGE}`);
                const pullSuccess = await pullDockerImage(ORCHESTRATOR_IMAGE);
                
                if (pullSuccess) {
                    logger.info(`Successfully pulled image: ${ORCHESTRATOR_IMAGE}`);
                } else {
                    logger.error(`Failed to pull image: ${ORCHESTRATOR_IMAGE}`);
                }
                
                // Regardless of pull result, proceed with shutdown and restart
                await gracefulShutdown();
                const container = docker.getContainer(process.env.HOSTNAME || ""); // or use docker ps/inspect to get container ID
                await container.remove({ force: true });
                process.exit(1);
                break;
            case -10:
                logger.info("Value is -10");
                logger.info("Provider has been turned on and is starting up OR is not staked yet");
                logger.info("Go to the provider dashboard to Stake if you have not yet OR wait for provider to finish turning on if you have staked already");
                break;
            default:
                logger.debug("Provider is up and working");
                logger.debug(`Onchain Value is ${current_onchain_random}`);
                logger.debug(`Local Value is ${currentCount}`);
                await updateAvailableValuesAsync(currentCount);

        }

        // First check if a random generation is already in progress. If so, see if it's done
        if (ongoingRandomGeneration) {
            logger.info('A random generation process is already running. Skipping new request.');
            await monitorDockerContainers();
            return;
        }

        // Check if more entries are needed
        const entriesNeeded = MINIMUM_ENTRIES - currentCount;
        if (entriesNeeded < MINIMUM_RANDOM_DELTA) return;

        // Set the flag to prevent concurrent random generation
        ongoingRandomGeneration = true;

        // Limit to MAX_RANDOM_PER_REQUEST
        const randomToGenerate = Math.min(entriesNeeded, MAX_RANDOM_PER_REQUEST);

        logger.info(`Less than ${MINIMUM_ENTRIES} entries found. Fetching ${randomToGenerate} entries (out of ${entriesNeeded} needed)...`);

        // Start the random generation with the calculated amount
        await getMoreRandom(randomToGenerate);

    } catch (error) {
        logger.error('Error during check and fetch:', error);
        ongoingRandomGeneration = false; // Reset the flag on error
    }
}

export async function updateAvailableValuesAsync(currentCount: number) {
    const now = Date.now();

    if (now - lastUpdatedOnChainTime < FIFTEEN_MINUTES_MS) {
        logger.info(`On-chain update skipped - only ${Math.floor((now - lastUpdatedOnChainTime) / 1000)}s since last update`);
        return;
    }

    try {
        const monitoringData = await monitoring.getMonitoringData();

        await (await getRandomClient()).updateProviderAvailableValues(currentCount, monitoringData);
        logger.info(`Updated provider values to ${currentCount}`);

        lastUpdatedOnChainTime = now;
    } catch (error) {
        logger.error("Failed to update provider values:", error);
        monitoring.incrementErrorCount();
    }
}

// Function to post VDF challenge (fetches dbId dynamically)
async function fulfillRandomChallenge(client: Client, requestId: string, parentLogId: string): Promise<void> {
    const logPrefix = `${parentLogId} [Challenge ${requestId}]`;
    
    // Check if this request is already being processed
    if (challengeCooldowns.has(requestId)) {
        logger.debug(`${logPrefix} Request is in cooldown, skipping...`);
        return;
    }

    // Set cooldown immediately to prevent concurrent processing
    challengeCooldowns.set(requestId, true);
    const cooldownTimer = setTimeout(() => {
        challengeCooldowns.delete(requestId);
        logger.debug(`${logPrefix} Cooldown released`);
    }, 60000); // 1 minute cooldown

    let randomClient: RandomClient | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay

    while (retryCount <= maxRetries) {
        try {
            // Get a fresh client for each attempt
            randomClient = await getRandomClient();
            if (!randomClient) {
                throw new Error('Failed to initialize RandomClient');
            }

            // Fetch the necessary details from the database using requestId
            const res = await client.query(
                `SELECT id, modulus, x 
                 FROM time_lock_puzzles 
                 WHERE request_id = $1`,
                [requestId]
            );

            if (!res.rowCount) {
                logger.error(`${logPrefix} No database entry found for request`);
                return;
            }


            const { id: dbId, modulus, x: input } = res.rows[0];
            
            if (!modulus || !input) {
                throw new Error('Missing required fields in database entry');
            }

            logger.debug(`${logPrefix} Posting VDF challenge for DB ID: ${dbId}`);
            
            // Post the VDF challenge
            await randomClient.commit({
                requestId: requestId,
                puzzle: {
                    input: input,
                    modulus: modulus
                }
            });

            logger.info(`${logPrefix} Successfully posted VDF challenge`);
            return; // Success, exit the function

        } catch (error) {
            retryCount++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            if (retryCount <= maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
                logger.warn(`${logPrefix} Attempt ${retryCount}/${maxRetries} failed, retrying in ${delay}ms:`, errorMessage);
                
                // Force client recreation on retry
                randomClient = null;
                randomClientInstance = null;
                
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                logger.error(`${logPrefix} All ${maxRetries} attempts failed:`, error);
                // The cooldown was already set at the beginning
                return;
            }
        } finally {
            // Ensure the client is properly cleaned up
            if (randomClient) {
                try {
                    if (typeof (randomClient as any).disconnect === 'function') {
                        await (randomClient as any).disconnect().catch((e: Error) => 
                            logger.warn(`${logPrefix} Error disconnecting client:`, e)
                        );
                    }
                } catch (e) {
                    logger.warn(`${logPrefix} Error during client cleanup:`, e);
                }
            }
        }
    }
}

// Function to post VDF output and proof
async function fulfillRandomOutput(client: Client, requestId: string, parentLogId: string): Promise<void> {
    const logPrefix = `${parentLogId} [Output ${requestId}]`;
    
    // Check if this request is already being processed
    if (outputCooldowns.has(requestId)) {
        logger.debug(`${logPrefix} Request is in cooldown, skipping...`);
        return;
    }

    // Set cooldown immediately to prevent concurrent processing
    outputCooldowns.set(requestId, true);
    const cooldownTimer = setTimeout(() => {
        outputCooldowns.delete(requestId);
        logger.debug(`${logPrefix} Cooldown released`);
    }, 60000); // 1 minute cooldown

    let randomClient: RandomClient | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay

    while (retryCount <= maxRetries) {
        try {
            // Get a fresh client for each attempt
            randomClient = await getRandomClient();
            if (!randomClient) {
                throw new Error('Failed to initialize RandomClient');
            }

            // Fetch the output and proof from the database using the requestId
            const res = await client.query(
                `SELECT 
                    tlp.id, 
                    tlp.y AS output, 
                    rk.p, 
                    rk.q 
                FROM time_lock_puzzles tlp
                JOIN rsa_keys rk ON tlp.rsa_id = rk.id
                WHERE tlp.request_id = $1`,
                [requestId]
            );

            if (!res.rowCount) {
                logger.error(`${logPrefix} No database entry found for request`);
                return;
            }


            const { id: dbId, output, p: rsaP, q: rsaQ } = res.rows[0];
            
            if (!output || !rsaP || !rsaQ) {
                throw new Error('Missing required fields in database entry');
            }

            logger.debug(`${logPrefix} Posting VDF output and proof for DB ID: ${dbId}`);
            
            // Post the VDF output and proof
            await randomClient.reveal({
                requestId: requestId,
                rsa_key: {
                    p: rsaP,
                    q: rsaQ
                }
            });

            logger.info(`${logPrefix} Successfully posted VDF output and proof`);
            return; // Success, exit the function

        } catch (error) {
            retryCount++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            if (retryCount <= maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
                logger.warn(`${logPrefix} Attempt ${retryCount}/${maxRetries} failed, retrying in ${delay}ms:`, errorMessage);
                
                // Force client recreation on retry
                randomClient = null;
                randomClientInstance = null;
                
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                logger.error(`${logPrefix} All ${maxRetries} attempts failed:`, error);
                // The cooldown was already set at the beginning
                return;
            }
        } finally {
            // Ensure the client is properly cleaned up
            if (randomClient) {
                try {
                    if (typeof (randomClient as any).disconnect === 'function') {
                        await (randomClient as any).disconnect().catch((e: Error) => 
                            logger.warn(`${logPrefix} Error disconnecting client:`, e)
                        );
                    }
                } catch (e) {
                    logger.warn(`${logPrefix} Error during client cleanup:`, e);
                }
            }
        }
    }
}

export async function gracefulShutdown() {
    const logPrefix = '[Shutdown]';
    let randomClient: RandomClient | null = null;
    
    try {
        logger.info(`${logPrefix} Starting graceful shutdown sequence`);
        
        // Get monitoring data for final update
        const monitoringData = await monitoring.getMonitoringData();
        
        // Get a fresh client for the shutdown sequence
        randomClient = await getRandomClient();
        if (!randomClient) {
            throw new Error('Failed to initialize RandomClient during shutdown');
        }
        
        // Set provider available values to 0 and include final monitoring data
        logger.info(`${logPrefix} Updating provider values to 0...`);
        await randomClient.updateProviderAvailableValues(0, monitoringData);
        
        logger.info(`${logPrefix} Provider values updated to 0`);
        
        // Add a small delay to ensure the update is processed
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        logger.info(`${logPrefix} Shutdown sequence completed`);
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`${logPrefix} Error during shutdown:`, errorMessage);
        logger.debug(`${logPrefix} Error details:`, error);
        monitoring.incrementErrorCount();
    } finally {
        // // Ensure the client is properly cleaned up
        // if (randomClient) {
        //     try {
        //         if (typeof (randomClient as any).disconnect === 'function') {
        //             await (randomClient as any).disconnect().catch((e: Error) => 
        //                 logger.warn(`${logPrefix} Error disconnecting client:`, e)
        //             );
        //         }
        //     } catch (e) {
        //         logger.warn(`${logPrefix} Error during client cleanup:`, e);
        //     }
        // }
        
        // // Clear the client instance to ensure a fresh start if the process continues
        // randomClientInstance = null;

        
    }
}
