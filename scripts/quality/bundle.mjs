import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { platform, arch } from 'node:os';
import {
  coverageCommand,
  digest,
  environment,
  git,
  identity,
  profiles,
  readJson,
  toolsIdentity,
} from './config.mjs';
import { validateCoverage } from './coverage.mjs';

export const writeJson = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
export function same(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} mismatch`);
}

export function exactRevision(root, base, head) {
  if (!/^[a-f0-9]{40}$/.test(base ?? '') || !/^[a-f0-9]{40}$/.test(head ?? ''))
    throw new Error('base and head must be exact commit SHAs');
  same(git(root, 'rev-parse', `${base}^{commit}`), base, 'base');
  same(git(root, 'rev-parse', 'HEAD'), head, 'head');
  git(root, 'merge-base', '--is-ancestor', base, head);
}

export function runCommand(root, bundle, id, command, cwd = '.', allowed = [0], output = null) {
  mkdirSync(resolve(bundle, 'commands'), { recursive: true });
  const log = `commands/${id}.log`;
  const descriptor = openSync(resolve(bundle, log), 'w');
  const outputDescriptor = output ? openSync(resolve(bundle, output), 'w') : descriptor;
  const commandEnvironment = id === 'worker' ? { ...environment, INIT_CWD: root } : environment;
  const startedAt = new Date().toISOString();
  const start = Date.now();
  let result;
  try {
    result = spawnSync(command[0], command.slice(1), {
      cwd: resolve(root, cwd),
      env: { ...process.env, ...commandEnvironment },
      stdio: ['ignore', outputDescriptor, descriptor],
    });
  } finally {
    closeSync(descriptor);
    if (output) closeSync(outputDescriptor);
  }
  const record = {
    id,
    command,
    cwd,
    environment: commandEnvironment,
    startedAt,
    durationMs: Date.now() - start,
    status: result.status,
    error: result.error?.message ?? null,
    log,
    output,
  };
  writeJson(resolve(bundle, `commands/${id}.json`), record);
  if (result.error || !allowed.includes(result.status))
    throw new Error(`${id} failed (${result.status}); see ${log}`);
  return record;
}

export function producerIdentity(root, base) {
  const inputs = identity(root);
  if (inputs.dirty) throw new Error('quality evidence requires a clean committed checkout');
  exactRevision(root, base, inputs.head);
  return {
    ...inputs,
    base,
    producerRoot: root,
    producerOS: `${platform()}/${arch()}`,
    node: process.version,
    npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
    tools: toolsIdentity(root),
  };
}

export function artifact(bundle, path) {
  if (typeof path !== 'string' || isAbsolute(path) || path.split(/[\\/]/).includes('..'))
    throw new Error('artifact path escapes bundle');
  const absolute = resolve(bundle, path);
  const located = relative(realpathSync(bundle), realpathSync(absolute));
  if (located.startsWith(`..${sep}`) || isAbsolute(located))
    throw new Error('artifact path escapes bundle');
  return absolute;
}

export function artifactDigests(bundle, paths) {
  return Object.fromEntries(
    [...new Set(paths)].sort().map((path) => [path, digest(readFileSync(artifact(bundle, path)))])
  );
}

export function validateBundle(root, bundle, base, head, certification = true) {
  exactRevision(root, base, head);
  const manifest = readJson(resolve(bundle, 'manifest.json'));
  const current = identity(root);
  if (current.dirty) throw new Error('checkout inputs changed: dirty tree');
  const expectedProfiles = profiles(current.inputs);
  const producer = manifest.producer;
  same(producer.base, base, 'base');
  same(producer.head, head, 'head');
  same(producer.inputs, current.inputs, 'input inventory');
  same(producer.dirty, '', 'producer dirty state');
  same(producer.tools, toolsIdentity(root), 'installed tools');
  if (
    typeof producer.producerRoot !== 'string' ||
    !isAbsolute(producer.producerRoot) ||
    !producer.producerOS ||
    !/^v\d/.test(producer.node) ||
    !/^\d/.test(producer.npm)
  )
    throw new Error('incomplete producer identity');
  same(manifest.schema, 1, 'bundle schema');
  same(readJson(artifact(bundle, 'identity.json')), producer, 'separate identity');
  same(manifest.profiles, expectedProfiles, 'profile configuration/source/test scope');
  same(readJson(artifact(bundle, 'profiles.json')), manifest.profiles, 'separate profiles');
  same(
    manifest.artifacts,
    artifactDigests(bundle, Object.keys(manifest.artifacts)),
    'artifact digests'
  );
  const requiredCommands = [
    { id: 'shared-build', command: ['npm', 'run', 'shared:build'], cwd: '.' },
    { id: 'server-build', command: ['npm', 'run', 'server:build'], cwd: '.' },
    ...expectedProfiles.map((profile) => ({
      id: profile.id,
      command: coverageCommand(profile, resolve(producer.producerRoot, '.fallow/quality')),
      cwd: profile.cwd,
    })),
    { id: 'shared-node', command: ['npm', 'run', 'shared:node-test'], cwd: '.' },
  ];
  same(
    manifest.commands.map(({ id, command, cwd }) => ({ id, command, cwd })),
    requiredCommands,
    'producer commands'
  );
  const requiredArtifacts = ['identity.json', 'profiles.json'];
  for (const record of manifest.commands) {
    same(record.status, 0, `${record.id} result`);
    same(record.error, null, `${record.id} error`);
    same(
      record.environment,
      record.id === 'worker' ? { ...environment, INIT_CWD: producer.producerRoot } : environment,
      `${record.id} environment`
    );
    same(record.log, `commands/${record.id}.log`, 'command log');
    if (
      !Number.isFinite(record.durationMs) ||
      record.durationMs < 0 ||
      !Number.isFinite(Date.parse(record.startedAt))
    )
      throw new Error('invalid command timing');
    same(readJson(artifact(bundle, `commands/${record.id}.json`)), record, 'separate command');
    requiredArtifacts.push(record.log, `commands/${record.id}.json`);
  }
  for (const profile of expectedProfiles) {
    const path = `${profile.id}/coverage-final.json`;
    requiredArtifacts.push(path, `${profile.id}/coverage-summary.json`, `${profile.id}/tests.json`);
    validateCoverage(readJson(artifact(bundle, path)), profile, producer.producerRoot);
    const tests = readJson(artifact(bundle, `${profile.id}/tests.json`));
    if (
      !tests.success ||
      tests.numFailedTests ||
      !tests.numTotalTests ||
      !tests.numPassedTests ||
      !Array.isArray(tests.testResults)
    )
      throw new Error(`${profile.id}: failed or absent test results`);
    const executed = tests.testResults
      .map((test) => {
        const path = test.name.replaceAll('\\', '/');
        if (!path.startsWith(`${producer.producerRoot}/`))
          throw new Error(`${profile.id}: foreign test result`);
        return path.slice(producer.producerRoot.length + 1);
      })
      .sort();
    same(executed, profile.tests, `${profile.id} executed tests`);
  }
  for (const path of requiredArtifacts)
    if (!manifest.artifacts[path]) throw new Error(`missing artifact digest: ${path}`);
  if (certification)
    same(
      readJson(artifact(bundle, 'certification.json')),
      { base, head, manifest: digest(readFileSync(resolve(bundle, 'manifest.json'))) },
      'certification'
    );
  return manifest;
}

export function saveManifest(bundle, producer, profileList, commands) {
  const paths = ['identity.json', 'profiles.json'];
  for (const command of commands) paths.push(command.log, `commands/${command.id}.json`);
  for (const profile of profileList)
    paths.push(
      `${profile.id}/coverage-final.json`,
      `${profile.id}/coverage-summary.json`,
      `${profile.id}/tests.json`
    );
  const manifest = {
    schema: 1,
    producer,
    profiles: profileList,
    commands,
    artifacts: artifactDigests(bundle, paths),
  };
  writeJson(resolve(bundle, 'manifest.json'), manifest);
  return manifest;
}
