
import { EventEmitter } from 'events';
import { RuleEngine } from '../data-plane/rule-engine';
import {
  SDKConfig,
  UserContext,
  EvaluationRequest,
  EvaluationResponse,
  FeatureFlag,
  FlagConfig,
  FlagVariant,
  RolloutRule
} from '../types';

interface FlagConfigCache {
  [flagKey: string]: {
    flag: FeatureFlag;
    config: FlagConfig;
    variants: FlagVariant[];
    rules: RolloutRule[];
    lastUpdated: number;
  };
}

interface SDKOptions {
  apiKey: string;
  baseUrl: string;
  environment?: string;
  pollInterval?: number;
  timeout?: number;
  enableAnalytics?: boolean;
  enableLocalEvaluation?: boolean;
  fallbackValues?: Record<string, any>;
}

export class CanarySDK extends EventEmitter {
  private config: SDKConfig;
  private ruleEngine: RuleEngine;
  private flagCache: FlagConfigCache = {};
  private pollTimer: NodeJS.Timeout | null = null;
  private lastETag: string | null = null;
  private isInitialized = false;
  private analytics: Array<{
    flagKey: string;
    result: any;
    timestamp: number;
    userContext: UserContext;
  }> = [];

  constructor(options: SDKOptions) {
    super();
    
    this.config = {
      api_key: options.apiKey,
      base_url: options.baseUrl,
      environment: options.environment || 'production',
      poll_interval: options.pollInterval || 30000,
      timeout: options.timeout || 5000,
      enable_analytics: options.enableAnalytics ?? true
    };
    
    this.ruleEngine = new RuleEngine();
    
    // Initialize immediately
    this.initialize();
  }

  /**
   * Initialize the SDK
   */
  private async initialize(): Promise<void> {
    try {
      await this.fetchConfig();
      this.startPolling();
      this.isInitialized = true;
      this.emit('ready');
    } catch (error) {
      this.emit('error', error);
      // Continue with polling even if initial fetch fails
      this.startPolling();
    }
  }

