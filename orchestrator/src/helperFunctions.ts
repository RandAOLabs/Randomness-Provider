import { GetOpenRandomRequestsResponse, GetProviderAvailableValuesResponse, RandomClient, RequestList } from "ao-process-clients";
import { Client } from "pg";
import { COMPLETION_RETENTION_PERIOD_MS, MINIMUM_ENTRIES, UNCHAIN_VS_OFFCHAIN_MAX_DIF } from "./app";
import { getMoreRandom, monitorDockerContainers } from "./containerManagment";
import logger, { LogLevel } from "./logger";
import { monitoring } from "./monitoring";
import { setTimeout, setInterval } from 'timers';

let randomClientInstance: RandomClient | null = null;
let lastInitTime: number = 0;
const REINIT_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds
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

// Function to reset the ongoingRandomGeneration flag
export function resetOngoingRandomGeneration() {
    ongoingRandomGeneration = false;
    logger.info('Random generation flag reset. System ready for new random generation requests.');
}

// Optional: Auto-reinitialize on a timer
setInterval(() => {
    randomClientInstance = null;
}, REINIT_INTERVAL);

export async function getRandomClient(): Promise<RandomClient> {
    const currentTime = Date.now();

    if (!randomClientInstance || (currentTime - lastInitTime) > REINIT_INTERVAL) {
        logger.debug("Initializing RandomClient");
        randomClientInstance = ((await RandomClient.defaultBuilder()))
            .withWallet(JSON.parse(process.env.WALLET_JSON!))
            .withAOConfig({
                CU_URL: "https://ur-cu.randao.net",
                MU_URL: "https://ur-mu.randao.net",
                MODE: "legacy"
            })
            .build();
        lastInitTime = currentTime;
        logger.debug("RandomClient initialized");
    }

    return randomClientInstance;
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

export async function getProviderRequests(PROVIDER_ID: string, parentLogId: string): Promise<GetOpenRandomRequestsResponse> {
    const defaultResponse: GetOpenRandomRequestsResponse = {
        providerId: PROVIDER_ID,
        activeChallengeRequests: { request_ids: [] },
        activeOutputRequests: { request_ids: [] }
    };
    try {
        const response = await (await getRandomClient()).getAllProviderActivity();
        const provider = response.find(p => p.provider_id === PROVIDER_ID);

        if (!provider) {
            logger.warn(`${parentLogId} Warning: Provider with ID ${PROVIDER_ID} not found.`);
            return defaultResponse;
        }

        // Attempt to parse fields if they exist, otherwise default to empty arrays
        let parsedChallengeRequests: RequestList = { request_ids: [] };
        let parsedOutputRequests: RequestList = { request_ids: [] };

        try {
            if (provider.active_challenge_requests) {
                //@ts-ignore
                parsedChallengeRequests = JSON.parse(provider.active_challenge_requests);
            }
        } catch (err) {
            logger.warn(`${parentLogId} Warning: Failed to parse active_challenge_requests:`, err);
        }

        try {
            if (provider.active_output_requests) {
                //@ts-ignore
                parsedOutputRequests = JSON.parse(provider.active_output_requests);
            }
        } catch (err) {
            logger.warn(`${parentLogId} Warning: Failed to parse active_output_requests:`, err);
        }

        // Only update current_onchain_random if successful
        current_onchain_random = provider.random_balance;

        const result: GetOpenRandomRequestsResponse = {
            providerId: provider.provider_id,
            activeChallengeRequests: parsedChallengeRequests,
            activeOutputRequests: parsedOutputRequests,
        };

        logger.verbose(`${parentLogId} Step 1: Open Requests: ${JSON.stringify(result)}`);
        logger.info(`${parentLogId} Step 1: Open Challenge Requests count: ${result.activeChallengeRequests.request_ids.length}`);
        logger.info(`${parentLogId} Step 1: Open Output Requests count: ${result.activeOutputRequests.request_ids.length}`);

        return result;

    } catch (error) {
        logger.error(`${parentLogId} Error fetching provider requests: ${error}`);
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
        if (currentCount >= MINIMUM_ENTRIES) return;

        // Set the flag to prevent concurrent random generation
        ongoingRandomGeneration = true;

        // Calculate how many random values we need
        const entriesNeeded = MINIMUM_ENTRIES - currentCount;
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
    // Check if this request ID is on cooldown
    if (challengeCooldowns.get(requestId)) {
        logger.debug(`${parentLogId} Skipping challenge for request ID ${requestId} - on cooldown`);
        return;
    }

    try {
        // Mark this request ID as being processed to prevent duplicates
        challengeCooldowns.set(requestId, true);

        // Fetch the necessary details from the database using requestId
        const res = await client.query(
            `SELECT id, modulus, x 
             FROM time_lock_puzzles 
             WHERE request_id = $1`,
            [requestId]
        );

        if (!res.rowCount) {
            logger.error(`No entry found for Request ID: ${requestId}`);
            return;
        }

        const { id: dbId, modulus, x: input } = res.rows[0];

        logger.debug(`${parentLogId} Fetched entry details - Request ID: ${requestId}, DB ID: ${dbId}, Modulus: ${modulus}, Input: ${input}`);

        logger.info(`${parentLogId} Posting VDF challenge for Request ID: ${requestId}, DB ID: ${dbId}`);
        await (await getRandomClient()).commit({
            requestId: requestId,
            puzzle: {
                input: input,
                modulus: modulus
            }
        });
        logger.info(`${parentLogId} Challenge posted for Request ID: ${requestId}. Waiting to post proof...`);

        // Set a timeout to release the cooldown after 1 second
        setTimeout(() => {
            challengeCooldowns.delete(requestId);
            logger.debug(`${parentLogId} Challenge cooldown released for request ID: ${requestId}`);
        }, 1000);
    } catch (error) {
        logger.error(`${parentLogId} Error posting VDF challenge for Request ID: ${requestId}:`, error);
        // Release the cooldown immediately on error to allow retry
        challengeCooldowns.delete(requestId);
    }
}

// Function to post VDF output and proof
async function fulfillRandomOutput(client: Client, requestId: string, parentLogId: string): Promise<void> {
    // Check if this request ID is on cooldown
    if (outputCooldowns.get(requestId)) {
        logger.debug(`${parentLogId} Skipping output for request ID ${requestId} - on cooldown`);
        return;
    }

    try {
        // Mark this request ID as being processed to prevent duplicates
        outputCooldowns.set(requestId, true);

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
            logger.error(`No entry found for request ID: ${requestId}`);
            return;
        }

        // Map the response to structured variables
        const {
            id: dbId,
            output,  // Mapping 'y' to 'output'
            p: rsaP,
            q: rsaQ
        } = res.rows[0];

        logger.debug(`${parentLogId} Fetched entry from database for output - ID: ${dbId}, requestID: ${requestId}, output: ${output}, rsaP: ${rsaP}, rsaQ ${rsaQ} `);

        logger.info(`${parentLogId} Posting VDF output and proof for - ID: ${dbId}, request ID: ${requestId}`);
        await (await getRandomClient()).reveal({
            requestId: requestId,
            rsa_key: {
                p: rsaP,
                q: rsaQ
            }
        });
        logger.info(`${parentLogId} Proof posted for request ID: ${requestId}`);

        // Set a timeout to release the cooldown after 1 second
        setTimeout(() => {
            outputCooldowns.delete(requestId);
            logger.debug(`${parentLogId} Output cooldown released for request ID: ${requestId}`);
        }, 1000);
    } catch (error) {
        logger.error(`${parentLogId} Error fulfilling random output for request ID: ${requestId}:`, error);
        // Release the cooldown immediately on error to allow retry
        outputCooldowns.delete(requestId);
    }
}

export async function shutdown() {
    //TODO do post 0 avalible random then do like as much polling as you can before turning off to ensure all random gets pushed through
    try {
        // // Get monitoring data for final update
        // const monitoringData = await monitoring.getMonitoringData();

        // Set provider available values to 0 and include final monitoring data
        const message = await (await getRandomClient()).updateProviderAvailableValues(0);
        logger.info(String(message)); // Convert message to string
        logger.info(`Updated provider values to 0`);
    } catch (error) {
        logger.error("Failed to update provider values:", error);
        monitoring.incrementErrorCount();
    }
}
