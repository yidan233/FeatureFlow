import crypto from 'crypto';
import {
  UserContext,
  EvaluationContext,
  RuleEvaluationResult,
  RolloutRule,
  FlagVariant,
  FlagConfig
} from '../types';
import logger from '../utils/logger';

export class RuleEngine {
  
  /**
   * Evaluates a feature flag for a given user context
   */
  evaluateFlag(context: EvaluationContext): {
    enabled: boolean;
    variant: string;
    reason: string;
  } {
    const { user_context, flag_config, rules, variants } = context;
    
    // If flag is not enabled, return default
    if (!flag_config.is_enabled) {
      return {
        enabled: false,
        variant: flag_config.default_variant,
        reason: 'flag_disabled'
      };
    }
    
    // Sort rules by priority 
    const sortedRules = rules.sort((a, b) => a.priority - b.priority);
    
    // Evaluate rules in order
    for (const rule of sortedRules) {
      const ruleResult = this.evaluateRule(rule, user_context, variants);
      
      if (ruleResult.matched) {
        return {
          enabled: true,
          variant: ruleResult.variant_key || flag_config.default_variant,
          reason: ruleResult.reason
        };
      }
    }
    
    // If no rules matched, check percentage rollout
    const rolloutResult = this.evaluatePercentageRollout(
      flag_config.rollout_percentage,
      user_context,
      context.flag_config.flag_id
    );
    
    if (rolloutResult.matched) {
      // Select variant based on weights
      const selectedVariant = this.selectVariantByWeight(variants);
      
      return {
        enabled: true,
        variant: selectedVariant.key,
        reason: 'percentage_rollout'
      };
    }
    
    return {
      enabled: false,
      variant: flag_config.default_variant,
      reason: 'not_in_rollout'
    };
  }
  
  /**
   * Evaluates a single rollout rule
   */
  private evaluateRule(
    rule: RolloutRule, 
    userContext: UserContext, 
    variants: FlagVariant[]
  ): RuleEvaluationResult {
    switch (rule.rule_type) {
      case 'percentage':
        return this.evaluatePercentageRule(rule, userContext);
        
      case 'attribute':
        return this.evaluateAttributeRule(rule, userContext);
        
      case 'user_id':
        return this.evaluateUserIdRule(rule, userContext);
        
      default:
        logger.warn(`Unknown rule type: ${rule.rule_type}`);
        return { matched: false, reason: 'unknown_rule_type' };
    }
  }
  
  /**
   * Evaluates percentage-based rules
   */
  private evaluatePercentageRule(
    rule: RolloutRule, 
    userContext: UserContext
  ): RuleEvaluationResult {
    if (!rule.percentage || rule.percentage === 0) {
      return { matched: false, reason: 'zero_percentage' };
    }
    
    const userId = userContext.user_id || 'anonymous';
    const hash = this.generateUserHash(userId, rule.id);
    const percentage = hash % 100;
    
    const matched = percentage < rule.percentage;
    
    return {
      matched,
      variant_key: rule.variant_key,
      reason: matched ? 'percentage_match' : 'percentage_no_match',
      rule_id: rule.id
    };
  }
  
  /**
   * Evaluates attribute-based rules
   */
  private evaluateAttributeRule(
    rule: RolloutRule, 
    userContext: UserContext
  ): RuleEvaluationResult {
    if (!rule.attribute_name || !rule.operator || !rule.attribute_value) {
      return { matched: false, reason: 'invalid_attribute_rule' };
    }
    
    const userAttributes = { ...userContext.attributes, ...userContext.custom_attributes };
    const userValue = userAttributes[rule.attribute_name];
    
    if (userValue === undefined) {
      return { matched: false, reason: 'attribute_not_found' };
    }
    
    const matched = this.evaluateAttributeCondition(
      userValue, 
      rule.operator, 
      rule.attribute_value
    );
    
    return {
      matched,
      variant_key: rule.variant_key,
      reason: matched ? 'attribute_match' : 'attribute_no_match',
      rule_id: rule.id
    };
  }
  
  /**
   * Evaluates user ID based rules
   */
  private evaluateUserIdRule(
    rule: RolloutRule, 
    userContext: UserContext
  ): RuleEvaluationResult {
    if (!userContext.user_id || !rule.attribute_value) {
      return { matched: false, reason: 'invalid_user_id_rule' };
    }
    
    const targetUserIds = rule.attribute_value.split(',').map(id => id.trim());
    const matched = targetUserIds.includes(userContext.user_id);
    
    return {
      matched,
      variant_key: rule.variant_key,
      reason: matched ? 'user_id_match' : 'user_id_no_match',
      rule_id: rule.id
    };
  }
  
