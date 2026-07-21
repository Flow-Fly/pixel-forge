import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function startProcess(environment: Record<string, string>): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ['dist/index.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, ...environment },
    stdio: 'pipe',
  });
}

function waitForOutput(
  child: ChildProcessWithoutNullStreams,
  stream: 'stderr' | 'stdout',
  text: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';

    function cleanup(): void {
      clearTimeout(timeout);
      child[stream].off('data', onData);
      child.off('exit', onExit);
    }

    function succeed(): void {
      cleanup();
      resolve(output);
    }

    function fail(error: Error): void {
      cleanup();
      reject(error);
    }

    function onData(chunk: string): void {
      output += chunk;
      const completeLines = output.split('\n').slice(0, -1);
      if (completeLines.some((line) => line.includes(text))) succeed();
    }

    function onExit(code: number | null, signal: NodeJS.Signals | null): void {
      fail(new Error(`Server exited before ${text}: code=${code} signal=${signal}`));
    }

    const timeout = setTimeout(() => fail(new Error(`Timed out waiting for ${text}`)), 5_000);

    child[stream].setEncoding('utf8');
    child[stream].on('data', onData);
    child.once('exit', onExit);
  });
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    function cleanup(): void {
      clearTimeout(timeout);
      child.off('exit', onExit);
    }

    function onExit(code: number | null, signal: NodeJS.Signals | null): void {
      cleanup();
      resolve({ code, signal });
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for the server process to exit'));
    }, 5_000);

    child.once('exit', onExit);
    if (child.exitCode !== null || child.signalCode !== null) {
      onExit(child.exitCode, child.signalCode);
    }
  });
}

describe('server process', { timeout: 10_000 }, () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    'serves health and exits cleanly on %s',
    async (signal) => {
      const child = startProcess({
        BUILD_REVISION: 'process-test',
        CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
        PORT: '0',
      });

      try {
        const output = await waitForOutput(child, 'stdout', 'server.started');
        const started = output
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { event: string; port?: number })
          .find(({ event }) => event === 'server.started');
        if (started?.port === undefined) {
          throw new Error('Server start event did not include its bound port');
        }

        const response = await fetch(`http://127.0.0.1:${started.port}/api/health`);
        expect(response.status).toBe(200);

        const exit = waitForExit(child);
        child.kill(signal);
        await expect(exit).resolves.toEqual({ code: 0, signal: null });
      } finally {
        if (child.exitCode === null) child.kill('SIGKILL');
      }
    }
  );

  it('reports invalid startup configuration without binding a socket', async () => {
    const child = startProcess({ PORT: 'invalid' });

    try {
      const stderr = await waitForOutput(child, 'stderr', 'server.start_failed');
      expect(stderr).toContain('PORT must be an integer between 0 and 65535');

      await expect(waitForExit(child)).resolves.toEqual({
        code: 1,
        signal: null,
      });
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  });
});
