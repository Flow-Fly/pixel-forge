import { describe, expect, it } from 'vitest';
import {
  CreativeRunRecoveryCoordinator,
  digestProjectFile,
  type CreativeRunRecoveryHistoryEntry,
  type CreativeRunRecoveryPersistence,
  type CreativeRunRecoveryTarget,
} from '../../src/editor/creative-run-recovery';
import type { CreativeBrief } from '../../src/editor/creative-run';
import type { ProjectFile } from '../../src/types/project';
import { ProjectAlreadyExistsError } from '../../src/services/persistence/project-repository';

const brief: CreativeBrief = {
  runId: 'run-587',
  revision: 1,
  targetId: 'project-587',
  targetName: 'Original project',
  goal: 'Make a title card',
  constraints: [],
  requestedWriteCategories: ['structure'],
  transactionLimit: 5,
  durationSeconds: 60,
  contentEgress: 'local-only',
};

function project(name = 'Original project'): ProjectFile {
  return {
    version: '4.3.0',
    name,
    width: 8,
    height: 8,
    palette: ['#000000'],
    paletteEntries: [{ id: 'black', color: '#000000' }],
    layers: [],
    frames: [],
    animation: { fps: 12, currentFrameIndex: 0 },
    tags: [],
  };
}

function provenance(operationId: string, fromRevision: number, toRevision: number) {
  return {
    source: 'automation' as const,
    transactionId: operationId,
    clientId: 'Creative Run',
    sessionId: 'session-587',
    runId: brief.runId,
    operationId,
    target: { projectId: brief.targetId },
    fromRevision,
    toRevision,
    transitionCount: 1,
    transitionsTruncated: false,
    transitions: [],
    children: [],
  };
}

function createPersistence() {
  let record: Parameters<CreativeRunRecoveryPersistence['save']>[0] | null = null;
  let fail = false;
  const persistence: CreativeRunRecoveryPersistence = {
    load: async () => (record ? structuredClone(record) : null),
    save: async (next) => {
      if (fail) throw new Error('persistence unavailable');
      record = structuredClone(next);
    },
  };
  return {
    persistence,
    setFail(value: boolean) {
      fail = value;
    },
    getRecord() {
      return record;
    },
  };
}

function createTarget() {
  let current = project();
  let revision = 0;
  const copies = new Map<string, ProjectFile>();
  const undoOrder: string[] = [];
  const historyEntries: CreativeRunRecoveryHistoryEntry[] = [];
  let nextId = 0;
  const target: CreativeRunRecoveryTarget = {
    target: { projectId: brief.targetId },
    getRevision: () => revision,
    captureProject: async () => structuredClone(current),
    restoreProject: async (next, expectedRevision) => {
      if (revision !== expectedRevision) throw new Error('revision changed');
      current = structuredClone(next);
      revision += 1;
      return { fromRevision: expectedRevision, toRevision: revision };
    },
    repository: {
      create: async (id, next) => {
        if (copies.has(id)) throw new ProjectAlreadyExistsError(id);
        copies.set(id, structuredClone(next));
      },
    },
    createProjectId: () => `copy-${++nextId}`,
    history: {
      listUndoEntries: () => [...historyEntries],
      undo: async (entry, expectedRevision) => {
        const last = undoOrder.pop();
        if (last !== entry.operationId || revision !== expectedRevision) throw new Error('wrong history entry');
        revision += 1;
        return { fromRevision: expectedRevision, toRevision: revision };
      },
    },
    isCurrentTarget: () => true,
    isWorkSettled: () => true,
  };
  return {
    target,
    copies,
    historyEntries,
    undoOrder,
    setProject(next: ProjectFile, nextRevision: number) {
      current = structuredClone(next);
      revision = nextRevision;
    },
    addHistory(operationId: string, ordinal: number, fromRevision: number, toRevision: number) {
      const entry = {
        operationId,
        ordinal,
        fromRevision,
        toRevision,
        provenance: provenance(operationId, fromRevision, toRevision),
      } satisfies CreativeRunRecoveryHistoryEntry;
      historyEntries.push(entry);
      undoOrder.push(operationId);
    },
    getRevision: () => revision,
    getProject: () => current,
  };
}

