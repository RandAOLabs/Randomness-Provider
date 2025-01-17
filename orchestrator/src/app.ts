import { Client } from 'pg';
import Docker from 'dockerode';
import AWS from 'aws-sdk';
import { getRandomClientAutoConfiguration, IRandomClient, RandomClient, RandomClientConfig } from "ao-process-clients"
import { dbConfig } from './db_config.js';

const RANDOM_CONFIG: RandomClientConfig = {
    tokenProcessId: "7enZBOhWsyU3A5oCt8HtMNNPHSxXYJVTlOGOetR9IDw",
    processId: "KbaY8P4h9wdHYKHlBSLbXN_yd-9gxUDxSgBackUxTiQ",
    wallet: JSON.parse(process.env.WALLET_JSON!),
    environment: 'mainnet'
}
//const randclient: IRandomClient = RandomClient.autoConfiguration()
const randclient: IRandomClient = new RandomClient(RANDOM_CONFIG)

const docker = new Docker();



// Constants for configuration
const POLLING_INTERVAL_MS = 5000;
const MINIMUM_ENTRIES = 250;
const TARGET_ENTRIES = 500;
//Expected increments per second=10×0.005=0.05
//180 times per hour
//4,320 times per day
//1,576,800 times per year
const MAX_OUTSTANDING_REQUESTS = 50;
const MAX_OUTSTANDING_FULFILLMENTS = 50;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 10000;
const VDF_JOB_IMAGE = 'randao/vdf_job:v0.1.4';
const ENVIRONMENT = process.env.ENVIRONMENT || 'local';
const ecs = new AWS.ECS({ region: process.env.AWS_REGION || 'us-east-1' });
const ongoingTasks = new Set<string>();  // Track task ARNs of running ECS tasks
const ongoingContainers = new Set<string>(); // Track container IDs of running Docker containers
const ongoingFulfillments = new Set<string>(); // Track request IDs for ongoing fulfillments
const PROVIDER_ID = process.env.PROVIDER_ID || "0";
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || "backend";
let ongoingRequest = false;
let spotInterruptions = 0;
let totalProvided = 0;
let PreviousTotalAvailableRandom = 0;

