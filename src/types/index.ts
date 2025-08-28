// Interface 
export interface Environment {
  id: string;
  name: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description?: string;
  flag_type: 'boolean' | 'string' | 'number' | 'json';
  is_active: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface FlagConfig {
  id: string;
  flag_id: string;
  environment_id: string;
  is_enabled: boolean;
  default_variant: string;
  rollout_percentage: number;
  config_data: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface FlagVariant {
  id: string;
  flag_id: string;
  key: string;
  value: string;
  description?: string;
  weight: number;
  created_at: Date;
}

export interface RolloutRule {
  id: string;
  flag_config_id: string;
  rule_type: 'percentage' | 'attribute' | 'user_id' | 'segment';
  attribute_name?: string;
  operator?: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than';
  attribute_value?: string;
  percentage?: number;
  variant_key?: string;
  priority: number;
  created_at: Date;
}

export interface UserSegment {
  id: string;
  name: string;
  description?: string;
  conditions: any[];
  created_at: Date;
  updated_at: Date;
}

export interface AuditLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: 'created' | 'updated' | 'deleted' | 'toggled';
  changes?: Record<string, any>;
  user_id?: string;
  user_email?: string;
  ip_address?: string;
  created_at: Date;
}

export interface FlagEvaluation {
  id: string;
  flag_key: string;
  environment_name: string;
  user_id?: string;
  variant_key?: string;
  evaluation_result: boolean;
  user_attributes: Record<string, any>;
  evaluated_at: Date;
  sdk_version?: string;
  ip_address?: string;
}

// SDK Types
export interface UserContext {
  user_id?: string;
  attributes?: Record<string, any>;
  custom_attributes?: Record<string, any>;
}

export interface EvaluationRequest {
  flag_key: string;
  user_context: UserContext;
  environment?: string;
  default_value?: any;
}

export interface EvaluationResponse {
  flag_key: string;
  value: any;
  variant_key?: string;
  reason: string;
  timestamp: Date;
}

export interface SDKConfig {
  api_key: string;
  base_url: string;
  environment: string;
  poll_interval: number;
  timeout: number;
  enable_analytics: boolean;
}

// API Request/Response Types
export interface CreateFlagRequest {
  key: string;
  name: string;
  description?: string;
  flag_type?: 'boolean' | 'string' | 'number' | 'json';
  variants?: Array<{
    key: string;
    value: string;
    description?: string;
    weight?: number;
  }>;
}

export interface UpdateFlagConfigRequest {
  is_enabled?: boolean;
  default_variant?: string;
  rollout_percentage?: number;
  config_data?: Record<string, any>;
  rules?: Array<{
    rule_type: string;
    attribute_name?: string;
    operator?: string;
    attribute_value?: string;
    percentage?: number;
    variant_key?: string;
    priority?: number;
  }>;
}

export interface FlagListResponse {
  flags: Array<FeatureFlag & {
    configs?: FlagConfig[];
    variants?: FlagVariant[];
  }>;
  total: number;
  page: number;
  per_page: number;
}

// Configuration Types
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  max_connections?: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  prefix?: string;
}

export interface ServerConfig {
  control_plane_port: number;
  evaluation_service_port: number;
  metrics_port: number;
  cors_enabled: boolean;
  request_logging: boolean;
}

// Rule Engine Types
export interface EvaluationContext {
  user_context: UserContext;
  flag_config: FlagConfig;
  rules: RolloutRule[];
  variants: FlagVariant[];
  environment: string;
}

export interface RuleEvaluationResult {
  matched: boolean;
  variant_key?: string;
  reason: string;
  rule_id?: string;
}

// Metrics Types
export interface MetricLabels {
  flag_key?: string;
  environment?: string;
  variant?: string;
  result?: string;
  [key: string]: string | undefined;
}

export interface PerformanceMetrics {
  evaluation_duration_ms: number;
  cache_hit: boolean;
  rule_evaluations: number;
  timestamp: Date;
}