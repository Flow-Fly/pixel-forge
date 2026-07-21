import { parseServerConfig } from './config.js';
import {
  consoleServerLogger,
  errorMessage,
  type ServerLogger,
} from './logger.js';
import { startServer, type RunningServer } from './server.js';

function registerShutdownSignals(
  server: RunningServer,
  logger: ServerLogger,
): void {
  const shutdown = (signal: NodeJS.Signals): void => {
    void server.shutdown(signal).catch(() => {
      logger.error('server.shutdown_exit', { signal });
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function main(): Promise<void> {
  const config = parseServerConfig(process.env);
  const server = await startServer(config, consoleServerLogger);
  registerShutdownSignals(server, consoleServerLogger);
}

void main().catch((error: unknown) => {
  consoleServerLogger.error('server.start_failed', {
    message: errorMessage(error),
  });
  process.exitCode = 1;
});
