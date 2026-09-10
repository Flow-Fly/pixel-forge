import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coverageCommand, digest, git, identity, profiles } from './quality/config.mjs';
import {
  producerIdentity,
  runCommand,
  same,
  saveManifest,
  validateBundle,
  writeJson,
} from './quality/bundle.mjs';
import { collectFallow, validateFallow } from './quality/fallow.mjs';
import { validateCoverage } from './quality/coverage.mjs';

const root = process.cwd();
const [action, ...args] = process.argv.slice(2);
let bundle = resolve(root, '.fallow/quality');
try {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (
      !['--base', '--head', '--bundle'].includes(args[index]) ||
      !args[index + 1] ||
      options[args[index]]
    )
      throw new Error('invalid quality command arguments');
    options[args[index]] = args[index + 1];
  }
  if (action === 'test') {
    if (args.length) throw new Error('quality:test takes no arguments');
    runCommand(root, bundle, 'quality-test', [
      'node_modules/.bin/vitest',
      'run',
      'tests/scripts/quality-evidence.test.ts',
      'tests/scripts/quality-boundaries.test.ts',
    ]);
  } else if (action === 'check') {
    bundle = resolve(root, options['--bundle'] ?? '.fallow/quality');
    const manifest = validateBundle(root, bundle, options['--base'], options['--head']);
    validateFallow(root, bundle, manifest);
    console.log(`Accepted quality evidence for ${options['--head']}`);
  } else if (action === 'verify') {
    if (options['--bundle'] || options['--head'])
      throw new Error('quality:verify takes only --base');
    mkdirSync(bundle, { recursive: true });
    rmSync(resolve(bundle, 'certification.json'), { force: true });
    const producer = producerIdentity(root, options['--base']);
    const profileList = profiles(producer.inputs);
    writeJson(resolve(bundle, 'identity.json'), producer);
    writeJson(resolve(bundle, 'profiles.json'), profileList);
    const commands = [];
    commands.push(runCommand(root, bundle, 'shared-build', ['npm', 'run', 'shared:build']));
    commands.push(runCommand(root, bundle, 'server-build', ['npm', 'run', 'server:build']));
    for (const profile of profileList) {
      console.log(`Collecting ${profile.id} (${profile.runtime})`);
      commands.push(
        runCommand(root, bundle, profile.id, coverageCommand(profile, bundle), profile.cwd)
      );
      validateCoverage(
        JSON.parse(readFileSync(resolve(bundle, profile.id, 'coverage-final.json'), 'utf8')),
        profile,
        root
      );
    }
    commands.push(runCommand(root, bundle, 'shared-node', ['npm', 'run', 'shared:node-test']));
    same(
      identity(root),
      { head: producer.head, dirty: producer.dirty, inputs: producer.inputs },
      'post-run checkout'
    );
    const manifest = saveManifest(bundle, producer, profileList, commands);
    collectFallow(root, bundle, manifest);
    validateFallow(root, bundle, manifest);
    same(
      identity(root),
      { head: producer.head, dirty: producer.dirty, inputs: producer.inputs },
      'post-constraint checkout'
    );
    validateBundle(root, bundle, producer.base, producer.head, false);
    writeJson(resolve(bundle, 'certification.json'), {
      base: producer.base,
      head: producer.head,
      manifest: digest(readFileSync(resolve(bundle, 'manifest.json'))),
    });
    console.log(`Certified quality evidence for ${git(root, 'rev-parse', 'HEAD')}`);
  } else {
    throw new Error('expected verify, check, or test');
  }
} catch (error) {
  if (action === 'verify') {
    mkdirSync(bundle, { recursive: true });
    writeFileSync(resolve(bundle, 'failure.log'), `${error.stack}\n`);
  }
  console.error(error.message);
  process.exitCode = 1;
}