// Retry logic for connecting to PostgreSQL
async function connectWithRetry(): Promise<Client> {
    const client = new Client(dbConfig);
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await client.connect();
            console.log(`Connected to PostgreSQL database (Attempt ${attempt})`);
            return client;
        } catch (error) {
            console.error(`Connection attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
    }
    throw new Error("Failed to connect to PostgreSQL after multiple attempts");
}

// Setup the `verifiable_delay_functions` table if not exists
async function setupDatabase(client: Client): Promise<void> {

    // // Drop the table if it exists
    // await client.query(`
    //     DROP TABLE IF EXISTS verifiable_delay_functions;
    // `);
    // console.log("'verifiable_delay_functions' table dropped.");

    await client.query(`
        CREATE TABLE IF NOT EXISTS verifiable_delay_functions (
            id TEXT PRIMARY KEY,  -- Define as TEXT to match UUID format
            request_id TEXT,
            modulus TEXT NOT NULL,
            input TEXT NOT NULL,
            output TEXT NOT NULL,
            proof JSON NOT NULL,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log("Database setup complete. 'verifiable_delay_functions' table is ready.");
}

// Modified function to trigger VDF job pod using ECS or Docker
async function triggerVDFJobPod(): Promise<string | null> {
    if (ENVIRONMENT === 'cloud') {
        try {
            console.log("Cloud environment detected. Launching ECS task.");
            const result = await ecs.runTask({
                cluster: process.env.ECS_CLUSTER_NAME || 'fargate-cluster',
                taskDefinition: 'vdf-job',
                capacityProviderStrategy: [
                    {
                        capacityProvider: 'FARGATE_SPOT',
                        weight: 1
                    }
                ],
                networkConfiguration: {
                    awsvpcConfiguration: {
                        subnets: [process.env.SUBNET_ID || 'subnet-12345678'],
                        securityGroups: [process.env.SECURITY_GROUP || 'sg-12345678'],
                        assignPublicIp: 'ENABLED'
                    }
                },
                overrides: {
                    containerOverrides: [
                        {
                            name: 'vdf_job_container',
                            environment: [
                                { name: 'DATABASE_TYPE', value: 'postgresql' },
                                { name: 'DATABASE_HOST', value: process.env.DB_HOST || 'cloud-postgres-host' },
                                { name: 'DATABASE_PORT', value: process.env.DB_PORT || '5432' },
                                { name: 'DATABASE_USER', value: process.env.DB_USER || 'myuser' },
                                { name: 'DATABASE_PASSWORD', value: process.env.DB_PASSWORD || 'mypassword' },
                                { name: 'DATABASE_NAME', value: process.env.DB_NAME || 'mydatabase' },
                            ]
                        }
                    ]
                },
                count: 1
            }).promise();

            const taskArn = result.tasks?.[0]?.taskArn;
            if (taskArn) {
                ongoingTasks.add(taskArn);
                console.log(`ECS task started successfully: ${taskArn}`);
                return taskArn;
            }
            return null;
        } catch (error: any) {
            if (error?.code === 'SpotCapacityNotAvailableException') {
                spotInterruptions++;
                console.log(`Spot instance reclaimed by AWS. Total interruptions so far: ${spotInterruptions}`);
            } else {
                console.error("Error launching ECS task:", error);
            }
            return null;
        }
    } else {
        const containerName = `vdf_job_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        console.log(`Starting Docker container with name: ${containerName}`);
        const container = await docker.createContainer({
            Image: VDF_JOB_IMAGE,
            Cmd: ['python', 'main.py'],
            Env: [
                `DATABASE_TYPE=postgresql`,
                `DATABASE_HOST=${dbConfig.host}`,
                `DATABASE_PORT=${dbConfig.port.toString()}`,
                `DATABASE_USER=${dbConfig.user}`,
                `DATABASE_PASSWORD=${dbConfig.password}`,
                `DATABASE_NAME=${dbConfig.database}`,
            ],
            HostConfig: {
                NetworkMode: DOCKER_NETWORK,
            },
            name: containerName
        });

        await container.start();
        ongoingContainers.add(container.id);
        console.log(`Docker container ${containerName} started successfully.`);
        return container.id;
    }
}

// Modified function to wait for ECS tasks to complete and remove them from tracking
async function monitorECSTasks(): Promise<void> {
    if (ongoingTasks.size === 0) return;

    const describeTasksResult = await ecs.describeTasks({
        cluster: process.env.ECS_CLUSTER_NAME || 'fargate-cluster',
        tasks: Array.from(ongoingTasks)
    }).promise();

    describeTasksResult.tasks?.forEach(task => {
        // Check capacity provider name to determine if it is running Fargate or Fargate Spot
        const capacityProvider = task.capacityProviderName || 'Unknown';

        console.log(`ECS task: ${task.taskArn}, Capacity Provider: ${capacityProvider}`);

        if (task.lastStatus === 'STOPPED') {
            console.log(`ECS task stopped: ${task.taskArn}`);
            if (task.stoppedReason) {
                console.log(`Task stopped reason: ${task.stoppedReason}`);
                if (task.stoppedReason.includes('Host EC2 instance termination')) {
                    spotInterruptions++;
                    console.log(`Spot instance reclaimed by AWS. Total interruptions so far: ${spotInterruptions}`);
                }
            } else {
                console.log('Task stopped due to normal completion.');
            }
            ongoingTasks.delete(task.taskArn as string);
        }
    });
}

// Function to wait for Docker containers to complete and remove them from tracking
async function monitorDockerContainers(): Promise<void> {
    if (ongoingContainers.size === 0) return;

    for (const containerId of ongoingContainers) {
        try {
            const container = docker.getContainer(containerId);
            const containerInfo = await container.inspect();

            // Check if the container is already stopped (exited)
            if (containerInfo.State.Status === 'exited') {
                console.log(`Docker container stopped: ${containerId}`);

                // Attempt to remove the container, handling possible errors gracefully
                try {
                    await container.remove({ force: true }); // Force removal to avoid "in progress" errors
                    console.log(`Docker container removed: ${containerId}`);
                    ongoingContainers.delete(containerId);
                } catch (removeError) {
                    if (isDockerError(removeError) && removeError.statusCode === 409) {
                        // Error 409 means removal is in progress, so skip this container for now
                        console.log(`Removal of container ${containerId} is already in progress. Skipping.`);
                    } else {
                        // Handle other errors that might occur during container removal
                        console.error(`Error removing Docker container ${containerId}:`, removeError);
                    }
                }
            }
        } catch (error) {
            console.error(`Error inspecting Docker container ${containerId}:`, error);
            ongoingContainers.delete(containerId); // Remove from tracking if there's an error (e.g., container not found)
        }
    }
}

// Helper function to type guard Docker errors
function isDockerError(error: unknown): error is { statusCode: number } {
    return typeof error === 'object' && error !== null && 'statusCode' in error && typeof (error as any).statusCode === 'number';
}

// Function to process hex output for 64-bit modulus
function hexMod64Bit(expectedOutput: string): { expectedOutput64BitBase10: string } {
    // Parse the hexadecimal string into a BigInt
    const number = BigInt(`0x${expectedOutput}`);
    
    // Define the 64-bit modulus (2^64 - 1)
    const modulus = BigInt("0x7FFFFFFFF");
    
    // Keep dividing by modulus until we get a remainder less than modulus
    let remainder = number;
    while (remainder >= modulus) {
        remainder = remainder % modulus;
    }
    
    // Return the remainder in base 10
    return {
        expectedOutput64BitBase10: remainder.toString(),
    };
}

// Function to prepend 0x to hex strings
function addHexPrefix(value: string): string {
    return value.startsWith('0x') ? value : `0x${value}`;
}

// Function to check if there are fewer than MINIMUM_ENTRIES and fetch until TARGET_ENTRIES
async function checkAndFetchIfNeeded(client: Client): Promise<void> {
    try {
        if (ongoingRequest) return;
        const res = await client.query('SELECT COUNT(*) AS count FROM verifiable_delay_functions WHERE request_id IS NULL');
        const currentCount = parseInt(res.rows[0].count, 10);
        console.log("Total usable db entries: " + currentCount);

        if (currentCount < MINIMUM_ENTRIES) {
            const entriesNeeded = TARGET_ENTRIES - currentCount;
            console.log(`Less than ${MINIMUM_ENTRIES} entries found. Fetching ${entriesNeeded} more entries to reach ${TARGET_ENTRIES}...`);
            ongoingRequest = true;

            const batchCount = Math.min(entriesNeeded, MAX_OUTSTANDING_REQUESTS);
            console.log(`Batchcount: ${batchCount}, Ongoing containers: ${ongoingContainers.size}`);

            let spawnCount = Math.min(batchCount, MAX_OUTSTANDING_REQUESTS - ongoingContainers.size);
            if (spawnCount <= 0) {
                console.log("Max outstanding containers reached. Skipping new container launches.");
                return;
            }
            
            for (let i = 0; i < spawnCount; i++) {
                if (ENVIRONMENT === 'cloud' && ongoingTasks.size < MAX_OUTSTANDING_REQUESTS) {
                    triggerVDFJobPod().then(taskArn => {
                        if (taskArn) console.log(`ECS task triggered: ${taskArn}`);
                    }).catch(console.error);
                } else if (ENVIRONMENT !== 'cloud' && ongoingContainers.size < MAX_OUTSTANDING_REQUESTS) {
                    triggerVDFJobPod().then(containerId => {
                        if (containerId) console.log(`Docker container triggered: ${containerId}`);
                    }).catch(console.error);
                }
            }

            ongoingRequest = false; // Immediately allow other operations
        }
    } catch (error) {
        console.error('Error during check and fetch:', error);
        ongoingRequest = false;
    }
}

// Function to post VDF challenge (fetches dbId dynamically)
async function fulfillRandomChallenge(client: Client, requestId: string): Promise<void> {
    try {
        // Fetch the necessary details from the database using requestId
        const res = await client.query(
            `SELECT id, modulus, input 
             FROM verifiable_delay_functions 
             WHERE request_id = $1`,
            [requestId]
        );

        if (!res.rowCount) {
            console.error(`No entry found for Request ID: ${requestId}`);
            return;
        }

        const { id: dbId, modulus, input } = res.rows[0];

        console.log(`Fetched entry details - Request ID: ${requestId}, DB ID: ${dbId}, Modulus: ${modulus}, Input: ${input}`);

        // Add hex prefix to modulus and input
        const hexModulus = addHexPrefix(modulus);
        const hexInput = addHexPrefix(input);

        console.log(`Posting VDF challenge for Request ID: ${requestId}, DB ID: ${dbId}`);
        await randclient.postVDFChallenge(requestId, hexModulus, hexInput);
        console.log(`Challenge posted for Request ID: ${requestId}. Waiting to post proof...`);
    } catch (error) {
        console.error(`Error posting VDF challenge for Request ID: ${requestId}:`, error);
    }
}



// Function to post VDF output and proof
async function fulfillRandomOutput(client: Client, requestId: string): Promise<void> {
    try {
        // Fetch the output and proof from the database using the requestId
        const res = await client.query('SELECT id, output, proof FROM verifiable_delay_functions WHERE request_id = $1', [requestId]);
        if (!res.rowCount) {
            console.error(`No entry found for request ID: ${requestId}`);
            return;
        }
        const { id: dbId, output, proof } = res.rows[0];

        console.log(`Fetched entry from database for output - ID: ${dbId}, requestID: ${requestId}`);
        
        // Process the output through hexMod64Bit
        const processedOutput = hexMod64Bit(output).expectedOutput64BitBase10;
        console.log(`Processed output: ${processedOutput}  For request ID: ${requestId}`);
        // Process the proof array - add hex prefix to each element
        let processedProof = proof;
        if (Array.isArray(proof)) {
            processedProof = proof.map(element => addHexPrefix(element));
        }
        const proofString = JSON.stringify(processedProof);

        console.log(`Posting VDF output and proof for - ID: ${dbId}, request ID: ${requestId}`);
        await randclient.postVDFOutputAndProof(requestId, processedOutput, proofString);
        console.log(`Proof posted for request ID: ${requestId}`);

        ongoingFulfillments.delete(dbId);
    } catch (error) {
        console.error(`Error fulfilling random output for request ID: ${requestId}:`, error);
    }
}

function getLogId(): string {
    const randomId = Math.floor(10000 + Math.random() * 90000); // 5-digit random number
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false }); // HH:MM:SS format
    return `[LogID: ${randomId} | ${timestamp}]`;
}

