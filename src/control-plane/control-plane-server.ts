import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { FlagRepository } from '../database/repositories/flag-repository';
import { EvaluationService } from '../data-plane/evaluation-service';
import { 
  CreateFlagRequest, 
  UpdateFlagConfigRequest, 
  FlagListResponse 
} from '../types';
import { getServerConfig } from '../utils/config';
import logger from '../utils/logger';
import { metricsService, metricsMiddleware } from '../observability/metrics';

const app = express();
let flagRepository: FlagRepository;
let evaluationService: EvaluationService;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(metricsMiddleware('control-plane')); 

// Request timeout middleware
app.use((req, res, next) => {
  res.setTimeout(10000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});


const authenticateApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  const validApiKey = process.env.API_KEY || 'canary-admin-key';
  
  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ 
      error: 'Unauthorized - Invalid API key',
      hint: 'Include X-API-Key header or Authorization: Bearer <key>'
    });
  }
  
  // Add user info to request for audit logging
  req.user = { id: 'api-user', email: 'api@canary.com' };
  next();
};

// Apply auth to all routes except health and test-db
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/test-db') {
    return next();
  }
  return authenticateApiKey(req, res, next);
});

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'control-plane',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Database test endpoint (no auth required)
app.get('/test-db', async (req, res) => {
  try {
    console.log('🔍 Testing database connection...');
    if (!flagRepository) {
      return res.status(500).json({ error: 'FlagRepository not initialized' });
    }
    
    // Try a simple database query
    const { flags, total } = await flagRepository.listFlags(1, 1);
    res.json({
      status: 'success',
      message: 'Database connection working',
      flag_count: total
    });
  } catch (error) {
    console.error('❌ Database test failed:', error);
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// ==================== FLAG MANAGEMENT ENDPOINTS ====================

// Get all flags with pagination and filtering
app.get('/api/flags', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = Math.min(parseInt(req.query.per_page as string) || 50, 100);
    const activeOnly = req.query.active !== 'false';
    const environment = req.query.environment as string;

    const { flags, total } = await flagRepository.listFlags(page, perPage, activeOnly);
    
    // If environment specified, include configs for that environment
    let enrichedFlags = flags;
    if (environment) {
      enrichedFlags = await Promise.all(flags.map(async (flag) => {
        const flagData = await flagRepository.getFlagConfig(flag.key, environment);
        return {
          ...flag,
          config: flagData?.config || null,
          variants: flagData?.variants || [],
          rules: flagData?.rules || []
        };
      }));
    }

    const response: FlagListResponse = {
      flags: enrichedFlags,
      total,
      page,
      per_page: perPage
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to list flags:', error);
    res.status(500).json({ error: 'Failed to retrieve flags' });
  }
});

// Get single flag with all environments
app.get('/api/flags/:flagKey', async (req, res) => {
  try {
    const { flagKey } = req.params;
    
    const flag = await flagRepository.getFlag(flagKey);
    if (!flag) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    // Get configurations for all environments
    const environments = ['development', 'staging', 'production'];
    const configs = await Promise.all(
      environments.map(async (env) => {
        const flagData = await flagRepository.getFlagConfig(flagKey, env);
        return {
          environment: env,
          config: flagData?.config || null,
          variants: flagData?.variants || [],
          rules: flagData?.rules || []
        };
      })
    );

    res.json({
      flag,
      environments: configs
    });
  } catch (error) {
    logger.error(`Failed to get flag ${req.params.flagKey}:`, error);
    res.status(500).json({ error: 'Failed to retrieve flag' });
  }
});

// Create new flag
app.post('/api/flags', async (req, res) => {
  try {
    const request: CreateFlagRequest = req.body;
    
    // Validation
    if (!request.key || !request.name) {
      return res.status(400).json({ 
        error: 'Missing required fields: key and name are required' 
      });
    }
    
    if (!/^[a-z0-9_]+$/.test(request.key)) {
      return res.status(400).json({ 
        error: 'Invalid key format. Use only lowercase letters, numbers, and underscores' 
      });
    }

    const userId = req.user?.id || 'anonymous';
    const userEmail = req.user?.email || 'unknown';
    const flag = await flagRepository.createFlag(request, userId);
    

    metricsService.recordFlagConfigChange(flag.key, 'all', 'created', userId);
    
    logger.info(`Flag created: ${flag.key}`, {
      flagKey: flag.key,
      userId,
      userEmail
    });

    res.status(201).json(flag);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return res.status(409).json({ error: 'Flag key already exists' });
    }
    
    logger.error('Failed to create flag:', error);
    res.status(500).json({ error: 'Failed to create flag' });
  }
});

// Update flag configuration for specific environment
app.put('/api/flags/:flagKey/environments/:environment', async (req, res) => {
  try {
    const { flagKey, environment } = req.params;
    const updateRequest: UpdateFlagConfigRequest = req.body;
    
    // Validate environment
    const validEnvironments = ['development', 'staging', 'production'];
    if (!validEnvironments.includes(environment)) {
      return res.status(400).json({ 
        error: 'Invalid environment. Must be: development, staging, or production' 
      });
    }

    const userId = req.user?.id || 'anonymous';
    const updatedConfig = await flagRepository.updateFlagConfig(
      flagKey,
      environment,
      updateRequest,
      userId
    );
    
    // Invalidate cache after update
    if (evaluationService) {
      await evaluationService.invalidateCache(flagKey, environment);
    }
    

    metricsService.recordFlagConfigChange(flagKey, environment, 'updated', userId);
    
    logger.info(`Flag config updated: ${flagKey} in ${environment}`, {
      flagKey,
      environment,
      userId,
      changes: updateRequest
    });

    res.json(updatedConfig);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
    }
    
    logger.error(`Failed to update flag config ${req.params.flagKey}:`, error);
    res.status(500).json({ error: 'Failed to update flag configuration' });
  }
});

