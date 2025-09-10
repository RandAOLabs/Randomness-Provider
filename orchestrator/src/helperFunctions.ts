import { GetOpenRandomRequestsResponse, GetProviderAvailableValuesResponse, RandomClient, RequestList } from "ao-js-sdk";
import { Client } from "pg";
import { COMPLETION_RETENTION_PERIOD_MS, MINIMUM_ENTRIES, MINIMUM_RANDOM_DELTA, UNCHAIN_VS_OFFCHAIN_MAX_DIF, ORCHESTRATOR_IMAGE, docker } from "./app";
import { getMoreRandom, monitorDockerContainers, pullDockerImage } from "./containerManagment";
import logger, { LogLevel } from "./logger";
import { monitoring } from "./monitoring";
import { setTimeout, setInterval } from 'timers';
import { getWallet } from "./walletUtils";
import { getUsableEntriesCount, assignRequestIdsToEntries, getPuzzleDataForChallenge, getPuzzleDataForOutput, cleanupFulfilledEntriesAdvanced } from "./db_tools";
import * as aoSdkPackage from "ao-js-sdk/package.json";

// Random client management
let randomClientInstance: RandomClient | null = null;
let lastInitTime: number = 0;
const REINIT_INTERVAL = 60 * 60 * 1000; // 1 hour
let current_onchain_random = -10;

// Simple flags
let isInitializing = false;
let firstInitializationComplete = false;
let ongoingRandomGeneration = false;
let initializationPromise: Promise<RandomClient> | null = null;

// Constants
const MAX_RANDOM_PER_REQUEST = 500;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

// Tracking maps
const challengeCooldowns = new Map<string, boolean>();
const outputCooldowns = new Map<string, boolean>();
const requestTimestamps: Map<string, number> = new Map();
let lastUpdatedOnChainTime = 0;

// Function to reset the ongoingRandomGeneration flag
export function resetOngoingRandomGeneration() {
    ongoingRandomGeneration = false;
    logger.info('Random generation flag reset. System ready for new random generation requests.');
}

export async function getRandomClient(): Promise<RandomClient> {
    // First initialization - must complete
    if (!firstInitializationComplete) {
        if (initializationPromise) {
            return await initializationPromise;
        }
        return await initializeRandomClient();
    }

    // Return existing client if fresh (less than 1 hour old)
    const currentTime = Date.now();
    if (randomClientInstance && (currentTime - lastInitTime) <= REINIT_INTERVAL) {
        return randomClientInstance;
    }

    // Handle reinitialization
    if (isInitializing && initializationPromise) {
        // Wait for ongoing initialization to complete
        try {
            return await initializationPromise;
        } catch (err) {
            logger.error('[RandomClient] Failed to wait for reinitialization:', err);
            // Fall back to old client if available
            if (randomClientInstance) {
                return randomClientInstance;
            }
            throw err;
        }
    }

    // Start new reinitialization if not already happening
    if (!isInitializing) {
        initializationPromise = initializeRandomClient();
        initializationPromise.catch(err => 
            logger.error('[RandomClient] Background reinitialization failed:', err)
        );
        
        // For background reinitialization, return old client immediately
        if (randomClientInstance) {
            return randomClientInstance;
        }
        
        // No old client available, must wait for new one
        return await initializationPromise;
    }

    // Should not reach here, but return old client as fallback
    return randomClientInstance!;
}


/**
 * Initialize the random client - thread-safe with proper promise handling
 */
