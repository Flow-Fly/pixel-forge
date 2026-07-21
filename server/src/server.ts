import { serve, type ServerType } from '@hono/node-server';
import { createApp, SERVER_VERSION } from './app.js';
import type { ServerConfig } from './config.js';
import { consoleServerLogger, errorMessage, type ServerLogger } from './logger.js';

export interface RunningServer {
  readonly port: number;
  shutdown(reason: string): Promise<void>;
}

function closeServer(server: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function createRunningServer(
  server: ServerType,
  port: number,
  logger: ServerLogger
): RunningServer {
  let shutdownPromise: Promise<void> | undefined;

  return {
    port,
    shutdown(reason) {
      if (shutdownPromise) return shutdownPromise;

      logger.info('server.shutdown_started', { reason });
      shutdownPromise = closeServer(server)
        .then(() => logger.info('server.shutdown_complete', { reason }))
        .catch((error: unknown) => {
          logger.error('server.shutdown_failed', {
            message: errorMessage(error),
            reason,
          });
          throw error;
        });
      return shutdownPromise;
    },
  };
}

export function startServer(
  config: ServerConfig,
  logger: ServerLogger = consoleServerLogger
): Promise<RunningServer> {
  const app = createApp(config);

  return new Promise((resolve, reject) => {
    const server = serve(
      { fetch: app.fetch, hostname: '127.0.0.1', port: config.port },
      ({ port }) => {
        server.off('error', reject);
        server.on('error', (error) =>
          logger.error('server.error', { message: errorMessage(error) })
        );
        logger.info('server.started', {
          port,
          revision: config.buildRevision,
          version: SERVER_VERSION,
        });
        resolve(createRunningServer(server, port, logger));
      }
    );

    server.once('error', reject);
  });
}