let pollingInProgress = false; // Global flag to track polling state

async function polling(client: Client): Promise<void> {
    if (pollingInProgress) {
        console.log(`[SKIPPED] Polling is already in progress. Skipping this run.`);
        return; // Prevent concurrent execution
    }

    pollingInProgress = true; // Mark polling as in progress
    const logId = getLogId();
    console.log(`${logId} Starting Polling...`);

    try {
        console.log(`${logId} Step 1: Fetching open requests from the Randomness Client.`);
        const openRequests = await randclient.getOpenRandomRequests(PROVIDER_ID);
        console.log(`${logId} Step 1: Open Requests: ${JSON.stringify(openRequests)}`);
        console.log(openRequests);
        console.log(`${logId} Step 1: Open requests fetched.`);

        // Run Step 2, 3, and 4 concurrently after Step 1
        await Promise.all([
            processChallengeRequests(client, openRequests.activeChallengeRequests, logId),
            processOutputRequests(client, openRequests.activeOutputRequests, logId),
            cleanupFulfilledEntries(client, openRequests, logId)
        ]);

        console.log(`${logId} Polling cycle completed successfully.`);
    } catch (error) {
        console.error(`${logId} An error occurred during polling:`, error);
    } finally {
        pollingInProgress = false; // Reset flag after execution
    }
}


