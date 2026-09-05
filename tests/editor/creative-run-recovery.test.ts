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
    layers: [{
      id: 'layer-1',
      name: 'Layer 1',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 255,
      parentId: null,
      data: new Uint8Array(64),
    }],
    frames: [{
      id: 'frame-1',
      duration: 100,
      cels: [{
        id: 'cel-1',
        layerId: 'layer-1',
        data: new Uint8Array(64),
        opacity: 100,
      }],
    }],
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
    setRecord(next: Parameters<CreativeRunRecoveryPersistence['save']>[0] | null) {
      record = next ? structuredClone(next) : null;
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

  it('lazily checkpoints an approved target before recording interruption', async () => {
    const target = createTarget();
    const persistence = createPersistence();
    const recovery = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });

    await expect(recovery.markInterrupted()).resolves.toMatchObject({
      ok: true,
      reason: 'work-unsettled',
    });
    expect(recovery.record?.checkpoint.sourceRevision).toBe(0);
    expect(persistence.getRecord()?.status).toBe('interrupted');
  });

  it('reports persistence-failed when an interruption transition cannot be durable', async () => {
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
    persistence.setFail(true);

    await expect(recovery.markInterrupted()).resolves.toMatchObject({
      ok: false,
      reason: 'persistence-failed',
    });
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

  it('rewinds every owned transaction for checkpoint selection and keeps a latest selection safe', async () => {
    const checkpointTarget = createTarget();
    const checkpointPersistence = createPersistence();
    const checkpointRecovery = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: checkpointTarget.target,
      persistence: checkpointPersistence.persistence,
    });
    await checkpointRecovery.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    await recordTransaction(checkpointRecovery, checkpointTarget, 1);
    await recordTransaction(checkpointRecovery, checkpointTarget, 2);

    await expect(checkpointRecovery.rewind({ checkpoint: true })).resolves.toMatchObject({ ok: true });
    expect(checkpointTarget.undoOrder).toEqual([]);
    expect(checkpointTarget.getRevision()).toBe(4);
    expect(checkpointRecovery.record?.transactions).toHaveLength(0);

    const latestTarget = createTarget();
    const latestPersistence = createPersistence();
    const latestRecovery = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: latestTarget.target,
      persistence: latestPersistence.persistence,
    });
    await latestRecovery.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    await recordTransaction(latestRecovery, latestTarget, 1);
    await recordTransaction(latestRecovery, latestTarget, 2);

    await expect(latestRecovery.rewind({ operationId: 'op-2' })).resolves.toMatchObject({ ok: true });
    expect(latestTarget.undoOrder).toEqual(['op-1', 'op-2']);
    expect(latestTarget.getRevision()).toBe(2);
    expect(latestRecovery.status.requiresReapproval).toBe(true);
  });

  it('reactivates a rewound record only after the retained state is freshly observed', async () => {
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
    await recovery.rewind({ operationId: 'op-1' });
    target.setProject({ ...target.getProject(), name: 'Result 1' }, 3);

    await expect(recovery.reactivateAfterReapproval(3)).resolves.toMatchObject({ ok: true });
    expect(recovery.status.requiresReapproval).toBe(false);
    expect(recovery.record?.status).toBe('active');
    expect(persistence.getRecord()?.status).toBe('active');

    const reloaded = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'replacement-session',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await expect(reloaded.load()).resolves.toMatchObject({ ok: true });
    target.setProject({ ...target.getProject(), name: 'Result 2' }, 4);
    target.addHistory('op-2-after-rewind', 2, 3, 4);
    await expect(reloaded.recordCommittedTransaction({
      operationId: 'op-2-after-rewind',
      ordinal: 2,
      fromRevision: 3,
      toRevision: 4,
      provenance: provenance('op-2-after-rewind', 3, 4),
      durationMs: 20,
    })).resolves.toMatchObject({ ok: true });
    const resumedReload = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'replacement-session-2',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await expect(resumedReload.load()).resolves.toMatchObject({ ok: true });
  });

  it.each([
    ['foreign history', 'history-not-owned' as const, (target: ReturnType<typeof createTarget>) => {
      target.historyEntries[target.historyEntries.length - 1] = {
        operationId: 'foreign',
        ordinal: 1,
        fromRevision: 0,
        toRevision: 1,
        provenance: null,
      };
    }],
    ['evicted history', 'history-evicted' as const, (target: ReturnType<typeof createTarget>) => {
      target.historyEntries.shift();
    }],
  ])('rejects %s without undoing anything', async (_label, reason, alterHistory) => {
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
    alterHistory(target);
    const beforeRevision = target.getRevision();

    await expect(recovery.rewind({ checkpoint: true })).resolves.toMatchObject({ ok: false, reason });
    expect(target.getRevision()).toBe(beforeRevision);
    expect(target.undoOrder).toEqual(['op-1', 'op-2']);
    expect(persistence.getRecord()?.status).toBe('recovery-required');
  });

  it('copies before a collision and leaves the rejected result untouched', async () => {
    const target = createTarget();
    target.copies.set('copy-existing', project('Existing copy'));
    const persistence = createPersistence();
    const recovery = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: { ...target.target, createProjectId: () => 'copy-existing' },
      persistence: persistence.persistence,
    });
    await recovery.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    await recordTransaction(recovery, target, 1);
    const before = target.getProject();

    await expect(recovery.reject(true)).resolves.toMatchObject({ ok: false, reason: 'copy-collision' });
    expect(target.getProject()).toEqual(before);
    expect(target.getRevision()).toBe(1);
    expect(target.copies.get('copy-existing')?.name).toBe('Existing copy');
  });

  it('preserves the rejected copy when restore fails after the copy is durable', async () => {
    const target = createTarget();
    const persistence = createPersistence();
    const recovery = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: {
        ...target.target,
        restoreProject: async () => {
          throw new Error('restore unavailable');
        },
      },
      persistence: persistence.persistence,
    });
    await recovery.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    await recordTransaction(recovery, target, 1);

    await expect(recovery.reject(true)).resolves.toMatchObject({ ok: false, reason: 'restore-failed' });
    expect(target.copies.get('copy-1')?.name).toBe('Rejected Result Recovery Copy');
    expect(target.getProject().name).toBe('Result 1');
    expect(target.getRevision()).toBe(1);
  });

  it('rejects a restore that does not report one exact forward revision', async () => {
    const target = createTarget();
    const persistence = createPersistence();
    const recovery = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: {
        ...target.target,
        restoreProject: async (next, expectedRevision) => {
          target.setProject(next, expectedRevision + 2);
          return { fromRevision: expectedRevision, toRevision: expectedRevision + 2 };
        },
      },
      persistence: persistence.persistence,
    });
    await recovery.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    await recordTransaction(recovery, target, 1);

    await expect(recovery.reject(true)).resolves.toMatchObject({ ok: false, reason: 'restore-failed' });
    expect(target.copies.get('copy-1')?.name).toBe('Rejected Result Recovery Copy');
    expect(target.getProject().name).toBe('Original project');
    expect(target.getRevision()).toBe(3);
  });

  it('does not replay a terminal run or mutate its durable rejected record', async () => {
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
    await expect(recovery.reject(true)).resolves.toMatchObject({ ok: true });
    const saved = persistence.getRecord();
    if (!saved) throw new Error('Expected a durable rejected record.');
    persistence.setFail(true);

    await expect(recovery.recordCommittedTransaction({
      operationId: 'op-after-reject',
      ordinal: 2,
      fromRevision: 2,
      toRevision: 3,
      provenance: provenance('op-after-reject', 2, 3),
      durationMs: 20,
    })).resolves.toMatchObject({ ok: false, reason: 'terminal-run', nextAction: 'none' });
    expect(recovery.record).toEqual(saved);
  });

  it('reloads interruption state and refuses a queued transaction', async () => {
    const target = createTarget();
    const persistence = createPersistence();
    const first = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await first.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    await recordTransaction(first, target, 1);
    await expect(first.markInterrupted()).resolves.toMatchObject({ ok: true });

    const reloaded = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'replacement-session',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await expect(reloaded.load()).resolves.toMatchObject({ ok: true, nextAction: 'approve-brief' });
    expect(reloaded.status.interrupted).toBe(true);
    expect(reloaded.status.requiresReapproval).toBe(true);
    await expect(reloaded.recordCommittedTransaction({
      operationId: 'queued-op',
      ordinal: 2,
      fromRevision: 1,
      toRevision: 2,
      provenance: provenance('queued-op', 1, 2),
      durationMs: 20,
    })).resolves.toMatchObject({ ok: false, reason: 'work-unsettled' });
    expect(reloaded.record?.transactions.map((transaction) => transaction.operationId)).toEqual(['op-1']);
  });

  it('requires exact digest equality and real Web Crypto SHA-256', async () => {
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
    target.setProject({ ...target.getProject(), name: 'Changed without revision' }, 0);
    await expect(recovery.checkpointBeforeFirstWrite({ expectedRevision: 0 })).resolves.toMatchObject({
      ok: false,
      reason: 'content-ambiguous',
    });

    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    try {
      await expect(digestProjectFile(project())).rejects.toThrow('SHA-256 is unavailable');
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
    }
  });

  it('rejects malformed persisted digest, sequence, and project data before recovery', async () => {
    const target = createTarget();
    const persistence = createPersistence();
    const first = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await first.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    const stored = persistence.getRecord();
    if (!stored) throw new Error('Expected persisted recovery data.');
    persistence.setRecord({
      ...stored,
      timeline: [{ ...stored.timeline[0], sequence: 0 }],
      checkpoint: {
        ...stored.checkpoint,
        sourceDigest: 'not-a-sha256',
        project: { ...stored.checkpoint.project, layers: [] },
      },
    } as typeof stored);

    const reloaded = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await expect(reloaded.load()).resolves.toMatchObject({ ok: false, reason: 'content-ambiguous' });
    expect(reloaded.record).toBeNull();
  });

  it('verifies checkpoint bytes and the transaction revision chain before loading', async () => {
    const target = createTarget();
    const persistence = createPersistence();
    const first = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await first.checkpointBeforeFirstWrite({ expectedRevision: 0 });
    const stored = persistence.getRecord();
    if (!stored) throw new Error('Expected persisted recovery data.');
    persistence.setRecord({
      ...stored,
      checkpoint: { ...stored.checkpoint, project: { ...stored.checkpoint.project, name: 'Tampered' } },
    });

    const tampered = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await expect(tampered.load()).resolves.toMatchObject({ ok: false, reason: 'content-ambiguous' });
    expect(tampered.record).toBeNull();

    persistence.setRecord(stored);
    await recordTransaction(first, target, 1);
    const withTransaction = persistence.getRecord();
    if (!withTransaction) throw new Error('Expected persisted transaction data.');
    persistence.setRecord({
      ...withTransaction,
      transactions: [{ ...withTransaction.transactions[0], fromRevision: 4 }],
    });
    const brokenChain = new CreativeRunRecoveryCoordinator({
      runId: brief.runId,
      sessionId: 'session-587',
      brief,
      target: target.target,
      persistence: persistence.persistence,
    });
    await expect(brokenChain.load()).resolves.toMatchObject({ ok: false, reason: 'content-ambiguous' });
  });

  it('retains collapsed recovery events in bounded diagnostics', async () => {
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
    for (let index = 0; index < 205; index += 1) await recovery.markInterrupted();

    const diagnostics = recovery.getDiagnostics();
    expect(diagnostics.collapsedEventCount).toBeGreaterThan(0);
    expect(diagnostics.eventCount).toBeGreaterThan(200);
    expect(persistence.getRecord()?.collapsedEventCount).toBe(diagnostics.collapsedEventCount);
  });
});
