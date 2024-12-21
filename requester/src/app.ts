import {
    getRandomClientAutoConfiguration,
    IRandomClient,
    RandomClient,
    RandomClientConfig,
} from "ao-process-clients";

const PROVIDER_ID = "XUo8jZtUDBFLtp5okR12oLrqIZ4ewNlTpqnqmriihJE";
const RETRY_DELAY_MS = 5000;
const CHANCE_TO_CALL_RANDOM = 1;

const RANDOM_CONFIG: RandomClientConfig = {
    tokenProcessId: getRandomClientAutoConfiguration().tokenProcessId,
    processId: "vgH7EXVs6-vxxilja6lkBruHlgOkyqddFVg-BVp3eJc",
    wallet: JSON.parse(process.env.REQUEST_WALLET_JSON!),
    environment: "mainnet",
};

let totalRandomCalled = 0;
let totalTimeToFulfill = 0;
let fulfilledRequests = 0;
const outstandingRequests: Set<string> = new Set();

async function main() {
    const randclient: IRandomClient = new RandomClient(RANDOM_CONFIG);

    while (true) {
        console.log("Running")
        try {
            // Roll for random chance to make a request
            if (Math.random() < CHANCE_TO_CALL_RANDOM) {
                console.log("Initiating random request...");
                const callbackId = `callback-${Date.now()}`;
                await randclient.createRequest([PROVIDER_ID], 1, callbackId);
                totalRandomCalled++;
                console.log("Random request initiated. Awaiting request ID in open requests...");
            }

            // // Check open requests
            // const openRequestsResponse = await randclient.getOpenRandomRequests(PROVIDER_ID);
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