async function initializeRandomClient(): Promise<RandomClient> {
    // If already initializing, wait for the existing promise
    if (isInitializing && initializationPromise) {
        return await initializationPromise;
    }

    isInitializing = true;
    const isFirst = !firstInitializationComplete;
    const AO_CONFIG = {
        MU_URL: "https://ur-mu.randao.net",
        CU_URL: "https://ur-cu.randao.net",
        // MU_URL: "https://mu.ao-testnet.xyz",
        // CU_URL: "https://cu.ao-testnet.xyz",
        GATEWAY_URL: "https://arweave.net",
        MODE: "legacy" as const
    };
    
    try {
        logger.info(`[RandomClient] Using ao-js-sdk version: ${aoSdkPackage.version}`);
        const wallet = await getWallet();
        console.log('Wallet loaded:', wallet ? 'SUCCESS' : 'FAILED');
        const client = (await RandomClient.builder())
            .withWallet(wallet)
            .withAOConfig(AO_CONFIG)
            .withProcessId("1nTos_shMV8HlC7f2svZNZ3J09BROKCTK8DyvkrzLag")
            .withTokenAOConfig(AO_CONFIG)
            .withTokenProcessId("rPpsRk9Rm8_SJ1JF8m9_zjTalkv9Soaa_5U0tYUloeY")
            .build();
        
        randomClientInstance = client;
        lastInitTime = Date.now();
        
        if (isFirst) {
            firstInitializationComplete = true;
        }
        
        return client;
        
    } catch (err) {
        if (isFirst) {
            throw new Error(`Critical: Random client initialization failed: ${err}`);
        }
        throw err;
    } finally {
        isInitializing = false;
        initializationPromise = null;
    }
}

// Force refresh the client
export async function refreshRandomClient(): Promise<RandomClient> {
    randomClientInstance = null;
    lastInitTime = 0;
    isInitializing = false;
    initializationPromise = null;
    return await initializeRandomClient();
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
        // Use db_tools function to assign request IDs to database entries
        const mappedEntries = await assignRequestIdsToEntries(client, requestIds);
        logger.info(`${parentLogId} Assigned ${mappedEntries.length} request IDs to database entries.`);

        if (mappedEntries.length === 0) {
            logger.info(`${parentLogId} No requests to process.`);
            return;
        }

        // Call fulfillRandomChallenge for all request IDs
        await Promise.all(
            mappedEntries.map(entry =>
                fulfillRandomChallenge(client, entry.requestId, parentLogId)
                    .catch(error => logger.error(`${parentLogId} Error fulfilling challenge for Request ID ${entry.requestId}:`, error))
            )
        );

        logger.info(`${parentLogId} All challenges fulfilled`);
    } catch (error: any) {
        logger.error(`${parentLogId} Error in processChallengeRequests:`, error);
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

    try {
        const activeChallengeRequestIds = openRequests.activeChallengeRequests?.request_ids || [];
        const activeOutputRequestIds = openRequests.activeOutputRequests?.request_ids || [];
        
        // Use db_tools function for cleanup
        const result = await cleanupFulfilledEntriesAdvanced(
            client,
            activeChallengeRequestIds,
            activeOutputRequestIds,
            COMPLETION_RETENTION_PERIOD_MS
        );

        logger.debug(`${parentLogId} Marked ${result.markedCompleted} entries as completed.`);
        logger.info(`${parentLogId} Deleted ${result.deleted} old completed entries and corresponding RSA keys.`);
    } catch (error) {
        logger.error(`${parentLogId} Error in cleanupFulfilledEntries:`, error);
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
                throw new Error('Failed to initialize RandomClient1');
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
        // Use db_tools function to get count of usable DB entries
        const currentCount = await getUsableEntriesCount(client);
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
                throw new Error('Failed to initialize RandomClient2');
            }

            // Use db_tools function to get puzzle data
            const puzzleData = await getPuzzleDataForChallenge(client, requestId);
            
            if (!puzzleData) {
                logger.error(`${logPrefix} No database entry found for request`);
                return;
            }

            const { id: dbId, modulus, x: input } = puzzleData;
            
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
                throw new Error('Failed to initialize RandomClient3');
            }

            // Use db_tools function to get puzzle data for output
            const puzzleData = await getPuzzleDataForOutput(client, requestId);
            
            if (!puzzleData) {
                logger.error(`${logPrefix} No database entry found for request`);
                return;
            }

            const { id: dbId, output, rsaP, rsaQ } = puzzleData;
            
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
   
    }
}
