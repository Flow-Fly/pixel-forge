import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { registerShutdownSignals } from '../src/lifecycle.js';
import type { ServerLogDetails, ServerLogger } from '../src/logger.js';
import type { RunningServer } from '../src/server.js';

class TestLogger implements ServerLogger {
  readonly events: Array<{ details: ServerLogDetails; event: string }> = [];

  error(event: string, details: ServerLogDetails): void {
    this.events.push({ details, event });
  }

  info(event: string, details: ServerLogDetails): void {
    this.events.push({ details, event });
  }
}

describe('registerShutdownSignals', () => {
  it('queues an early signal and keeps repeated signals idempotent', async () => {
    const signals = new EventEmitter();
    const logger = new TestLogger();
    let finishShutdown: (() => void) | undefined;
    const shutdown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishShutdown = resolve;
        })
    );
    const server: RunningServer = { port: 3001, shutdown };
    const controller = registerShutdownSignals(signals, logger, vi.fn());

    signals.emit('SIGTERM', 'SIGTERM');
    controller.attach(server);
    signals.emit('SIGTERM', 'SIGTERM');

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledWith('SIGTERM');

    finishShutdown?.();
    await controller.done;
    expect(signals.listenerCount('SIGINT')).toBe(0);
    expect(signals.listenerCount('SIGTERM')).toBe(0);
  });

  it('reports shutdown failure and sets the failure boundary', async () => {
    const signals = new EventEmitter();
    const logger = new TestLogger();
    const markFailure = vi.fn();
    const server: RunningServer = {
      port: 3001,
      shutdown: vi.fn().mockRejectedValue(new Error('close failed')),
    };
    const controller = registerShutdownSignals(signals, logger, markFailure);
    controller.attach(server);

    signals.emit('SIGINT', 'SIGINT');
    await controller.done;

    expect(markFailure).toHaveBeenCalledOnce();
    expect(logger.events).toContainEqual({
      details: { signal: 'SIGINT' },
      event: 'server.shutdown_exit',
    });
  });
});
