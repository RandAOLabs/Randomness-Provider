import {
    getRandomClientAutoConfiguration,
    IRandomClient,
    RandomClient,
    RandomClientConfig,
} from "ao-process-clients";

const PROVIDER_IDS = [
    "XUo8jZtUDBFLtp5okR12oLrqIZ4ewNlTpqnqmriihJE",
    "c8Iq4yunDnsJWGSz_wYwQU--O9qeODKHiRdUkQkW2p8",
    "Sr3HVH0Nh6iZzbORLpoQFOEvmsuKjXsHswSWH760KAk",
    "1zlA7nKecUGevGNAEbjim_SlbioOI6daNNn2luDEHb0"
];

const RETRY_DELAY_MS = 5000; //5 seconds
const CHANCE_TO_CALL_RANDOM = 1;

const RANDOM_CONFIG: RandomClientConfig = {
    tokenProcessId: "5ZR9uegKoEhE9fJMbs-MvWLIztMNCVxgpzfeBVE3vqI",
    processId: "yKVS1tYE3MajUpZqEIORmW1J8HTke-6o6o6tnlkFOZQ",
    wallet: JSON.parse(process.env.REQUEST_WALLET_JSON!),
    environment: "mainnet",
};

let totalRandomCalled = 0;
let totalTimeToFulfill = 0;
let fulfilledRequests = 0;
const outstandingRequests: Set<string> = new Set();

function getRandomProviders(): { providers: string[], count: number } {
    // Randomly select how many providers we want (1-3)
    const count = Math.floor(Math.random() * 3) + 1;
    
    // Shuffle the provider array and take the first 'count' elements
    const shuffled = [...PROVIDER_IDS]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(count, PROVIDER_IDS.length));
    
    return {
        providers: shuffled,
        count: shuffled.length
    };
}

async function main() {
    const randclient: IRandomClient = new RandomClient(RANDOM_CONFIG);

    while (true) {
        console.log("Running")
        try {
            // Roll for random chance to make a request
            if (Math.random() < CHANCE_TO_CALL_RANDOM) {
                console.log("Initiating random request...");
                const callbackId = `callback-${Date.now()}`;
                const { providers, count } = getRandomProviders();
                console.log(`Selected ${count} providers:`, providers);
                await randclient.createRequest(providers, count, callbackId);
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