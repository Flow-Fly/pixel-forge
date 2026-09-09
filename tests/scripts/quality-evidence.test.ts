import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repository = process.cwd();
const fixture = realpathSync(mkdtempSync(resolve(tmpdir(), 'pixel-forge-quality-')));
const bundle = resolve(fixture, '.fallow/quality');
let base: string;
let head: string;
function write(path: string, text: string) {
  mkdirSync(dirname(resolve(fixture, path)), { recursive: true });
  writeFileSync(resolve(fixture, path), text);
}
function git(...args: string[]) {
  return execFileSync('git', args, { cwd: fixture, encoding: 'utf8' }).trim();
}
function cli(...args: string[]) {
  const result = spawnSync(process.execPath, ['scripts/quality-evidence.mjs', ...args], {
    cwd: fixture,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
  });
  return { status: result.status, text: result.stdout + result.stderr };
}
function check(path = bundle, candidateBase = base, candidateHead = head) {
  return cli('check', '--base', candidateBase, '--head', candidateHead, '--bundle', path);
}

beforeAll(() => {
  for (const path of [
    'scripts/quality-evidence.mjs',
    'scripts/quality',
    'vitest.config.ts',
    'vitest.browser.config.ts',
    'server/vitest.config.ts',
    'eslint.config.js',
    '.fallowrc.json',
  ]) {
    mkdirSync(dirname(resolve(fixture, path)), { recursive: true });
    cpSync(resolve(repository, path), resolve(fixture, path), { recursive: true });
  }
  write(
    'vitest.config.ts',
    readFileSync(resolve(repository, 'vitest.config.ts'), 'utf8').replace(
      "setupFiles: ['fake-indexeddb/auto'],",
      ''
    )
  );
  write(
    'vitest.browser.config.ts',
    readFileSync(resolve(repository, 'vitest.browser.config.ts'), 'utf8').replace(
      'defineConfig({',
      `defineConfig({ server: { fs: { allow: [${JSON.stringify(repository)}, ${JSON.stringify(fixture)}] } },`
    )
  );
  symlinkSync(resolve(repository, 'node_modules'), resolve(fixture, 'node_modules'), 'dir');
  write(
    '.gitignore',
    'node_modules\n.fallow/\n**/dist/\nworkers/telemetry/worker-configuration.d.ts\n'
  );
  write(
    'package.json',
    JSON.stringify({
      type: 'module',
      workspaces: ['workers/telemetry'],
      scripts: {
        'shared:build': 'node --eval "0"',
        'server:build': 'node --eval "0"',
        'shared:node-test': 'node shared/tests/node-import.mjs',
      },
    })
  );
  write('package-lock.json', readFileSync(resolve(repository, 'package-lock.json'), 'utf8'));
  write('shared/package.json', readFileSync(resolve(repository, 'shared/package.json'), 'utf8'));
  write(
    'workers/telemetry/package.json',
    readFileSync(resolve(repository, 'workers/telemetry/package.json'), 'utf8')
  );
  write(
    'workers/telemetry/wrangler.jsonc',
    '{"name":"quality-fixture","main":"src/index.ts","compatibility_date":"2026-01-01"}'
  );
  write('src/main.ts', 'export const main = 1;\n');
  write('src/value.ts', 'export const value = 2;\n');
  write('src/zero.ts', 'export function uncalled() { return 3; }\n');
  write('src/types.ts', 'export interface Value { value: number }\n');
  write('shared/src/index.ts', 'export const shared = 3;\n');
  write('server/src/index.ts', 'export const server = 4;\n');
  write('workers/telemetry/src/index.ts', 'export const worker = 5;\n');
  write(
    'shared/tests/node-import.mjs',
    'import assert from "node:assert/strict"; assert.equal(1 + 1, 2);\n'
  );
  for (const [path, source, name, value] of [
    ['tests/value.test.ts', '../src/value.ts', 'value', 2],
    ['tests/browser/value.test.ts', '../../src/main.ts', 'main', 1],
    ['tests/shared/project-contract.test.ts', '../../shared/src/index.ts', 'shared', 3],
    ['tests/shared/product-events.test.ts', '../../shared/src/index.ts', 'shared', 3],
    ['server/tests/value.test.ts', '../src/index.ts', 'server', 4],
    ['tests/workers/telemetry-worker.test.ts', '../../workers/telemetry/src/index.ts', 'worker', 5],
  ] as const)
    write(
      path,
      `import { expect, it } from 'vitest'; import { ${name} } from '${source}'; it('executes ${name}', () => expect(${name}).toBe(${value}));\n`
    );
  git('init', '-q');
  git('config', 'user.email', 'quality@example.invalid');
  git('config', 'user.name', 'Quality fixture');
  git('add', '.');
  git('commit', '-qm', 'fixture base');
  base = git('rev-parse', 'HEAD');
  write('README.md', 'Quality fixture candidate.\n');
  git('add', '.');
  git('commit', '-qm', 'fixture head');
  head = git('rev-parse', 'HEAD');
  const result = cli('verify', '--base', base);
  const logs = readdirSync(resolve(bundle, 'commands'))
    .filter((name) => name.endsWith('.log'))
    .map((name) => readFileSync(resolve(bundle, 'commands', name), 'utf8'))
    .join('\n');
  expect(result, result.text + logs).toMatchObject({ status: 0 });
}, 120_000);

