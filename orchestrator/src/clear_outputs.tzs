import { Client } from 'pg';
import {  RandomClient, RandomClientConfig } from "ao-process-clients";
import { dbConfig } from './db_config';

// Random Client Configuration
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
        const openRequests = await (await getRandomClient()).getOpenRandomRequests(PROVIDER_ID);

        if (openRequests && openRequests.activeOutputRequests) {
            console.log(`Found ${openRequests.activeOutputRequests.request_ids.length} output requests to clear.`);

            // Process each request
            const clearPromises = openRequests.activeOutputRequests.request_ids.map(async (requestId: string) => {
                console.log(`Sending "No data" for output request ID: ${requestId}`);
                try {
                    await (await getRandomClient()).postVDFOutputAndProof(requestId, "No data", "No data");
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
