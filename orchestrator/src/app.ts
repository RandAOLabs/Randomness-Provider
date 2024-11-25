import { Client } from 'pg';
import Docker from 'dockerode';
import AWS from 'aws-sdk';
import { getRandomClientAutoConfiguration, IRandomClient, RandomClient, RandomClientConfig } from "ao-process-clients"

// const RANDOM_CONFIG: RandomClientConfig = {
//     tokenProcessId: getRandomClientAutoConfiguration().tokenProcessId,
//     processId: getRandomClientAutoConfiguration().processId,
//     wallet: JSON.parse(process.env.WALLET_JSON!),
//     environment: 'mainnet'
// }
const randclient: IRandomClient = RandomClient.autoConfiguration()
//const randclient: IRandomClient = new RandomClient(RANDOM_CONFIG)

const docker = new Docker();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'myuser',
    password: process.env.DB_PASSWORD || 'mypassword',
    database: process.env.DB_NAME || 'mydatabase',
};

// Constants for configuration
const POLLING_INTERVAL_MS = 5000;
const MINIMUM_ENTRIES = 50;
const TARGET_ENTRIES = 75;
const DROP_CHANCE = 0.005;
//Expected increments per second=10×0.005=0.05
//180 times per hour
//4,320 times per day
//1,576,800 times per year
const MAX_OUTSTANDING_REQUESTS = 10;
const MAX_OUTSTANDING_FULFILLMENTS = 10;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 10000;
const VDF_JOB_IMAGE = 'randao/vdf_job:v0.1.0';
const ENVIRONMENT = process.env.ENVIRONMENT || 'local';
const ecs = new AWS.ECS({ region: process.env.AWS_REGION || 'us-east-1' });
const ongoingTasks = new Set<string>();  // Track task ARNs of running ECS tasks
const ongoingContainers = new Set<string>(); // Track container IDs of running Docker containers
const ongoingFulfillments = new Set<string>(); // Track request IDs for ongoing fulfillments
const PROVIDER_ID = process.env.PROVIDER_ID || "0";
let ongoingRequest = false;
let spotInterruptions = 0;

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
        const containerName = `vdf_job_${Date.now()}`;
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
                NetworkMode: 'backend',
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

            if (containerInfo.State.Status === 'exited') {
                console.log(`Docker container stopped: ${containerId}`);
                await container.remove();
                ongoingContainers.delete(containerId);
            }
        } catch (error) {
            console.error(`Error monitoring Docker container ${containerId}:`, error);
            ongoingContainers.delete(containerId); // Remove from tracking if there's an error (e.g., container not found)
        }
    }
}

