import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { createDatabaseConnection, createRedisConnection } from '../database/connection';
import { FlagRepository } from '../database/repositories/flag-repository';
import { getDatabaseConfig, getRedisConfig } from '../utils/config';
import { CreateFlagRequest } from '../types';

const program = new Command();
let flagRepository: FlagRepository;

// Initialize connections
const initializeConnections = async () => {
  try {
    createDatabaseConnection(getDatabaseConfig());
    createRedisConnection(getRedisConfig());
    
  
    flagRepository = new FlagRepository();  
    flagRepository.initialize();  
    
    console.log(chalk.green('✓ Connected to database and Redis'));
  } catch (error) {
    console.error(chalk.red('✗ Failed to connect to services:'), String(error));
    process.exit(1);
  }
};

// List all flags
const listFlags = async () => {
  try {
    const { flags, total } = await flagRepository.listFlags(1, 50);
    
    console.log(chalk.blue(`\n📋 Feature Flags (${total} total):`));
    console.log('─'.repeat(80));
    
    flags.forEach(flag => {
      const status = flag.is_active ? chalk.green('ACTIVE') : chalk.red('INACTIVE');
      console.log(`${chalk.bold(flag.key)} - ${flag.name} [${status}]`);
      if (flag.description) {
        console.log(`   ${chalk.gray(flag.description)}`);
      }
      console.log(`   Created: ${flag.created_at.toISOString().split('T')[0]} by ${flag.created_by || 'unknown'}`);
      console.log();
    });
  } catch (error) {
    console.error(chalk.red('Error listing flags:'), String(error));
  }
};

// Create a new flag
const createFlag = async () => {
  try {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'key',
        message: 'Flag key (unique identifier):',
        validate: (input) => {
          if (!input) return 'Flag key is required';
          if (!/^[a-z0-9_]+$/.test(input)) return 'Flag key can only contain lowercase letters, numbers, and underscores';
          return true;
        }
      },
      {
        type: 'input',
        name: 'name',
        message: 'Flag name (display name):',
        validate: (input) => input ? true : 'Flag name is required'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description (optional):'
      },
      {
        type: 'list',
        name: 'flag_type',
        message: 'Flag type:',
        choices: ['boolean', 'string', 'number', 'json'],
        default: 'boolean'
      }
    ]);

    const request: CreateFlagRequest = {
      key: answers.key,
      name: answers.name,
      description: answers.description || undefined,
      flag_type: answers.flag_type
    };

    const flag = await flagRepository.createFlag(request, 'cli-user');
    console.log(chalk.green(`✓ Created flag: ${flag.key}`));
    
    // Ask about initial configuration
    const configAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configure',
        message: 'Would you like to configure this flag for an environment?',
        default: true
      }
    ]);

    if (configAnswer.configure) {
      await configureFlag(flag.key);
    }

  } catch (error) {
    console.error(chalk.red('Error creating flag:'), String(error));
  }
};

// Configure a flag
const configureFlag = async (flagKey?: string) => {
  try {
    if (!flagKey) {
      const { flags } = await flagRepository.listFlags(1, 50);
      
      if (flags.length === 0) {
        console.log(chalk.yellow('No flags available to configure'));
        return;
      }

      const flagAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'flagKey',
          message: 'Select a flag to configure:',
          choices: flags.map(f => ({ name: `${f.key} - ${f.name}`, value: f.key }))
        }
      ]);
      
      flagKey = flagAnswer.flagKey;
    }

    const configAnswers = await inquirer.prompt([
      {
        type: 'list',
        name: 'environment',
        message: 'Select environment:',
        choices: ['development', 'staging', 'production']
      },
      {
        type: 'confirm',
        name: 'is_enabled',
        message: 'Enable this flag?',
        default: false
      },
      {
        type: 'number',
        name: 'rollout_percentage',
        message: 'Rollout percentage (0-100):',
        default: 0,
        validate: (input: any) => {
          const num = parseInt(String(input));
          return (num >= 0 && num <= 100) ? true : 'Percentage must be between 0 and 100';
        }
      }
    ]);

    await flagRepository.updateFlagConfig(
      flagKey!,
      configAnswers.environment,
      {
        is_enabled: configAnswers.is_enabled,
        rollout_percentage: configAnswers.rollout_percentage
      },
      'cli-user'
    );

    console.log(chalk.green(`✓ Updated ${flagKey} in ${configAnswers.environment}`));

  } catch (error) {
    console.error(chalk.red('Error configuring flag:'), String(error));
  }
};

