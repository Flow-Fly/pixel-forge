import { createDatabaseAdapter } from '../database/adapter.js';
import { requireSafeDatabaseTarget } from '../database/config.js';
import { migrateDatabase } from '../database/migrate.js';
import { consoleServerLogger, errorMessage } from '../logger.js';

const COMPATIBILITY_META_KEY = 'database_compatibility:last_checked';

async function main(): Promise<void> {
  let config;
  try {
    config = requireSafeDatabaseTarget(process.env);
  } catch (error) {
    consoleServerLogger.error('database.compatibility_failed', {
      message: errorMessage(error),
      stage: 'configuration',
    });
    process.exitCode = 1;
    return;
  }

  try {
    await migrateDatabase(config);
  } catch {
    consoleServerLogger.error('database.compatibility_failed', {
      message: 'Database compatibility migration failed',
      stage: 'migration',
    });
    process.exitCode = 1;
    return;
  }

  const database = createDatabaseAdapter(config);
  try {
    await database.checkReadiness();
    const checkedAt = new Date().toISOString();
    await database.transaction(async (transaction) => {
      await transaction.setAppMeta(COMPATIBILITY_META_KEY, checkedAt);
      const record = await transaction.getAppMeta(COMPATIBILITY_META_KEY);
      if (record?.value !== checkedAt) {
        throw new Error('Compatibility transaction did not persist its metadata');
      }
    });
    await database.close();
    consoleServerLogger.info('database.compatibility_complete', {
      status: 'complete',
    });
  } catch {
    await database.close().catch(() => undefined);
    consoleServerLogger.error('database.compatibility_failed', {
      message: 'Database compatibility query failed',
      stage: 'query',
    });
    process.exitCode = 1;
  }
}

void main();
