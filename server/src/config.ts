const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173'];
const DEFAULT_BUILD_REVISION = 'development';
const DEFAULT_PORT = 3001;

export interface ServerConfig {
  readonly allowedOrigins: readonly string[];
  readonly buildRevision: string;
  readonly port: number;
}

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}

function parseOrigin(value: string): string {
  if (value === '*' || value.length === 0) {
    throw new Error('CORS_ALLOWED_ORIGINS must contain explicit HTTP(S) origins');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`CORS_ALLOWED_ORIGINS contains an invalid origin: ${value}`);
  }

  const isHttpOrigin = url.protocol === 'http:' || url.protocol === 'https:';
  if (!isHttpOrigin || url.origin !== value) {
    throw new Error(`CORS_ALLOWED_ORIGINS contains an invalid origin: ${value}`);
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

  const revision = value.trim();
  if (revision.length === 0) {
    throw new Error('BUILD_REVISION must not be empty');
  }

  return revision;
}

export function parseServerConfig(environment: ServerEnvironment): ServerConfig {
  return {
    allowedOrigins: parseAllowedOrigins(environment.CORS_ALLOWED_ORIGINS),
    buildRevision: parseBuildRevision(environment.BUILD_REVISION),
    port: parsePort(environment.PORT),
  };
}
