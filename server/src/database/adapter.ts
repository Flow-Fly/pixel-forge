import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { DatabaseConfig } from './config.js';
import { appMeta } from './schema.js';

export type AppMetaRecord = typeof appMeta.$inferSelect;

export interface AppMetaSession {
  deleteAppMeta(key: string): Promise<void>;
  getAppMeta(key: string): Promise<AppMetaRecord | undefined>;
  setAppMeta(key: string, value: string): Promise<void>;
}

export interface DatabaseAdapter extends AppMetaSession {
  checkReadiness(): Promise<void>;
  close(): Promise<void>;
  transaction<T>(work: (transaction: AppMetaSession) => Promise<T>): Promise<T>;
}

function openClient(config: DatabaseConfig) {
  return postgres(config.url, {
    connect_timeout: 5,
    idle_timeout: 20,
    max: config.maxConnections,
    prepare: false,
  });
}

export function createDatabaseAdapter(config: DatabaseConfig): DatabaseAdapter {
  const client = openClient(config);
  const database = drizzle(client);
  let closePromise: Promise<void> | undefined;

  function createAppMetaSession(
    databaseSession: Pick<typeof database, 'delete' | 'insert' | 'select'>
  ): AppMetaSession {
    return {
      async deleteAppMeta(key) {
        await databaseSession.delete(appMeta).where(eq(appMeta.key, key));
      },

      async getAppMeta(key) {
        const [record] = await databaseSession
          .select()
          .from(appMeta)
          .where(eq(appMeta.key, key))
          .limit(1);
        return record;
      },

      async setAppMeta(key, value) {
        await databaseSession
          .insert(appMeta)
          .values({ key, value })
          .onConflictDoUpdate({
            set: { updatedAt: new Date(), value },
            target: appMeta.key,
          });
      },
    };
  }

  const appMetaSession = createAppMetaSession(database);

  return {
    ...appMetaSession,

    async checkReadiness() {
      await database.execute(sql`select 1`);
    },

    close() {
      closePromise ??= client.end({ timeout: 5 });
      return closePromise;
    },

    transaction(work) {
      return database.transaction((databaseTransaction) =>
        work(createAppMetaSession(databaseTransaction))
      );
    },
  };
}
