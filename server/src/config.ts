const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173'];
const DEFAULT_BUILD_REVISION = 'development';
const DEFAULT_PORT = 3001;
const BUILD_REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const INVALID_ORIGINS_MESSAGE = 'CORS_ALLOWED_ORIGINS must contain only explicit HTTP(S) origins';

export interface ServerConfig {
  readonly allowedOrigins: readonly string[];
  readonly buildRevision: string;
  readonly port: number;
}

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;

  if (value.trim().length === 0) {
    throw new Error('PORT must be an integer between 0 and 65535');
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('PORT must be an integer between 0 and 65535');
  }

  return port;
}

function parseOrigin(value: string): string {
  if (value === '*' || value.length === 0) {
    throw new Error(INVALID_ORIGINS_MESSAGE);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(INVALID_ORIGINS_MESSAGE);
  }

  const isHttpOrigin = url.protocol === 'http:' || url.protocol === 'https:';
  if (!isHttpOrigin || url.origin !== value) {
    throw new Error(INVALID_ORIGINS_MESSAGE);
  }

  return value;
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  if (value === undefined) return DEFAULT_ALLOWED_ORIGINS;

  const origins = value.split(',').map((origin) => parseOrigin(origin.trim()));
  return [...new Set(origins)];
}

function parseBuildRevision(value: string | undefined): string {
  if (value === undefined) return DEFAULT_BUILD_REVISION;

  if (!BUILD_REVISION_PATTERN.test(value)) {
    throw new Error('BUILD_REVISION must be 1 to 64 URL-safe characters');
  }

  return value;
}

export function parseServerConfig(environment: ServerEnvironment): ServerConfig {
  return {
    allowedOrigins: parseAllowedOrigins(environment.CORS_ALLOWED_ORIGINS),
    buildRevision: parseBuildRevision(environment.BUILD_REVISION),
    port: parsePort(environment.PORT),
  };
}
