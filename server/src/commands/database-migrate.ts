import { requireSafeDatabaseTarget } from '../database/config.js';
import { migrateDatabase } from '../database/migrate.js';
import { consoleServerLogger, errorMessage } from '../logger.js';

async function main(): Promise<void> {
  let config;
  try {
    config = requireSafeDatabaseTarget(process.env);
  } catch (error) {
    consoleServerLogger.error('database.migration_failed', {
      message: errorMessage(error),
      stage: 'configuration',
    });
    process.exitCode = 1;
    return;
  }

  try {
    await migrateDatabase(config);
    consoleServerLogger.info('database.migration_complete', {
      status: 'complete',
    });
  } catch {
    consoleServerLogger.error('database.migration_failed', {
      message: 'Database migration failed',
      stage: 'migration',
    });
    process.exitCode = 1;
  }
}

void main();