  /**
   * Evaluates percentage rollout without specific rules
   */
  private evaluatePercentageRollout(
    percentage: number,
    userContext: UserContext,
    flagId: string
  ): RuleEvaluationResult {
    if (percentage === 0) {
      return { matched: false, reason: 'zero_rollout' };
    }
    
    if (percentage === 100) {
      return { matched: true, reason: 'full_rollout' };
    }
    
    const userId = userContext.user_id || 'anonymous';
    const hash = this.generateUserHash(userId, flagId);
    const userPercentage = hash % 100;
    
    const matched = userPercentage < percentage;
    
    return {
      matched,
      reason: matched ? 'rollout_match' : 'rollout_no_match'
    };
  }
  
  /**
   * Evaluates attribute conditions based on operator
   */
  private evaluateAttributeCondition(
    userValue: any, 
    operator: string, 
    expectedValue: string
  ): boolean {
    const userStr = String(userValue).toLowerCase();
    const expectedStr = expectedValue.toLowerCase();
    
    switch (operator) {
      case 'equals':
        return userStr === expectedStr;
        
      case 'not_equals':
        return userStr !== expectedStr;
        
      case 'in':
        const inValues = expectedStr.split(',').map(v => v.trim());
        return inValues.includes(userStr);
        
      case 'not_in':
        const notInValues = expectedStr.split(',').map(v => v.trim());
        return !notInValues.includes(userStr);
        
      case 'contains':
        return userStr.includes(expectedStr);
        
      case 'starts_with':
        return userStr.startsWith(expectedStr);
        
      case 'ends_with':
        return userStr.endsWith(expectedStr);
        
      case 'greater_than':
        const userNum = parseFloat(userStr);
        const expectedNum = parseFloat(expectedStr);
        return !isNaN(userNum) && !isNaN(expectedNum) && userNum > expectedNum;
        
      case 'less_than':
        const userNumLt = parseFloat(userStr);
        const expectedNumLt = parseFloat(expectedStr);
        return !isNaN(userNumLt) && !isNaN(expectedNumLt) && userNumLt < expectedNumLt;
        
      default:
        logger.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }
  
  /**
   * Selects a variant based on weights
   */
  private selectVariantByWeight(variants: FlagVariant[]): FlagVariant {
    if (variants.length === 0) {
      // Return default boolean variant
      return {
        id: 'default',
        flag_id: '',
        key: 'true',
        value: 'true',
        weight: 100,
        created_at: new Date()
      };
    }
    
    if (variants.length === 1) {
      return variants[0];
    }
    
    const totalWeight = variants.reduce((sum, variant) => sum + variant.weight, 0);
    
    if (totalWeight === 0) {
      return variants[0];
    }
    
    // Generate random number based on total weight
    const random = Math.random() * totalWeight;
    
    let cumulativeWeight = 0;
    for (const variant of variants) {
      cumulativeWeight += variant.weight;
      if (random <= cumulativeWeight) {
        return variant;
      }
    }
    
    // Fallback to first variant
    return variants[0];
  }
  
  /**
   * Generates a consistent hash for user and flag combination
   * This ensures the same user gets the same treatment for a flag
   */
  private generateUserHash(userId: string, flagIdentifier: string): number {
    const combined = `${userId}:${flagIdentifier}`;
    const hash = crypto.createHash('md5').update(combined).digest('hex');
    
    // Convert first 8 characters of hex to integer
    const hexSubstring = hash.substring(0, 8);
    return parseInt(hexSubstring, 16);
  }
  
  /**
   * Validates evaluation context
   */
  validateContext(context: EvaluationContext): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!context.flag_config) {
      errors.push('Missing flag configuration');
    }
    
    if (!context.user_context) {
      errors.push('Missing user context');
    }
    
    if (!Array.isArray(context.rules)) {
      errors.push('Rules must be an array');
    }
    
    if (!Array.isArray(context.variants)) {
      errors.push('Variants must be an array');
    }
    
    if (!context.environment) {
      errors.push('Missing environment');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Gets evaluation statistics for debugging
   */
  getEvaluationStats(context: EvaluationContext): {
    total_rules: number;
    enabled_rules: number;
    percentage_rollout: number;
    variants_count: number;
  } {
    return {
      total_rules: context.rules.length,
      enabled_rules: context.rules.filter(r => 
        r.rule_type !== 'percentage' || (r.percentage && r.percentage > 0)
      ).length,
      percentage_rollout: context.flag_config.rollout_percentage,
      variants_count: context.variants.length
    };
  }
}