async function recordTransaction(
  recovery: CreativeRunRecoveryCoordinator,
  target: ReturnType<typeof createTarget>,
  ordinal: number,
) {
  const fromRevision = ordinal - 1;
  target.setProject({ ...target.getProject(), name: `Result ${ordinal}` }, ordinal);
  target.addHistory(`op-${ordinal}`, ordinal, fromRevision, ordinal);
  return await recovery.recordCommittedTransaction({
    operationId: `op-${ordinal}`,
    ordinal,
    fromRevision,
    toRevision: ordinal,
    provenance: provenance(`op-${ordinal}`, fromRevision, ordinal),
    durationMs: ordinal * 10,
  });
}

describe('CreativeRunRecoveryCoordinator', () => {
  it('persists the detached checkpoint before a first write and is idempotent', async () => {
    const target = createTarget();
    const persistence = createPersistence();
    const events: string[] = [];
    const recovery = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: {
        ...target.target,
        captureProject: async () => {
          events.push('capture');
          return target.target.captureProject();
        },
        repository: target.target.repository,
      },
      persistence: {
        load: persistence.persistence.load,
        save: async (record) => {
          events.push('persist');
          return persistence.persistence.save(record);
        },
      },
    });

    await expect(recovery.checkpointBeforeFirstWrite({ expectedRevision: 0 })).resolves.toMatchObject({ ok: true });
    expect(events).toEqual(['capture', 'persist']);
    const first = persistence.getRecord();
    await recovery.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    expect(persistence.getRecord()).toEqual(first);
    expect(recovery.record?.checkpoint.sourceDigest).toBe(await digestProjectFile(project()));
  });

  it('blocks the write when checkpoint persistence fails', async () => {
    const target = createTarget();
    const persistence = createPersistence();
    persistence.setFail(true);
    const recovery = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });

    await expect(recovery.checkpointBeforeFirstWrite({ expectedRevision: 0 })).resolves.toMatchObject({
      ok: false,
      reason: 'checkpoint-persistence',
    });
    expect(recovery.record).toBeNull();
  });

  it('rewinds only later owned transactions in reverse order with monotonic revisions', async () => {
    const target = createTarget();
    const persistence = createPersistence();
    const recovery = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await recovery.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    await recordTransaction(recovery, target, 1);
    await recordTransaction(recovery, target, 2);
    await recordTransaction(recovery, target, 3);

    const result = await recovery.rewind({ operationId: 'op-1' });
    expect(result).toMatchObject({ ok: true, outcome: 'rewound-to-owned-transaction' });
    expect(target.undoOrder).toEqual(['op-1']);
    expect(target.getRevision()).toBe(5);
    expect(recovery.record?.transactions.map((transaction) => transaction.operationId)).toEqual(['op-1']);
    expect(recovery.status.requiresReapproval).toBe(true);
  });

  it('preserves both copies before restoring a rejected result', async () => {
    const target = createTarget();
    const persistence = createPersistence();
    const recovery = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await recovery.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    await recordTransaction(recovery, target, 1);

    const result = await recovery.reject(true);
    expect(result).toMatchObject({ ok: true, outcome: 'restored-original-with-rejected-copy', recoveryCopyId: 'copy-1' });
    expect(target.getProject().name).toBe('Original project');
    expect(target.getRevision()).toBe(2);
    expect(target.copies.get('copy-1')?.name).toBe('Rejected Result Recovery Copy');
  });

  it('leaves later manual work untouched and creates a checkpoint copy on conflict', async () => {
    const target = createTarget();
    const persistence = createPersistence();
    const recovery = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await recovery.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    await recordTransaction(recovery, target, 1);
    target.setProject({ ...target.getProject(), name: 'Manual edit' }, 2);
    target.historyEntries.push({
      operationId: 'manual',
      ordinal: 0,
      fromRevision: -1,
      toRevision: -1,
      provenance: null,
    });

    const result = await recovery.reject(true);
    expect(result).toMatchObject({ ok: true, outcome: 'preserved-original-with-checkpoint-copy', recoveryCopyId: 'copy-1' });
    expect(target.getProject().name).toBe('Manual edit');
    expect(target.getRevision()).toBe(2);
  });
});
