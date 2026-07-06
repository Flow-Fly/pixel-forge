import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { openDB } from 'idb';
import type { ProjectFile } from '../../../src/types/project';
import type { ProjectRepository } from '../../../src/services/persistence/project-repository';

function makeProject(name: string, width = 8, height = 8): ProjectFile {
  return {
    version: '3.0.0',
    name,
    width,
    height,
    layers: [],
    frames: [],
    animation: { fps: 12, currentFrameIndex: 0 },
  };
}

let repo: ProjectRepository;

beforeAll(async () => {
  // Seed a pre-multi-project database: one project under the legacy
  // 'current-project' slot — BEFORE the repository module is imported.
  const db = await openDB('pixel-forge-db', 1, {
    upgrade(d) {
      d.createObjectStore('sprites', { keyPath: 'id' });
      d.createObjectStore('settings', { keyPath: 'key' });
    },
  });
  await db.put('sprites', {
    id: 'current-project',
    project: makeProject('Legacy drawing', 32, 32),
    lastModified: 1111,
  });
  db.close();

  ({ projectRepository: repo } = await import(
    '../../../src/services/persistence/indexed-db'
  ));
});

describe('IndexedDbProjectRepository', () => {
  it('adopts the legacy current-project slot as a UUID-keyed project', async () => {
    const all = await repo.list();

    expect(all).toHaveLength(1);
    expect(all[0].id).not.toBe('current-project');
    expect(all[0].name).toBe('Legacy drawing');
    expect(all[0].width).toBe(32);
    expect(all[0].lastModified).toBe(1111);

    // The adopted project became the last-opened one
    expect(await repo.getLastOpenedProjectId()).toBe(all[0].id);

    // And the legacy record is gone
    expect(await repo.load('current-project')).toBeNull();
  });

  it('round-trips a project through save/load', async () => {
    const project = makeProject('Round trip', 16, 24);
    await repo.save('id-roundtrip', project);

    const loaded = await repo.load('id-roundtrip');
    expect(loaded).toEqual(project);
  });

  it('returns null for unknown ids', async () => {
    expect(await repo.load('nope')).toBeNull();
  });

  it('lists projects most recently modified first', async () => {
    await repo.save('id-old', makeProject('Old'));
    await new Promise((r) => setTimeout(r, 5));
    await repo.save('id-new', makeProject('New'));

    const all = await repo.list();
    const oldIdx = all.findIndex((p) => p.id === 'id-old');
    const newIdx = all.findIndex((p) => p.id === 'id-new');
    expect(newIdx).toBeGreaterThanOrEqual(0);
    expect(newIdx).toBeLessThan(oldIdx);
  });

  it('deletes projects (unknown ids are a no-op)', async () => {
    await repo.save('id-doomed', makeProject('Doomed'));
    await repo.delete('id-doomed');
    expect(await repo.load('id-doomed')).toBeNull();

    await expect(repo.delete('never-existed')).resolves.toBeUndefined();
  });

  it('persists the last-opened project id', async () => {
    await repo.setLastOpenedProjectId('id-roundtrip');
    expect(await repo.getLastOpenedProjectId()).toBe('id-roundtrip');
  });
});