// Step 2: Process Challenge Requests (Database selection & assigning is atomic)
async function processChallengeRequests(
    client: Client,
    activeChallengeRequests: { request_ids: string[] } | undefined,
    parentLogId: string
): Promise<void> {
    const logId = getLogId();
    console.log(`${logId} Step 2: Processing challenge requests.`);

    if (!activeChallengeRequests || activeChallengeRequests.request_ids.length === 0) {
        console.log(`${logId} No Challenge Requests to process.`);
        return;
    }

    // Limit to MAX_OUTSTANDING_FULFILLMENTS requests
    const requestIds = activeChallengeRequests.request_ids.slice(0, MAX_OUTSTANDING_FULFILLMENTS);
    console.log(`${logId} Processing up to ${requestIds.length} requests.`);

    try {
        await client.query('BEGIN'); // Start transaction

        console.log(`${logId} Fetching existing request mappings.`);
        // Fetch already assigned request_id -> dbId mappings
        const existingMappingsRes = await client.query(
            `SELECT request_id FROM verifiable_delay_functions 
             WHERE request_id = ANY($1) 
             FOR UPDATE SKIP LOCKED`, 
            [requestIds]
        );

        const existingRequestIds = new Set(existingMappingsRes.rows.map(row => row.request_id));
        console.log(`${logId} Found ${existingRequestIds.size} already mapped requests.`);

        // Find only the unmapped requests (requestIds not in existingRequestIds)
        const unmappedRequestIds = requestIds.filter(requestId => !existingRequestIds.has(requestId));
        console.log(`${logId} Unmapped requests: ${unmappedRequestIds.length}`);

        // Fetch available DB entries for unmapped requests
        console.log(`${logId} Fetching available DB entries.`);
        const dbRes = await client.query(
            `SELECT id FROM verifiable_delay_functions 
             WHERE request_id IS NULL 
             ORDER BY id ASC 
             LIMIT $1 
             FOR UPDATE SKIP LOCKED`,
            [unmappedRequestIds.length]
        );

        const availableDbEntries = dbRes.rows.map(row => row.id);
        console.log(`${logId} Found ${availableDbEntries.length} available DB entries.`);

        // Reduce request list if we don’t have enough DB entries
        if (availableDbEntries.length < unmappedRequestIds.length) {
            console.log(`${logId} Limiting requests to ${availableDbEntries.length} due to DB availability.`);
            unmappedRequestIds.length = availableDbEntries.length;
        }

        if (availableDbEntries.length === 0 && existingRequestIds.size === 0) {
            console.log(`${logId} No available DB entries to process and no existing mappings.`);
            await client.query('COMMIT'); // Commit to release locks
            return;
        }

        // Map unmapped requestIds to available DB entries (1:1)
        for (let i = 0; i < unmappedRequestIds.length; i++) {
            await client.query(
                `UPDATE verifiable_delay_functions 
                 SET request_id = $1 
                 WHERE id = $2`,
                [unmappedRequestIds[i], availableDbEntries[i]]
            );
            console.log(`${logId} Assigned Request ID ${unmappedRequestIds[i]} to DB Entry ${availableDbEntries[i]}.`);
        }

        await client.query('COMMIT'); // Commit all updates at once

        // Call fulfillRandomChallenge for all request IDs (existing + newly mapped)
        for (const requestId of requestIds) {
            fulfillRandomChallenge(client, requestId)
                .catch(error => console.error(`${logId} Error fulfilling challenge for Request ID ${requestId}:`, error));
        }

        console.log(`${logId} Step 2 completed.`);
    } catch (error) {
        console.error(`${logId} Error in processChallengeRequests:`, error);
        await client.query('ROLLBACK'); // Rollback on failure
    }
}





