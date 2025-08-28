import { createDatabaseConnection, closeDatabaseConnections } from './connection';
import { getDatabaseConfig } from '../utils/config';
import logger from '../utils/logger';

const seedDatabase = async (): Promise<void> => {
  let pool;
  
  try {
    logger.info('Starting database seeding...');
    
    // Initialize database connection
    const dbConfig = getDatabaseConfig();
    pool = createDatabaseConnection(dbConfig);

    // Create sample feature flags
    const sampleFlags = [
      {
        key: 'new_checkout_flow',
        name: 'New Checkout Flow',
        description: 'Enable the redesigned checkout process',
        flag_type: 'boolean'
      },
      {
        key: 'premium_features',
        name: 'Premium Features',
        description: 'Enable premium tier functionality',
        flag_type: 'boolean'
      },
      {
        key: 'dark_mode',
        name: 'Dark Mode Theme',
        description: 'Enable dark mode UI theme',
        flag_type: 'boolean'
      },
      {
        key: 'recommendation_algorithm',
        name: 'ML Recommendation Algorithm',
        description: 'Choose between recommendation algorithms',
        flag_type: 'string'
      }
    ];

    // Insert sample flags
    for (const flag of sampleFlags) {
      const result = await pool.query(`
        INSERT INTO feature_flags (key, name, description, flag_type, created_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (key) DO NOTHING
        RETURNING id
      `, [flag.key, flag.name, flag.description, flag.flag_type, 'seeder']);
      
      if (result.rows.length > 0) {
        const flagId = result.rows[0].id;
        
        // Get environment IDs
        const envResult = await pool.query('SELECT id, name FROM environments');
        
        for (const env of envResult.rows) {
          // Create flag config for each environment
          let rolloutPercentage = 0;
          let isEnabled = false;
          
          // Different settings per environment
          if (env.name === 'development') {
            rolloutPercentage = 100;
            isEnabled = true;
          } else if (env.name === 'staging') {
            rolloutPercentage = 50;
            isEnabled = true;
          } else if (env.name === 'production') {
            rolloutPercentage = flag.key === 'dark_mode' ? 10 : 0;
            isEnabled = flag.key === 'dark_mode';
          }
          
          await pool.query(`
            INSERT INTO flag_configs (flag_id, environment_id, is_enabled, default_variant, rollout_percentage)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (flag_id, environment_id) DO NOTHING
          `, [flagId, env.id, isEnabled, 'false', rolloutPercentage]);
          
          // Add variants for string flags
          if (flag.flag_type === 'string' && flag.key === 'recommendation_algorithm') {
            const variants = [
              { key: 'collaborative', value: 'collaborative_filtering', weight: 50 },
              { key: 'content_based', value: 'content_based_filtering', weight: 30 },
              { key: 'hybrid', value: 'hybrid_approach', weight: 20 }
            ];
            
            for (const variant of variants) {
              await pool.query(`
                INSERT INTO flag_variants (flag_id, key, value, weight)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (flag_id, key) DO NOTHING
              `, [flagId, variant.key, variant.value, variant.weight]);
            }
          } else {
            // Standard boolean variants
            await pool.query(`
              INSERT INTO flag_variants (flag_id, key, value, weight)
              VALUES ($1, $2, $3, $4), ($1, $5, $6, $7)
              ON CONFLICT (flag_id, key) DO NOTHING
            `, [flagId, 'true', 'true', 50, 'false', 'false', 50]);
          }
        }
        
        logger.info(`Created flag: ${flag.key}`);
      }
    }

    // Create sample user segments
    const sampleSegments = [
      {
        name: 'beta_users',
        description: 'Users enrolled in beta program',
        conditions: [
          { attribute: 'user_type', operator: 'equals', value: 'beta' }
        ]
      },
      {
        name: 'premium_users',
        description: 'Users with premium subscription',
        conditions: [
          { attribute: 'subscription_tier', operator: 'equals', value: 'premium' }
        ]
      },
      {
        name: 'mobile_users',
        description: 'Users accessing via mobile app',
        conditions: [
          { attribute: 'platform', operator: 'equals', value: 'mobile' }
        ]
      }
    ];

    for (const segment of sampleSegments) {
      await pool.query(`
        INSERT INTO user_segments (name, description, conditions)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO NOTHING
      `, [segment.name, segment.description, JSON.stringify(segment.conditions)]);
      
      logger.info(`Created segment: ${segment.name}`);
    }

    logger.info('Database seeding completed successfully');
    
  } catch (error) {
    logger.error('Database seeding failed:', error);
    throw error;
  } finally {
    if (pool) {
      await closeDatabaseConnections();
    }
  }
};

// Run seeding if called directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Seed script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seed script failed:', error);
      process.exit(1);
    });
}

export { seedDatabase };