// Toggle a flag
const toggleFlag = async () => {
  try {
    const { flags } = await flagRepository.listFlags(1, 50);
    
    if (flags.length === 0) {
      console.log(chalk.yellow('No flags available to toggle'));
      return;
    }

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'flagKey',
        message: 'Select a flag to toggle:',
        choices: flags.map(f => ({ name: `${f.key} - ${f.name}`, value: f.key }))
      },
      {
        type: 'list',
        name: 'environment',
        message: 'Select environment:',
        choices: ['development', 'staging', 'production']
      },
      {
        type: 'confirm',
        name: 'enabled',
        message: 'Enable or disable this flag?'
      }
    ]);

    await flagRepository.toggleFlag(
      answers.flagKey,
      answers.environment,
      answers.enabled,
      'cli-user'
    );

    const status = answers.enabled ? 'enabled' : 'disabled';
    console.log(chalk.green(`✓ Flag ${answers.flagKey} ${status} in ${answers.environment}`));

  } catch (error) {
    console.error(chalk.red('Error toggling flag:'), String(error));
  }
};

// Test flag evaluation
const testEvaluation = async () => {
  try {
    const { flags } = await flagRepository.listFlags(1, 50);
    
    if (flags.length === 0) {
      console.log(chalk.yellow('No flags available to test'));
      return;
    }

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'flagKey',
        message: 'Select a flag to test:',
        choices: flags.map(f => ({ name: `${f.key} - ${f.name}`, value: f.key }))
      },
      {
        type: 'list',
        name: 'environment',
        message: 'Select environment:',
        choices: ['development', 'staging', 'production']
      },
      {
        type: 'input',
        name: 'userId',
        message: 'User ID for testing:',
        default: 'test-user-' + Math.random().toString(36).substr(2, 9)
      }
    ]);

    // Make HTTP request to evaluation service
    const response = await fetch('http://localhost:8081/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        flag_key: answers.flagKey,
        user_context: {
          user_id: answers.userId,
          attributes: {
            test: true
          }
        },
        environment: answers.environment,
        default_value: false
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json() as any;
    
    console.log(chalk.blue('\n🧪 Evaluation Result:'));
    console.log('─'.repeat(40));
    console.log(`Flag: ${chalk.bold(result.flag_key)}`);
    console.log(`Value: ${chalk.bold(result.value)}`);
    console.log(`Variant: ${result.variant_key}`);
    console.log(`Reason: ${result.reason}`);
    console.log(`Timestamp: ${result.timestamp}`);

  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.error(chalk.red('✗ Evaluation service is not running'));
      console.log(chalk.yellow('  Start it with: npm run dev:eval'));
    } else {
      console.error(chalk.red('Error testing evaluation:'), String(error));
    }
  }
};

// Interactive menu
const showMenu = async () => {
  const choices = [
    { name: '📋 List all flags', value: 'list' },
    { name: '➕ Create new flag', value: 'create' },
    { name: '⚙️  Configure flag', value: 'configure' },
    { name: '🔄 Toggle flag', value: 'toggle' },
    { name: '🧪 Test evaluation', value: 'test' },
    { name: '❌ Exit', value: 'exit' }
  ];

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices
    }
  ]);

  switch (answer.action) {
    case 'list':
      await listFlags();
      break;
    case 'create':
      await createFlag();
      break;
    case 'configure':
      await configureFlag();
      break;
    case 'toggle':
      await toggleFlag();
      break;
    case 'test':
      await testEvaluation();
      break;
    case 'exit':
      console.log(chalk.blue('👋 Goodbye!'));
      process.exit(0);
  }

  // Show menu again
  console.log();
  await showMenu();
};

// Main CLI setup
program
  .name('canary-cli')
  .description('Canary Feature Flag System CLI')
  .version('1.0.0');

program
  .command('list')
  .description('List all feature flags')
  .action(async () => {
    await initializeConnections();
    await listFlags();
    process.exit(0);
  });

program
  .command('create')
  .description('Create a new feature flag')
  .action(async () => {
    await initializeConnections();
    await createFlag();
    process.exit(0);
  });

program
  .command('interactive')
  .description('Start interactive mode')
  .action(async () => {
    await initializeConnections();
    console.log(chalk.blue.bold('🐦 Canary Feature Flag System CLI'));
    console.log(chalk.gray('Interactive mode - manage your feature flags\n'));
    await showMenu();
  });

// Default to interactive mode if no command specified
if (process.argv.length === 2) {
  program.parse(['node', 'cli', 'interactive']);
} else {
  program.parse();
}