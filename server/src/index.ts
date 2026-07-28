import { parseServerConfig } from './config.js';
import { registerShutdownSignals } from './lifecycle.js';
import { consoleServerLogger, errorMessage } from './logger.js';
import { startServer } from './server.js';

async function main(): Promise<void> {
  const shutdownSignals = registerShutdownSignals(process, consoleServerLogger, () => {
    process.exitCode = 1;
  });

  try {
    const config = parseServerConfig(process.env);
    const server = await startServer(config, consoleServerLogger);
    shutdownSignals.attach(server);
  } catch (error) {
    shutdownSignals.dispose();
    throw error;
  }
}

void main().catch((error: unknown) => {
  consoleServerLogger.error('server.start_failed', {
    message: errorMessage(error),
  });
  process.exitCode = 1;
});
