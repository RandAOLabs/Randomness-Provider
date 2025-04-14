import { docker, DOCKER_NETWORK, ecs, ENVIRONMENT, MINIMUM_ENTRIES, TIME_PUZZLE_JOB_IMAGE, UNCHAIN_VS_OFFCHAIN_MAX_DIF } from "./app";
import AWS from 'aws-sdk';
import { dbConfig } from "./db_tools";
export interface NetworkConfig {
  subnets: string[];
  securityGroups: string[];
}

let spotInterruptions = 0;
// Global variables to track polling status
let pulledDockerimage = false;
// Cache for network configuration
let cachedNetworkConfig: NetworkConfig | null = null;
const ongoingContainers = new Set<string>(); // Track container IDs of running Docker containers

export async function getNetworkConfig(ecs: AWS.ECS): Promise<NetworkConfig> {
  // Get the task definition to extract network configuration
  const taskDef = await ecs.describeTaskDefinition({ taskDefinition: 'vdf-job' }).promise();
  
  // Get the service to extract network configuration
  const services = await ecs.listServices({ cluster: process.env.ECS_CLUSTER_NAME }).promise();
  const serviceArn = services.serviceArns?.find(arn => arn.includes('vdf-job-service'));
  
  if (!serviceArn) {
    throw new Error('VDF job service not found');
  }
  
  const service = await ecs.describeServices({
    cluster: process.env.ECS_CLUSTER_NAME,
    services: [serviceArn]
  }).promise();

  const networkConfig = service.services?.[0]?.networkConfiguration?.awsvpcConfiguration;
  
  if (!networkConfig?.subnets || !networkConfig?.securityGroups) {
    throw new Error('Network configuration not found');
  }

  return {
    subnets: networkConfig.subnets,
    securityGroups: networkConfig.securityGroups
  };
}

export async function launchVDFTask(
  ecs: AWS.ECS,
  networkConfig: NetworkConfig,
  random_per_vdf: number,
): Promise<string | null> {
  const result = await ecs.runTask({
    cluster: process.env.ECS_CLUSTER_NAME,
    taskDefinition: 'vdf-job',
    capacityProviderStrategy: [
      {
        capacityProvider: 'FARGATE_SPOT',
        weight: 1,
      },
    ],
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: networkConfig.subnets,
        securityGroups: networkConfig.securityGroups,
        assignPublicIp: 'ENABLED',
      },
    },
    count: 1,
    overrides: {
      containerOverrides: [
        {
          name: 'vdf_job_container', // Must match the container name in the task definition
          command: ['sh', '-c', `python3 main.py ${random_per_vdf}`],
        },
      ],
    },
  }).promise();

  const taskArn = result.tasks?.[0]?.taskArn;
  return taskArn || null;
}




export async function triggerTimePuzzleJobPod(randomCount: number): Promise<string | null> {
    if (ENVIRONMENT === 'cloud') {
        try {
            console.log("Cloud environment detected. Launching ECS task.");

            // Get or refresh network configuration
            if (!cachedNetworkConfig) {
                console.log("Fetching network configuration...");
                cachedNetworkConfig = await getNetworkConfig(ecs);
                console.log("Network config:", cachedNetworkConfig);
            }

            const taskArn = await launchVDFTask(ecs, cachedNetworkConfig, randomCount);
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
        const containerName = `puzzle-gen_job_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        console.log(`Starting Docker container with name: ${containerName}`);
        try {
            if (!pulledDockerimage) {
                console.log(`Pulling image: ${TIME_PUZZLE_JOB_IMAGE}`);
                await new Promise((resolve, reject) => {
                    docker.pull(TIME_PUZZLE_JOB_IMAGE, (err: any, stream: NodeJS.ReadableStream) => {
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
                Image: TIME_PUZZLE_JOB_IMAGE,
                Cmd: ['sh', '-c', `python3 main.py ${randomCount}`],

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

export async function getMoreRandom(currentCount: number) {
    const entriesNeeded = MINIMUM_ENTRIES - currentCount;
    console.log(`Less than ${MINIMUM_ENTRIES} entries found. Fetching ${entriesNeeded} more entries...`);

    if (ongoingContainers.size > 0) {
        console.log("A puzzle-gen container is already running. Skipping new container launch.");
        return null;
    }

    console.log(`Spawning a single container to generate ${entriesNeeded} random values.`);

    try {
        const jobId = await triggerTimePuzzleJobPod(entriesNeeded);
        if (jobId) {
            console.log(`Job triggered: ${jobId}`);
            ongoingContainers.add(jobId);
        }
    } catch (error) {
        console.error('Error triggering job pod:', error);
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
export async function monitorDockerContainers(): Promise<void> {
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