afterAll(() => rmSync(fixture, { recursive: true, force: true }));

describe('public quality evidence CLI', () => {
  it('collects all five real producers and accepts a relocated intact bundle', () => {
    expect(check().status).toBe(0);
    const manifest = JSON.parse(readFileSync(resolve(bundle, 'manifest.json'), 'utf8'));
    expect(manifest.profiles.map((profile: { id: string }) => profile.id)).toEqual([
      'root',
      'browser',
      'shared',
      'server',
      'worker',
    ]);
    const rootMap = JSON.parse(readFileSync(resolve(bundle, 'root/coverage-final.json'), 'utf8'));
    expect(rootMap[resolve(fixture, 'src/main.ts')]).toBeUndefined();
    expect(
      Object.values(rootMap[resolve(fixture, 'src/zero.ts')].s).every((hits) => hits === 0)
    ).toBe(true);
    expect(rootMap[resolve(fixture, 'src/types.ts')].s).toEqual({});
    const relocated = resolve(fixture, '.fallow/downloaded');
    cpSync(bundle, relocated, { recursive: true });
    expect(check(relocated).status).toBe(0);
    expect(readFileSync(resolve(relocated, 'manifest.json'), 'utf8')).toBe(
      readFileSync(resolve(bundle, 'manifest.json'), 'utf8')
    );
  });

  it('rejects absent, malformed, incomplete, foreign, or mixed artifacts', () => {
    expect(check(resolve(fixture, '.fallow/absent')).status).toBe(1);
    for (const [path, replacement] of [
      ['manifest.json', '{'],
      ['root/coverage-final.json', '{}'],
      [
        'root/coverage-final.json',
        readFileSync(resolve(bundle, 'server/coverage-final.json'), 'utf8'),
      ],
      [
        'root/coverage-final.json',
        readFileSync(resolve(bundle, 'root/coverage-final.json'), 'utf8').replaceAll(
          fixture,
          '/foreign/root'
        ),
      ],
      ['commands/root.json', '{}'],
      ['certification.json', '{}'],
    ]) {
      const original = readFileSync(resolve(bundle, path));
      writeFileSync(resolve(bundle, path), replacement);
      expect(check().status, path).toBe(1);
      writeFileSync(resolve(bundle, path), original);
    }
  });

  it('rejects wrong revisions, tool/config/scope identities and changed inputs', () => {
    expect(check(bundle, head).status).toBe(1);
    expect(check(bundle, base, base).status).toBe(1);
    const path = resolve(bundle, 'manifest.json');
    const original = readFileSync(path, 'utf8');
    for (const mutate of [
      (m: any) => {
        m.producer.tools.vitest = '0.0.0';
      },
      (m: any) => {
        m.profiles[0].configs = [];
      },
      (m: any) => {
        m.profiles[0].sources = [];
      },
      (m: any) => {
        m.profiles[0].tests = [];
      },
      (m: any) => {
        m.producer.producerRoot = '/foreign/root';
      },
      (m: any) => {
        m.artifacts['../outside'] = 'invalid';
      },
    ]) {
      const manifest = JSON.parse(original);
      mutate(manifest);
      writeFileSync(path, JSON.stringify(manifest));
      expect(check().status).toBe(1);
      writeFileSync(path, original);
    }
    write('README.md', 'Changed tracked input.');
    expect(check().status).toBe(1);
    git('restore', 'README.md');
    write('new-input.txt', 'Nonignored input.');
    expect(check().status).toBe(1);
    rmSync(resolve(fixture, 'new-input.txt'));
    expect(check().status).toBe(0);
  });

  it('invalidates certification before a failed producer and retains its diagnostics', () => {
    write(
      'tests/value.test.ts',
      "import { it } from 'vitest'; it('fails', () => { throw new Error('producer failure'); });\n"
    );
    git('add', '.');
    git('commit', '-qm', 'failed test producer');
    const result = cli('verify', '--base', base);
    expect(result.status).toBe(1);
    expect(existsSync(resolve(bundle, 'certification.json'))).toBe(false);
    expect(readFileSync(resolve(bundle, 'root/tests.json'), 'utf8')).toContain('producer failure');
  }, 60_000);
});
