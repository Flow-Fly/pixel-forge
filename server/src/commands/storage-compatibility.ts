import { randomBytes, randomUUID } from 'node:crypto';
import { consoleServerLogger, errorMessage } from '../logger.js';
import type { BlobStorage } from '../storage/blob-storage.js';
import { requireSafeLocalStorageTarget } from '../storage/config.js';
import { createS3BlobStorage } from '../storage/s3-adapter.js';

const COMPATIBILITY_PREFIX = 'storage-compatibility';

async function cleanupOwnedKey(storage: BlobStorage, key: string): Promise<boolean> {
  try {
    await storage.delete(key);
    return true;
  } catch {
    consoleServerLogger.error('storage.compatibility_failed', {
      message: 'Storage compatibility cleanup failed',
      stage: 'cleanup',
    });
    return false;
  }
}

async function main(): Promise<void> {
  let config;
  try {
    config = requireSafeLocalStorageTarget(process.env);
  } catch (error) {
    consoleServerLogger.error('storage.compatibility_failed', {
      message: errorMessage(error),
      stage: 'configuration',
    });
    process.exitCode = 1;
    return;
  }

  const storage = createS3BlobStorage(config);
  const key = `${COMPATIBILITY_PREFIX}/${randomUUID()}/probe.bin`;
  try {
    await storage.checkReadiness();
    const expected = randomBytes(257);
    await storage.put(key, expected);
    const actual = await storage.get(key);
    if (!actual || !Buffer.from(actual).equals(expected)) {
      throw new Error('Storage did not preserve the probe bytes');
    }

    await storage.delete(key);
    if (await storage.get(key)) {
      throw new Error('Storage did not remove the probe object');
    }
  } catch {
    consoleServerLogger.error('storage.compatibility_failed', {
      message: 'Storage compatibility operation failed',
      stage: 'operation',
    });
    process.exitCode = 1;
  } finally {
    if (!(await cleanupOwnedKey(storage, key))) process.exitCode = 1;
    storage.close();
  }

  if (process.exitCode !== 1) {
    consoleServerLogger.info('storage.compatibility_complete', { status: 'complete' });
  }
}

void main();
