import { describe, expect, it } from 'vitest';
import {
  CreativeRunController,
  type CreativeBriefInput,
  type CreativeRunSessionBoundary,
  type CreativeRunStep,
  type CreativeRunStepSource,
} from '../../src/editor/creative-run';
import type {
  ArtistModeGrant,
  AutomationLocalArtistModeRun,
  AutomationLocalSession,
  AutomationSessionResult,
} from '../../src/editor/automation-session';
import type { EditorTransactionResult } from '../../src/editor/transaction';
import type {
  CreativeRunRecovery,
  CreativeRunRecoveryDiagnosticBundle,
  CreativeRunRecoveryResult,
  CreativeRunRecoveryStatus,
} from '../../src/editor/creative-run-recovery';

const targetId = 'controller-recovery-project';
const sessionId = 'controller-recovery-session';
const runId = 'controller-recovery-run';
const brief: CreativeBriefInput = {
  targetId,
  targetName: 'Controller recovery project',
  goal: 'Make a title card',
  constraints: [],
  requestedWriteCategories: ['structure'],
  transactionLimit: 2,
  durationSeconds: 60,
  contentEgress: 'local-only',
};

function success<T>(result: T): AutomationSessionResult<T> {
  return { ok: true, result };
}

function step(): CreativeRunStep {
  return {
    profile: 'layer-and-tag',
    children: [{ command: 'project.layer.state', input: { kind: 'layer.visibility', visible: true } }],
  };
}

function createAuthority(options: { readonly sessionId?: string; readonly runId?: string } = {}) {
  const authoritySessionId = options.sessionId ?? sessionId;
  const authorityRunId = options.runId ?? runId;
  let revision = 0;
  let runStatus: AutomationLocalArtistModeRun['status'] = 'running';
  let transactionsUsed = 0;
  let executeCount = 0;
  let observeCount = 0;
  const operationIds: string[] = [];
  let holdNextTransaction = false;
  let releaseTransaction: (() => void) | null = null;
  let signalTransactionStarted: (() => void) | null = null;
  const transactionStarted = new Promise<void>((resolve) => {
    signalTransactionStarted = resolve;
  });
  const session: AutomationLocalSession = {
    sessionId: authoritySessionId,
    client: { name: 'Recovery test', identity: 'self-declared' },
    targetId,
    targetName: brief.targetName,
    observationClasses: ['structure', 'save-state'],
    expiresAt: 100_000,
    status: 'active',
  };
  const run: AutomationLocalArtistModeRun = {
    sessionId: authoritySessionId,
    runId: authorityRunId,
    client: session.client,
    targetId,
    targetName: brief.targetName,
    categories: ['structure'],
    transactionLimit: 2,
    transactionsUsed: 0,
    remainingTransactions: 2,
    expiresAt: 100_000,
    status: runStatus,
    pendingEscalation: false,
  };
  const grant = (): ArtistModeGrant => ({
    type: 'automation.artist-mode.granted',
    sessionId: authoritySessionId,
    runId: authorityRunId,
    client: session.client,
    categories: ['structure'],
    transactionLimit: 2,
    childCommandLimit: 2,
    transactionsUsed,
    remainingTransactions: 2 - transactionsUsed,
    expiresAt: 100_000,
    status: runStatus,
    catalogVersion: '1.0',
    operationIds: ['project.transaction.execute'],
    profiles: ['layer-and-tag', 'static-structure', 'structure-refinement', 'animation', 'raster-patch'],
  });
  const boundary: CreativeRunSessionBoundary = {
    listLocalSessions: () => [session],
    listLocalArtistModeRuns: () => [{ ...run, status: runStatus, transactionsUsed, remainingTransactions: 2 - transactionsUsed }],
    getArtistModeGrant: () => success(grant()),
    pauseArtistMode: () => {
      runStatus = 'paused';
      return success(grant());
    },
    resumeArtistMode: () => {
      runStatus = 'running';
      return success(grant());
    },
    completeArtistMode: () => {
      runStatus = 'completed';
      return success(grant());
    },
    takeoverProjectWriteTurn: () => {
      runStatus = 'paused';
      return true;
    },
    observe: async () => {
      observeCount += 1;
      return success({ type: 'project.structure.observation', revision });
    },
    executeArtistModeTransaction: async (_session, _run, input) => {
      executeCount += 1;
      const request = input as { expectedRevision: number; operationId: string };
      operationIds.push(request.operationId);
      const result = success<EditorTransactionResult>({
        type: 'project.transaction.execute',
        target: { projectId: targetId },
        fromRevision: request.expectedRevision,
        revision: request.expectedRevision + 1,
        event: {
          type: 'project-change',
          target: targetId,
          fromRevision: request.expectedRevision,
          toRevision: request.expectedRevision + 1,
          transactionId: request.operationId,
          domains: ['layer-state'],
        },
        provenance: {
          source: 'automation',
          transactionId: request.operationId,
          clientId: 'Recovery test',
          sessionId: authoritySessionId,
          runId: authorityRunId,
          operationId: request.operationId,
          target: { projectId: targetId },
          fromRevision: request.expectedRevision,
          toRevision: request.expectedRevision + 1,
          transitionCount: 1,
          transitionsTruncated: false,
          transitions: [],
          children: [],
        },
      });
      if (holdNextTransaction) {
        holdNextTransaction = false;
        signalTransactionStarted?.();
        await new Promise<void>((resolve) => {
          releaseTransaction = resolve;
        });
      }
      revision = request.expectedRevision + 1;
      transactionsUsed += 1;
      return result;
    },
  };
  return {
    boundary,
    get revision() { return revision; },
    get executeCount() { return executeCount; },
    get observeCount() { return observeCount; },
    operationIds,
    pause() { runStatus = 'paused'; },
    holdTransaction() { holdNextTransaction = true; },
    transactionStarted,
    releaseTransaction() {
      const release = releaseTransaction;
      releaseTransaction = null;
      release?.();
    },
  };
}

