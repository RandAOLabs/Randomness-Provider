import {
    RandomClient,
} from "ao-process-clients";
//import { TransferToProviders } from "./extra";

const RETRY_DELAY_MS = 5000; // 1 seconds
const PROVIDER_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
const PROVIDER_REQUEST_TIMEOUT = 60 * 1000; // 1 minute
const CHANCE_TO_CALL_RANDOM = 1;

let cachedProviders: string[] = [];
let lastProviderRefresh = 0;

// const AO_CONFIG = {
//     MU_URL: "https://ur-mu.randao.net",
//     CU_URL: "https://ur-cu.randao.net",
//     // MU_URL: "https://mu.ao-testnet.xyz",
//     // CU_URL: "https://cu.ao-testnet.xyz",
//     GATEWAY_URL: "https://arweave.net",
//     MODE: "legacy"
// };

let randomClientInstance: RandomClient | null = null;

export async function getRandomClient(): Promise<RandomClient> {
    
    if (!randomClientInstance) {
        randomClientInstance = ((await RandomClient.defaultBuilder()))
            .withAOConfig({
                MU_URL: "https://ur-mu.randao.net",
                CU_URL: "https://ur-cu.randao.net",
                // MU_URL: "https://mu.ao-testnet.xyz",
                // CU_URL: "https://cu.ao-testnet.xyz",
                GATEWAY_URL: "https://arweave.net",
                MODE: "legacy"
            })
            .withWallet(JSON.parse(process.env.REQUEST_WALLET_JSON!))
            .build();
    }
    return randomClientInstance;
}




let totalRandomCalled = 0;
let totalTimeToFulfill = 0;
let fulfilledRequests = 0;
const outstandingRequests: Set<string> = new Set();

async function getRandomProviders(randclient: RandomClient): Promise<{ providers: string[], count: number }> {
    const now = Date.now();
    
    // If we have cached providers and they're not expired, use them
    if (cachedProviders.length > 0 && (now - lastProviderRefresh) < PROVIDER_REFRESH_INTERVAL) {
        const count = Math.floor(Math.random() * 3) + 1;
        const shuffled = [...cachedProviders]
            .sort(() => Math.random() - 0.5)
            .slice(0, Math.min(count, cachedProviders.length));
        return {
            providers: shuffled,
            count: shuffled.length
        };
    }

    try {
        // Create a promise that rejects after timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Provider request timed out")), PROVIDER_REQUEST_TIMEOUT);
        });

        // Create the actual provider fetch promise
        const fetchPromise = async () => {
            const providerInfo = await randclient.getAllProviderActivity();
            console.log(providerInfo)
            const eligibleProviders = providerInfo
            //@ts-ignore
                .filter(provider => provider.active === 1)
                //@ts-ignore
                .map(provider => provider.provider_id);

            if (eligibleProviders.length === 0) {
                throw new Error("No eligible providers found with active status");
            }

            // Update cache
            cachedProviders = eligibleProviders;
            lastProviderRefresh = now;

            const count = Math.floor(Math.random() * 3) + 1;
            const shuffled = [...eligibleProviders]
                .sort(() => Math.random() - 0.5)
                .slice(0, Math.min(count, eligibleProviders.length));
            
            return {
                providers: shuffled,
                count: shuffled.length
            };
        };

        // Race between timeout and fetch
        return await Promise.race([fetchPromise(), timeoutPromise]);
    } catch (error) {
        console.error("Error fetching providers:", error);
        
        // If we have cached providers, use them as fallback
        if (cachedProviders.length > 0) {
            console.log("Using cached providers as fallback");
            const count = Math.floor(Math.random() * 3) + 1;
            const shuffled = [...cachedProviders]
                .sort(() => Math.random() - 0.5)
                .slice(0, Math.min(count, cachedProviders.length));
            return {
                providers: shuffled,
                count: shuffled.length
            };
        }
        
        throw error; // Re-throw if we have no fallback
    }
}

import { startRequestTracker } from "./requestTracker";

async function main() {
    const randclient = await getRandomClient()
    //const stakeclient = ProviderStakingClient.autoConfiguration();

    randclient.prepay(1000_000000000) //1,000
    
    // Start request tracker in a separate process
    // This will continuously poll for provider activity and crank defunct requests
    startRequestTracker().catch(error => {
        console.error("Error starting request tracker:", error);
    });
    while (true) {
        console.log("Running")
        try {
            // Roll for random chance to make a request
            if (Math.random() < CHANCE_TO_CALL_RANDOM) {
                console.log("Initiating random request...");
                const callbackId = `callback-${Date.now()}`;
                const { providers, count } = await getRandomProviders(randclient);
                console.log(`Selected ${count} providers:`, providers);
                // await randclient.createRequest(providers, count, callbackId);
                console.log(await randclient.redeem(providers, count, callbackId));
                //await TransferToProviders(providers, callbackId)
                //await randclient.createRequest(["X1tqliRkKnClhVQ4aIeyuOaPTzr5PfnxqAoSdpTzZy8"], 1, "123");
                totalRandomCalled++;
                console.log("Random request initiated. Awaiting request ID in open requests...");
            }

            // // Check open requests
            // const openRequestsResponse = await randclient.getOpenRandomRequests(PROVIDER_IDS[0]);
            // const openRequestIds = openRequestsResponse.activeRequests.request_ids || [];
            // console.log("Open requests:", openRequestIds);

            // // Track outstanding requests
            // for (const requestId of openRequestIds) {
            //     if (!outstandingRequests.has(requestId)) {
            //         console.log(`Tracking new request: ${requestId}`);
            //         outstandingRequests.add(requestId);
            //     }
            // }

            // // Check the status of outstanding requests
            // if (outstandingRequests.size > 0) {
            //     const randomRequestsResponse = await randclient.getRandomRequests(Array.from(outstandingRequests));
            //     const requests = randomRequestsResponse.randomRequestResponses || []; // Adjust based on actual response structure
            //     console.log(randomRequestsResponse)
            //     console.log(requests)

            //     //     for (const request of requests) {
            //     //         const requestId = request.requestId; // Adjust if property has a different name
            //     //         if (request?.status === "fulfilled") {
            //     //             const fulfilledTime = Date.now();
            //     //             const timeToFulfill = fulfilledTime - request.createdTime; // Adjust if createdTime exists
            //     //             totalTimeToFulfill += timeToFulfill;
            //     //             fulfilledRequests++;
            //     //             console.log(`Request ${requestId} fulfilled. Time to fulfill: ${timeToFulfill}ms`);
            //     //             outstandingRequests.delete(requestId); // Stop tracking fulfilled requests
            //     //         } else {
            //     //             console.log(`Request ${requestId} is still being processed.`);
            //     //         }
            //     //     }
            // }

            // // Calculate and log stats
            // if (fulfilledRequests > 0) {
            //     const avgTimeToFulfill = totalTimeToFulfill / fulfilledRequests;

            //     console.log(`
            //         Total Random Called: ${totalRandomCalled}
            //         Outstanding Requests: ${outstandingRequests.size}
            //         Average Time to Fulfill: ${avgTimeToFulfill}ms
            //     `);
            // }

            // Wait before next cycle
            await delay(RETRY_DELAY_MS);
        } catch (error) {
            console.error("An error occurred:", error);
        }
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Call the main function
main();