// Function to check if there are fewer than MINIMUM_ENTRIES and fetch until TARGET_ENTRIES
async function checkAndFetchIfNeeded(client: Client): Promise<void> {
    try {
        if (ongoingRequest) return;

        const res = await client.query('SELECT COUNT(*) as count FROM verifiable_delay_functions');
        const currentCount = parseInt(res.rows[0].count, 10);
        const updateAvailableValuesResult = await randclient.updateProviderAvailableValues(currentCount);
        console.log("Updates onchain: " + updateAvailableValuesResult)
        console.log(await randclient.getProviderAvailableValues(PROVIDER_ID))
        if (currentCount < MINIMUM_ENTRIES) {
            const entriesNeeded = TARGET_ENTRIES - currentCount;
            console.log(`Less than ${MINIMUM_ENTRIES} entries found. Fetching ${entriesNeeded} more entries to reach ${TARGET_ENTRIES}...`);
            ongoingRequest = true;
            let tasksTriggered = 0;

            while (tasksTriggered < entriesNeeded) {
                if (ENVIRONMENT === 'cloud' && ongoingTasks.size >= MAX_OUTSTANDING_REQUESTS) {
                    await monitorECSTasks();
                } else if (ENVIRONMENT !== 'cloud' && ongoingContainers.size >= MAX_OUTSTANDING_REQUESTS) {
                    await monitorDockerContainers();
                } else {
                    const taskArn = await triggerVDFJobPod();
                    if (taskArn) {
                        tasksTriggered++;
                        console.log(`Task triggered: ${taskArn}. Total ongoing tasks: ${ongoingTasks.size}. Total ongoing containers ${+ ongoingContainers.size}`);
                    }
                }
            }
            ongoingRequest = false;
        }
    } catch (error) {
        console.error('Error during check and fetch:', error);
        ongoingRequest = false;
    }
}
// Function to post VDF challenge and proof
async function fulfillRandomRequest(client: Client, dbId: string, requestId: string, modulus: string, input: string): Promise<void> {
    if (ongoingFulfillments.size >= MAX_OUTSTANDING_FULFILLMENTS) return;
    ongoingFulfillments.add(dbId);
    try {
        console.log(`Posting VDF challenge for entry ID: ${dbId}, request ID: ${requestId}`);
        await randclient.postVDFChallenge(requestId, modulus, input);
        console.log(`Challenge posted for request ID: ${requestId}. Waiting to post proof...`);
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Fetch the output and proof from the database
        const res = await client.query('SELECT output, proof FROM verifiable_delay_functions WHERE id = $1', [dbId]);
        if (!res.rowCount) {
            console.error(`No entry found for ID: ${dbId}`);
            return;
        }
        const { output, proof } = res.rows[0];

        // Stringify the proof if it is an array
        const proofString = Array.isArray(proof) ? JSON.stringify(proof) : proof;

        console.log(`Posting VDF output and proof for request ID: ${requestId}`);
        await randclient.postVDFOutputAndProof(requestId, output, proofString);
        console.log(`Proof posted for request ID: ${requestId}`);

        // Delete the entry from the database after successfully posting the proof
        await client.query('DELETE FROM verifiable_delay_functions WHERE id = $1', [dbId]);
        console.log(`Entry with ID: ${dbId} deleted from database.`);
    } catch (error) {
        console.error(`Error fulfilling random request for entry ID: ${dbId}, request ID: ${requestId}:`, error);
    } finally {
        ongoingFulfillments.delete(dbId);
    }
}

// Modified polling function to fulfill open requests if they exist
async function polling(client: Client): Promise<void> {
    await checkAndFetchIfNeeded(client);

    try {
        console.log(PROVIDER_ID);

        const openRequests = await randclient.getOpenRandomRequests(PROVIDER_ID);
        console.log("here");
        console.log(openRequests);

        if (openRequests && openRequests.activeRequests && openRequests.activeRequests.request_ids) {
            console.log(openRequests.providerId);
            console.log(openRequests.activeRequests);
            console.log(openRequests.activeRequests.request_ids);
            console.log(openRequests.activeRequests.request_ids.length);

            // Check if there are enough entries in the database to fulfill the requests
            const res = await client.query('SELECT * FROM verifiable_delay_functions ORDER BY id ASC LIMIT $1', [openRequests.activeRequests.request_ids.length]);

            if (res.rowCount !== null && res.rowCount > 0) {
                const rowsToProcess = Math.min(res.rowCount, openRequests.activeRequests.request_ids.length);

                for (let i = 0; i < rowsToProcess; i++) {
                    if (ongoingFulfillments.size >= MAX_OUTSTANDING_FULFILLMENTS) break;

                    const { id, modulus, input } = res.rows[i];
                    const requestId = openRequests.activeRequests.request_ids[i];
                    fulfillRandomRequest(client, id, requestId, modulus, input);
                }
            } else {
                console.log('Not enough entries in the database to fulfill all requests.');
            }
        } else {
            console.log('No requests');
        }
    } catch (error) {
        console.error('An error occurred while fetching open random requests:', error);
    }
}


// Main function
async function run(): Promise<void> {
    const client = await connectWithRetry();
    await setupDatabase(client);

    setInterval(async () => {
        const res = await client.query('SELECT COUNT(*) as count FROM verifiable_delay_functions');
        console.log(`Periodic log - Current database size: ${res.rows[0].count}`);
    }, 10000);

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
