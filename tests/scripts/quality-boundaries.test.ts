import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

const repository = process.cwd();
const fixture = mkdtempSync(resolve(tmpdir(), 'pixel-forge-boundaries-'));

beforeAll(() => {
  symlinkSync(resolve(repository, 'node_modules'), resolve(fixture, 'node_modules'), 'dir');
  for (const file of ['eslint.config.js', '.fallowrc.json'])
    cpSync(resolve(repository, file), resolve(fixture, file));
  for (const directory of ['src', 'server/src', 'shared/src'])
    mkdirSync(resolve(fixture, directory), { recursive: true });
  writeFileSync(resolve(fixture, 'package.json'), '{"type":"module"}');
  writeFileSync(resolve(fixture, '.gitignore'), 'node_modules\n.fallow\n');
  execFileSync('git', ['init', '-q'], { cwd: fixture });
});
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

it('blocks local source crossings even outside a changed-files audit', () => {
  writeFileSync(resolve(fixture, 'server/src/index.ts'), 'export const server = 1;');
  writeFileSync(
    resolve(fixture, 'src/main.ts'),
    "import { server } from '../server/src/index.ts'; console.log(server);"
  );
  const result = spawnSync(
    resolve(repository, 'node_modules/.bin/fallow'),
    ['dead-code', '--boundary-violations', '--format', 'json', '--no-cache'],
    { cwd: fixture, encoding: 'utf8' }
  );
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).boundary_violations).toHaveLength(1);
});

it('rejects static, literal dynamic and computed imports in each production runtime', () => {
  for (const [filename, specifier] of [
    ['src/fixture.ts', 'hono'],
    ['shared/src/fixture.ts', 'node:fs'],
    ['server/src/fixture.ts', 'lit'],
    ['workers/telemetry/src/fixture.ts', 'lit'],
    ['scripts/fixture.mjs', 'lit'],
  ]) {
    for (const source of [
      `import * as value from '${specifier}'; export { value };`,
      `export const value = import('${specifier}');`,
      "const destination = './local.js'; export const value = import(destination);",
    ]) {
      const result = spawnSync(
        resolve(repository, 'node_modules/.bin/eslint'),
        ['--stdin', '--stdin-filename', filename, '--format', 'json'],
        { cwd: fixture, encoding: 'utf8', input: source }
      );
      expect(result.status, result.stderr).toBe(1);
      expect(
        JSON.parse(result.stdout)[0].messages.some((message: { ruleId: string }) =>
          ['no-restricted-imports', 'no-restricted-syntax'].includes(message.ruleId)
        )
      ).toBe(true);
    }
  }
}, 30_000);

it('keeps a type-accepted wrong-runtime package blocked by the import policy', () => {
  writeFileSync(
    resolve(fixture, 'shared/src/fixture.ts'),
    "import { readFileSync } from 'node:fs'; export { readFileSync };"
  );
  const result = spawnSync(
    resolve(repository, 'node_modules/.bin/tsc'),
    [
      '--noEmit',
      '--skipLibCheck',
      '--target',
      'es2022',
      '--lib',
      'es2022',
      '--module',
      'nodenext',
      '--types',
      'node',
      'shared/src/fixture.ts',
    ],
    { cwd: fixture, encoding: 'utf8' }
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
