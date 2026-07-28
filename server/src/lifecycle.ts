import type { ServerLogger } from './logger.js';
import type { RunningServer } from './server.js';

type ShutdownSignal = 'SIGINT' | 'SIGTERM';
type ShutdownSignalListener = (signal: ShutdownSignal) => void;

export interface ShutdownSignalSource {
  off(signal: ShutdownSignal, listener: ShutdownSignalListener): unknown;
  on(signal: ShutdownSignal, listener: ShutdownSignalListener): unknown;
}

export interface ShutdownSignalController {
  readonly done: Promise<void>;
  attach(server: RunningServer): void;
  dispose(): void;
}

export function registerShutdownSignals(
  source: ShutdownSignalSource,
  logger: ServerLogger,
  markFailure: () => void
): ShutdownSignalController {
  let requestedSignal: ShutdownSignal | undefined;
  let runningServer: RunningServer | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const dispose = (): void => {
    source.off('SIGINT', handleSignal);
    source.off('SIGTERM', handleSignal);
    resolveDone();
  };

  const beginShutdown = (): void => {
    if (!runningServer || !requestedSignal || shutdownPromise) return;

    const signal = requestedSignal;
    shutdownPromise = runningServer
      .shutdown(signal)
      .catch(() => {
        logger.error('server.shutdown_exit', { signal });
        markFailure();
      })
      .finally(dispose);
  };

  const handleSignal = (signal: ShutdownSignal): void => {
    requestedSignal ??= signal;
    beginShutdown();
  };

  source.on('SIGINT', handleSignal);
  source.on('SIGTERM', handleSignal);

  return {
    done,
    attach(server) {
      runningServer = server;
      beginShutdown();
    },
    dispose,
  };
}
