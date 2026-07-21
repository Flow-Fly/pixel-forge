import { createServer } from 'node:http';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

async function reserveAvailablePort(): Promise<number> {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');

  const address = reservation.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected a TCP address while reserving a test port');
  }

  await new Promise<void>((resolve, reject) => {
    reservation.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

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
  text: string,
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
  child: ChildProcessWithoutNullStreams,
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
  it('serves health and exits cleanly on SIGTERM', async () => {
    const port = await reserveAvailablePort();
    const child = startProcess({
      BUILD_REVISION: 'process-test',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
      PORT: String(port),
    });

    try {
      await waitForOutput(child, 'stdout', 'server.started');

      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(response.status).toBe(200);

      const exit = waitForExit(child);
      child.kill('SIGTERM');
      await expect(exit).resolves.toEqual({ code: 0, signal: null });
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  });

  it('reports invalid startup configuration without binding a socket', async () => {
    const child = startProcess({ PORT: 'invalid' });

    try {
      const stderr = await waitForOutput(child, 'stderr', 'server.start_failed');
      expect(stderr).toContain('PORT must be an integer between 1 and 65535');

      await expect(waitForExit(child)).resolves.toEqual({
        code: 1,
        signal: null,
      });
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  });
});
