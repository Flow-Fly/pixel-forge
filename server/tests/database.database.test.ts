import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createDatabaseAdapter, type DatabaseAdapter } from '../src/database/adapter.js';
import { requireSafeDatabaseTarget } from '../src/database/config.js';
import { migrateDatabase } from '../src/database/migrate.js';

const execFileAsync = promisify(execFile);
const COMPATIBILITY_META_KEY = 'database_compatibility:last_checked';

async function cleanupOwnedRecords(
  database: DatabaseAdapter,
  keys: readonly string[]
): Promise<void> {
  const deletionResults = await Promise.allSettled(keys.map((key) => database.deleteAppMeta(key)));
  await Promise.all([database.close(), database.close()]);

  const deletionFailure = deletionResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (deletionFailure) throw deletionFailure.reason;
}

describe('PostgreSQL metadata seam', () => {
  it('migrates, probes, transacts, rolls back, and cleans up owned records', async () => {
    const config = requireSafeDatabaseTarget(process.env);
    const suffix = randomUUID();
    const committedKey = `integration:committed:${suffix}`;
    const rolledBackKey = `integration:rolled-back:${suffix}`;

    await migrateDatabase(config);
    await migrateDatabase(config);

    const database = createDatabaseAdapter(config);
    try {
      await database.checkReadiness();
      await database.transaction(async (transaction) => {
        await transaction.setAppMeta(committedKey, 'committed');
      });
      await expect(database.getAppMeta(committedKey)).resolves.toMatchObject({
        key: committedKey,
        value: 'committed',
      });

      await expect(
        database.transaction(async (transaction) => {
          await transaction.setAppMeta(rolledBackKey, 'must roll back');
          throw new Error('rollback probe');
        })
      ).rejects.toThrow('rollback probe');
      await expect(database.getAppMeta(rolledBackKey)).resolves.toBeUndefined();
    } finally {
      await cleanupOwnedRecords(database, [committedKey, rolledBackKey]);
    }
  });

  it('runs the public compatibility command and safely re-runs it', async () => {
    const config = requireSafeDatabaseTarget(process.env);
    const environment = {
      ...process.env,
      DATABASE_SAFETY_CONFIRM: 'non-production',
      DATABASE_URL: config.url,
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await execFileAsync(
        process.execPath,
        ['dist/commands/database-compatibility.js'],
        {
          cwd: new URL('..', import.meta.url),
          env: environment,
          timeout: 10_000,
        }
      );
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('"event":"database.compatibility_complete"');
    }

    const database = createDatabaseAdapter(config);
    try {
      await expect(database.getAppMeta(COMPATIBILITY_META_KEY)).resolves.toMatchObject({
        key: COMPATIBILITY_META_KEY,
      });
    } finally {
      await cleanupOwnedRecords(database, [COMPATIBILITY_META_KEY]);
    }
  });
});
