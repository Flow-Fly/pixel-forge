import { createHash } from 'node:crypto';
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
  write(
    'src/zero.ts',
    'export function uncalled(flag: boolean) { if (flag) return 1; return 3; }\n'
  );
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
  const fallow = JSON.parse(readFileSync(resolve(fixture, '.fallowrc.json'), 'utf8'));
  fallow.entry.push('scripts/fixture-entry.mjs');
  fallow.rules = { 'unused-exports': 'warn', 'unresolved-imports': 'error' };
  write('.fallowrc.json', JSON.stringify(fallow));
  write(
    'scripts/fixture-entry.mjs',
    "import { used } from './fixture-lib.mjs'; console.log(used);\n"
  );
  write('scripts/fixture-lib.mjs', 'export function used() { return 1; }\n');
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
}, 300_000);

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
    const branches = Object.values(rootMap[resolve(fixture, 'src/zero.ts')].branchMap) as any[];
    expect(
      branches.some(
        (branch) => JSON.stringify(branch.locations[1]) === JSON.stringify({ start: {}, end: {} })
      )
    ).toBe(true);
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

  it('validates coverage structure even when a changed artifact has a matching digest', () => {
    const path = 'root/coverage-final.json';
    const original = readFileSync(resolve(bundle, path), 'utf8');
    const savedManifest = readFileSync(resolve(bundle, 'manifest.json'), 'utf8');
    const map = JSON.parse(original);
    const incomplete = { ...map };
    delete incomplete[resolve(fixture, 'src/zero.ts')];
    const malformedBranch = JSON.parse(original);
    const firstBranch = Object.values(
      malformedBranch[resolve(fixture, 'src/zero.ts')].branchMap
    )[0] as any;
    firstBranch.locations[0] = { start: {}, end: {} };
    const malformed = JSON.parse(original);
    malformed[resolve(fixture, 'src/value.ts')].s = { 0: -1 };
    for (const [replacement, message] of [
      ['{}', 'empty or malformed'],
      [JSON.stringify(incomplete), 'incomplete or wrong-profile'],
      [JSON.stringify(malformed), 'malformed'],
      [JSON.stringify(malformedBranch), 'malformed branch'],
      [original.replaceAll(fixture, '/foreign/root'), 'foreign'],
      [readFileSync(resolve(bundle, 'server/coverage-final.json'), 'utf8'), 'wrong-profile'],
    ]) {
      writeFileSync(resolve(bundle, path), replacement);
      const manifest = JSON.parse(savedManifest);
      manifest.artifacts[path] = createHash('sha256').update(replacement).digest('hex');
      writeFileSync(resolve(bundle, 'manifest.json'), JSON.stringify(manifest));
      const result = check();
      expect(result.status).toBe(1);
      expect(result.text).toContain(message);
    }
    writeFileSync(resolve(bundle, path), original);
    writeFileSync(resolve(bundle, 'manifest.json'), savedManifest);
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

  it('refuses a committed lockfile that disagrees with the installed tool', () => {
    const original = readFileSync(resolve(fixture, 'package-lock.json'), 'utf8');
    const lock = JSON.parse(original);
    lock.packages['node_modules/vitest'].version = '0.0.0';
    write('package-lock.json', JSON.stringify(lock));
    git('add', '.');
    git('commit', '-qm', 'contradictory tool lock');
    const result = cli('verify', '--base', base);
    expect(result.status).toBe(1);
    expect(result.text).toContain('installed tool does not match package-lock.json');
    expect(existsSync(resolve(bundle, 'certification.json'))).toBe(false);
    write('package-lock.json', original);
    git('add', '.');
    git('commit', '-qm', 'restore tool lock');
    head = git('rev-parse', 'HEAD');
  });

  it('preserves new-only required errors while native complexity errors stay advisory', () => {
    const commit = (source: string) => {
      write('scripts/fixture-lib.mjs', source);
      git('add', '.');
      git('commit', '-qm', 'audit fixture');
      head = git('rev-parse', 'HEAD');
    };
    commit('export function used() { return 1; }\nexport const unused = 2;\n');
    let result = cli('verify', '--base', base);
    expect(result, result.text).toMatchObject({ status: 0 });
    expect(
      JSON.parse(readFileSync(resolve(bundle, 'review.json'), 'utf8')).advisories.some(
        (finding: any) => finding.category === 'unused_exports'
      )
    ).toBe(true);
    commit("import { missing } from './missing.js';\nexport function used() { return missing; }\n");
    result = cli('verify', '--base', base);
    expect(result.status).toBe(1);
    expect(result.text).toContain('required Fallow findings');
    const inheritedBase = head;
    commit(
      "import { missing } from './missing.js';\nexport function used() { return missing; }\nexport const unused = 2;\n"
    );
    result = cli('verify', '--base', inheritedBase);
    expect(result, result.text).toMatchObject({ status: 0 });
    const review = JSON.parse(readFileSync(resolve(bundle, 'review.json'), 'utf8'));
    expect(review.blockers).toEqual([]);
    expect(review.advisories.some((finding: any) => finding.category === 'unused_exports')).toBe(
      true
    );
    commit(
      `export function used(value) {\n${Array.from({ length: 25 }, (_, index) => `if (value === ${index}) return ${index};`).join('\n')}\nreturn -1;\n}\n`
    );
    result = cli('verify', '--base', base);
    expect(result, result.text).toMatchObject({ status: 0 });
    expect(JSON.parse(readFileSync(resolve(bundle, 'audit.json'), 'utf8')).verdict).toBe('fail');
    expect(
      JSON.parse(readFileSync(resolve(bundle, 'review.json'), 'utf8')).advisories.some(
        (finding: any) => finding.category === 'complexity'
      )
    ).toBe(true);
    const sarifPath = resolve(bundle, 'audit.sarif.json');
    const sarif = JSON.parse(readFileSync(sarifPath, 'utf8'));
    const nativeResult = sarif.runs
      .flatMap((run: any) => run.results ?? [])
      .find((result: any) => result.ruleId === 'fallow/high-crap-score');
    expect(nativeResult.level).toBe('error');
    nativeResult.ruleId = 'fallow/css-broken-reference';
    const changedSarif = JSON.stringify(sarif);
    writeFileSync(sarifPath, changedSarif);
    const manifest = JSON.parse(readFileSync(resolve(bundle, 'manifest.json'), 'utf8'));
    manifest.artifacts['audit.sarif.json'] = createHash('sha256')
      .update(changedSarif)
      .digest('hex');
    const changedManifest = JSON.stringify(manifest);
    writeFileSync(resolve(bundle, 'manifest.json'), changedManifest);
    writeFileSync(
      resolve(bundle, 'certification.json'),
      JSON.stringify({
        base,
        head,
        manifest: createHash('sha256').update(changedManifest).digest('hex'),
      })
    );
    result = check();
    expect(result.status).toBe(1);
    expect(result.text).toContain('unmatched Fallow result: fallow/css-broken-reference');
  }, 600_000);

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
