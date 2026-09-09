import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const git = (root, ...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
export const environment = { CI: 'true', FORCE_COLOR: '0' };

export function identity(root) {
  const paths = [
    ...new Set(
      git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard')
        .split('\0')
        .filter(Boolean)
    ),
  ].sort();
  return {
    head: git(root, 'rev-parse', 'HEAD'),
    dirty: git(root, 'status', '--porcelain', '--untracked-files=all'),
    inputs: paths.map((path) => ({ path, sha256: digest(readFileSync(resolve(root, path))) })),
  };
}

export function toolsIdentity(root) {
  const packages = [
    'vitest',
    '@vitest/coverage-v8',
    '@vitest/browser-playwright',
    'playwright',
    'fallow',
    'eslint',
    'typescript',
    'wrangler',
  ];
  const locked = readJson(resolve(root, 'package-lock.json')).packages;
  return Object.fromEntries(
    packages.map((name) => {
      const installed = readJson(resolve(root, 'node_modules', name, 'package.json')).version;
      if (installed !== locked?.[`node_modules/${name}`]?.version)
        throw new Error(`${name}: installed tool does not match package-lock.json`);
      return [name, installed];
    })
  );
}

export function profiles(inputs) {
  const paths = inputs.map((input) => input.path);
  const source = (prefix) =>
    paths.filter(
      (path) => path.startsWith(prefix) && path.endsWith('.ts') && !path.endsWith('.d.ts')
    );
  const tests = paths.filter((path) => path.endsWith('.test.ts'));
  const definitions = [
    {
      id: 'root',
      runtime: 'Node/happy-dom',
      cwd: '.',
      command: ['node_modules/.bin/vitest', 'run', '--maxWorkers=2'],
      config: ['vitest.config.ts'],
      include: 'src/**/*.ts',
      exclude: ['**/*.d.ts', 'src/**/*.test.ts', 'src/main.ts'],
      sources: source('src/').filter((p) => p !== 'src/main.ts' && !p.endsWith('.test.ts')),
      tests: tests.filter((p) => p.startsWith('tests/') && !p.startsWith('tests/browser/')),
      testSelection: ['tests/**/*.test.ts'],
      testExclusions: ['tests/browser/**/*.test.ts'],
    },
    {
      id: 'browser',
      runtime: 'Chromium/Playwright',
      cwd: '.',
      command: ['node_modules/.bin/vitest', 'run', '--config', 'vitest.browser.config.ts'],
      config: ['vitest.browser.config.ts'],
      include: 'src/**/*.ts',
      exclude: ['**/*.d.ts'],
      sources: source('src/'),
      tests: tests.filter((p) => p.startsWith('tests/browser/')),
      testSelection: ['tests/browser/**/*.test.ts'],
      testExclusions: [],
    },
    {
      id: 'shared',
      runtime: 'Node/happy-dom',
      cwd: '.',
      command: [
        'node_modules/.bin/vitest',
        'run',
        'tests/shared/project-contract.test.ts',
        'tests/shared/product-events.test.ts',
      ],
      config: ['vitest.config.ts', 'shared/package.json'],
      include: 'shared/src/**/*.ts',
      exclude: ['**/*.d.ts'],
      sources: source('shared/src/'),
      tests: ['tests/shared/product-events.test.ts', 'tests/shared/project-contract.test.ts'],
      testSelection: [
        'tests/shared/project-contract.test.ts',
        'tests/shared/product-events.test.ts',
      ],
      testExclusions: [],
    },
    {
      id: 'server',
      runtime: 'Node',
      cwd: 'server',
      command: ['../node_modules/.bin/vitest', 'run', '--config', 'vitest.config.ts'],
      config: ['server/vitest.config.ts'],
      include: 'src/**/*.ts',
      exclude: ['**/*.d.ts'],
      sources: source('server/src/'),
      tests: tests.filter(
        (p) => p.startsWith('server/tests/') && !/\.(database|storage)\.test\.ts$/.test(p)
      ),
      testSelection: ['server/tests/**/*.test.ts'],
      testExclusions: ['server/tests/**/*.database.test.ts', 'server/tests/**/*.storage.test.ts'],
    },
    {
      id: 'worker',
      runtime: 'Node/happy-dom; mocked Worker bindings, not workerd',
      cwd: '.',
      command: ['npm', 'run', 'test', '--workspace', '@pixel-forge/telemetry-worker', '--'],
      config: [
        'vitest.config.ts',
        'workers/telemetry/package.json',
        'workers/telemetry/wrangler.jsonc',
      ],
      include: 'workers/telemetry/src/**/*.ts',
      exclude: ['**/*.d.ts'],
      sources: source('workers/telemetry/src/'),
      tests: ['tests/workers/telemetry-worker.test.ts'],
      testSelection: ['tests/workers/telemetry-worker.test.ts'],
      testExclusions: [],
    },
  ];
  return definitions.map((profile) => ({
    ...profile,
    sources: profile.sources.sort(),
    tests: profile.tests.sort(),
    environment,
    provider: 'v8',
    format: 'istanbul',
    configs: profile.config.map((path) => inputs.find((input) => input.path === path)),
  }));
}

export function coverageCommand(profile, bundle) {
  return [
    ...profile.command,
    '--reporter=json',
    `--outputFile=${resolve(bundle, profile.id, 'tests.json')}`,
    '--coverage.enabled',
    '--coverage.excludeAfterRemap',
    '--coverage.provider=v8',
    '--coverage.reporter=json',
    '--coverage.reporter=json-summary',
    `--coverage.include=${resolve(bundle, '../..', profile.cwd, profile.include)}`,
    ...profile.exclude.map((path) => `--coverage.exclude=${path}`),
    `--coverage.reportsDirectory=${resolve(bundle, profile.id)}`,
  ];
}
