import fs from 'fs';
import path from 'path';
import { createDatabaseConnection, closeDatabaseConnections } from './connection';
import { getDatabaseConfig } from '../utils/config';
import logger from '../utils/logger';

const runMigration = async (): Promise<void> => {
  let pool;
  
  try {
    logger.info('Starting database migration...');
    
    // Initialize database connection
    const dbConfig = getDatabaseConfig();
    pool = createDatabaseConnection(dbConfig);
    
    // Read the schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute the schema
    await pool.query(schemaSql);
    
    logger.info('Database migration completed successfully');
  } catch (error) {
    logger.error('Database migration failed:', error);
    throw error;
  } finally {
    if (pool) {
      await closeDatabaseConnections();
    }
  }
};


if (require.main === module) {
  runMigration()
    .then(() => {
      logger.info('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration script failed:', error);
      process.exit(1);
    });
}

export { runMigration };