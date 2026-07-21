import { describe, expect, it } from 'vitest';
import { parseStorageConfig, requireSafeLocalStorageTarget } from '../src/storage/config.js';

const validEnvironment = {
  STORAGE_ACCESS_KEY_ID: 'pixel_forge',
  STORAGE_BUCKET: 'pixel-forge-dev',
  STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
  STORAGE_FORCE_PATH_STYLE: 'true',
  STORAGE_REGION: 'us-east-1',
  STORAGE_SECRET_ACCESS_KEY: 'pixel_forge_local',
};

describe('storage configuration', () => {
  it('parses the explicit S3-compatible settings used by local MinIO', () => {
    expect(parseStorageConfig(validEnvironment)).toEqual({
      accessKeyId: 'pixel_forge',
      bucket: 'pixel-forge-dev',
      endpoint: 'http://127.0.0.1:9000',
      forcePathStyle: true,
      region: 'us-east-1',
      secretAccessKey: 'pixel_forge_local',
    });
  });

  it('keeps a parsed endpoint valid when commands pass configuration onward', () => {
    const config = parseStorageConfig(validEnvironment);

    expect(
      parseStorageConfig({ ...validEnvironment, STORAGE_ENDPOINT: config.endpoint }).endpoint
    ).toBe(config.endpoint);
  });

  it.each([
    ['STORAGE_ACCESS_KEY_ID', undefined, 'STORAGE_ACCESS_KEY_ID is required'],
    ['STORAGE_BUCKET', 'Invalid_Bucket', 'STORAGE_BUCKET must be a portable'],
    ['STORAGE_ENDPOINT', 'https://user:secret@example.com', 'STORAGE_ENDPOINT must be'],
    ['STORAGE_ENDPOINT', 'http://objects.example.com', 'STORAGE_ENDPOINT must be'],
    ['STORAGE_FORCE_PATH_STYLE', 'yes', 'STORAGE_FORCE_PATH_STYLE must equal'],
    ['STORAGE_REGION', '/', 'STORAGE_REGION must contain'],
    ['STORAGE_SECRET_ACCESS_KEY', '', 'STORAGE_SECRET_ACCESS_KEY is required'],
  ])('rejects an invalid %s without echoing its value', (name, value, message) => {
    const environment = { ...validEnvironment, [name]: value };

    expect(() => parseStorageConfig(environment)).toThrow(message);
    try {
      parseStorageConfig(environment);
    } catch (error) {
      expect(String(error)).not.toContain('user:secret');
    }
  });

  it('requires the exact safety confirmation before parsing a mutation target', () => {
    expect(() => requireSafeLocalStorageTarget(validEnvironment)).toThrow(
      'STORAGE_SAFETY_CONFIRM must equal local-non-production'
    );
  });

  it('allows guarded commands only against loopback storage', () => {
    const environment = {
      ...validEnvironment,
      STORAGE_ENDPOINT: 'https://objects.example.com',
      STORAGE_SAFETY_CONFIRM: 'local-non-production',
    };

    expect(() => requireSafeLocalStorageTarget(environment)).toThrow(
      'Storage integration commands require a loopback endpoint'
    );
  });
});
