// src/observability/metrics.ts
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import express from 'express';
import { getServerConfig } from '../utils/config';
import logger from '../utils/logger';


collectDefaultMetrics();

export const flagEvaluationTotal = new Counter({
  name: 'flag_evaluations_total',
  help: 'Total number of flag evaluations',
  labelNames: ['flag_key', 'environment', 'result', 'reason']
});

export const flagEvaluationDuration = new Histogram({
  name: 'flag_evaluation_duration_seconds',
  help: 'Duration of flag evaluations in seconds',
  labelNames: ['flag_key', 'environment'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0]
});

export const flagCacheHits = new Counter({
  name: 'flag_cache_hits_total',
  help: 'Total number of flag cache hits',
  labelNames: ['flag_key', 'environment']
});

export const flagCacheMisses = new Counter({
  name: 'flag_cache_misses_total',
  help: 'Total number of flag cache misses',
  labelNames: ['flag_key', 'environment']
});

export const activeFlagsGauge = new Gauge({
  name: 'active_flags_total',
  help: 'Total number of active flags',
  labelNames: ['environment']
});

export const flagConfigChanges = new Counter({
  name: 'flag_config_changes_total',
  help: 'Total number of flag configuration changes',
  labelNames: ['flag_key', 'environment', 'action', 'user']
});

export const apiRequestsTotal = new Counter({
  name: 'api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['method', 'route', 'status_code', 'service']
});

export const apiRequestDuration = new Histogram({
  name: 'api_request_duration_seconds',
  help: 'Duration of API requests in seconds',
  labelNames: ['method', 'route', 'service'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0]
});

// Kill switch activations (important for alerting)
export const killSwitchActivations = new Counter({
  name: 'kill_switch_activations_total',
  help: 'Total number of kill switch activations',
  labelNames: ['flag_key', 'user', 'reason']
});

// SDK polling metrics
export const sdkPollingRequests = new Counter({
  name: 'sdk_polling_requests_total',
  help: 'Total number of SDK polling requests',
  labelNames: ['environment', 'sdk_version']
});

// Rule evaluation metrics
export const ruleEvaluations = new Counter({
  name: 'rule_evaluations_total',
  help: 'Total number of rule evaluations',
  labelNames: ['flag_key', 'rule_type', 'matched']
});

// Metrics helper class
export class MetricsService {
  
  /**
   * Record a flag evaluation
   */
  recordFlagEvaluation(
    flagKey: string,
    environment: string,
    result: boolean,
    reason: string,
    duration: number,
    cacheHit: boolean
  ): void {
    flagEvaluationTotal.inc({ 
      flag_key: flagKey, 
      environment, 
      result: result.toString(), 
      reason 
    });
    
    flagEvaluationDuration.observe(
      { flag_key: flagKey, environment }, 
      duration
    );
    
    if (cacheHit) {
      flagCacheHits.inc({ flag_key: flagKey, environment });
    } else {
      flagCacheMisses.inc({ flag_key: flagKey, environment });
    }
  }
  
  /**
   * Record API request metrics
   */
  recordApiRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
    service: 'control-plane' | 'evaluation'
  ): void {
    apiRequestsTotal.inc({ 
      method, 
      route, 
      status_code: statusCode.toString(), 
      service 
    });
    
    apiRequestDuration.observe(
      { method, route, service }, 
      duration
    );
  }
  
  /**
   * Record flag configuration change
   */
  recordFlagConfigChange(
    flagKey: string,
    environment: string,
    action: 'created' | 'updated' | 'deleted' | 'toggled',
    user: string
  ): void {
    flagConfigChanges.inc({ 
      flag_key: flagKey, 
      environment, 
      action, 
      user 
    });
  }
  
  /**
   * Record kill switch activation
   */
  recordKillSwitchActivation(flagKey: string, user: string, reason: string): void {
    killSwitchActivations.inc({ flag_key: flagKey, user, reason });
  }
  
  /**
   * Update active flags gauge
   */
  updateActiveFlagsCount(environment: string, count: number): void {
    activeFlagsGauge.set({ environment }, count);
  }
  
  /**
   * Record rule evaluation
   */
  recordRuleEvaluation(flagKey: string, ruleType: string, matched: boolean): void {
    ruleEvaluations.inc({ 
      flag_key: flagKey, 
      rule_type: ruleType, 
      matched: matched.toString() 
    });
  }
  
  /**
   * Record SDK polling request
   */
  recordSdkPolling(environment: string, sdkVersion: string): void {
    sdkPollingRequests.inc({ environment, sdk_version: sdkVersion });
  }
}

// Singleton instance
export const metricsService = new MetricsService();

// Express middleware for automatic API metrics collection
export const metricsMiddleware = (service: 'control-plane' | 'evaluation') => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const start = Date.now();
    
    // Continue with the request
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000; // Convert to seconds
      const route = req.route?.path || req.path;
      
      metricsService.recordApiRequest(
        req.method,
        route,
        res.statusCode,
        duration,
        service
      );
    });
    
    next();
  };
};

// Metrics server
export const startMetricsServer = (): void => {
  const app = express();
  const config = getServerConfig();
  const port = config.metrics_port;
  
  // Metrics endpoint
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      const metrics = await register.metrics();
      res.end(metrics);
    } catch (error) {
      logger.error('Failed to generate metrics:', error);
      res.status(500).end('Failed to generate metrics');
    }
  });
  
  // Health check for metrics server
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'metrics',
      timestamp: new Date().toISOString()
    });
  });
  
  app.listen(port, () => {
    logger.info(`Metrics server running on port ${port}`);
    logger.info(`Prometheus metrics available at: http://localhost:${port}/metrics`);
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  register.clear();
});

export default metricsService;