class RecoveryDouble implements CreativeRunRecovery {
  private currentStatus: CreativeRunRecoveryStatus = {
    outcome: null,
    reason: null,
    recoveryCopyId: null,
    requiresReapproval: false,
    interrupted: false,
    terminal: false,
  };
  readonly calls: string[] = [];
  readonly failCommit: boolean;
  record: CreativeRunRecovery['record'] = null;
  holdCopy = false;
  private releaseCopy: (() => void) | null = null;

  constructor(failCommit = false) {
    this.failCommit = failCommit;
  }

  get status() { return this.currentStatus; }

  async load(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('load');
    return { ok: true, outcome: null, reason: null, nextAction: 'none', recoveryCopyId: null };
  }

  async checkpointBeforeFirstWrite(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('checkpoint');
    this.record = {};
    return { ok: true, outcome: null, reason: null, nextAction: 'none', recoveryCopyId: null };
  }

  async recordCommittedTransaction(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('persist-transaction');
    return this.failCommit
      ? { ok: false, outcome: 'recovery-required', reason: 'persistence-failed', nextAction: 'recover-manually', recoveryCopyId: null }
      : { ok: true, outcome: null, reason: null, nextAction: 'none', recoveryCopyId: null };
  }

  async markInterrupted(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('interrupted');
    this.currentStatus = { ...this.currentStatus, interrupted: true, outcome: 'recovery-required', reason: 'work-unsettled' };
    return { ok: true, outcome: 'recovery-required', reason: 'work-unsettled', nextAction: 'recover-manually', recoveryCopyId: null };
  }

  async reactivateAfterReapproval(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('reactivate');
    this.currentStatus = { ...this.currentStatus, requiresReapproval: false, interrupted: false };
    return { ok: true, outcome: null, reason: null, nextAction: 'none', recoveryCopyId: null };
  }

  async rewind(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('rewind');
    return { ok: true, outcome: 'rewound-to-owned-transaction', reason: null, nextAction: 'approve-brief', recoveryCopyId: null };
  }

  async reject(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('reject');
    return { ok: true, outcome: 'restored-original-with-rejected-copy', reason: null, nextAction: 'none', recoveryCopyId: 'copy' };
  }

  async createCheckpointCopy(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('copy');
    if (this.holdCopy) {
      await new Promise<void>((resolve) => { this.releaseCopy = resolve; });
    }
    return { ok: true, outcome: null, reason: null, nextAction: 'review-result', recoveryCopyId: 'copy' };
  }

  releaseHeldCopy(): void {
    const release = this.releaseCopy;
    this.releaseCopy = null;
    release?.();
  }

  setRewound(): void {
    this.currentStatus = {
      ...this.currentStatus,
      requiresReapproval: true,
      outcome: 'rewound-to-owned-transaction',
    };
  }

