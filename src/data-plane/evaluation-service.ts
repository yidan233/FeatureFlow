// src/data-plane/evaluation-service.ts
import { FlagRepository } from '../database/repositories/flag-repository';
import { RuleEngine } from './rule-engine';
import { getRedis } from '../database/connection';
import {
  EvaluationRequest,
  EvaluationResponse,
  UserContext,
  EvaluationContext,
  PerformanceMetrics
} from '../types';
import { metricsService } from '../observability/metrics';
import logger from '../utils/logger';
import { Redis } from 'ioredis';

export class EvaluationService {
  private flagRepository: FlagRepository;
  private ruleEngine: RuleEngine;
  private redis: Redis;
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'flag_config:';

  constructor() {
    this.flagRepository = new FlagRepository();
    this.ruleEngine = new RuleEngine();
    this.redis = null as any;
  }
  
  // Initialize method to be called after connections are ready
  async initialize(): Promise<void> {
    try {
      console.log('🔍 EvaluationService: Starting initialization...');
      await this.flagRepository.initialize();
      console.log('✅ EvaluationService: FlagRepository initialized');
      this.redis = getRedis();
      console.log('✅ EvaluationService: Redis initialized');
      
      // Test the connections immediately
      console.log('🔍 Testing connections...');
      await this.redis.ping();
      console.log('✅ Redis ping successful');
      
      const testQuery = await this.flagRepository.listFlags(1, 1);
      console.log('✅ Database query successful, found', testQuery.total, 'flags');
      
    } catch (error) {
      console.error('❌ EvaluationService initialization failed:', error);
      throw error;
    }
  }

  /**
   * Main evaluation method
   */
  async evaluateFlag(request: EvaluationRequest): Promise<EvaluationResponse> {
    const startTime = Date.now();
    let cacheHit = false;

    try {
      const { flag_key, user_context, environment = 'production', default_value = false } = request;

      // Try to get from cache first
      const cacheKey = `${this.CACHE_PREFIX}${flag_key}:${environment}`;
      let flagData = await this.getFlagFromCache(cacheKey);
      
      if (!flagData) {
        // Cache miss - fetch from database
        flagData = await this.flagRepository.getFlagConfig(flag_key, environment);
        
        if (!flagData) {
          logger.warn(`Flag not found: ${flag_key} in ${environment}`);
          return this.createEvaluationResponse(
            flag_key,
            default_value,
            'default',
            'flag_not_found',
            startTime,
            cacheHit
          );
        }

        // Cache the result
        await this.cacheFlagData(cacheKey, flagData);
      } else {
        cacheHit = true;
      }

      // Build evaluation context
      const evaluationContext: EvaluationContext = {
        user_context,
        flag_config: flagData.config,
        rules: flagData.rules,
        variants: flagData.variants,
        environment
      };

      // Validate context
      const validation = this.ruleEngine.validateContext(evaluationContext);
      if (!validation.valid) {
        logger.error('Invalid evaluation context:', validation.errors);
        return this.createEvaluationResponse(
          flag_key,
          default_value,
          'default',
          'invalid_context',
          startTime,
          cacheHit
        );
      }

      // Evaluate the flag
      const result = this.ruleEngine.evaluateFlag(evaluationContext);
      
      // Record metrics
      const duration = (Date.now() - startTime) / 1000; // Convert to seconds
      metricsService.recordFlagEvaluation(
        flag_key,
        environment,
        result.enabled,
        result.reason,
        duration,
        cacheHit
      );
      
      // Log evaluation for analytics (async)
      this.logEvaluation(flag_key, environment, user_context, result, startTime)
        .catch(error => logger.error('Failed to log evaluation:', error));

      return this.createEvaluationResponse(
        flag_key,
        result.enabled,
        result.variant,
        result.reason,
        startTime,
        cacheHit
      );

    } catch (error) {
      logger.error(`Flag evaluation failed for ${request.flag_key}:`, error);
      
      return this.createEvaluationResponse(
        request.flag_key,
        request.default_value || false,
        'default',
        'evaluation_error',
        startTime,
        cacheHit
      );
    }
  }

