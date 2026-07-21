const SAFE_STORAGE_CONFIRMATION = 'local-non-production';
const INSECURE_HTTP_CONFIRMATION = 'local-container-network';
const INVALID_ENDPOINT_MESSAGE =
  'STORAGE_ENDPOINT must be an explicit HTTPS origin or loopback HTTP origin without credentials';
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const REGION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}[A-Za-z0-9]$/;

type StorageEnvironment = Readonly<Record<string, string | undefined>>;

export interface StorageConfig {
  readonly accessKeyId: string;
  readonly bucket: string;
  readonly endpoint: string;
  readonly forcePathStyle: boolean;
  readonly region: string;
  readonly secretAccessKey: string;
}

function requireValue(environment: StorageEnvironment, name: string): string {
  const value = environment[name];
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

function parseEndpoint(value: string, insecureHttpConfirmation: string | undefined): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error(INVALID_ENDPOINT_MESSAGE);
  }

  if (
    !isHttpProtocol(endpoint) ||
    endpoint.origin !== value ||
    !hasSafeTransport(endpoint, insecureHttpConfirmation) ||
    endpoint.username ||
    endpoint.password
  ) {
    throw new Error(INVALID_ENDPOINT_MESSAGE);
  }

  return endpoint;
}

function isHttpProtocol(endpoint: URL): boolean {
  return endpoint.protocol === 'http:' || endpoint.protocol === 'https:';
}

function hasSafeTransport(endpoint: URL, insecureHttpConfirmation: string | undefined): boolean {
  return (
    endpoint.protocol === 'https:' ||
    isLoopbackHost(endpoint.hostname) ||
    insecureHttpConfirmation === INSECURE_HTTP_CONFIRMATION
  );
}

function parseBucket(value: string): string {
  if (!BUCKET_PATTERN.test(value) || value.includes('..')) {
    throw new Error('STORAGE_BUCKET must be a portable 3 to 63 character bucket name');
  }
  return value;
}

function parseRegion(value: string): string {
  if (!REGION_PATTERN.test(value)) {
    throw new Error('STORAGE_REGION must contain 2 to 64 portable characters');
  }
  return value;
}

function parseForcePathStyle(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('STORAGE_FORCE_PATH_STYLE must equal true or false');
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function parseStorageConfig(environment: StorageEnvironment): StorageConfig {
  return {
    accessKeyId: requireValue(environment, 'STORAGE_ACCESS_KEY_ID'),
    bucket: parseBucket(requireValue(environment, 'STORAGE_BUCKET')),
    endpoint: parseEndpoint(
      requireValue(environment, 'STORAGE_ENDPOINT'),
      environment.STORAGE_INSECURE_HTTP_CONFIRM
    ).origin,
    forcePathStyle: parseForcePathStyle(requireValue(environment, 'STORAGE_FORCE_PATH_STYLE')),
    region: parseRegion(requireValue(environment, 'STORAGE_REGION')),
    secretAccessKey: requireValue(environment, 'STORAGE_SECRET_ACCESS_KEY'),
  };
}

export function requireSafeLocalStorageTarget(environment: StorageEnvironment): StorageConfig {
  if (environment.STORAGE_SAFETY_CONFIRM !== SAFE_STORAGE_CONFIRMATION) {
    throw new Error('STORAGE_SAFETY_CONFIRM must equal local-non-production');
  }

  const config = parseStorageConfig(environment);
  if (!isLoopbackHost(new URL(config.endpoint).hostname)) {
    throw new Error('Storage integration commands require a loopback endpoint');
  }
  return config;
}
