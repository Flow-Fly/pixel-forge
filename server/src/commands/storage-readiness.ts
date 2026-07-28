import { consoleServerLogger, errorMessage } from '../logger.js';
import { parseStorageConfig } from '../storage/config.js';
import { createS3BlobStorage } from '../storage/s3-adapter.js';

async function main(): Promise<void> {
  let config;
  try {
    config = parseStorageConfig(process.env);
  } catch (error) {
    consoleServerLogger.error('storage.not_ready', {
      message: errorMessage(error),
      stage: 'configuration',
    });
    process.exitCode = 1;
    return;
  }

  const storage = createS3BlobStorage(config);
  try {
    await storage.checkReadiness();
    consoleServerLogger.info('storage.ready', { status: 'ready' });
  } catch {
    consoleServerLogger.error('storage.not_ready', {
      message: 'Storage readiness check failed',
      stage: 'query',
    });
    process.exitCode = 1;
  } finally {
    storage.close();
  }
}

void main();