// Step 3: Process Output Requests (unchanged but with logging)
async function processOutputRequests(
    client: Client,
    activeOutputRequests: { request_ids: string[] } | undefined,
    parentLogId: string
): Promise<void> {
    const logId = getLogId();
    console.log(`${logId} Step 3: Processing output requests.`);

    if (!activeOutputRequests || activeOutputRequests.request_ids.length === 0) {
        console.log(`${logId} No Output Requests to process.`);
        return;
    }

    const outputPromises = activeOutputRequests.request_ids.map(async (requestId) => {
        console.log(`${logId} Processing output request ID: ${requestId}`);

        // Run fulfillRandomOutput asynchronously (do not await)
        fulfillRandomOutput(client, requestId)
            .catch(error => console.error(`${logId} Error fulfilling output:`, error));
    });

    await Promise.all(outputPromises);
    console.log(`${logId} Step 3 completed.`);
}

// Step 4: Remove fulfilled entries no longer in use (unchanged but with logging)
async function cleanupFulfilledEntries(
    client: Client,
    openRequests: any,
    parentLogId: string
): Promise<void> {
    const logId = getLogId();
    console.log(`${logId} Step 4: Checking for fulfilled entries no longer in use.`);

    const noLongerUsedIds: string[] = [];
    for (const ongoingId of ongoingFulfillments) {
        const challengeInProgress = openRequests.activeChallengeRequests?.request_ids.includes(ongoingId);
        const outputInProgress = openRequests.activeOutputRequests?.request_ids.includes(ongoingId);

        if (!challengeInProgress && !outputInProgress) {
            noLongerUsedIds.push(ongoingId);
        }
    }

    if (noLongerUsedIds.length > 0) {
        console.log(`${logId} No longer in use: ${noLongerUsedIds.join(', ')}`);
        noLongerUsedIds.forEach((id) => {
            ongoingFulfillments.delete(id);
            console.log(`${logId} Removed ID ${id} from ongoing fulfillments.`);
        });
    } else {
        console.log(`${logId} No fulfilled entries to remove.`);
    }

    console.log(`${logId} Step 4 completed.`);
}


// Main function
async function run(): Promise<void> {
    const client = await connectWithRetry();
    await setupDatabase(client);

    setInterval(async () => {
        const res = await client.query('SELECT COUNT(*) as count FROM verifiable_delay_functions');
        console.log(`Periodic log - Current database size: ${res.rows[0].count}`);
        // Check and fetch entries for the database if needed
        console.log("Step 1: Checking and fetching database entries if below threshold.");
        checkAndFetchIfNeeded(client).catch((error) => {
            console.error("Error in checkAndFetchIfNeeded:", error);
        });
        
    }, 10000);

    setInterval(async () => {
        await monitorDockerContainers();
        await monitorECSTasks();
    }, 30000); // Cleanup every 30 seconds

    setInterval(async () => {
        await polling(client);
    }, POLLING_INTERVAL_MS);

    process.on("SIGTERM", async () => {
        console.log("SIGTERM received. Closing database connection.");
        await client.end();
        process.exit(0);
    });
}

run().catch((err) => console.error(`Error in main function: ${err}`));
