import { Command } from 'commander';
import dotenv from 'dotenv';
import { createDatabaseConnection, createRedisConnection } from './database/connection';
import { getDatabaseConfig, getRedisConfig } from './utils/config';
import { startServer as startEvaluationServer } from './data-plane/evaluation-server';
import { startControlPlaneServer } from './control-plane/control-plane-server';
import { startMetricsServer } from './observability/metrics';
import { runMigration } from './database/migrate';
import { seedDatabase } from './database/seed';
import logger from './utils/logger';

// Load environment variables first
dotenv.config();

const program = new Command();

// Initialize database and Redis connections
const initializeServices = async () => {
  try {
    const dbConfig = getDatabaseConfig();
    const redisConfig = getRedisConfig();
    
    createDatabaseConnection(dbConfig);
    createRedisConnection(getRedisConfig());
    
    logger.info('✓ Services initialized successfully');
  } catch (error) {
    logger.error('✗ Failed to initialize services:', error);
    process.exit(1);
  }
};

program
  .name('canary-flags')
  .description('Canary Feature Flag System')
  .version('1.0.0');

// Start control plane service
program
  .command('start:control')
  .description('Start the control plane service')
  .action(async () => {
    logger.info('🎛️ Starting control plane service...');
    await initializeServices();
    await startControlPlaneServer();
  });
program
  .command('start:eval')
  .description('Start the evaluation service')
  .action(async () => {
    logger.info('🚀 Starting evaluation service...');
    await initializeServices();
    await startEvaluationServer();
  });

program
  .command('start:metrics')
  .description('Start the metrics service')
  .action(async () => {
    logger.info('📊 Starting metrics service...');
    startMetricsServer();
  });

// Run database migration
program
  .command('migrate')
  .description('Run database migrations')
  .action(async () => {
    logger.info('📊 Running database migration...');
    try {
      await runMigration();
      logger.info('✓ Migration completed successfully');
    } catch (error) {
      logger.error('✗ Migration failed:', error);
      process.exit(1);
    }
  });

// Seed database
program
  .command('seed')
  .description('Seed database with sample data')
  .action(async () => {
    logger.info('🌱 Seeding database...');
    try {
      await seedDatabase();
      logger.info('✓ Database seeded successfully');
    } catch (error) {
      logger.error('✗ Seeding failed:', error);
      process.exit(1);
    }
  });

// Start all services (for production)
program
  .command('start')
  .description('Start all services')
  .action(async () => {
    logger.info('🐦 Starting Canary Feature Flag System...');
    await initializeServices();
    
    // Start all services
    logger.info('Starting metrics service...');
    startMetricsServer();
    
    logger.info('Starting evaluation service...');
    startEvaluationServer();
    
    logger.info('Starting control plane service...');
    await startControlPlaneServer();
    
    logger.info('✓ All services started successfully');
  });

// Health check command
program
  .command('health')
  .description('Check system health')
  .action(async () => {
    try {
      await initializeServices();
      
      // Test evaluation service
      const response = await fetch('http://localhost:8081/health');
      if (response.ok) {
        const health = await response.json();
        console.log('🟢 System Health: HEALTHY');
        console.log('Details:', JSON.stringify(health, null, 2));
      } else {
        console.log('🔴 System Health: UNHEALTHY');
        console.log('Evaluation service not responding');
      }
    } catch (error) {
      console.log('🔴 System Health: UNHEALTHY');
      console.log('Error:', String(error));
    }
  });

// Default behavior - show help
if (process.argv.length === 2) {
  program.help();
}

// Parse command line arguments
program.parse();

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});