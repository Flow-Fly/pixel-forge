import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
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
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${text}`)), 5_000);

    child[stream].setEncoding('utf8');
    child[stream].on('data', (chunk: string) => {
      output += chunk;
      if (!output.includes(text)) return;

      clearTimeout(timeout);
      resolve(output);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before ${text}: code=${code} signal=${signal}`));
    });
  });
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }

  const [code, signal] = await once(child, 'exit');
  return {
    code: code as number | null,
    signal: signal as NodeJS.Signals | null,
  };
}

describe('server process', () => {
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
