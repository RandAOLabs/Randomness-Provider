import { Client } from 'pg';
import Docker from 'dockerode';
import AWS from 'aws-sdk';
import { GetOpenRandomRequestsResponse, GetProviderAvailableValuesResponse, RandomClient, RandomClientConfig} from "ao-process-clients"
import { dbConfig } from './db_config.js';
import { getNetworkConfig, launchVDFTask, NetworkConfig } from './ecs_config';
import Arweave from 'arweave';

// const RANDOM_CONFIG: RandomClientConfig = {
//     wallet: JSON.parse(process.env.WALLET_JSON!),
//     tokenProcessId: '',
//     processId: ''
// }
//const randclient: IRandomClient = RandomClient.autoConfiguration()
async function getRandomClient(): Promise<RandomClient>{
//     let test = await getRandomClientAutoConfiguration()
// test.wallet = JSON.parse(process.env.WALLET_JSON!)

const RANDOM_CONFIG: RandomClientConfig = {
    wallet: JSON.parse(process.env.WALLET_JSON!),
    tokenProcessId: '5ZR9uegKoEhE9fJMbs-MvWLIztMNCVxgpzfeBVE3vqI',
    processId: '1dnDvaDRQ7Ao6o1ohTr7NNrN5mp1CpsXFrWm3JJFEs8'
}
const randclient = new RandomClient(RANDOM_CONFIG)
    return randclient
}

// async function getStakingClient(): Promise<ProviderStakingClient>{
//     let test = await getProviderStakingClientAutoConfiguration()
// test.wallet = JSON.parse(process.env.WALLET_JSON!)
// const randclient = new ProviderStakingClient(test)
//     return randclient
// }


const docker = new Docker();



// Constants for configuration
const POLLING_INTERVAL_MS = 1000;
const MINIMUM_ENTRIES = 500;
const DRYRUNTIMEOUT = 15000; // 15 seconds
//const DRYRUNRESETTIME = 300000; // 5 min
//Expected increments per second=10×0.005=0.05
//180 times per hour
//4,320 times per day
//1,576,800 times per year
const MAX_OUTSTANDING_VDF_CONTAINERS = 10;
const RANDOM_PER_VDF = 10;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 10000;
const VDF_JOB_IMAGE = 'randao/vdf_job:v0.1.4';
const ENVIRONMENT = process.env.ENVIRONMENT || 'local';
const ecs = new AWS.ECS({ region: process.env.AWS_REGION || 'us-east-1' });
const ongoingContainers = new Set<string>(); // Track container IDs of running Docker containers
let PROVIDER_ID = "";
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || "backend";
const COMPLETION_RETENTION_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
let ongoingRequest = false;
let spotInterruptions = 0;
// Global variables to track polling status
let pollingInProgress = false;
let lastPollingId: string | null = null;
let pulledDockerimage = false;

// Cache for network configuration
let cachedNetworkConfig: NetworkConfig | null = null;


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
    await client.query(`
        CREATE TABLE IF NOT EXISTS verifiable_delay_functions (
            id TEXT PRIMARY KEY,  
            request_id TEXT,
            modulus TEXT NOT NULL,
            input TEXT NOT NULL,
            output TEXT NOT NULL,
            proof JSON NOT NULL,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            detected_completed TIMESTAMP NULL
        );
    `);

    // Ensure detected_completed column exists in case the table was created before it was added
    await client.query(`
            ALTER TABLE verifiable_delay_functions 
            ADD COLUMN IF NOT EXISTS detected_completed TIMESTAMP NULL;
        `);
    console.log("Database setup complete. 'verifiable_delay_functions' table is ready.");
}


