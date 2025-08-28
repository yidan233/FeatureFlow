-- Canary Feature Flag System Database Schema

-- Environments (dev, staging, prod)
CREATE TABLE environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Feature Flags
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  flag_type VARCHAR(20) DEFAULT 'boolean' CHECK (flag_type IN ('boolean', 'string', 'number', 'json')),
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Flag Configurations per Environment
CREATE TABLE flag_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id UUID REFERENCES feature_flags(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES environments(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT false,
  default_variant VARCHAR(100) DEFAULT 'false',
  rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  config_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(flag_id, environment_id)
);

-- Flag Variants (for A/B testing)
CREATE TABLE flag_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id UUID REFERENCES feature_flags(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  weight INTEGER DEFAULT 50 CHECK (weight >= 0 AND weight <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(flag_id, key)
);

-- Rollout Rules
CREATE TABLE rollout_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_config_id UUID REFERENCES flag_configs(id) ON DELETE CASCADE,
  rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('percentage', 'attribute', 'user_id', 'segment')),
  attribute_name VARCHAR(100),
  operator VARCHAR(20) CHECK (operator IN ('equals', 'not_equals', 'in', 'not_in', 'contains', 'starts_with', 'ends_with', 'greater_than', 'less_than')),
  attribute_value TEXT,
  percentage INTEGER CHECK (percentage >= 0 AND percentage <= 100),
  variant_key VARCHAR(100),
  priority INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User Segments
CREATE TABLE user_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  conditions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'toggled')),
  changes JSONB,
  user_id VARCHAR(100),
  user_email VARCHAR(200),
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Flag Evaluation Metrics (for analytics)
CREATE TABLE flag_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key VARCHAR(100) NOT NULL,
  environment_name VARCHAR(50) NOT NULL,
  user_id VARCHAR(100),
  variant_key VARCHAR(100),
  evaluation_result BOOLEAN,
  user_attributes JSONB DEFAULT '{}',
  evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  sdk_version VARCHAR(20),
  ip_address INET
);

-- Indexes for performance
CREATE INDEX idx_feature_flags_key ON feature_flags(key);
CREATE INDEX idx_feature_flags_active ON feature_flags(is_active);
CREATE INDEX idx_flag_configs_flag_env ON flag_configs(flag_id, environment_id);
CREATE INDEX idx_flag_configs_enabled ON flag_configs(is_enabled);
CREATE INDEX idx_rollout_rules_flag_config ON rollout_rules(flag_config_id);
CREATE INDEX idx_rollout_rules_priority ON rollout_rules(priority);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_flag_evaluations_flag_env ON flag_evaluations(flag_key, environment_name);
CREATE INDEX idx_flag_evaluations_time ON flag_evaluations(evaluated_at);
CREATE INDEX idx_flag_evaluations_user ON flag_evaluations(user_id);

-- Insert default environment
INSERT INTO environments (name, description) VALUES 
  ('development', 'Development environment'),
  ('staging', 'Staging environment'),
  ('production', 'Production environment');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON feature_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_flag_configs_updated_at BEFORE UPDATE ON flag_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_environments_updated_at BEFORE UPDATE ON environments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_segments_updated_at BEFORE UPDATE ON user_segments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();