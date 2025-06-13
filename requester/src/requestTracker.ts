import { RandomClient } from "ao-process-clients";
import { getRandomClient } from "./app";

// Map to track request timestamps
const requestTimestamps: Map<string, number> = new Map();
const DEFUNCT_THRESHOLD_MS = 30 * 1000; // 30 seconds
const POLL_INTERVAL_MS = 1000; // Poll every second

/**
 * Function to log request timestamps
 * Adds new request IDs to the tracking map and removes ones that are no longer present
 * @param allRequestIds Array of request IDs to track
 */
function logRequestTimestamps(allRequestIds: string[]): void {
  const currentTime = Date.now();
  const existingIds = new Set(requestTimestamps.keys());
  
  // Add new request IDs with current timestamp
  for (const requestId of allRequestIds) {
    if (!requestTimestamps.has(requestId)) {
      console.log(`Adding new request ID to tracking: ${requestId}`);
      requestTimestamps.set(requestId, currentTime);
    }
  }
  
  // Remove request IDs that are no longer present
  for (const existingId of existingIds) {
    if (!allRequestIds.includes(existingId)) {
      console.log(`Removing request ID from tracking: ${existingId}`);
      requestTimestamps.delete(existingId);
    }
  }
}

/**
 * Check for defunct requests and crank if needed
 */
async function crankDefunctRequests(randclient: RandomClient) {
  const currentTime = Date.now();
  const defunctRequestIds: string[] = [];
  
  // Check for defunct request IDs (those that have been in the map for over 30 seconds)
  requestTimestamps.forEach((timestamp, requestId) => {
    const timeInMap = currentTime - timestamp;
    if (timeInMap > DEFUNCT_THRESHOLD_MS) {
      defunctRequestIds.push(requestId);
      console.log(`Defunct request found: ${requestId} (in system for ${Math.floor(timeInMap / 1000)} seconds)`);
    }
  });
  
  // If there are any defunct requests, run the crank
  if (defunctRequestIds.length > 0) {
    console.log(`Cranking due to ${defunctRequestIds.length} defunct requests: ${defunctRequestIds.join(', ')}`);
    await randclient.crank();
  }
}

/**
 * Parse provider activity to extract all request IDs
 * @param providerActivity Provider activity data from getAllProviderActivity
 * @returns Array of request IDs
 */
function extractRequestIdsFromProviderActivity(providerActivity: any[]): string[] {
  const allRequestIds: string[] = [];
  
  // Process each provider to extract request IDs
  for (const provider of providerActivity) {
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
          console.warn(`Warning: Failed to parse challenge requests JSON for provider ${provider.provider_id}:`, parseErr);
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
          console.warn(`Warning: Failed to parse output requests JSON for provider ${provider.provider_id}:`, parseErr);
        }
      }
    } catch (err) {
      console.warn(`Warning: Failed to process provider ${provider?.provider_id || 'unknown'}:`, err);
    }
  }
  
  // Remove duplicates
  return [...new Set(allRequestIds)];
}

/**
 * Main function to start tracking and cranking requests
 */
export async function startRequestTracker() {
  console.log("Starting request tracker...");
  
  while (true) {
    try {
      const randclient = await getRandomClient();
      let maxRetries = 3;
      let response = null;
      let lastError = null;
      
      // Get provider activity with retries
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          response = await randclient.getAllProviderActivity();
          lastError = null;
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error as Error;
          console.warn(`Attempt ${attempt}/${maxRetries} failed to fetch provider activity:`, error);
          
          if (attempt < maxRetries) {
            // Wait before retrying with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      // If we still have an error after retries, throw it
      if (lastError) {
        throw lastError;
      }
      
      if (!response) {
        throw new Error('No response from provider activity');
      }
      
      // Extract all request IDs
      const allRequestIds = extractRequestIdsFromProviderActivity(response);
      console.log(`Found ${allRequestIds.length} active request IDs across all providers`);
      
      // Log timestamps for tracking
      logRequestTimestamps(allRequestIds);
      
      // Check and crank defunct requests
      await crankDefunctRequests(randclient);
      
    } catch (error) {
      console.error("Error in request tracker:", error);
    }
    
    // Wait before next polling cycle
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
