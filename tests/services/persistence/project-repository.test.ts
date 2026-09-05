import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { openDB } from 'idb';
import type { ProjectFile } from '../../../src/types/project';
import {
  ProjectAlreadyExistsError,
  type ProjectRepository,
} from '../../../src/services/persistence/project-repository';
import type { CreativeRunRecoveryRecord } from '../../../src/editor/creative-run-recovery';
import { decodeProjectFile, type ProjectFileInput } from '../../../src/types/project';

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

function makeLegacyProject(name: string): ProjectFileInput {
  return {
    version: '1.0.0',
    name,
    width: 2,
    height: 2,
    layers: [{
      id: 'legacy-layer',
      name: 'Legacy layer',
      visible: true,
      opacity: 255,
      data: new Uint8Array(4),
    }],
    frames: [{
      id: 'legacy-frame',
      duration: 100,
      cels: [{ layerId: 'legacy-layer', data: new Uint8Array(4) }],
    }],
    animation: { fps: 12, currentFrameIndex: 0 },
  };
}

function makeCurrentProject(name: string): ProjectFile {
  return {
    version: '4.3.0',
    name,
    width: 2,
    height: 2,
    palette: ['#000000'],
    paletteEntries: [{ id: 'current-black', color: '#000000' }],
    layers: [{
      id: 'current-layer',
      name: 'Current layer',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 255,
      parentId: null,
      data: new Uint8Array(4),
    }],
    frames: [{
      id: 'current-frame',
      duration: 100,
      cels: [{ id: 'current-cel', layerId: 'current-layer', data: new Uint8Array(4), opacity: 100 }],
    }],
    animation: { fps: 12, currentFrameIndex: 0 },
  };
}

let repo: ProjectRepository;
let recoveryPersistence: {
  load(runId: string): Promise<CreativeRunRecoveryRecord | null>;
  save(record: CreativeRunRecoveryRecord): Promise<void>;
};

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

  ({ projectRepository: repo, creativeRunRecoveryPersistence: recoveryPersistence } = await import(
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

  it('creates fresh records atomically without overwriting a collision', async () => {
    const original = makeProject('Original');
    await repo.create('id-create-only', original);

    await expect(repo.create('id-create-only', makeProject('Replacement'))).rejects.toBeInstanceOf(
      ProjectAlreadyExistsError
    );
    expect(await repo.load('id-create-only')).toEqual(original);
  });

  it('stores thumbnails as metadata without changing the project file', async () => {
    const project = makeProject('With thumbnail', 16, 24);
    const thumbnail = new Uint8Array([137, 80, 78, 71]);
    await repo.save('id-thumbnail', project, { thumbnail });

    const meta = (await repo.list()).find(
      (projectMeta) => projectMeta.id === 'id-thumbnail'
    );
    expect(meta?.thumbnail).toEqual(thumbnail);
    expect(await repo.load('id-thumbnail')).toEqual(project);
  });

  it('preserves thumbnails when callers save project data without a new one', async () => {
    const thumbnail = new Uint8Array([1, 2, 3]);
    await repo.save('id-preserve-thumbnail', makeProject('Original'), {
      thumbnail,
    });
    await repo.save('id-preserve-thumbnail', makeProject('Renamed'));

    const meta = (await repo.list()).find(
      (projectMeta) => projectMeta.id === 'id-preserve-thumbnail'
    );
    expect(meta?.name).toBe('Renamed');
    expect(meta?.thumbnail).toEqual(thumbnail);
  });

  it('adds the recovery store without replacing projects or settings', async () => {
    const db = await openDB('pixel-forge-db', 2);
    expect(db.objectStoreNames.contains('sprites')).toBe(true);
    expect(db.objectStoreNames.contains('settings')).toBe(true);
    expect(db.objectStoreNames.contains('creativeRunRecovery')).toBe(true);
    expect(await repo.load('current-project')).toBeNull();
    expect((await repo.list()).some((item) => item.name === 'Legacy drawing')).toBe(true);
    expect(await repo.getLastOpenedProjectId()).toBeTruthy();
    db.close();
  });

  it('round-trips a bounded recovery record with its Project File bytes', async () => {
    const record = {
      schemaVersion: 1,
      runId: 'persisted-run',
      sessionId: 'persisted-session',
      target: { projectId: 'persisted-project' },
      brief: {
        runId: 'persisted-run',
        revision: 1,
        targetId: 'persisted-project',
        targetName: 'Persisted project',
        goal: 'Goal',
        constraints: [],
        requestedWriteCategories: ['structure'] as const,
        transactionLimit: 1,
        durationSeconds: 10,
        contentEgress: 'local-only' as const,
      },
      approvedBriefRevision: 1,
      phase: 'ready',
      status: 'active' as const,
      outcome: null,
      reason: null,
      currentRevision: 0,
      lastDurableRevision: 0,
      checkpoint: {
        schemaVersion: 1,
        runId: 'persisted-run',
        target: { projectId: 'persisted-project' },
        sourceRevision: 0,
        sourceDigest: 'a'.repeat(64),
        project: makeProject('Checkpoint'),
      },
      transactions: [],
      timeline: [{ sequence: 1, kind: 'checkpoint' as const }],
      collapsedEventCount: 0,
      recoveryCopyId: null,
    } satisfies CreativeRunRecoveryRecord;

    await recoveryPersistence.save(record);
    expect(await recoveryPersistence.load(record.runId)).toEqual(record);
  });

  it('keeps legacy and current Project Files compatible across the additive upgrade', async () => {
    const legacy = makeLegacyProject('Legacy compatible');
    const current = makeCurrentProject('Current compatible');
    await repo.save('legacy-compatible', legacy as unknown as ProjectFile);
    await repo.save('current-compatible', current);

    const legacyLoaded = await repo.load('legacy-compatible');
    const currentLoaded = await repo.load('current-compatible');
    if (!legacyLoaded || !currentLoaded) throw new Error('Expected both compatible projects.');
    expect(decodeProjectFile(legacyLoaded)).toMatchObject({
      name: 'Legacy compatible',
      layers: [{ type: 'image', locked: false, parentId: null }],
      frames: [{ cels: [{ id: expect.any(String), opacity: 100 }] }],
    });
    expect(decodeProjectFile(currentLoaded)).toEqual(current);
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

  it('persists workspace state and mirrors the active project as last-opened', async () => {
    await repo.setWorkspaceState({
      openProjectIds: ['project-a', 'project-b'],
      activeProjectId: 'project-b',
    });

    expect(await repo.getWorkspaceState()).toEqual({
      openProjectIds: ['project-a', 'project-b'],
      activeProjectId: 'project-b',
    });
    expect(await repo.getLastOpenedProjectId()).toBe('project-b');
  });
});
