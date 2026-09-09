import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { digest, environment, readJson } from './config.mjs';
import { artifact, artifactDigests, runCommand, same, writeJson } from './bundle.mjs';

function findingLocation(finding) {
  if (typeof finding.path !== 'string') throw new Error('unsupported Fallow finding location');
  return { path: finding.path, line: finding.line ?? 1, column: (finding.col ?? 0) + 1 };
}

function sarifLocation(result) {
  const location = result.locations?.[0]?.physicalLocation;
  if (!location?.artifactLocation?.uri) throw new Error('missing SARIF finding location');
  return {
    path: decodeURI(location.artifactLocation.uri),
    line: location.region?.startLine ?? 1,
    column: location.region?.startColumn ?? 1,
  };
}

function reconcile(audit, sarif, registry, base, head) {
  if (
    audit.kind !== 'audit' ||
    audit.base_ref !== base ||
    !head.startsWith(audit.head_sha) ||
    audit.head_sha.length < 7 ||
    audit.attribution?.gate !== 'new-only'
  )
    throw new Error('Fallow comparison identity mismatch');
  const results = sarif.runs?.flatMap((run) => run.results ?? []);
  if (!Array.isArray(results) || !audit.dead_code) throw new Error('malformed Fallow reports');
  const advisories = [];
  const blockers = [];
  const matched = new Set();
  for (const [category, findings] of Object.entries(audit.dead_code)) {
    if (!Array.isArray(findings) || !findings.length) continue;
    const rule = registry.issue_types.find((entry) => entry.result_key === category);
    if (!rule?.sarif_rule_ids?.length) throw new Error(`unknown Fallow category: ${category}`);
    for (const finding of findings) {
      if (typeof finding.introduced !== 'boolean')
        throw new Error('missing Fallow introduced identity');
      const location = findingLocation(finding);
      const candidates = results.filter(
        (result) =>
          rule.sarif_rule_ids.includes(result.ruleId) &&
          JSON.stringify(sarifLocation(result)) === JSON.stringify(location)
      );
      if (candidates.length !== 1 || matched.has(candidates[0]))
        throw new Error(`ambiguous Fallow severity join: ${category} ${JSON.stringify(location)}`);
      const result = candidates[0];
      matched.add(result);
      if (!['error', 'warning', 'note', 'none'].includes(result.level))
        throw new Error('unknown Fallow severity');
      const entry = {
        id: `${result.ruleId}:${location.path}:${location.line}:${location.column}`,
        category,
        level: result.level,
        introduced: finding.introduced,
        location,
      };
      if (category.startsWith('boundary_') || (finding.introduced && result.level === 'error'))
        blockers.push(entry);
      else if (finding.introduced && result.level !== 'none') advisories.push(entry);
    }
  }
  const heuristicRules = new Set(
    registry.issue_types
      .filter((entry) => ['health', 'dupes'].includes(entry.command))
      .flatMap((entry) => [entry.rule_id, ...(entry.sarif_rule_ids ?? [])])
  );
  for (const result of results)
    if (!matched.has(result) && !heuristicRules.has(result.ruleId))
      throw new Error(`unmatched Fallow result: ${result.ruleId}`);
  for (const finding of audit.complexity?.findings ?? [])
    advisories.push({
      id: `complexity:${finding.path}:${finding.line}:${finding.col}`,
      category: 'complexity',
      introduced: finding.introduced,
      finding,
    });
  for (const group of audit.duplication?.clone_groups ?? [])
    advisories.push({
      id: group.id ?? group.fingerprint,
      category: 'duplication',
      introduced: group.introduced,
      finding: group,
    });
  return {
    policy:
      'introduced non-heuristic errors and all boundaries block; complexity and duplication advisory',
    blockers,
    advisories,
  };
}

function commands(producer, profiles) {
  const fallow = 'node_modules/.bin/fallow';
  const audit = ['audit', '--base', producer.base, '--gate', 'new-only', '--no-cache'];
  return [
    {
      id: 'boundaries',
      command: [fallow, 'dead-code', '--boundary-violations', '--format', 'json', '--no-cache'],
      output: 'boundaries.json',
      allowed: [0, 1],
    },
    {
      id: 'boundary-inventory',
      command: [fallow, 'list', '--boundaries', '--format', 'json'],
      output: 'boundary-inventory.json',
      allowed: [0],
    },
    {
      id: 'runtime-imports',
      command: [
        'node_modules/.bin/eslint',
        'src',
        'shared/src',
        'server/src',
        'workers/telemetry/src',
        'scripts',
      ],
      output: null,
      allowed: [0],
    },
    {
      id: 'audit-json',
      command: [fallow, ...audit, '--format', 'json'],
      output: 'audit.json',
      allowed: [0, 1],
    },
    {
      id: 'audit-sarif',
      command: [fallow, ...audit, '--format', 'sarif'],
      output: 'audit.sarif.json',
      allowed: [0, 1],
    },
    ...profiles.map((profile) => ({
      id: `health-${profile.id}`,
      command: [
        fallow,
        'health',
        '--report-only',
        '--file-scores',
        '--complexity',
        '--max-crap',
        '1',
        '--coverage',
        resolve(producer.producerRoot, '.fallow/quality', profile.id, 'coverage-final.json'),
        '--coverage-root',
        producer.producerRoot,
        '--format',
        'json',
        '--no-cache',
      ],
      output: `${profile.id}/fallow.json`,
      allowed: [0],
    })),
  ];
}

