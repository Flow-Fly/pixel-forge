import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

interface CommandResult {
  readonly code: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

async function runCommand(
  command: 'database-compatibility' | 'database-migrate' | 'database-readiness',
  environment: Record<string, string | undefined>
): Promise<CommandResult> {
  const child = spawn(process.execPath, [`dist/commands/${command}.js`], {
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

describe('database commands', () => {
  it.each(['database-compatibility', 'database-migrate'] as const)(
    'refuses %s without the safety confirmation before connecting',
    async (command) => {
      const result = await runCommand(command, {
        DATABASE_SAFETY_CONFIRM: undefined,
        DATABASE_URL: 'postgresql://pixel_forge:secret@127.0.0.1:1/pixel_forge_dev',
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('DATABASE_SAFETY_CONFIRM must equal non-production');
      expect(result.stderr).not.toContain('pixel_forge:secret');
      expect(result.stdout).toBe('');
    }
  );

  it('reports malformed readiness configuration without echoing credentials', async () => {
    const databaseUrl = 'https://pixel_forge:secret@example.com/database';
    const result = await runCommand('database-readiness', {
      DATABASE_URL: databaseUrl,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('database.not_ready');
    expect(result.stderr).not.toContain(databaseUrl);
    expect(result.stderr).not.toContain('secret');
    expect(result.stdout).toBe('');
  });
});
