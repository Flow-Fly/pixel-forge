import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

interface CommandResult {
  readonly code: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

const storageEnvironment = {
  STORAGE_ACCESS_KEY_ID: 'pixel_forge',
  STORAGE_BUCKET: 'pixel-forge-dev',
  STORAGE_ENDPOINT: 'http://127.0.0.1:1',
  STORAGE_FORCE_PATH_STYLE: 'true',
  STORAGE_REGION: 'us-east-1',
  STORAGE_SECRET_ACCESS_KEY: 'private-local-secret',
};

async function runStorageReadiness(
  environment: Record<string, string | undefined>
): Promise<CommandResult> {
  const child = spawn(process.execPath, ['dist/commands/storage-readiness.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, ...environment },
    stdio: 'pipe',
  });
  child.stderr.setEncoding('utf8');
  child.stdout.setEncoding('utf8');

  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (chunk: string) => (stderr += chunk));
  child.stdout.on('data', (chunk: string) => (stdout += chunk));

  const [code] = (await once(child, 'exit')) as [number | null];
  return { code, stderr, stdout };
}

describe('storage readiness command', () => {
  it('reports missing configuration without attempting readiness', async () => {
    const result = await runStorageReadiness({
      ...storageEnvironment,
      STORAGE_SECRET_ACCESS_KEY: undefined,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('"event":"storage.not_ready"');
    expect(result.stderr).toContain('"stage":"configuration"');
    expect(result.stdout).not.toContain('storage.ready');
  });

  it('reports an unavailable service without credentials or raw SDK errors', async () => {
    const result = await runStorageReadiness(storageEnvironment);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('"event":"storage.not_ready"');
    expect(result.stderr).toContain('"stage":"query"');
    expect(result.stderr).not.toContain(storageEnvironment.STORAGE_SECRET_ACCESS_KEY);
    expect(result.stderr).not.toContain('ECONNREFUSED');
    expect(result.stdout).not.toContain('storage.ready');
  });
});