  getDiagnostics(): CreativeRunRecoveryDiagnosticBundle {
    return {
      schemaVersion: 1,
      phase: 'ready',
      outcome: null,
      reason: null,
      transactionCount: 0,
      eventCount: 0,
      collapsedEventCount: 0,
      currentRevision: 0,
      lastDurableRevision: 0,
      checkpointRevision: 0,
      checkpointDigest: null,
      postRunDigest: null,
      operationIds: [],
      eventKinds: [],
      durationsMs: [],
    };
  }
}

function approval(controller: CreativeRunController) {
  const state = controller.getState();
  return {
    briefRevision: state.brief.revision,
    targetId: state.brief.targetId,
    requestedWriteCategories: state.brief.requestedWriteCategories,
    transactionLimit: state.brief.transactionLimit,
    durationSeconds: state.brief.durationSeconds,
    contentEgress: state.brief.contentEgress,
  };
}

function createController(
  authority: ReturnType<typeof createAuthority>,
  recovery: RecoveryDouble,
  stepSource: CreativeRunStepSource,
): CreativeRunController {
  return new CreativeRunController({
    sessionManager: authority.boundary,
    sessionId,
    runId,
    brief,
    stepSource,
    recovery,
    getCurrentRevision: () => authority.revision,
    clock: () => 10_000,
  });
}

