import { Pool } from 'pg';
import { 
  FeatureFlag, 
  FlagConfig, 
  FlagVariant, 
  RolloutRule, 
  CreateFlagRequest,
  UpdateFlagConfigRequest 
} from '../../types';
import { getDatabase } from '../connection';
import logger from '../../utils/logger';

export class FlagRepository {
  private pool: Pool;

  constructor() {
    // Don't initialize here - let the caller handle it
    this.pool = null as any;
  }
  
  // Initialize method to be called after database connection is ready
  initialize(): void {
    try {
      this.pool = getDatabase();
      console.log('✅ FlagRepository: Database connection initialized');
    } catch (error) {
      console.error('❌ FlagRepository: Failed to initialize database connection:', error);
      throw error;
    }
  }

  async createFlag(request: CreateFlagRequest, createdBy: string): Promise<FeatureFlag> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create the feature flag
      const flagResult = await client.query(`
        INSERT INTO feature_flags (key, name, description, flag_type, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        request.key, 
        request.name, 
        request.description || null,
        request.flag_type || 'boolean',
        createdBy
      ]);
      
      const flag = flagResult.rows[0];
      
      // Create variants if provided
      if (request.variants && request.variants.length > 0) {
        for (const variant of request.variants) {
          await client.query(`
            INSERT INTO flag_variants (flag_id, key, value, description, weight)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            flag.id,
            variant.key,
            variant.value,
            variant.description || null,
            variant.weight || 50
          ]);
        }
      } else {
        // Create default boolean variants
        await client.query(`
          INSERT INTO flag_variants (flag_id, key, value, weight)
          VALUES ($1, 'true', 'true', 50), ($1, 'false', 'false', 50)
        `, [flag.id]);
      }
      
      // Create flag configs for all environments
      const envResult = await client.query('SELECT id FROM environments');
      for (const env of envResult.rows) {
        await client.query(`
          INSERT INTO flag_configs (flag_id, environment_id, is_enabled, default_variant, rollout_percentage)
          VALUES ($1, $2, false, 'false', 0)
        `, [flag.id, env.id]);
      }
      
      await client.query('COMMIT');
      logger.info(`Created flag: ${flag.key}`);
      
      return flag;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getFlag(key: string): Promise<FeatureFlag | null> {
    const result = await this.pool.query(
      'SELECT * FROM feature_flags WHERE key = $1 AND is_active = true',
      [key]
    );
    
    return result.rows[0] || null;
  }

  async getFlagById(id: string): Promise<FeatureFlag | null> {
    const result = await this.pool.query(
      'SELECT * FROM feature_flags WHERE id = $1',
      [id]
    );
    
    return result.rows[0] || null;
  }

  async listFlags(page = 1, perPage = 50, activeOnly = true): Promise<{
    flags: FeatureFlag[];
    total: number;
  }> {
    const offset = (page - 1) * perPage;
    const activeFilter = activeOnly ? 'WHERE is_active = true' : '';
    
    const [flagsResult, countResult] = await Promise.all([
      this.pool.query(`
        SELECT * FROM feature_flags 
        ${activeFilter}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, [perPage, offset]),
      
      this.pool.query(`
        SELECT COUNT(*) as total FROM feature_flags ${activeFilter}
      `)
    ]);
    
    return {
      flags: flagsResult.rows,
      total: parseInt(countResult.rows[0].total)
    };
  }

  async getFlagConfig(flagKey: string, environment: string): Promise<{
    flag: FeatureFlag;
    config: FlagConfig;
    variants: FlagVariant[];
    rules: RolloutRule[];
  } | null> {
    const result = await this.pool.query(`
      SELECT 
        f.*,
        fc.*,
        e.name as environment_name,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', fv.id,
              'key', fv.key,
              'value', fv.value,
              'description', fv.description,
              'weight', fv.weight
            )
          ) FILTER (WHERE fv.id IS NOT NULL), 
          '[]'
        ) as variants,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', rr.id,
              'rule_type', rr.rule_type,
              'attribute_name', rr.attribute_name,
              'operator', rr.operator,
              'attribute_value', rr.attribute_value,
              'percentage', rr.percentage,
              'variant_key', rr.variant_key,
              'priority', rr.priority
            )
          ) FILTER (WHERE rr.id IS NOT NULL),
          '[]'
        ) as rules
      FROM feature_flags f
      JOIN flag_configs fc ON f.id = fc.flag_id
      JOIN environments e ON fc.environment_id = e.id
      LEFT JOIN flag_variants fv ON f.id = fv.flag_id
      LEFT JOIN rollout_rules rr ON fc.id = rr.flag_config_id
      WHERE f.key = $1 AND e.name = $2 AND f.is_active = true
      GROUP BY f.id, fc.id, e.name
    `, [flagKey, environment]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    
    return {
      flag: {
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description,
        flag_type: row.flag_type,
        is_active: row.is_active,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at
      },
      config: {
        id: row.id,
        flag_id: row.flag_id,
        environment_id: row.environment_id,
        is_enabled: row.is_enabled,
        default_variant: row.default_variant,
        rollout_percentage: row.rollout_percentage,
        config_data: row.config_data,
        created_at: row.created_at,
        updated_at: row.updated_at
      },
      variants: row.variants || [],
      rules: row.rules || []
    };
  }

  async updateFlagConfig(
    flagKey: string, 
    environment: string, 
    update: UpdateFlagConfigRequest,
    updatedBy: string
  ): Promise<FlagConfig> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get flag and config IDs
      const flagResult = await client.query(`
        SELECT f.id as flag_id, fc.id as config_id
        FROM feature_flags f
        JOIN flag_configs fc ON f.id = fc.flag_id
        JOIN environments e ON fc.environment_id = e.id
        WHERE f.key = $1 AND e.name = $2
      `, [flagKey, environment]);
      
      if (flagResult.rows.length === 0) {
        throw new Error(`Flag config not found: ${flagKey} in ${environment}`);
      }
      
      const { config_id: configId } = flagResult.rows[0];
      
      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;
      
      if (update.is_enabled !== undefined) {
        updateFields.push(`is_enabled = $${paramIndex++}`);
        updateValues.push(update.is_enabled);
      }
      
      if (update.default_variant !== undefined) {
        updateFields.push(`default_variant = $${paramIndex++}`);
        updateValues.push(update.default_variant);
      }
      
      if (update.rollout_percentage !== undefined) {
        updateFields.push(`rollout_percentage = $${paramIndex++}`);
        updateValues.push(update.rollout_percentage);
      }
      
      if (update.config_data !== undefined) {
        updateFields.push(`config_data = $${paramIndex++}`);
        updateValues.push(JSON.stringify(update.config_data));
      }
      
      if (updateFields.length > 0) {
        updateValues.push(configId);
        
        const updateResult = await client.query(`
          UPDATE flag_configs 
          SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $${paramIndex}
          RETURNING *
        `, updateValues);
        
        // Update rollout rules if provided
        if (update.rules) {
          // Delete existing rules
          await client.query('DELETE FROM rollout_rules WHERE flag_config_id = $1', [configId]);
          
          // Insert new rules
          for (const rule of update.rules) {
            await client.query(`
              INSERT INTO rollout_rules (
                flag_config_id, rule_type, attribute_name, operator, 
                attribute_value, percentage, variant_key, priority
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
              configId,
              rule.rule_type,
              rule.attribute_name || null,
              rule.operator || null,
              rule.attribute_value || null,
              rule.percentage || null,
              rule.variant_key || null,
              rule.priority || 100
            ]);
          }
        }
        
        await client.query('COMMIT');
        
        logger.info(`Updated flag config: ${flagKey} in ${environment}`, {
          flagKey,
          environment,
          updatedBy,
          changes: update
        });
        
        return updateResult.rows[0];
      }
      
      throw new Error('No fields to update');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async toggleFlag(flagKey: string, environment: string, enabled: boolean, updatedBy: string): Promise<void> {
    await this.updateFlagConfig(flagKey, environment, { is_enabled: enabled }, updatedBy);
    
    logger.info(`Toggled flag: ${flagKey} to ${enabled} in ${environment}`, {
      flagKey,
      environment,
      enabled,
      updatedBy
    });
  }

  async deleteFlag(flagKey: string, deletedBy: string): Promise<void> {
    const result = await this.pool.query(`
      UPDATE feature_flags 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE key = $1
      RETURNING *
    `, [flagKey]);
    
    if (result.rows.length === 0) {
      throw new Error(`Flag not found: ${flagKey}`);
    }
    
    logger.info(`Deleted flag: ${flagKey}`, {
      flagKey,
      deletedBy
    });
  }

  async getAllActiveFlags(): Promise<Array<{
    flag: FeatureFlag;
    configs: Array<FlagConfig & { environment_name: string }>;
    variants: FlagVariant[];
  }>> {
    const result = await this.pool.query(`
      SELECT 
        f.*,
        json_agg(
          DISTINCT jsonb_build_object(
            'id', fc.id,
            'flag_id', fc.flag_id,
            'environment_id', fc.environment_id,
            'environment_name', e.name,
            'is_enabled', fc.is_enabled,
            'default_variant', fc.default_variant,
            'rollout_percentage', fc.rollout_percentage,
            'config_data', fc.config_data,
            'created_at', fc.created_at,
            'updated_at', fc.updated_at
          )
        ) as configs,
        json_agg(
          DISTINCT jsonb_build_object(
            'id', fv.id,
            'key', fv.key,
            'value', fv.value,
            'description', fv.description,
            'weight', fv.weight
          )
        ) FILTER (WHERE fv.id IS NOT NULL) as variants
      FROM feature_flags f
      LEFT JOIN flag_configs fc ON f.id = fc.flag_id
      LEFT JOIN environments e ON fc.environment_id = e.id
      LEFT JOIN flag_variants fv ON f.id = fv.flag_id
      WHERE f.is_active = true
      GROUP BY f.id
      ORDER BY f.created_at DESC
    `);
    
    return result.rows.map(row => ({
      flag: {
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description,
        flag_type: row.flag_type,
        is_active: row.is_active,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at
      },
      configs: row.configs || [],
      variants: row.variants || []
    }));
  }
}