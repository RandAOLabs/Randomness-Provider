import { Client } from 'pg';
import { getRandomClientAutoConfiguration, RandomClient, RandomClientConfig } from "ao-process-clients";
import { dbConfig } from './db_config';

// Random Client Configuration
const RANDOM_CONFIG: RandomClientConfig = {
    tokenProcessId: "7enZBOhWsyU3A5oCt8HtMNNPHSxXYJVTlOGOetR9IDw",
    processId: "KbaY8P4h9wdHYKHlBSLbXN_yd-9gxUDxSgBackUxTiQ",
    wallet: JSON.parse(process.env.WALLET_JSON!),
    environment: 'mainnet' as const
};

const randclient = new RandomClient(RANDOM_CONFIG);
const PROVIDER_ID = process.env.PROVIDER_ID || "0";

// Function to connect to PostgreSQL
async function connectToDatabase() {
    const client = new Client(dbConfig);
    await client.connect();
    console.log("Connected to PostgreSQL database.");
    return client;
}

// Function to clear all output requests
async function clearAllOutputRequests(client: Client) {
    try {
        console.log("Fetching open output requests...");
        const openRequests = await randclient.getOpenRandomRequests(PROVIDER_ID);

        if (openRequests && openRequests.activeOutputRequests) {
            console.log(`Found ${openRequests.activeOutputRequests.request_ids.length} output requests to clear.`);

            // Process each request
            const clearPromises = openRequests.activeOutputRequests.request_ids.map(async (requestId: string) => {
                console.log(`Sending "No data" for output request ID: ${requestId}`);
                try {
                    await randclient.postVDFOutputAndProof(requestId, "No data", "No data");
                    console.log(`"No data" successfully sent for request ID: ${requestId}`);
                } catch (error) {
                    console.error(`Error sending "No data" for request ID: ${requestId}:`, error);
                }
            });

            await Promise.all(clearPromises);
            console.log("All output requests cleared.");
        } else {
            console.log("No output requests to clear.");
        }
    } catch (error) {
        console.error("An error occurred while clearing output requests:", error);
    } finally {
        await client.end();
        console.log("Database connection closed.");
    }
}

// Run the function when the script is executed
(async () => {
    const client = await connectToDatabase();
    await clearAllOutputRequests(client);
})();
