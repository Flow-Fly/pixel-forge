import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDatabaseAdapter } from '../src/database/adapter.js';
import { parseDatabaseConfig } from '../src/database/config.js';
import { migrateDatabase } from '../src/database/migrate.js';

describe('PostgreSQL metadata seam', () => {
  it('migrates, probes, transacts, rolls back, and cleans up owned records', async () => {
    const config = parseDatabaseConfig(process.env);
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
      await database.deleteAppMeta(committedKey).catch(() => undefined);
      await database.deleteAppMeta(rolledBackKey).catch(() => undefined);
      await Promise.all([database.close(), database.close()]);
    }
  });
});