describe('CreativeRunController recovery boundaries', () => {
  it('checkpoints before dispatch and waits for transaction durability before another step', async () => {
    const authority = createAuthority();
    const recovery = new RecoveryDouble();
    let steps = 0;
    const controller = createController(authority, recovery, () => {
      steps += 1;
      return steps === 1 ? step() : null;
    });
    controller.approveBrief(approval(controller));
    await controller.start();

    expect(recovery.calls).toEqual(['checkpoint', 'persist-transaction']);
    expect(authority.executeCount).toBe(1);
    expect(steps).toBe(2);
  });

  it('stops after a committed transaction cannot be durably recorded and never replays it', async () => {
    const authority = createAuthority();
    const recovery = new RecoveryDouble(true);
    let steps = 0;
    const controller = createController(authority, recovery, () => {
      steps += 1;
      return step();
    });
    controller.approveBrief(approval(controller));
    const result = await controller.start();

    expect(result).toMatchObject({ ok: false, state: { phase: 'recovery-required' } });
    expect(authority.executeCount).toBe(1);
    expect(steps).toBe(1);
  });

  it('fences an in-flight transaction on offline and persists interruption after it settles', async () => {
    const authority = createAuthority();
    const recovery = new RecoveryDouble();
    const controller = createController(authority, recovery, () => step());
    controller.approveBrief(approval(controller));
    authority.holdTransaction();
    const run = controller.start();
    await authority.transactionStarted;
    window.dispatchEvent(new Event('offline'));
    authority.pause();
    authority.releaseTransaction();
    await run;

    expect(recovery.calls).toContain('interrupted');
    expect(controller.getState().phase).toBe('recovery-required');
    expect(controller.getState().recovery?.interrupted).toBe(true);
  });

  it('requires a different replacement session, fresh observation, and reapproval', async () => {
    const authority = createAuthority();
    const recovery = new RecoveryDouble();
    await recovery.markInterrupted();
    let factoryCalls = 0;
    let observed = 0;
    const replacementAuthority = createAuthority({ sessionId: 'replacement-session', runId: 'replacement-run' });
    const replacement = new CreativeRunController({
      sessionManager: replacementAuthority.boundary,
      sessionId: 'replacement-session',
      runId: 'replacement-run',
      brief: { ...brief, runId: 'replacement-run' },
      stepSource: () => null,
      getCurrentRevision: () => replacementAuthority.revision,
      clock: () => 10_000,
    });
    const controller = new CreativeRunController({
      sessionManager: authority.boundary,
      sessionId,
      runId,
      brief,
      recovery,
      stepSource: () => null,
      getCurrentRevision: () => authority.revision,
      createReplacementController: async (input) => {
        factoryCalls += 1;
        expect(input.previousSessionId).toBe(sessionId);
        observed += 1;
        return {
          controller: replacement,
          sessionId: 'replacement-session',
          observedRevision: replacement.getState().currentRevision,
        };
      },
    });
    controller.approveBrief(approval(controller));
    await expect(controller.start()).resolves.toMatchObject({
      ok: false,
      error: { code: 'recovery_resume_required', nextAction: 'resume-interrupted' },
    });
    const result = await controller.resumeAfterInterruption();

    expect(result).toMatchObject({ ok: true });
    expect(factoryCalls).toBe(1);
    expect(observed).toBe(1);
    expect(replacementAuthority.observeCount).toBe(1);
    expect(controller.replacement).toBe(replacement);
    expect(replacement.getState().approvedBriefRevision).toBeNull();
    expect(replacement.getState().phase).toBe('draft');
  });

  it('serializes recovery actions at the controller boundary', async () => {
    const authority = createAuthority();
    const recovery = new RecoveryDouble();
    recovery.holdCopy = true;
    const controller = createController(authority, recovery, () => null);
    controller.approveBrief(approval(controller));
    controller.stop();

    const first = controller.createRecoveryCopy();
    await Promise.resolve();
    const second = await controller.createRecoveryCopy();
    expect(second).toMatchObject({ ok: false, error: { code: 'recovery_busy' } });
    expect(controller.approveBrief(approval(controller))).toMatchObject({ error: { code: 'recovery_busy' } });
    expect(controller.refineBrief({ goal: 'another goal' })).toMatchObject({ error: { code: 'recovery_busy' } });
    expect(controller.pause()).toMatchObject({ error: { code: 'recovery_busy' } });
    expect(controller.requestManualTakeover('creator')).toMatchObject({ error: { code: 'recovery_busy' } });
    expect(controller.stop()).toMatchObject({ error: { code: 'recovery_busy' } });
    await expect(controller.start()).resolves.toMatchObject({ error: { code: 'recovery_busy' } });
    await expect(controller.resume()).resolves.toMatchObject({ error: { code: 'recovery_busy' } });
    await expect(controller.accept()).resolves.toMatchObject({ error: { code: 'recovery_busy' } });
    await expect(controller.reject(true)).resolves.toMatchObject({ error: { code: 'recovery_busy' } });
    await expect(controller.rewind({ checkpoint: true })).resolves.toMatchObject({ error: { code: 'recovery_busy' } });
    await expect(controller.markInterrupted()).resolves.toMatchObject({ error: { code: 'recovery_busy' } });
    await expect(controller.openRecoveryCopy()).resolves.toMatchObject({ error: { code: 'recovery_busy' } });
    await expect(controller.loadRecoveryRecord()).resolves.toMatchObject({ error: { code: 'recovery_busy' } });
    await expect(controller.observeForRecovery()).resolves.toMatchObject({ error: { code: 'recovery_busy' } });
    await expect(controller.resumeAfterInterruption()).resolves.toMatchObject({ error: { code: 'recovery_busy' } });
    controller.dispose();
    expect(recovery.calls).not.toContain('interrupted');
    recovery.releaseHeldCopy();
    await expect(first).resolves.toMatchObject({ ok: true });
    expect(recovery.calls.filter((call) => call === 'copy')).toHaveLength(1);
    expect(recovery.calls.filter((call) => call === 'interrupted')).toHaveLength(1);
  });

  it('reactivates a rewound recovery record after fresh observation before dispatch', async () => {
    const authority = createAuthority();
    const recovery = new RecoveryDouble();
    recovery.setRewound();
    const controller = createController(authority, recovery, () => null);
    controller.approveBrief(approval(controller));
    const result = await controller.start();

    expect(result).toMatchObject({ ok: true, state: { phase: 'stopped' } });
    expect(recovery.calls).toEqual(['reactivate']);
    expect(authority.observeCount).toBe(1);
  });

  it('retains the ordinal suffix when a run id reaches the operation-id limit', async () => {
    const longRunId = 'r'.repeat(256);
    const authority = createAuthority({ runId: longRunId });
    let stepCount = 0;
    const controller = new CreativeRunController({
      sessionManager: authority.boundary,
      sessionId,
      runId: longRunId,
      brief,
      stepSource: () => (stepCount++ === 0 ? step() : null),
      getCurrentRevision: () => authority.revision,
      clock: () => 10_000,
    });
    controller.approveBrief(approval(controller));
    await controller.start();

    expect(authority.operationIds[0]).toHaveLength(256);
    expect(authority.operationIds[0]).toMatch(/:step:1$/);
  });
});
