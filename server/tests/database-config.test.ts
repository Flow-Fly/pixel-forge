import { describe, expect, it } from 'vitest';
import { parseDatabaseConfig, requireSafeDatabaseTarget } from '../src/database/config.js';

describe('parseDatabaseConfig', () => {
  it('parses an explicit PostgreSQL target with a bounded pool', () => {
    expect(
      parseDatabaseConfig({
        DATABASE_MAX_CONNECTIONS: '2',
        DATABASE_URL: 'postgresql://pixel_forge:secret@127.0.0.1:5432/pixel_forge_dev',
      })
    ).toEqual({
      maxConnections: 2,
      url: 'postgresql://pixel_forge:secret@127.0.0.1:5432/pixel_forge_dev',
    });
  });

  it.each([
    undefined,
    '',
    'not-a-url',
    'https://example.com/database',
    'postgresql://localhost',
    'postgresql://localhost/database/extra',
    'postgresql://localhost/%',
    'postgresql://localhost/pixel_forge_dev?database=postgres',
  ])('rejects invalid DATABASE_URL %j without echoing it', (databaseUrl) => {
    let error: unknown;
    try {
      parseDatabaseConfig({ DATABASE_URL: databaseUrl });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    if (databaseUrl) expect((error as Error).message).not.toContain(databaseUrl);
  });

  it.each(['0', '21', '1.5', 'many', ''])('rejects invalid pool size %j', (maxConnections) => {
    expect(() =>
      parseDatabaseConfig({
        DATABASE_MAX_CONNECTIONS: maxConnections,
        DATABASE_URL: 'postgresql://localhost/pixel_forge_dev',
      })
    ).toThrow('DATABASE_MAX_CONNECTIONS must be an integer between 1 and 20');
  });
});

describe('requireSafeDatabaseTarget', () => {
  it('requires an exact non-production confirmation', () => {
    expect(() =>
      requireSafeDatabaseTarget({
        DATABASE_URL: 'postgresql://localhost/pixel_forge_dev',
      })
    ).toThrow('DATABASE_SAFETY_CONFIRM must equal non-production');
  });

  it.each(['postgres', 'template0', 'template1', 'POSTGRES'])(
    'refuses administrative database %s',
    (databaseName) => {
      expect(() =>
        requireSafeDatabaseTarget({
          DATABASE_SAFETY_CONFIRM: 'non-production',
          DATABASE_URL: `postgresql://localhost/${databaseName}`,
        })
      ).toThrow('Database commands refuse built-in administrative databases');
    }
  );

  it('accepts a named remote non-production target', () => {
    const config = requireSafeDatabaseTarget({
      DATABASE_SAFETY_CONFIRM: 'non-production',
      DATABASE_URL: 'postgresql://compat.example.com/pixel_forge_compat',
    });

    expect(config.url).toBe('postgresql://compat.example.com/pixel_forge_compat');
  });
});
