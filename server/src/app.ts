import { Hono } from 'hono';
import { cors } from 'hono/cors';
import serverPackage from '../package.json' with { type: 'json' };
import type { ServerConfig } from './config.js';

export const SERVER_VERSION = serverPackage.version;

export function createApp(config: ServerConfig): Hono {
  const allowedOrigins = new Set(config.allowedOrigins);
  const app = new Hono();

  app.use(
    '/api/*',
    cors({
      allowMethods: ['GET'],
      origin: (origin) => (allowedOrigins.has(origin) ? origin : undefined),
    })
  );

  app.get('/api/health', (context) =>
    context.json({
      revision: config.buildRevision,
      service: 'pixel-forge-api',
      status: 'ok',
      version: SERVER_VERSION,
    })
  );

  return app;
}
