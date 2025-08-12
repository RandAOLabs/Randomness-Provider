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

// Database maintenance function to prevent storage bloat
export async function performDatabaseMaintenance(client: Client): Promise<void> {
    try {
        logger.info("🧹 Starting database maintenance...");
        
        // Vacuum analyze to reclaim space and update statistics
        await client.query('VACUUM ANALYZE time_lock_puzzles;');
        await client.query('VACUUM ANALYZE rsa_keys;');
        
        // Get database size info
        const sizeResult = await client.query(`
            SELECT 
                pg_size_pretty(pg_database_size(current_database())) as db_size,
                (SELECT count(*) FROM time_lock_puzzles) as puzzle_count,
                (SELECT count(*) FROM rsa_keys) as key_count
        `);
        
        const { db_size, puzzle_count, key_count } = sizeResult.rows[0];
        logger.info(`📊 Database maintenance complete - Size: ${db_size}, Puzzles: ${puzzle_count}, Keys: ${key_count}`);
        
    } catch (error: any) {
        logger.error("❌ Error during database maintenance:", error.message);
    }
}

// Aggressive cleanup function for storage management
export async function performAggressiveCleanup(client: Client): Promise<void> {
    try {
        logger.info("🗑️ Starting aggressive cleanup for storage management...");
        
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000)); // 1 hour ago
        
        // Delete old completed entries more aggressively
        const deleteResult = await client.query(`
            DELETE FROM rsa_keys 
            WHERE id IN (
                SELECT rsa_id FROM time_lock_puzzles 
                WHERE detected_completed IS NOT NULL 
                AND detected_completed < $1
            )
        `, [oneHourAgo]);
        
        await client.query(`
            DELETE FROM time_lock_puzzles 
            WHERE detected_completed IS NOT NULL 
            AND detected_completed < $1
        `, [oneHourAgo]);
        
        logger.info(`🗑️ Aggressive cleanup complete - Removed ${deleteResult.rowCount || 0} old entries`);
        
    } catch (error: any) {
        logger.error("❌ Error during aggressive cleanup:", error.message);
    }
}
