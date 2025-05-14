import { docker, DOCKER_NETWORK, ecs, MINIMUM_ENTRIES, TIME_PUZZLE_JOB_IMAGE, UNCHAIN_VS_OFFCHAIN_MAX_DIF } from "./app";
import AWS from 'aws-sdk';
import { dbConfig } from "./db_tools";
import logger from "./logger";
import { monitoring } from "./monitoring";

export interface NetworkConfig {
  subnets: string[];
  securityGroups: string[];
}

let spotInterruptions = 0;
// Global variables to track polling status
let pulledDockerimage = false;
let pullingImagePromise: Promise<void> | null = null; // Add at the top-level scope (module-global)
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
  const containerName = `puzzle-gen_job_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  if (ongoingContainers.size > 0) {
    logger.debug("A puzzle-gen container is already running. Skipping new container launch.");
    return null;
  }

  // Ensure only one pull operation at a time
  if (!pulledDockerimage) {
    if (!pullingImagePromise) {
      pullingImagePromise = new Promise<void>((resolve, reject) => {
        logger.info(`Pulling image: ${TIME_PUZZLE_JOB_IMAGE}`);
        docker.pull(TIME_PUZZLE_JOB_IMAGE, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
          if (err || !stream) {
            pullingImagePromise = null; // reset on error
            return reject(err || new Error("Docker stream undefined"));
          }
          docker.modem.followProgress(stream, (doneErr: Error | null) => {
            if (doneErr) {
              pullingImagePromise = null; // reset on error
              reject(doneErr);
            } else {
              pulledDockerimage = true; // Mark as pulled after success
              resolve();
            }
          });
        });
      });
    }
    try {
      await pullingImagePromise;
    } catch (error) {
      logger.error(`Failed to pull Docker image:`, error);
      pullingImagePromise = null;
      return null;
    }
  }

  logger.info(`Starting Docker container with name: ${containerName}`);
  try {
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
    logger.info(`Docker container ${containerName} started successfully.`);
    return container.id;
  } catch (error) {
    logger.error(`Error starting Docker container ${containerName}:`, error);
    return null;
  }
}

export async function getMoreRandom(currentCount: number) {
  const entriesNeeded = MINIMUM_ENTRIES - currentCount;
  logger.info(`Less than ${MINIMUM_ENTRIES} entries found. Fetching ${entriesNeeded} more entries...`);

  if (ongoingContainers.size > 0) {
    logger.info("A puzzle-gen container is already running. Skipping new container launch.");
    return null;
  }

  logger.info(`Spawning a single container to generate ${entriesNeeded} random values.`);

  try {
    const jobId = await triggerTimePuzzleJobPod(entriesNeeded);
    if (jobId) {
      logger.info(`Job triggered: ${jobId}`);
      ongoingContainers.add(jobId);
    }
  } catch (error) {
    logger.error('Error triggering job pod:', error);
  }
}

// Function to wait for Docker containers to complete and remove them from tracking
export async function monitorDockerContainers(): Promise<void> {
  if (ongoingContainers.size === 0) return;

  logger.verbose(`Monitoring ${ongoingContainers.size} Docker containers`);

  for (const containerId of ongoingContainers) {
    try {
      const container = docker.getContainer(containerId);
      const containerInfo = await container.inspect();

      // Check if the container is already stopped (exited)
      if (containerInfo.State.Status === 'exited') {
        logger.debug(`Docker container stopped: ${containerId}`);

        // Attempt to remove the container, handling possible errors gracefully
        try {
          await container.remove({ force: true }); // Force removal to avoid "in progress" errors
          logger.info(`Docker container removed: ${containerId}`);
          ongoingContainers.delete(containerId);
        } catch (removeError) {
          if (isDockerError(removeError) && removeError.statusCode === 409) {
            // Error 409 means removal is in progress, so skip this container for now
            logger.debug(`Removal of container ${containerId} is already in progress. Skipping.`);
          } else {
            // Handle other errors that might occur during container removal
            logger.error(`Error removing Docker container ${containerId}:`, removeError);
          }
        }
      }
    } catch (error) {
      logger.error(`Error inspecting Docker container ${containerId}:`, error);
      ongoingContainers.delete(containerId); // Remove from tracking if there's an error (e.g., container not found)
    }
  }
}

// Helper function to type guard Docker errors
function isDockerError(error: unknown): error is { statusCode: number } {
  return typeof error === 'object' && error !== null && 'statusCode' in error && typeof (error as any).statusCode === 'number';
}