// Toggle flag on/off (quick enable/disable)
app.patch('/api/flags/:flagKey/environments/:environment/toggle', async (req, res) => {
  try {
    const { flagKey, environment } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const userId = req.user?.id || 'anonymous';
    await flagRepository.toggleFlag(flagKey, environment, enabled, userId);
    
    // Invalidate cache after toggle
    if (evaluationService) {
      await evaluationService.invalidateCache(flagKey, environment);
    }
    
    logger.info(`Flag toggled: ${flagKey} ${enabled ? 'enabled' : 'disabled'} in ${environment}`, {
      flagKey,
      environment,
      enabled,
      userId
    });

    res.json({ 
      message: `Flag ${flagKey} ${enabled ? 'enabled' : 'disabled'} in ${environment}`,
      flagKey,
      environment,
      enabled
    });
  } catch (error) {
    logger.error(`Failed to toggle flag ${req.params.flagKey}:`, error);
    res.status(500).json({ error: 'Failed to toggle flag' });
  }
});

// Kill switch - emergency disable flag in all environments
app.post('/api/flags/:flagKey/kill-switch', async (req, res) => {
  try {
    const { flagKey } = req.params;
    const { reason } = req.body;
    
    const environments = ['development', 'staging', 'production'];
    const userId = req.user?.id || 'anonymous';
    const userEmail = req.user?.email || 'unknown';
    
    // Disable in all environments
    await Promise.all(environments.map(env => 
      flagRepository.toggleFlag(flagKey, env, false, userId)
    ));
    
    // Clear all caches
    if (evaluationService) {
      await evaluationService.invalidateCache(flagKey);
    }
    
 
    metricsService.recordKillSwitchActivation(flagKey, userId, reason || 'Emergency disable');
    
    logger.warn(`KILL SWITCH ACTIVATED: ${flagKey}`, {
      flagKey,
      reason: reason || 'No reason provided',
      userId,
      userEmail,
      environments
    });

    res.json({
      message: `Kill switch activated for ${flagKey}`,
      flagKey,
      disabled_environments: environments,
      reason: reason || 'Emergency disable',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Kill switch failed for ${req.params.flagKey}:`, error);
    res.status(500).json({ error: 'Kill switch operation failed' });
  }
});

// Delete flag (soft delete - marks as inactive)
app.delete('/api/flags/:flagKey', async (req, res) => {
  try {
    const { flagKey } = req.params;
    const userId = req.user?.id || 'anonymous';
    
    await flagRepository.deleteFlag(flagKey, userId);
    
    // Clear all caches
    if (evaluationService) {
      await evaluationService.invalidateCache(flagKey);
    }
    
    logger.info(`Flag deleted: ${flagKey}`, {
      flagKey,
      userId
    });

    res.json({ 
      message: `Flag ${flagKey} deleted successfully`,
      flagKey
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Flag not found' });
      }
    }
    
    logger.error(`Failed to delete flag ${req.params.flagKey}:`, error);
    res.status(500).json({ error: 'Failed to delete flag' });
  }
});

// ==================== CACHE MANAGEMENT ====================

// Clear cache for specific flag
app.delete('/api/cache/flags/:flagKey', async (req, res) => {
  try {
    const { flagKey } = req.params;
    const { environment } = req.query;
    
    if (evaluationService) {
      await evaluationService.invalidateCache(flagKey, environment as string);
    }
    
    res.json({
      message: `Cache cleared for ${flagKey}`,
      environment: environment || 'all'
    });
  } catch (error) {
    logger.error('Cache invalidation failed:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Get cache status
app.get('/api/cache/status', async (req, res) => {
  try {
    if (!evaluationService) {
      return res.status(503).json({ error: 'Evaluation service not available' });
    }
    
    const cachedFlags = await evaluationService.getCachedFlags();
    const stats = await evaluationService.getStats();
    
    res.json({
      cached_flags: cachedFlags,
      stats
    });
  } catch (error) {
    logger.error('Failed to get cache status:', error);
    res.status(500).json({ error: 'Failed to retrieve cache status' });
  }
});

// ==================== SYSTEM INFO ====================

// System overview
app.get('/api/system/overview', async (req, res) => {
  try {
    const { flags, total } = await flagRepository.listFlags(1, 1000);
    
    const overview = {
      total_flags: total,
      active_flags: flags.filter(f => f.is_active).length,
      flag_types: flags.reduce((acc, flag) => {
        acc[flag.flag_type] = (acc[flag.flag_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      environments: ['development', 'staging', 'production'],
      system_health: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
    
    res.json(overview);
  } catch (error) {
    logger.error('Failed to get system overview:', error);
    res.status(500).json({ error: 'Failed to retrieve system overview' });
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error in control plane:', error);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Start server
const startControlPlaneServer = async (): Promise<void> => {
  // Initialize services
  flagRepository = new FlagRepository();
  await flagRepository.initialize();
  
  // Initialize evaluation service for cache invalidation
  evaluationService = new EvaluationService();
  await evaluationService.initialize();
  
  const config = getServerConfig();
  const port = config.control_plane_port;

  app.listen(port, () => {
    logger.info(`Control Plane running on port ${port}`);
    logger.info('Available endpoints:');
    logger.info('  GET    /health - Service health check');
    logger.info('  GET    /api/flags - List all flags');
    logger.info('  GET    /api/flags/:key - Get single flag');
    logger.info('  POST   /api/flags - Create new flag');
    logger.info('  PUT    /api/flags/:key/environments/:env - Update flag config');
    logger.info('  PATCH  /api/flags/:key/environments/:env/toggle - Toggle flag');
    logger.info('  POST   /api/flags/:key/kill-switch - Emergency disable');
    logger.info('  DELETE /api/flags/:key - Delete flag');
    logger.info('  GET    /api/system/overview - System overview');
    logger.info('  GET    /api/cache/status - Cache status');
    logger.info('');
    logger.info('🔑 API Key required for all endpoints except /health');
    logger.info(`   Use header: X-API-Key: ${process.env.API_KEY || 'canary-admin-key'}`);
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down control plane gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down control plane gracefully');
  process.exit(0);
});

// Export for use in main index
export { app as controlPlaneApp, startControlPlaneServer };


declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}