async function triggerVDFJobPod(): Promise<string | null> {
    if (ENVIRONMENT === 'cloud') {
        try {
            console.log("Cloud environment detected. Launching ECS task.");

            // Get or refresh network configuration
            if (!cachedNetworkConfig) {
                console.log("Fetching network configuration...");
                cachedNetworkConfig = await getNetworkConfig(ecs);
                console.log("Network config:", cachedNetworkConfig);
            }

            const taskArn = await launchVDFTask(ecs, cachedNetworkConfig, RANDOM_PER_VDF);
            if (taskArn) {
                ongoingContainers.add(taskArn);
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
                // Reset network config cache on error to force refresh on next attempt
                cachedNetworkConfig = null;
            }
            return null;
        }
    } else {
        // Check if we have reached the maximum number of containers
        if (ongoingContainers.size >= MAX_OUTSTANDING_VDF_CONTAINERS) {
            console.log(`Maximum outstanding VDF containers (${MAX_OUTSTANDING_VDF_CONTAINERS}) reached. Not starting new container.`);
            return null;
        }

        const containerName = `vdf_job_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        console.log(`Starting Docker container with name: ${containerName}`);
        try {
            if (!pulledDockerimage) {
                console.log(`Pulling image: ${VDF_JOB_IMAGE}`);
                await new Promise((resolve, reject) => {
                    docker.pull(VDF_JOB_IMAGE, (err: any, stream: NodeJS.ReadableStream) => {
                        if (err) {
                            return reject(err);
                        }
                        docker.modem.followProgress(stream, (doneErr) => {
                            if (doneErr) reject(doneErr);
                            else resolve(true);
                        });
                    });
                });
                pulledDockerimage = true;
            }
            const container = await docker.createContainer({
                Image: VDF_JOB_IMAGE,
                Cmd: ['sh', '-c', `for i in $(seq 1 ${RANDOM_PER_VDF}); do python main.py; done`],
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
        } catch (error) {
            console.error(`Error starting Docker container ${containerName}:`, error);
            return null;
        }
    }
}


// Modified function to wait for ECS tasks to complete and remove them from tracking
async function monitorECSTasks(): Promise<void> {
    if (ongoingContainers.size === 0) return;

    const describeTasksResult = await ecs.describeTasks({
        cluster: process.env.ECS_CLUSTER_NAME || 'fargate-cluster',
        tasks: Array.from(ongoingContainers)
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
            ongoingContainers.delete(task.taskArn as string);
        }
    });
}

// Function to wait for Docker containers to complete and remove them from tracking
async function monitorDockerContainers(): Promise<void> {
    if (ongoingContainers.size === 0) return;
    if (ENVIRONMENT === 'cloud') {
        await monitorECSTasks();
    } else {

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

function updateAvailableValuesAsync(currentCount: number) {
    return (async () => {
        try {
            (await getRandomClient()).updateProviderAvailableValues(currentCount);
            console.log(`Updated provider values to ${currentCount}`);
        } catch (error) {
            console.error("Failed to update provider values:", error);
        }
    })();
}

async function shutdown() {
    return (async () => {
        try {
            let message = await (await getRandomClient()).updateProviderAvailableValues(0);
            console.log(message)
            console.log(`Updated provider values to ${0}`);
        } catch (error) {
            console.error("Failed to update provider values:", error);
        }
    })();
}

async function getMoreRandom(currentCount: number) {
    const entriesNeeded = MINIMUM_ENTRIES - currentCount;
    //TODO this math looked wrong in https://discord.com/channels/1209645894039896074/1333434937537204336/1336000074765045853
    console.log(`Less than ${MINIMUM_ENTRIES} entries found. Fetching ${entriesNeeded} more entries...`);

    ongoingRequest = true;

    // Calculate how many containers to spawn
    const possibleBatchCount = Math.ceil(entriesNeeded / RANDOM_PER_VDF);
    const availableSpawns = Math.min(
        possibleBatchCount,
        MAX_OUTSTANDING_VDF_CONTAINERS - ongoingContainers.size
    );

    if (availableSpawns <= 0) {
        console.log("Max outstanding containers reached. Skipping new container launches.");
        ongoingRequest = false;
        return;
    }

    console.log(`Spawning up to ${availableSpawns} containers to generate random values.`);

    for (let i = 0; i < availableSpawns; i++) {
        try {
            const jobId = await triggerVDFJobPod();
            if (jobId) {
                console.log(`Job triggered: ${jobId}`);
                ongoingContainers.add(jobId);
            }
        } catch (error) {
            console.error('Error triggering job pod:', error);
        }
    }
}


// Function to check and fetch database entries as needed
async function checkAndFetchIfNeeded(client: Client) {
    try {
        //Check if provider has been given a special signal
        const on_chain_avalible_random = await getProviderAvailableRandomValues(PROVIDER_ID);
        // Query current count of usable DB entries
        const res = await client.query(
            'SELECT COUNT(*) AS count FROM verifiable_delay_functions WHERE request_id IS NULL'
        );
        const currentCount = parseInt(res.rows[0].count, 10);
        console.log("Total usable DB entries: " + currentCount);

        switch (on_chain_avalible_random.availibleRandomValues) {
            case -1:
                console.log("Provider is shutting down");
                //TODO prepare for shutdown
                //TODO the async causes it to ovewrite itself
                break;
            case -2:
                console.log("Value is -2");
                break;
            case -3:
                console.log("Value is -3");
                break;
            default:
                console.log("Value is not -1, -2, or -3");
                console.log("Value is "+ on_chain_avalible_random.availibleRandomValues)
                if (on_chain_avalible_random.availibleRandomValues != currentCount) {
                    console.log(`Updating available random values from ${on_chain_avalible_random.availibleRandomValues} to ${currentCount}`);
                    updateAvailableValuesAsync(currentCount);
                }
        }
        if (ongoingRequest) return; // Prevent redundant operations

        // Check if more entries are needed
        if (currentCount >= MINIMUM_ENTRIES) return;
        getMoreRandom(currentCount)

    } catch (error) {
        console.error('Error during check and fetch:', error);
    } finally {
        ongoingRequest = false; // Allow future operations
    }
}

// Function to post VDF challenge (fetches dbId dynamically)
async function fulfillRandomChallenge(client: Client, requestId: string, parentLogId: string): Promise<void> {
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

        console.log(`${parentLogId} Fetched entry details - Request ID: ${requestId}, DB ID: ${dbId}, Modulus: ${modulus}, Input: ${input}`);

        // Add hex prefix to modulus and input
        const hexModulus = addHexPrefix(modulus);
        const hexInput = addHexPrefix(input);

        console.log(`${parentLogId} Posting VDF challenge for Request ID: ${requestId}, DB ID: ${dbId}`);
        await (await getRandomClient()).postVDFChallenge(requestId, hexModulus, hexInput);
        console.log(`${parentLogId} Challenge posted for Request ID: ${requestId}. Waiting to post proof...`);
    } catch (error) {
        console.error(`${parentLogId} Error posting VDF challenge for Request ID: ${requestId}:`, error);
    }
}



// Function to post VDF output and proof
async function fulfillRandomOutput(client: Client, requestId: string, parentLogId: string): Promise<void> {
    try {
        // Fetch the output and proof from the database using the requestId
        const res = await client.query('SELECT id, output, proof FROM verifiable_delay_functions WHERE request_id = $1', [requestId]);
        if (!res.rowCount) {
            console.error(`No entry found for request ID: ${requestId}`);
            return;
        }
        const { id: dbId, output, proof } = res.rows[0];

        console.log(`${parentLogId} Fetched entry from database for output - ID: ${dbId}, requestID: ${requestId}`);

        // Process the output through hexMod64Bit
        const processedOutput = hexMod64Bit(output).expectedOutput64BitBase10;
        console.log(`${parentLogId} Processed output: ${processedOutput}  For request ID: ${requestId}`);
        // Process the proof array - add hex prefix to each element
        let processedProof = proof;
        if (Array.isArray(proof)) {
            processedProof = proof.map(element => addHexPrefix(element));
        }
        const proofString = JSON.stringify(processedProof);

        console.log(`${parentLogId} Posting VDF output and proof for - ID: ${dbId}, request ID: ${requestId}`);
        await (await getRandomClient()).postVDFOutputAndProof(requestId, processedOutput, proofString);
        console.log(`${parentLogId} Proof posted for request ID: ${requestId}`);
    } catch (error) {
        console.error(`${parentLogId} Error fulfilling random output for request ID: ${requestId}:`, error);
    }
}

function getLogId(): string {
    const randomId = Math.floor(10000 + Math.random() * 90000); // 5-digit random number
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false }); // HH:MM:SS format
    return `[LogID: ${randomId} | ${timestamp}]`;
}

async function getProviderRequests(PROVIDER_ID: string, parentLogId: string): Promise<GetOpenRandomRequestsResponse | false> {

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

async function getProviderAvailableRandomValues(PROVIDER_ID: string): Promise<GetProviderAvailableValuesResponse> {
    let avalibleRandom: GetProviderAvailableValuesResponse;
    // Create a function to fetch open requests with a timeout
    const fetchAvalibleRandom = async (): Promise<GetProviderAvailableValuesResponse> => {
        try {
            const response = await (await getRandomClient()).getProviderAvailableValues(PROVIDER_ID);
            return response;
        } catch (error) {
            console.error(`Error fetching avalible random: ${error}`);
            return { /* Return a default or empty response here */ } as GetProviderAvailableValuesResponse;
        }
    };

    try {
        avalibleRandom = await Promise.race([
            fetchAvalibleRandom().catch(err => {
                throw new Error(`Fetch Error: ${err}`);
            }),
            new Promise<GetProviderAvailableValuesResponse>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), DRYRUNTIMEOUT)
            )
        ]);
    } catch (error) {
        // console.log(`${parentLogId} Step 1: ${error}`);
        //randclient.setDryRunAsMessage(true);
        console.log("Removed this as its spamming")
        console.log("Switching dryrun off");
        avalibleRandom = await fetchAvalibleRandom(); // Retry request
    }
    return avalibleRandom;
}



async function polling(client: any) {
    if (pollingInProgress) {
        const completedSteps = Object.entries(stepTracking)
            .filter(([_, data]) => data?.completed)
            .map(([step, data]) => `${step} (Time: ${data?.timeTaken}ms)`);

        console.log(`\n[SKIPPED] Polling already in progress for ${lastPollingId}. Skipping this run.`);
        console.log(`Completed steps so far: ${completedSteps.length > 0 ? completedSteps.join(", ") : "None"}`);
        console.log("Current step tracking status:", stepTracking); // Debugging info to inspect tracking object
        return; // Prevent concurrent execution
    }

    resetStepTracking(); // Reset step tracking for fresh polling
    pollingInProgress = true; // Mark polling as in progress
    const logId = getLogId();
    lastPollingId = logId;
    console.log(`${logId} Starting Polling...`);

    try {
        const startTime = Date.now(); // Start time of polling

        // Step 1: Fetch open requests
        const s1 = Date.now();
        console.log(`${logId} Step 1 started.`);
        const openRequests = await getProviderRequests(PROVIDER_ID, logId);
        if(openRequests == false){
            console.log("Provider is set up and ready. Please stake to join network at https://providers_randao.ar.io")
            return
        }
        stepTracking.step1 = { completed: true, timeTaken: Date.now() - s1 };
        console.log(`${logId} Step 1: Open requests fetched. Time taken: ${stepTracking.step1.timeTaken}ms`);

        // Run Step 2, 3, and 4 concurrently
        await Promise.all([
            (async () => {
                const s2 = Date.now();
                console.log(`${logId} Step 2 started.`);
                await processChallengeRequests(client, openRequests.activeChallengeRequests, logId);
                stepTracking.step2 = { completed: true, timeTaken: Date.now() - s2 };
                console.log(`${logId} Step 2 completed. Time taken: ${stepTracking.step2.timeTaken}ms`);
            })(),
            (async () => {
                const s3 = Date.now();
                console.log(`${logId} Step 3 started.`);
                await processOutputRequests(client, openRequests.activeOutputRequests, logId);
                stepTracking.step3 = { completed: true, timeTaken: Date.now() - s3 };
                console.log(`${logId} Step 3 completed. Time taken: ${stepTracking.step3.timeTaken}ms`);
            })(),
            (async () => {
                const s4 = Date.now();
                console.log(`${logId} Step 4 started.`);
                await cleanupFulfilledEntries(client, openRequests, logId);
                stepTracking.step4 = { completed: true, timeTaken: Date.now() - s4 };
                console.log(`${logId} Step 4 completed. Time taken: ${stepTracking.step4.timeTaken}ms`);
            })(),
        ]);

        const totalTime = Date.now() - startTime;
        console.log(`${logId} Polling cycle completed successfully. Total time taken: ${totalTime}ms`);

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
            `SELECT request_id FROM verifiable_delay_functions 
             WHERE request_id = ANY($1) 
             FOR UPDATE SKIP LOCKED`,
            [requestIds]
        );

        const existingRequestIds = new Set(existingMappingsRes.rows.map(row => row.request_id));
        console.log(`${parentLogId} Found ${existingRequestIds.size} already mapped requests.`);

        // Find only the unmapped requests (requestIds not in existingRequestIds)
        const unmappedRequestIds = requestIds.filter(requestId => !existingRequestIds.has(requestId));
        console.log(`${parentLogId} Unmapped requests: ${unmappedRequestIds.length}`);

        // Fetch available DB entries for unmapped requests
        console.log(`${parentLogId} Fetching available DB entries.`);
        const dbRes = await client.query(
            `SELECT id FROM verifiable_delay_functions 
             WHERE request_id IS NULL 
             ORDER BY id ASC 
             LIMIT $1 
             FOR UPDATE SKIP LOCKED`,
            [unmappedRequestIds.length]
        );

        const availableDbEntries = dbRes.rows.map(row => row.id);
        console.log(`${parentLogId} Found ${availableDbEntries.length} available DB entries.`);

        // Reduce request list if we don’t have enough DB entries
        if (availableDbEntries.length < unmappedRequestIds.length) {
            console.log(`${parentLogId} Limiting requests to ${availableDbEntries.length} due to DB availability.`);
            unmappedRequestIds.length = availableDbEntries.length;
        }

        if (availableDbEntries.length === 0 && existingRequestIds.size === 0) {
            console.log(`${parentLogId} No available DB entries to process and no existing mappings.`);
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
            console.log(`${parentLogId} Assigned Request ID ${unmappedRequestIds[i]} to DB Entry ${availableDbEntries[i]}.`);
        }

        await client.query('COMMIT'); // Commit all updates at once

        // Call fulfillRandomChallenge for all request IDs (existing + newly mapped)
        // Create an array of promises and use Promise.all to await them all in parallel
        const promises = requestIds.map(requestId =>
            fulfillRandomChallenge(client, requestId, parentLogId)
                .catch(error => console.error(`${parentLogId} Error fulfilling challenge for Request ID ${requestId}:`, error))
        );

        await Promise.all(promises); // Wait for all promises to resolve
        console.log(`${parentLogId} All challenges fulfilled`);

        console.log(`${parentLogId} Step 2 completed.`);
    } catch (error) {
        console.error(`${parentLogId} Error in processChallengeRequests:`, error);
        await client.query('ROLLBACK'); // Rollback on failure
    }
}

// Step 3: Process Output Requests (unchanged but with logging)
async function processOutputRequests(
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
async function cleanupFulfilledEntries(
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
            FROM verifiable_delay_functions 
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
                UPDATE verifiable_delay_functions
                SET detected_completed = NOW()
                WHERE id = ANY($1)
            `, [markAsCompleted]);
            console.log(`${parentLogId} Marked ${markAsCompleted.length} entries as completed.`);
        }

        // Delete old completed entries
        if (markForDeletion.length > 0) {
            await client.query(`
                DELETE FROM verifiable_delay_functions
                WHERE id = ANY($1)
            `, [markForDeletion]);
            console.log(`${parentLogId} Deleted ${markForDeletion.length} old completed entries.`);
        }

        await client.query('COMMIT');
    } catch (error) {
        console.error(`${parentLogId} Error in cleanupFulfilledEntries:`, error);
        await client.query('ROLLBACK');
    }

    console.log(`${parentLogId} Step 4 completed.`);
}



