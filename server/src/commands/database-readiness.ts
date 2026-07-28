import { createDatabaseAdapter } from '../database/adapter.js';
import type { DatabaseAdapter } from '../database/adapter.js';
import { parseDatabaseConfig } from '../database/config.js';
import { consoleServerLogger, errorMessage } from '../logger.js';

async function main(): Promise<void> {
  let config;
  try {
    config = parseDatabaseConfig(process.env);
  } catch (error) {
    consoleServerLogger.error('database.not_ready', {
      message: errorMessage(error),
      stage: 'configuration',
    });
    process.exitCode = 1;
    return;
  }

  let database: DatabaseAdapter | undefined;
  try {
    database = createDatabaseAdapter(config);
    await database.checkReadiness();
    await database.close();
    consoleServerLogger.info('database.ready', {
      status: 'ready',
    });
  } catch {
    await database?.close().catch(() => undefined);
    consoleServerLogger.error('database.not_ready', {
      message: 'Database readiness check failed',
      stage: 'query',
    });
    process.exitCode = 1;
  }
}

void main();
