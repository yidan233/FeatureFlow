import dotenv from 'dotenv';
import { DatabaseConfig, RedisConfig, ServerConfig } from '../types';

dotenv.config();

export const getDatabaseConfig = (): DatabaseConfig => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'canary_flags',
  username: process.env.DB_USER || 'canary_user',
  password: process.env.DB_PASS || 'canary_pass',
  ssl: process.env.DB_SSL === 'true',
  max_connections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
});

export const getRedisConfig = (): RedisConfig => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  prefix: process.env.REDIS_PREFIX || 'canary:',
});

export const getServerConfig = (): ServerConfig => ({
  control_plane_port: parseInt(process.env.CONTROL_PLANE_PORT || '8080'),
  evaluation_service_port: parseInt(process.env.EVALUATION_SERVICE_PORT || '8081'),
  metrics_port: parseInt(process.env.METRICS_PORT || '9091'),
  cors_enabled: process.env.CORS_ENABLED !== 'false',
  request_logging: process.env.REQUEST_LOGGING !== 'false',
});

export const getEnvironment = (): string => {
  return process.env.NODE_ENV || 'development';
};

export const getLogLevel = (): string => {
  return process.env.LOG_LEVEL || 'info';
};

