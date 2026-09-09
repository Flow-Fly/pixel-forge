import { posix } from 'node:path';

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// V8 serializes its unbounded end columns (Infinity) as null in JSON.
function location(value) {
  return (
    object(value) &&
    ['start', 'end'].every(
      (edge) =>
        object(value[edge]) &&
        count(value[edge].line) &&
        value[edge].line > 0 &&
        (count(value[edge].column) || (edge === 'end' && value[edge].column === null))
    )
  );
}

export function validateCoverage(map, profile, producerRoot) {
  if (!object(map) || !Object.keys(map).length)
    throw new Error(`${profile.id}: empty or malformed coverage map`);
  const root = producerRoot.replaceAll('\\', '/').replace(/\/$/, '');
  const found = [];
  for (const [key, file] of Object.entries(map)) {
    const path = key.replaceAll('\\', '/');
    if (
      !path.startsWith(`${root}/`) ||
      posix.normalize(path) !== path ||
      !object(file) ||
      file.path !== key
    )
      throw new Error(`${profile.id}: foreign or inconsistent coverage path`);
    found.push(path.slice(root.length + 1));
    validateFileCounters(file, profile.id);
  }
  if (JSON.stringify(found.sort()) !== JSON.stringify(profile.sources))
    throw new Error(
      `${profile.id}: incomplete or wrong-profile source coverage; missing ${profile.sources.filter((path) => !found.includes(path)).join(', ')}; unexpected ${found.filter((path) => !profile.sources.includes(path)).join(', ')}`
    );
}

function validateFileCounters(file, profileId) {
  for (const [counters, mappings] of [
    ['s', 'statementMap'],
    ['f', 'fnMap'],
    ['b', 'branchMap'],
  ]) {
    if (
      !object(file[counters]) ||
      !object(file[mappings]) ||
      JSON.stringify(Object.keys(file[counters]).sort()) !==
        JSON.stringify(Object.keys(file[mappings]).sort())
    )
      throw new Error(`${profileId}: malformed coverage counters`);
    for (const [id, value] of Object.entries(file[counters])) {
      const mapping = file[mappings][id];
      if (counters === 'b') {
        if (
          !Array.isArray(value) ||
          !value.every(count) ||
          !object(mapping) ||
          typeof mapping.type !== 'string' ||
          !location(mapping.loc) ||
          !Array.isArray(mapping.locations) ||
          value.length !== mapping.locations.length ||
          !mapping.locations.every(location)
        )
          throw new Error(`${profileId}: malformed branch coverage`);
      } else if (
        !count(value) ||
        !location(counters === 's' ? mapping : mapping?.loc) ||
        (counters === 'f' && (typeof mapping.name !== 'string' || !location(mapping.decl)))
      ) {
        throw new Error(`${profileId}: malformed statement/function coverage`);
      }
    }
  }
}
