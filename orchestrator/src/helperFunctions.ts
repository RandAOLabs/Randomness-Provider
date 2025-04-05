import { GetOpenRandomRequestsResponse, GetProviderAvailableValuesResponse, Logger, LogLevel, RandomClient } from "ao-process-clients";
import { Client } from "pg";
import { COMPLETION_RETENTION_PERIOD_MS, DRYRUNTIMEOUT } from "./app";


let randomClientInstance: RandomClient | null = null;
let lastInitTime: number = 0;
const REINIT_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

const AO_CONFIG = {
    MU_URL: "https://ur-mu.randao.net",
    CU_URL: "https://ur-cu.randao.net",
    GATEWAY_URL: "https://arweave.net",
};
// Optional: Auto-reinitialize on a timer
setInterval(() => {
    randomClientInstance = null;
}, REINIT_INTERVAL);

export async function getRandomClient(): Promise<RandomClient> {
    const currentTime = Date.now();
    Logger.setLogLevel(LogLevel.DEBUG)
    if (!randomClientInstance || (currentTime - lastInitTime) > REINIT_INTERVAL) {
        randomClientInstance = ((await RandomClient.defaultBuilder())
            .withAOConfig(AO_CONFIG))
            .withWallet(JSON.parse(process.env.WALLET_JSON!))
            .build();
        lastInitTime = currentTime;
    }
    
    return randomClientInstance;
}








// Step 2: Process Challenge Requests (Database selection & assigning is atomic)
export async function processChallengeRequests(
    client: Client,
    activeChallengeRequests: { request_ids: string[] } | undefined,
    parentLogId: string
): Promise<void> {
    console.log(`${parentLogId} Step 2: Processing challenge requests.`);

    if (!activeChallengeRequests || activeChallengeRequests.request_ids.length === 0) {
        console.log(`${parentLogId} No Challenge Requests to process.`);
        return;
    }

    const requestIds = activeChallengeRequests.request_ids;
    console.log(`${parentLogId} Processing up to ${requestIds.length} requests.`);

    try {
        await client.query('BEGIN'); // Start transaction
    
        console.log(`${parentLogId} Fetching existing request mappings.`);
        
        // Fetch already assigned request_id -> dbId mappings
        const existingMappingsRes = await client.query(
            `SELECT request_id FROM time_lock_puzzles 
             WHERE request_id = ANY($1) 
             FOR UPDATE SKIP LOCKED`,
            [requestIds]
        );
    
        const existingRequestIds = new Set(existingMappingsRes.rows.map(row => row.request_id));
        console.log(`${parentLogId} Found ${existingRequestIds.size} already mapped requests.`);
    
        // Find only the unmapped requests (requestIds not in existingRequestIds)
        const unmappedRequestIds = requestIds.filter(requestId => !existingRequestIds.has(requestId));
        console.log(`${parentLogId} Unmapped requests: ${unmappedRequestIds.length}`);
    
        let mappedEntries: { requestId: string, dbId: number }[] = [];
    
        if (unmappedRequestIds.length > 0) {
            console.log(`${parentLogId} Fetching available DB entries.`);
            const dbRes = await client.query(
                `SELECT id FROM time_lock_puzzles 
                 WHERE request_id IS NULL 
                 ORDER BY id ASC 
                 LIMIT $1 
                 FOR UPDATE SKIP LOCKED`,
                [unmappedRequestIds.length]
            );
    
            const availableDbEntries = dbRes.rows.map(row => row.id);
            console.log(`${parentLogId} Found ${availableDbEntries.length} available DB entries.`);
    
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
                    console.log(`${parentLogId} Assigned Request ID ${unmappedRequestIds[i]} to DB Entry ${availableDbEntries[i]}.`);
                }
            } else {
                console.log(`${parentLogId} No available DB entries for unmapped requests.`);
            }
        }
    
        // Collect all request IDs (previously mapped + newly mapped)
        const allRequestIds = [...existingRequestIds, ...mappedEntries.map(entry => entry.requestId)];
    
        if (allRequestIds.length === 0) {
            console.log(`${parentLogId} No requests to process. Committing transaction.`);
            await client.query('COMMIT');
            return;
        }
    
        await client.query('COMMIT'); // Commit all updates at once
        console.log(`${parentLogId} Committed all changes. Now fulfilling challenges.`);
    
        // Call fulfillRandomChallenge for all request IDs
        await Promise.all(
            allRequestIds.map(requestId => 
                fulfillRandomChallenge(client, requestId, parentLogId)
                    .catch(error => console.error(`${parentLogId} Error fulfilling challenge for Request ID ${requestId}:`, error))
            )
        );
    
        console.log(`${parentLogId} All challenges fulfilled`);
    } catch (error:any) {
        console.error(`${parentLogId} Error in processChallengeRequests:`, error);
        await client.query('ROLLBACK'); // Rollback on failure
    
        console.error(`SQL State: ${error.code}, Message: ${error.message}`);
    } 
}
// Step 3: Process Output Requests (unchanged but with logging)
export async function processOutputRequests(
    client: Client,
    activeOutputRequests: { request_ids: string[] } | undefined,
    parentLogId: string
): Promise<void> {
    console.log(`${parentLogId} Step 3: Processing output requests.`);

    if (!activeOutputRequests || activeOutputRequests.request_ids.length === 0) {
        console.log(`${parentLogId} No Output Requests to process.`);
        return;
    }

    const outputPromises = activeOutputRequests.request_ids.map(async (requestId) => {
        console.log(`${parentLogId} Processing output request ID: ${requestId}`);

        // Run fulfillRandomOutput asynchronously (do not await)
        fulfillRandomOutput(client, requestId, parentLogId)
            .catch(error => console.error(`${parentLogId} Error fulfilling output:`, error));
    });

    await Promise.all(outputPromises);
    console.log(`${parentLogId} Step 3 completed.`);
}

