import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import type { DatabaseConfig } from './config.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function migrateDatabase(config: DatabaseConfig): Promise<void> {
  const client = postgres(config.url, {
    connect_timeout: 5,
    max: 1,
    onnotice: () => undefined,
    prepare: false,
  });

  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end({ timeout: 5 });
  }
}