  /**
   * Batch evaluate multiple flags
   */
  async evaluateBatch(requests: EvaluationRequest[]): Promise<EvaluationResponse[]> {
    const promises = requests.map(request => this.evaluateFlag(request));
    return Promise.all(promises);
  }

  /**
   * Get flag configuration from cache
   */
  private async getFlagFromCache(cacheKey: string): Promise<any> {
    try {
      const cached = await this.redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Cache read failed:', error);
      return null;
    }
  }

  /**
   * Cache flag configuration
   */
  private async cacheFlagData(cacheKey: string, flagData: any): Promise<void> {
    try {
      await this.redis.setex(
        cacheKey, 
        this.CACHE_TTL, 
        JSON.stringify(flagData)
      );
    } catch (error) {
      logger.warn('Cache write failed:', error);
    }
  }

  /**
   * Invalidate cache for a specific flag
   */
  async invalidateCache(flagKey: string, environment?: string): Promise<void> {
    try {
      if (environment) {
        const cacheKey = `${this.CACHE_PREFIX}${flagKey}:${environment}`;
        await this.redis.del(cacheKey);
      } else {
        // Invalidate for all environments
        const pattern = `${this.CACHE_PREFIX}${flagKey}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
      
      logger.info(`Cache invalidated for flag: ${flagKey}`);
    } catch (error) {
      logger.error('Cache invalidation failed:', error);
    }
  }

  /**
   * Get all cached flags (for debugging)
   */
  async getCachedFlags(): Promise<string[]> {
    try {
      const keys = await this.redis.keys(`${this.CACHE_PREFIX}*`);
      return keys.map(key => key.replace(this.CACHE_PREFIX, ''));
    } catch (error) {
      logger.error('Failed to get cached flags:', error);
      return [];
    }
  }

  /**
   * Create evaluation response object
   */
  private createEvaluationResponse(
    flagKey: string,
    value: any,
    variantKey: string,
    reason: string,
    startTime: number,
    cacheHit: boolean
  ): EvaluationResponse {
    return {
      flag_key: flagKey,
      value,
      variant_key: variantKey,
      reason,
      timestamp: new Date()
    };
  }

  /**
   * Log evaluation for analytics
   */
  private async logEvaluation(
    flagKey: string,
    environment: string,
    userContext: UserContext,
    result: { enabled: boolean; variant: string; reason: string },
    startTime: number
  ): Promise<void> {
    // This would typically go to a metrics system or analytics database
    // For now, we'll just log it
    const duration = Date.now() - startTime;
    
    logger.info('Flag evaluation completed', {
      flag_key: flagKey,
      environment,
      user_id: userContext.user_id,
      result: result.enabled,
      variant: result.variant,
      reason: result.reason,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });

    // Could also emit metrics here for Prometheus
    // this.metricsService.recordEvaluation(flagKey, environment, result, duration);
  }

  /**
   * Health check for the service
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      // Check Redis connection
      await this.redis.ping();
      
      // Check database connection
      await this.flagRepository.listFlags(1, 1);
      
      return {
        status: 'healthy',
        details: {
          redis: 'connected',
          database: 'connected',
          cache_keys: (await this.getCachedFlags()).length
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: String(error)
        }
      };
    }
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<{
    cached_flags: number;
    total_flags: number;
    cache_hit_ratio?: number;
  }> {
    try {
      const cachedFlags = await this.getCachedFlags();
      const { total } = await this.flagRepository.listFlags(1, 1);
      
      return {
        cached_flags: cachedFlags.length,
        total_flags: total,
        // cache_hit_ratio would be calculated from metrics
      };
    } catch (error) {
      logger.error('Failed to get stats:', error);
      return {
        cached_flags: 0,
        total_flags: 0
      };
    }
  }
}