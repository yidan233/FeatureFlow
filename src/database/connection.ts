import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';
import { DatabaseConfig, RedisConfig } from '../types';

let pgPool: Pool | null = null;
let redisClient: Redis | null = null;

export const createDatabaseConnection = (config: DatabaseConfig): Pool => {
  if (!pgPool) {
    pgPool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl,
      max: config.max_connections || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pgPool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }

  return pgPool;
};

export const createRedisConnection = (config: RedisConfig): Redis => {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
      keyPrefix: config.prefix || 'canary:',
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis connected successfully');
    });
  }

  return redisClient;
};

export const getDatabase = (): Pool => {
  if (!pgPool) {
    throw new Error('Database not initialized. Call createDatabaseConnection first.');
  }
  return pgPool;
};

export const getRedis = (): Redis => {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call createRedisConnection first.');
  }
  return redisClient;
};

export const closeDatabaseConnections = async (): Promise<void> => {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};

export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};