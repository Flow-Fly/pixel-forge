import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { BlobStorage } from '../src/storage/blob-storage.js';
import { requireSafeLocalStorageTarget } from '../src/storage/config.js';
import { createS3BlobStorage } from '../src/storage/s3-adapter.js';

const execFileAsync = promisify(execFile);

async function cleanupOwnedKeys(storage: BlobStorage, keys: readonly string[]): Promise<void> {
  const results = await Promise.allSettled(keys.map((key) => storage.delete(key)));
  storage.close();

  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (failure) throw failure.reason;
}

describe('S3-compatible project blob seam', () => {
  it('preserves arbitrary bytes and deletes only its exact owned key', async () => {
    const config = requireSafeLocalStorageTarget(process.env);
    const prefix = `integration/${randomUUID()}`;
    const key = `${prefix}/arbitrary-project.pf`;
    const missingKey = `${prefix}/never-created.pf`;
    const expected = Uint8Array.from([0, 255, 1, 128, 31, 139, 8, 0, 222, 173, 190, 239]);
    const storage = createS3BlobStorage(config);

    try {
      await storage.checkReadiness();
      await expect(storage.get(missingKey)).resolves.toBeUndefined();
      await storage.put(key, expected);
      await expect(storage.get(key)).resolves.toEqual(expected);
      await storage.delete(key);
      await expect(storage.get(key)).resolves.toBeUndefined();
    } finally {
      await cleanupOwnedKeys(storage, [key]);
    }
  });

  it('runs the guarded compatibility command repeatedly without shared test state', async () => {
    const config = requireSafeLocalStorageTarget(process.env);
    const environment = {
      ...process.env,
      STORAGE_ACCESS_KEY_ID: config.accessKeyId,
      STORAGE_BUCKET: config.bucket,
      STORAGE_ENDPOINT: config.endpoint,
      STORAGE_FORCE_PATH_STYLE: String(config.forcePathStyle),
      STORAGE_REGION: config.region,
      STORAGE_SAFETY_CONFIRM: 'local-non-production',
      STORAGE_SECRET_ACCESS_KEY: config.secretAccessKey,
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await execFileAsync(
        process.execPath,
        ['dist/commands/storage-compatibility.js'],
        {
          cwd: new URL('..', import.meta.url),
          env: environment,
          timeout: 10_000,
        }
      );
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('"event":"storage.compatibility_complete"');
    }
  });
});