// Step 4: Remove fulfilled entries no longer in use (unchanged but with logging)
export async function cleanupFulfilledEntries(
    client: Client,
    openRequests: any,
    parentLogId: string
): Promise<void> {
    console.log(`${parentLogId} Step 4: Checking for fulfilled entries no longer in use.`);

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
            console.log(`${parentLogId} Marked ${markAsCompleted.length} entries as completed.`);
        }

        // Delete old completed entries //TODO make sure its cleaning up BOTH tables
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
        
            console.log(`${parentLogId} Deleted ${markForDeletion.length} old completed entries and corresponding RSA keys.`);
        }

        await client.query('COMMIT');
    } catch (error) {
        console.error(`${parentLogId} Error in cleanupFulfilledEntries:`, error);
        await client.query('ROLLBACK');
    }

    console.log(`${parentLogId} Step 4 completed.`);
}



















export async function getProviderRequests(PROVIDER_ID: string, parentLogId: string): Promise<GetOpenRandomRequestsResponse | false> {

    let openRequests: GetOpenRandomRequestsResponse;

    // Create a function to fetch open requests with a timeout
    const fetchOpenRequests = async (): Promise<GetOpenRandomRequestsResponse> => {
        try {
            const response = await (await getRandomClient()).getOpenRandomRequests(PROVIDER_ID);
            return response;
        } catch (error) {
            console.error(`${parentLogId} Error fetching requests: ${error}`);
            return { /* Return a default or empty response here */ } as GetOpenRandomRequestsResponse;
        }
    };

    try {
        openRequests = await Promise.race([
            fetchOpenRequests().catch(err => {
                throw new Error(`${parentLogId} Fetch Error: ${err}`);
            }),
            new Promise<GetOpenRandomRequestsResponse>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), DRYRUNTIMEOUT)
            )
        ]);
    } catch (error) {
        console.log(`${parentLogId} Step 1: ${error}`);
        //randclient.setDryRunAsMessage(true);
        console.log("Removed this as its spamming")
        console.log("Switching dryrun off");
        openRequests = await fetchOpenRequests(); // Retry request
    }

    if(openRequests.toString().includes("not found")){
    return false
    }
    console.log(`${parentLogId} Step 1: Open Requests: ${JSON.stringify(openRequests)}`);
    console.log(`${parentLogId} Step 1: Open Challenge Requests count: ${openRequests.activeChallengeRequests.request_ids.length}`);
    console.log(`${parentLogId} Step 1: Open Challenge Requests count: ${openRequests.activeOutputRequests.request_ids.length}`);
    return openRequests;
}

export function updateAvailableValuesAsync(currentCount: number) {
    return (async () => {
        try {
            const randomClient = await getRandomClient();
            await randomClient.updateProviderAvailableValues(currentCount);
            console.log(`Updated provider values to ${currentCount}`);
        } catch (error) {
            console.error("Failed to update provider values:", error);
        }
    })();
}
export async function getProviderAvailableRandomValues(PROVIDER_ID: string): Promise<GetProviderAvailableValuesResponse> {
    try {
        const randomClient = await getRandomClient();
        return await randomClient.getProviderAvailableValues(PROVIDER_ID);
    } catch (error) {
        console.error(`Error fetching available random values: ${error}`);
        return {} as GetProviderAvailableValuesResponse;
    }
}

// Function to post VDF challenge (fetches dbId dynamically)
async function fulfillRandomChallenge(client: Client, requestId: string, parentLogId: string): Promise<void> {
    try {
        // Fetch the necessary details from the database using requestId
        const res = await client.query(
            `SELECT id, modulus, x 
             FROM time_lock_puzzles 
             WHERE request_id = $1`,
            [requestId]
        );

        if (!res.rowCount) {
            console.error(`No entry found for Request ID: ${requestId}`);
            return;
        }

        const { id: dbId, modulus, x: input } = res.rows[0];

        console.log(`${parentLogId} Fetched entry details - Request ID: ${requestId}, DB ID: ${dbId}, Modulus: ${modulus}, Input: ${input}`);

        console.log(`${parentLogId} Posting VDF challenge for Request ID: ${requestId}, DB ID: ${dbId}`);
        await (await getRandomClient()).commit({
            requestId: requestId,
            puzzle: {
                input: input,
                modulus: modulus
            }
        });
        console.log(`${parentLogId} Challenge posted for Request ID: ${requestId}. Waiting to post proof...`);
    } catch (error) {
        console.error(`${parentLogId} Error posting VDF challenge for Request ID: ${requestId}:`, error);
    }
}
// Function to post VDF output and proof
async function fulfillRandomOutput(client: Client, requestId: string, parentLogId: string): Promise<void> {
    try {
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
            console.error(`No entry found for request ID: ${requestId}`);
            return;
        }
       // Map the response to structured variables
const { 
    id: dbId, 
    output,  // Mapping 'y' to 'output'
    p: rsaP, 
    q: rsaQ 
} = res.rows[0];
        console.log(`${parentLogId} Fetched entry from database for output - ID: ${dbId}, requestID: ${requestId}, output: ${output}, rsaP: ${rsaP}, rsaQ ${rsaQ} `);

        console.log(`${parentLogId} Posting VDF output and proof for - ID: ${dbId}, request ID: ${requestId}`);
        await (await getRandomClient()).reveal({
            requestId: requestId,
            rsa_key: {
                p: rsaP,
                q: rsaQ
            }
        })
        console.log(`${parentLogId} Proof posted for request ID: ${requestId}`);
    } catch (error) {
        console.error(`${parentLogId} Error fulfilling random output for request ID: ${requestId}:`, error);
    }
}