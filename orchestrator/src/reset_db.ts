import { Client } from 'pg';
import { dbConfig } from './db_tools';
import logger from './logger';

interface TableRow {
    tablename: string;
}

// Function to connect to the database and drop all tables
async function resetDatabase(): Promise<void> {
    logger.info("Connecting to PostgreSQL to reset the database...");

    const client = new Client(dbConfig);
    try {
        await client.connect();
        logger.info("Connected to database. Dropping all tables...");

        // Disable foreign key constraints (important for dropping tables safely)
        await client.query(`SET session_replication_role = 'replica';`);

        // Fetch all tables in the public schema
        const tablesRes = await client.query(`
            SELECT tablename FROM pg_tables WHERE schemaname = 'public';
        `);
        
        const tables = tablesRes.rows.map((row: TableRow) => row.tablename);

        if (tables.length === 0) {
            logger.info("No tables found in the database.");
        } else {
            // Drop each table
            for (const table of tables) {
                logger.info(`Dropping table: ${table}`);
                await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
            }
            logger.info("All tables dropped successfully.");
        }

        // Re-enable foreign key constraints
        await client.query(`SET session_replication_role = 'origin';`);

    } catch (error) {
        logger.error("Error while resetting database:", error);
    } finally {
        await client.end();
        logger.info("Database connection closed.");
    }
}

// Run the reset function
resetDatabase().catch(error => logger.error("Failed to reset database:", error));
