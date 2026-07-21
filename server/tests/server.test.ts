import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { ServerLogDetails, ServerLogger } from '../src/logger.js';
import { startServer } from '../src/server.js';

class TestLogger implements ServerLogger {
  readonly events: Array<{ details: ServerLogDetails; event: string }> = [];

  error(event: string, details: ServerLogDetails): void {
    this.events.push({ details, event });
  }

  info(event: string, details: ServerLogDetails): void {
    this.events.push({ details, event });
  }
}

describe('startServer', () => {
  it('binds a real HTTP server and shuts it down once', async () => {
    const logger = new TestLogger();
    const server = await startServer(
      {
        allowedOrigins: ['http://localhost:5173'],
        buildRevision: 'test-revision',
        port: 0,
      },
      logger,
    );

    const response = await fetch(`http://127.0.0.1:${server.port}/api/health`);
    expect(response.status).toBe(200);

    await Promise.all([server.shutdown('test'), server.shutdown('test')]);

    expect(logger.events.map(({ event }) => event)).toEqual([
      'server.started',
      'server.shutdown_started',
      'server.shutdown_complete',
    ]);
    await expect(fetch(`http://127.0.0.1:${server.port}/api/health`)).rejects.toThrow();
  });

  it('rejects when the configured port cannot be bound', async () => {
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');

    const address = reservation.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected a TCP address while reserving a test port');
    }

    try {
      await expect(
        startServer({
          allowedOrigins: ['http://localhost:5173'],
          buildRevision: 'test-revision',
          port: address.port,
        }),
      ).rejects.toMatchObject({ code: 'EADDRINUSE' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        reservation.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