export function collectFallow(root, bundle, manifest) {
  const records = commands(manifest.producer, manifest.profiles).map((item) =>
    runCommand(root, bundle, item.id, item.command, '.', item.allowed, item.output)
  );
  const registry = readJson(resolve(root, 'node_modules/fallow/issue-registry.json'));
  const review = reconcile(
    readJson(resolve(bundle, 'audit.json')),
    readJson(resolve(bundle, 'audit.sarif.json')),
    registry,
    manifest.producer.base,
    manifest.producer.head
  );
  writeJson(resolve(bundle, 'review.json'), review);
  const paths = ['review.json'];
  for (const record of records)
    paths.push(record.log, `commands/${record.id}.json`, ...(record.output ? [record.output] : []));
  manifest.fallow = {
    registry: digest(readFileSync(resolve(root, 'node_modules/fallow/issue-registry.json'))),
    records,
    review,
  };
  manifest.artifacts = artifactDigests(bundle, [...Object.keys(manifest.artifacts), ...paths]);
  writeJson(resolve(bundle, 'manifest.json'), manifest);
}

export function validateFallow(root, bundle, manifest) {
  if (!manifest.fallow) throw new Error('missing Fallow evidence');
  const { records, review } = manifest.fallow;
  same(
    manifest.fallow.registry,
    digest(readFileSync(resolve(root, 'node_modules/fallow/issue-registry.json'))),
    'Fallow registry'
  );
  const expected = commands(manifest.producer, manifest.profiles);
  same(
    records.map(({ id, command, output }) => ({ id, command, output })),
    expected.map(({ id, command, output }) => ({ id, command, output })),
    'Fallow command inventory'
  );
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    same(record.cwd, '.', 'constraint working directory');
    same(record.environment, environment, 'constraint environment');
    same(record.log, `commands/${record.id}.log`, 'constraint log');
    if (
      !Number.isFinite(record.durationMs) ||
      record.durationMs < 0 ||
      !Number.isFinite(Date.parse(record.startedAt))
    )
      throw new Error('invalid constraint timing');
    if (!expected[index].allowed.includes(record.status) || record.error)
      throw new Error(`${record.id}: failed constraint producer`);
    same(readJson(artifact(bundle, `commands/${record.id}.json`)), record, 'Fallow command record');
    for (const path of [
      record.log,
      `commands/${record.id}.json`,
      ...(record.output ? [record.output] : []),
    ])
      if (!manifest.artifacts[path]) throw new Error(`missing constraint artifact: ${path}`);
  }
  const boundaries = readJson(artifact(bundle, 'boundaries.json'));
  if (boundaries.kind !== 'dead-code' || boundaries.total_issues !== 0)
    throw new Error('runtime boundary violation');
  const inventory = readJson(artifact(bundle, 'boundary-inventory.json'));
  const configured = readJson(resolve(root, '.fallowrc.json')).boundaries;
  same(
    inventory.boundaries.zones.map(({ name, patterns }) => ({ name, patterns })),
    configured.zones,
    'Fallow zone inventory'
  );
  for (const profile of manifest.profiles) {
    const health = readJson(artifact(bundle, `${profile.id}/fallow.json`));
    if (
      health.kind !== 'health' ||
      health.error ||
      health.version !== manifest.producer.tools.fallow ||
      health.summary?.coverage_model !== 'istanbul' ||
      typeof health.summary?.coverage_source_consistency !== 'string' ||
      !Number.isInteger(health.summary?.istanbul_matched) ||
      !Number.isInteger(health.summary?.istanbul_total)
    )
      throw new Error(`${profile.id}: malformed Fallow provenance`);
  }
  const reconciled = reconcile(
    readJson(artifact(bundle, 'audit.json')),
    readJson(artifact(bundle, 'audit.sarif.json')),
    readJson(resolve(root, 'node_modules/fallow/issue-registry.json')),
    manifest.producer.base,
    manifest.producer.head
  );
  same(review, reconciled, 'Fallow acceptance policy');
  same(readJson(artifact(bundle, 'review.json')), review, 'separate Fallow review');
  if (review.blockers.length)
    throw new Error(
      `required Fallow findings: ${review.blockers.map((finding) => finding.id).join(', ')}`
    );
}
