import { Client } from "pg";
import { MAX_RETRIES, RETRY_DELAY_MS } from "./app";
import logger from "./logger";

export const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'myuser',
    password: process.env.DB_PASSWORD || 'mypassword',
    database: process.env.DB_NAME || 'mydatabase',
};

// Clear out the existing database
export async function clearDatabase(client: Client): Promise<void> {
    logger.info("Clearing database...");

    await client.query(`SET session_replication_role = 'replica';`);

    const { rows } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public';`);
    for (const row of rows) {
        logger.debug(`Dropping table: ${row.tablename}`);
        await client.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE;`);
    }

    await client.query(`SET session_replication_role = 'origin';`);

    logger.info("Database cleared.");
}

export async function setupDatabase(client: Client): Promise<void> {
    try {
        // Create rsa_keys table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS rsa_keys (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                p TEXT NOT NULL,
                q TEXT NOT NULL,
                modulus TEXT NOT NULL UNIQUE,
                phi TEXT NOT NULL
            );
        `);

        // Create time_lock_puzzles table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS time_lock_puzzles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                x TEXT NOT NULL,
                y TEXT NOT NULL,
                t TEXT NOT NULL,
                modulus TEXT NOT NULL,
                request_id TEXT NULL,
                rsa_id UUID NOT NULL UNIQUE,
                detected_completed TIMESTAMP NULL,
                FOREIGN KEY (rsa_id) REFERENCES rsa_keys(id) ON DELETE CASCADE
            );
        `);

        // Drop the old verifiable_delay_functions table if exists
        await client.query(`DROP TABLE IF EXISTS verifiable_delay_functions CASCADE;`);

        logger.info("✅ Database setup complete or already exists.");
    } catch (error: any) {
        logger.error("❌ Legitimate issue encountered during database setup:", error.message);
    }
}

// Retry logic for connecting to PostgreSQL
export async function connectWithRetry(): Promise<Client> {
    const client = new Client(dbConfig);
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await client.connect();
            logger.info(`Connected to PostgreSQL database (Attempt ${attempt})`);
            return client;
        } catch (error) {
            logger.warn(`Connection attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
    }
    
    throw new Error("Failed to connect to PostgreSQL after multiple attempts");
}