  /**
   * Evaluate a feature flag
   */
  async evaluateFlag(
    flagKey: string, 
    userContext: UserContext, 
    defaultValue: any = false
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Try local evaluation first if cache is available
      if (this.flagCache[flagKey]) {
        const result = this.evaluateLocally(flagKey, userContext, defaultValue);
        
        // Record analytics
        if (this.config.enable_analytics) {
          this.recordAnalytics(flagKey, result, userContext, startTime, true);
        }
        
        return result;
      }
      
      // Fallback to remote evaluation
      const result = await this.evaluateRemotely(flagKey, userContext, defaultValue);
      
      // Record analytics
      if (this.config.enable_analytics) {
        this.recordAnalytics(flagKey, result, userContext, startTime, false);
      }
      
      return result;
      
    } catch (error) {
      // Return fallback value on error
      const fallbackValue = this.getFallbackValue(flagKey, defaultValue);
      
      this.emit('evaluationError', {
        flagKey,
        error,
        fallbackValue,
        userContext
      });
      
      return fallbackValue;
    }
  }

  /**
   * Evaluate multiple flags at once
   */
  async evaluateFlags(
    requests: Array<{
      flagKey: string;
      userContext: UserContext;
      defaultValue?: any;
    }>
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    
    // Evaluate all flags concurrently
    const promises = requests.map(async (req) => {
      const value = await this.evaluateFlag(req.flagKey, req.userContext, req.defaultValue);
      results[req.flagKey] = value;
    });
    
    await Promise.all(promises);
    return results;
  }

  /**
   * Local evaluation using cached config
   */
  private evaluateLocally(
    flagKey: string, 
    userContext: UserContext, 
    defaultValue: any
  ): any {
    const cached = this.flagCache[flagKey];
    if (!cached) {
      return defaultValue;
    }

    const evaluationContext = {
      user_context: userContext,
      flag_config: cached.config,
      rules: cached.rules,
      variants: cached.variants,
      environment: this.config.environment
    };

    const result = this.ruleEngine.evaluateFlag(evaluationContext);
    
    if (!result.enabled) {
      return defaultValue;
    }

    // Return the variant value or boolean result
    if (cached.flag.flag_type === 'boolean') {
      return result.variant === 'true';
    }
    
    const variant = cached.variants.find(v => v.key === result.variant);
    return variant ? this.parseVariantValue(variant.value, cached.flag.flag_type) : defaultValue;
  }

  /**
   * Remote evaluation via API
   */
  private async evaluateRemotely(
    flagKey: string,
    userContext: UserContext,
    defaultValue: any
  ): Promise<any> {
    const request: EvaluationRequest = {
      flag_key: flagKey,
      user_context: userContext,
      environment: this.config.environment,
      default_value: defaultValue
    };

    const response = await fetch(`${this.config.base_url}/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SDK-Key': this.config.api_key,
        'User-Agent': 'canary-sdk-js/1.0.0'
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json() as EvaluationResponse;
    return result.value;
  }

  /**
   * Fetch configuration from server
   */
  private async fetchConfig(): Promise<void> {
    const headers: Record<string, string> = {
      'X-SDK-Key': this.config.api_key,
      'User-Agent': 'canary-sdk-js/1.0.0'
    };

    if (this.lastETag) {
      headers['If-None-Match'] = this.lastETag;
    }

    const response = await fetch(`${this.config.base_url}/sdk/config?environment=${this.config.environment}`, {
      headers,
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (response.status === 304) {
      // Config hasn't changed
      return;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status}`);
    }

    this.lastETag = response.headers.get('ETag');
    
    // In a full implementation, this would return the actual flag configurations
    // For now, we'll emit an event that config was updated
    this.emit('configUpdated');
  }

  /**
   * Start polling for config updates
   */
  private startPolling(): void {
    this.stopPolling();
    
    this.pollTimer = setInterval(() => {
      this.fetchConfig().catch(error => {
        this.emit('pollError', error);
      });
    }, this.config.poll_interval);
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Get fallback value for a flag
   */
  private getFallbackValue(flagKey: string, defaultValue: any): any {
    // You could implement custom fallback logic here
    return defaultValue;
  }

  /**
   * Parse variant value based on flag type
   */
  private parseVariantValue(value: string, flagType: string): any {
    switch (flagType) {
      case 'boolean':
        return value === 'true';
      case 'number':
        return parseFloat(value);
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  /**
   * Record analytics data
   */
  private recordAnalytics(
    flagKey: string,
    result: any,
    userContext: UserContext,
    startTime: number,
    cached: boolean
  ): void {
    this.analytics.push({
      flagKey,
      result,
      timestamp: Date.now(),
      userContext: {
        user_id: userContext.user_id,
        // Don't include full attributes for privacy
        attributes: { hash: this.hashAttributes(userContext.attributes || {}) }
      }
    });

    // Emit evaluation event
    this.emit('evaluation', {
      flagKey,
      result,
      cached,
      duration: Date.now() - startTime,
      userContext: userContext.user_id
    });

    // Keep analytics array from growing too large
    if (this.analytics.length > 1000) {
      this.analytics = this.analytics.slice(-500);
    }
  }

  /**
   * Hash user attributes for privacy
   */
  private hashAttributes(attributes: Record<string, any>): string {
    const str = JSON.stringify(attributes);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get SDK status and statistics
   */
  getStatus(): {
    initialized: boolean;
    cachedFlags: number;
    environment: string;
    lastPoll: number | null;
    analyticsEvents: number;
  } {
    return {
      initialized: this.isInitialized,
      cachedFlags: Object.keys(this.flagCache).length,
      environment: this.config.environment,
      lastPoll: this.lastETag ? Date.now() : null,
      analyticsEvents: this.analytics.length
    };
  }

  /**
   * Force refresh of configuration
   */
  async refresh(): Promise<void> {
    await this.fetchConfig();
  }

  /**
   * Flush analytics data (in production, this would send to analytics service)
   */
  flushAnalytics(): void {
    if (this.analytics.length === 0) return;
    
    // In production, you'd send this to your analytics backend
    this.emit('analyticsFlush', [...this.analytics]);
    this.analytics = [];
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopPolling();
    this.flushAnalytics();
    this.removeAllListeners();
    this.flagCache = {};
  }
}

// Factory function for easier usage
export function createCanarySDK(options: SDKOptions): CanarySDK {
  return new CanarySDK(options);
}

// Usage example:
/*
const sdk = createCanarySDK({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:8081',
  environment: 'production',
  pollInterval: 30000
});

sdk.on('ready', () => {
  console.log('SDK is ready');
});

sdk.on('error', (error) => {
  console.error('SDK error:', error);
});

// Evaluate a flag
const isEnabled = await sdk.evaluateFlag('new_feature', {
  user_id: 'user123',
  attributes: { country: 'US', tier: 'premium' }
});

// Evaluate multiple flags
const results = await sdk.evaluateFlags([
  { flagKey: 'feature_a', userContext: { user_id: 'user123' } },
  { flagKey: 'feature_b', userContext: { user_id: 'user123' }, defaultValue: false }
]);
*/