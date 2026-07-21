const DEFAULT_MAX_CONNECTIONS = 4;
const MAX_CONNECTIONS_LIMIT = 20;
const SAFE_DATABASE_CONFIRMATION = 'non-production';
const ADMIN_DATABASE_NAMES = new Set(['postgres', 'template0', 'template1']);
const INVALID_DATABASE_URL_MESSAGE =
  'DATABASE_URL must be an explicit PostgreSQL connection URL with a database name';

type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

export interface DatabaseConfig {
  readonly maxConnections: number;
  readonly url: string;
}

function readDatabaseName(url: URL): string {
  try {
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error(INVALID_DATABASE_URL_MESSAGE);
  }
}

function parseDatabaseUrl(value: string | undefined): URL {
  if (!value) throw new Error(INVALID_DATABASE_URL_MESSAGE);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(INVALID_DATABASE_URL_MESSAGE);
  }

  const databaseName = readDatabaseName(url);
  const isPostgres = url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  if (!isPostgres || !url.hostname || !databaseName || databaseName.includes('/')) {
    throw new Error(INVALID_DATABASE_URL_MESSAGE);
  }

  return url;
}

function parseMaxConnections(value: string | undefined): number {
  if (value === undefined) return DEFAULT_MAX_CONNECTIONS;

  const maxConnections = Number(value);
  if (
    !Number.isInteger(maxConnections) ||
    maxConnections < 1 ||
    maxConnections > MAX_CONNECTIONS_LIMIT
  ) {
    throw new Error(
      `DATABASE_MAX_CONNECTIONS must be an integer between 1 and ${MAX_CONNECTIONS_LIMIT}`
    );
  }

  return maxConnections;
}

export function databaseNameFromUrl(url: string): string {
  return readDatabaseName(parseDatabaseUrl(url));
}

export function parseDatabaseConfig(environment: DatabaseEnvironment): DatabaseConfig {
  return {
    maxConnections: parseMaxConnections(environment.DATABASE_MAX_CONNECTIONS),
    url: parseDatabaseUrl(environment.DATABASE_URL).toString(),
  };
}

export function requireSafeDatabaseTarget(environment: DatabaseEnvironment): DatabaseConfig {
  if (environment.DATABASE_SAFETY_CONFIRM !== SAFE_DATABASE_CONFIRMATION) {
    throw new Error('DATABASE_SAFETY_CONFIRM must equal non-production');
  }

  const config = parseDatabaseConfig(environment);
  if (ADMIN_DATABASE_NAMES.has(databaseNameFromUrl(config.url).toLowerCase())) {
    throw new Error('Database commands refuse built-in administrative databases');
  }

  return config;
}
