import { docker, DOCKER_NETWORK, MINIMUM_ENTRIES, TIME_PUZZLE_JOB_IMAGE } from "./app";
import { dbConfig } from "./db_tools";
import logger from "./logger";


export interface NetworkConfig {
  subnets: string[];
  securityGroups: string[];
}

// Global variables to track polling status
let pulledDockerimage = false;
let pullingImagePromise: Promise<void> | null = null; // Add at the top-level scope (module-global)
const ongoingContainers = new Set<string>(); // Track container IDs of running Docker containers

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

export async function getMoreRandom(currentCount: number, randomToGenerate: number) {
  // If no specific amount provided, calculate based on minimum entries
  if (!randomToGenerate) {
    randomToGenerate = MINIMUM_ENTRIES - currentCount;
  }
  
  logger.info(`Attempting to fetch ${randomToGenerate} random entries...`);

  if (ongoingContainers.size > 0) {
    logger.info("A puzzle-gen container is already running. Skipping new container launch.");
    return null;
  }

  logger.info(`Spawning a single container to generate ${randomToGenerate} random values.`);

  try {
    const jobId = await triggerTimePuzzleJobPod(randomToGenerate);
    if (jobId) {
      logger.info(`Job triggered: ${jobId}`);
      ongoingContainers.add(jobId);
      return jobId;
    }
  } catch (error) {
    logger.error('Error triggering job pod:', error);
  }
  
  return null;
}

// Import the function to reset the generation flag from helperFunctions
import { resetOngoingRandomGeneration } from './helperFunctions.js';

// Function to wait for Docker containers to complete and remove them from tracking
export async function monitorDockerContainers(): Promise<void> {
  if (ongoingContainers.size === 0) return;

  logger.verbose(`Monitoring ${ongoingContainers.size} Docker containers`);
  let containersRemoved = false;

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
          containersRemoved = true;
          
          // Check exit code to log success or failure
          if (containerInfo.State.ExitCode === 0) {
            logger.info('Container completed successfully');
          } else {
            logger.warn(`Container exited with non-zero code: ${containerInfo.State.ExitCode}`);
          }
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
      containersRemoved = true;
    }
  }
  
  // If all containers are removed, reset the ongoingRandomGeneration flag
  if (ongoingContainers.size === 0 && containersRemoved) {
    logger.info('All random generation containers finished. Resetting generation flag.');
    resetOngoingRandomGeneration();
  }
}

// Helper function to type guard Docker errors
function isDockerError(error: unknown): error is { statusCode: number } {
  return typeof error === 'object' && error !== null && 'statusCode' in error && typeof (error as any).statusCode === 'number';
}