// Main function
async function run(): Promise<void> {
    const client = await connectWithRetry();
    await setupDatabase(client);

    arweave.wallets.jwkToAddress(JSON.parse(process.env.WALLET_JSON!)).then((address) => {
        console.log(address);
        PROVIDER_ID = address
        //1seRanklLU_1VTGkEk7P0xAwMJfA7owA1JHW5KyZKlY
    });

    setInterval(async () => {
        const res = await client.query('SELECT COUNT(*) as count FROM verifiable_delay_functions');
        console.log(`Periodic log - Current database size: ${res.rows[0].count}`);
        // Check and fetch entries for the database if needed
        console.log("Step 0: Checking and fetching database entries if below threshold.");
        checkAndFetchIfNeeded(client).catch((error) => {
            console.error("Error in checkAndFetchIfNeeded:", error);
        });

    }, 10000);

    setInterval(async () => {
        await monitorDockerContainers();
    }, 30000); // Cleanup every 30 seconds

    setInterval(async () => {
        await polling(client);
    }, POLLING_INTERVAL_MS);

    // setInterval(async () => {
    //     randclient.setDryRunAsMessage(false);
    //     console.log("Switching dryrun on")
    // }, DRYRUNRESETTIME);


    process.on("SIGTERM", async () => {
        console.log("SIGTERM received. Closing database connection.");
        await client.end();
        await shutdown();
        process.exit(0);
    });
}

run().catch((err) => console.error(`Error in main function: ${err}`));
