// src/data-plane/evaluation-server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { EvaluationService } from './evaluation-service';
import { EvaluationRequest } from '../types';
import { getServerConfig } from '../utils/config';
import { metricsMiddleware } from '../observability/metrics';
import logger from '../utils/logger';

const app = express();
let evaluationService: EvaluationService;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(metricsMiddleware('evaluation'));

// Request timeout middleware
app.use((req, res, next) => {
  res.setTimeout(5000, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    if (!evaluationService) {
      return res.status(503).json({
        status: 'unhealthy',
        error: 'Service not initialized'
      });
    }
    
    const health = await evaluationService.healthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: String(error)
    });
  }
});

// Service stats endpoint
app.get('/stats', async (req, res) => {
  try {
    if (!evaluationService) {
      return res.status(503).json({ error: 'Service not initialized' });
    }
    
    const stats = await evaluationService.getStats();
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to retrieve stats' });
  }
});

// Single flag evaluation
app.post('/evaluate', async (req, res) => {
  try {
    if (!evaluationService) {
      return res.status(503).json({
        error: 'Service not initialized',
        flag_key: req.body.flag_key,
        value: req.body.default_value || false,
        variant_key: 'default',
        reason: 'service_not_ready',
        timestamp: new Date()
      });
    }

    const evaluationRequest: EvaluationRequest = {
      flag_key: req.body.flag_key,
      user_context: req.body.user_context || {},
      environment: req.body.environment || 'production',
      default_value: req.body.default_value
    };

    // Validate request
    if (!evaluationRequest.flag_key) {
      return res.status(400).json({
        error: 'Missing required field: flag_key'
      });
    }

    const result = await evaluationService.evaluateFlag(evaluationRequest);
    res.json(result);

  } catch (error) {
    logger.error('Evaluation failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      flag_key: req.body.flag_key,
      value: req.body.default_value || false,
      variant_key: 'default',
      reason: 'evaluation_error',
      timestamp: new Date()
    });
  }
});

// Batch flag evaluation
app.post('/evaluate/batch', async (req, res) => {
  try {
    if (!evaluationService) {
      return res.status(503).json({
        error: 'Service not initialized'
      });
    }

    const requests: EvaluationRequest[] = req.body.requests;

    if (!Array.isArray(requests)) {
      return res.status(400).json({
        error: 'requests must be an array'
      });
    }

    if (requests.length > 50) {
      return res.status(400).json({
        error: 'Maximum 50 requests allowed per batch'
      });
    }

    // Validate each request
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      if (!request.flag_key) {
        return res.status(400).json({
          error: `Missing flag_key in request ${i}`
        });
      }
      
      // Set defaults
      request.user_context = request.user_context || {};
      request.environment = request.environment || 'production';
    }

    const results = await evaluationService.evaluateBatch(requests);
    res.json({ results });

  } catch (error) {
    logger.error('Batch evaluation failed:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Cache management endpoints
app.delete('/cache/:flagKey', async (req, res) => {
  try {
    if (!evaluationService) {
      return res.status(503).json({ error: 'Service not initialized' });
    }

    const { flagKey } = req.params;
    const { environment } = req.query;

    await evaluationService.invalidateCache(flagKey, environment as string);
    
    res.json({
      message: `Cache invalidated for flag: ${flagKey}`,
      environment: environment || 'all'
    });

  } catch (error) {
    logger.error('Cache invalidation failed:', error);
    res.status(500).json({ error: 'Cache invalidation failed' });
  }
});

app.get('/cache', async (req, res) => {
  try {
    if (!evaluationService) {
      return res.status(503).json({ error: 'Service not initialized' });
    }

    const cachedFlags = await evaluationService.getCachedFlags();
    res.json({ cached_flags: cachedFlags });
  } catch (error) {
    logger.error('Failed to get cached flags:', error);
    res.status(500).json({ error: 'Failed to retrieve cached flags' });
  }
});

// SDK Configuration endpoint (for SDK polling)
app.get('/sdk/config', async (req, res) => {
  try {
    const environment = req.query.environment as string || 'production';
    const etag = req.headers['if-none-match'];
    
    // This would typically return a lightweight config
    // For now, return a simple response
    const config = {
      environment,
      poll_interval: 30000,
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
    
    const configEtag = Buffer.from(JSON.stringify(config)).toString('base64').slice(0, 8);
    
    // If ETags match, return 304 Not Modified
    if (etag === configEtag) {
      return res.status(304).send();
    }
    
    res.set('ETag', configEtag);
    res.json(config);
    
  } catch (error) {
    logger.error('SDK config failed:', error);
    res.status(500).json({ error: 'Failed to get SDK config' });
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Start server
const startServer = async (): Promise<void> => {
  // Initialize evaluation service here, after connections are ready
  evaluationService = new EvaluationService();
  await evaluationService.initialize();
  
  const config = getServerConfig();
  const port = config.evaluation_service_port;

  app.listen(port, () => {
    logger.info(`Evaluation service running on port ${port}`);
    logger.info('Available endpoints:');
    logger.info('  GET  /health - Service health check');
    logger.info('  GET  /stats - Service statistics');
    logger.info('  POST /evaluate - Single flag evaluation');
    logger.info('  POST /evaluate/batch - Batch flag evaluation');
    logger.info('  GET  /cache - List cached flags');
    logger.info('  DELETE /cache/:flagKey - Invalidate flag cache');
    logger.info('  GET  /sdk/config - SDK configuration');
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Failed to start evaluation server:', error);
    process.exit(1);
  });
}

export { app, startServer };