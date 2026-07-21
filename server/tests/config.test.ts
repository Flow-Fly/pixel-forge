import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '../src/config.js';

describe('parseServerConfig', () => {
  it('provides safe local defaults', () => {
    expect(parseServerConfig({})).toEqual({
      allowedOrigins: ['http://localhost:5173'],
      buildRevision: 'development',
      port: 3001,
    });
  });

  it('parses explicit process configuration', () => {
    expect(
      parseServerConfig({
        BUILD_REVISION: 'abc123',
        CORS_ALLOWED_ORIGINS: 'https://pixel-forge.app,http://127.0.0.1:5173',
        PORT: '8080',
      })
    ).toEqual({
      allowedOrigins: ['https://pixel-forge.app', 'http://127.0.0.1:5173'],
      buildRevision: 'abc123',
      port: 8080,
    });
  });

  it('allows port zero for ephemeral test servers', () => {
    expect(parseServerConfig({ PORT: '0' }).port).toBe(0);
  });

  it.each(['-1', '65536', '3000px', '3.5', ''])('rejects invalid PORT %j', (port) => {
    expect(() => parseServerConfig({ PORT: port })).toThrow(
      'PORT must be an integer between 0 and 65535'
    );
  });

  it.each([
    '*',
    '',
    'https://pixel-forge.app/path',
    'https://pixel-forge.app?source=test',
    'file:///tmp/pixel-forge',
    'not-a-url',
    'http://localhost:5173,',
  ])('rejects invalid CORS_ALLOWED_ORIGINS %j', (allowedOrigins) => {
    expect(() => parseServerConfig({ CORS_ALLOWED_ORIGINS: allowedOrigins })).toThrow(
      'CORS_ALLOWED_ORIGINS'
    );
  });

  it('rejects an explicitly empty build revision', () => {
    expect(() => parseServerConfig({ BUILD_REVISION: '' })).toThrow(
      'BUILD_REVISION must be 1 to 64 URL-safe characters'
    );
  });

  it.each(['contains spaces', '../revision', 'a'.repeat(65), 'line\nbreak'])(
    'rejects unsafe BUILD_REVISION %j',
    (buildRevision) => {
      expect(() => parseServerConfig({ BUILD_REVISION: buildRevision })).toThrow(
        'BUILD_REVISION must be 1 to 64 URL-safe characters'
      );
    }
  );

  it('does not echo malformed origin values in errors', () => {
    const malformedOrigin = 'https://token@example.com/private?secret=value';

    expect(() => parseServerConfig({ CORS_ALLOWED_ORIGINS: malformedOrigin })).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(malformedOrigin),
      })
    );
  });
});
