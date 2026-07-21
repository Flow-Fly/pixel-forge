import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp({
  allowedOrigins: ['https://pixel-forge.app'],
  buildRevision: 'abc123',
  port: 3001,
});

describe('GET /api/health', () => {
  it('returns deterministic process and build liveness', async () => {
    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      revision: 'abc123',
      service: 'pixel-forge-api',
      status: 'ok',
      version: '0.1.0',
    });
  });

  it('allows an explicitly configured browser origin', async () => {
    const response = await app.request('/api/health', {
      headers: { Origin: 'https://pixel-forge.app' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://pixel-forge.app',
    );
  });

  it('does not grant CORS to an unconfigured origin', async () => {
    const response = await app.request('/api/health', {
      headers: { Origin: 'https://example.com' },
    });

    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });

  it('answers allowed preflight requests without credentials or a wildcard', async () => {
    const response = await app.request('/api/health', {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'GET',
        Origin: 'https://pixel-forge.app',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://pixel-forge.app',
    );
    expect(response.headers.has('access-control-allow-credentials')).toBe(false);
  });
});
