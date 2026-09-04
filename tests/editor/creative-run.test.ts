import { describe, expect, it } from 'vitest';
import {
  CreativeRunController,
  type CreativeBriefInput,
  type CreativeRunSessionBoundary,
  type CreativeRunPackageRequest,
  type CreativeRunStep,
} from '../../src/editor/creative-run';
import type {
  ArtistModeGrant,
  AutomationLocalArtistModeRun,
  AutomationLocalSession,
  AutomationSessionResult,
} from '../../src/editor/automation-session';
import type { EditorError } from '../../src/editor/contracts';

const targetId = 'creative-project';
const sessionId = 'creative-session';
const runId = 'creative-run';

const brief: CreativeBriefInput = {
  targetId,
  targetName: 'Creative project',
  goal: 'Make a calm title card',
  constraints: ['Keep the existing canvas'],
  requestedWriteCategories: ['structure', 'timeline'],
  transactionLimit: 2,
  durationSeconds: 60,
  contentEgress: 'local-only',
};

function success<T>(result: T): AutomationSessionResult<T> {
  return { ok: true, result };
}

function createAuthority(options: {
  revision?: number;
  status?: AutomationLocalArtistModeRun['status'];
  categories?: readonly ('structure' | 'palette' | 'timeline' | 'raster')[];
  transactionLimit?: number;
  expiresAt?: number;
} = {}): {
  boundary: CreativeRunSessionBoundary;
  state: {
    revision: number;
    runStatus: AutomationLocalArtistModeRun['status'];
    transactionsUsed: number;
    executeInputs: unknown[];
    pauseCount: number;
    resumeCount: number;
    packageRequests: unknown[];
  };
} {
  const state = {
    revision: options.revision ?? 0,
    runStatus: options.status ?? 'running',
    transactionsUsed: 0,
    executeInputs: [] as unknown[],
    pauseCount: 0,
    resumeCount: 0,
    packageRequests: [] as unknown[],
  };
  const categories = options.categories ?? ['structure', 'timeline'];
  const transactionLimit = options.transactionLimit ?? 2;
  const client = { name: 'Creative Run', identity: 'self-declared' as const };
  const session: AutomationLocalSession = {
    sessionId,
    client,
    targetId,
    targetName: 'Creative project',
    observationClasses: ['structure', 'timeline', 'save-state'],
    expiresAt: options.expiresAt ?? 100_000,
    status: 'active',
  };
  const run: AutomationLocalArtistModeRun = {
    sessionId,
    runId,
    client,
    targetId,
    targetName: 'Creative project',
    categories,
    transactionLimit,
    transactionsUsed: 0,
    remainingTransactions: transactionLimit,
    expiresAt: options.expiresAt ?? 100_000,
    status: state.runStatus,
    pendingEscalation: false,
  };
  const grant = (): ArtistModeGrant => ({
    type: 'automation.artist-mode.granted',
    sessionId,
    runId,
    client,
    categories,
    transactionLimit,
    childCommandLimit: 2,
    transactionsUsed: state.transactionsUsed,
    remainingTransactions: Math.max(0, transactionLimit - state.transactionsUsed),
    expiresAt: options.expiresAt ?? 100_000,
    status: state.runStatus,
    catalogVersion: '1.0',
    operationIds: ['project.transaction.execute'],
    profiles: ['structure-refinement', 'static-structure', 'layer-and-tag', 'animation', 'raster-patch'],
  });
  const boundary: CreativeRunSessionBoundary = {
    listLocalSessions: () => [session],
    listLocalArtistModeRuns: () => [{ ...run, status: state.runStatus, transactionsUsed: state.transactionsUsed, remainingTransactions: Math.max(0, transactionLimit - state.transactionsUsed) }],
    getArtistModeGrant: () => success(grant()),
    pauseArtistMode: () => {
      state.pauseCount += 1;
      state.runStatus = 'paused';
      return success(grant());
    },
    resumeArtistMode: () => {
      state.resumeCount += 1;
      state.runStatus = 'running';
      return success(grant());
    },
    completeArtistMode: () => {
      state.runStatus = 'completed';
      return success(grant());
    },
    takeoverProjectWriteTurn: () => {
      state.runStatus = 'paused';
      return true;
    },
    observe: async (_session, observationClass, input) => success({
      type: `project.${observationClass}.observation`,
      revision: state.revision,
      expectedRevision: (input as { expectedRevision: number }).expectedRevision,
    }),
    executeArtistModeTransaction: async (_session, _run, input) => {
      state.executeInputs.push(input);
      const request = input as { expectedRevision: number; operationId: string };
      state.revision = request.expectedRevision + 1;
      state.transactionsUsed += 1;
      return success({
        type: 'project.transaction.execute',
        target: { projectId: targetId },
        fromRevision: request.expectedRevision,
        revision: state.revision,
        provenance: {
          source: 'automation',
          transactionId: request.operationId,
          clientId: 'Creative Run',
          sessionId,
          runId,
          operationId: request.operationId,
          target: { projectId: targetId },
          fromRevision: request.expectedRevision,
          toRevision: state.revision,
          transitionCount: 1,
          transitionsTruncated: false,
          transitions: [],
          children: [],
        },
      });
    },
  };
  return { boundary, state };
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

function step(profile: CreativeRunStep['profile'] = 'layer-and-tag'): CreativeRunStep {
  return {
    profile,
    children: [{ command: 'project.layer.state', input: { kind: 'layer.visibility', visible: true } }],
  };
}

function failure(code: EditorError['code'], retryable = false): AutomationSessionResult<unknown> {
  return { ok: false, error: { code, retryable } };
}

function createController(
  authority: ReturnType<typeof createAuthority>,
  options: Partial<ConstructorParameters<typeof CreativeRunController>[0]> = {},
): CreativeRunController {
  return new CreativeRunController({
    sessionManager: authority.boundary,
    sessionId,
    runId,
    brief,
    stepSource: () => null,
    getCurrentRevision: () => authority.state.revision,
    clock: () => 10_000,
    ...options,
  });
}

describe('CreativeRunController', () => {
  it('requires exact brief revision approval and keeps target local to the controller', () => {
    const authority = createAuthority();
    const controller = new CreativeRunController({
      sessionManager: authority.boundary,
      sessionId,
      runId,
      brief,
      stepSource: () => null,
      getCurrentRevision: () => authority.state.revision,
      clock: () => 10_000,
    });

    expect(controller.approveBrief({ ...approval(controller), briefRevision: 99 })).toMatchObject({
      ok: false,
      error: { code: 'brief_revision_mismatch' },
    });
    expect(controller.getState().phase).toBe('draft');
    expect(controller.approveBrief(approval(controller))).toMatchObject({ ok: true, state: { phase: 'ready' } });
    expect(controller.getState().target).toEqual({ id: targetId, name: 'Creative project' });
    expect(JSON.stringify(authority.state.executeInputs)).not.toContain(targetId);

    expect(controller.refineBrief({ goal: 'Use a warmer title card' })).toMatchObject({ ok: true, state: { phase: 'draft' } });
    expect(controller.getState().approvedBriefRevision).toBeNull();
    expect(controller.approveBrief(approval(controller))).toMatchObject({ ok: true, state: { phase: 'ready' } });
  });

  it('fences a paused run before dispatching a step', async () => {
    const authority = createAuthority();
    let resolveStep!: (value: CreativeRunStep | null) => void;
    const pendingStep = new Promise<CreativeRunStep | null>((resolve) => { resolveStep = resolve; });
    const controller = new CreativeRunController({
      sessionManager: authority.boundary,
      sessionId,
      runId,
      brief,
      stepSource: () => pendingStep,
      getCurrentRevision: () => authority.state.revision,
      clock: () => 10_000,
    });
    controller.approveBrief(approval(controller));
    const run = controller.start();
    expect(controller.pause()).toMatchObject({ ok: true, state: { phase: 'pausing' } });
    resolveStep(step());
    await run;
    expect(authority.state.executeInputs).toHaveLength(0);
    expect(controller.getState().phase).toBe('paused');
  });

  it('accounts one committed transaction and prepares an exact-revision package', async () => {
    const authority = createAuthority();
    let nextStep = true;
    const packageRequests: unknown[] = [];
    const controller = new CreativeRunController({
      sessionManager: authority.boundary,
      sessionId,
      runId,
      brief,
      stepSource: () => {
        if (!nextStep) return null;
        nextStep = false;
        return step();
      },
      getCurrentRevision: () => authority.state.revision,
      clock: () => 10_000,
      preparePackage: async (request) => {
        packageRequests.push(request);
        return { ok: true, result: {} as never };
      },
    });
    controller.approveBrief(approval(controller));
    const result = await controller.start();
    expect(result).toMatchObject({ ok: true, state: { phase: 'stopped', transactionsUsed: 1, currentRevision: 1 } });
    expect(authority.state.executeInputs[0]).toEqual(expect.not.objectContaining({ target: expect.anything(), provenance: expect.anything() }));
    expect(controller.getState().timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'transaction', outcome: 'committed', fromRevision: 0, toRevision: 1 }),
    ]));
    const accepted = await controller.accept({ expectedSaveSafety: { status: 'safe', revision: 1 }, expectedPackageDigest: 'digest-1' });
    expect(accepted).toMatchObject({ ok: true, state: { phase: 'accepted', packagePreparedRevision: 1 } });
    expect(packageRequests).toEqual([{ expectedRevision: 1, expectedSaveSafety: { status: 'safe', revision: 1 }, expectedPackageDigest: 'digest-1' }]);
  });

  it('bounds the factual timeline while preserving a collapsed count', async () => {
    const authority = createAuthority();
    const controller = new CreativeRunController({
      sessionManager: authority.boundary,
      sessionId,
      runId,
      brief,
      stepSource: () => null,
      getCurrentRevision: () => authority.state.revision,
      clock: () => 10_000,
    });
    controller.approveBrief(approval(controller));
    for (let index = 0; index < 125; index += 1) {
      await controller.start();
      controller.approveBrief(approval(controller));
    }
    const state = controller.getState();
    expect(state.timeline.length).toBeLessThanOrEqual(200);
    expect(state.collapsedTimelineEntries).toBeGreaterThan(0);
    expect(JSON.stringify(state.timeline)).not.toContain('Goal 0');
    expect(state.timeline[0]).toMatchObject({ kind: 'collapsed', count: state.collapsedTimelineEntries });
  });

  it('fences a refined transaction limit before dispatch and exposes the exhausted budget', async () => {
    const authority = createAuthority();
    let stepNumber = 0;
    const controller = createController(authority, {
      stepSource: () => {
        if (stepNumber > 0) return null;
        stepNumber += 1;
        return step();
      },
    });
    controller.approveBrief(approval(controller));
    await controller.start();
    expect(controller.getState()).toMatchObject({ phase: 'stopped', transactionsUsed: 1 });
    authority.state.runStatus = 'paused';

    expect(controller.refineBrief({ transactionLimit: 1 })).toMatchObject({
      ok: true,
      state: { phase: 'draft', brief: { revision: 2 } },
    });
    controller.approveBrief(approval(controller));
    const result = await controller.start();

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'limit_exceeded', nextAction: 'review-result' },
      state: { phase: 'paused', transactionsUsed: 1, remainingTransactions: 0 },
    });
    expect(authority.state.executeInputs).toHaveLength(1);
    expect(controller.getState().timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'budget', outcome: 'exhausted', ordinal: 1 }),
    ]));
  });

  it('keeps active duration cumulative across pause time and fences expiry before dispatch', async () => {
    let now = 10_000;
    const authority = createAuthority();
    let planNumber = 0;
    let resolvePendingPlan!: (value: CreativeRunStep | null) => void;
    let pendingPlanRequested!: () => void;
    const pendingPlanSignal = new Promise<void>((resolve) => { pendingPlanRequested = resolve; });
    const pendingPlan = new Promise<CreativeRunStep | null>((resolve) => { resolvePendingPlan = resolve; });
    const controller = createController(authority, {
      clock: () => now,
      stepSource: () => {
        if (planNumber === 0) {
          planNumber += 1;
          now = 11_000;
          return step();
        }
        if (planNumber === 1) {
          planNumber += 1;
          pendingPlanRequested();
          return pendingPlan;
        }
        planNumber += 1;
        now = 18_000;
        return null;
      },
    });
    controller.approveBrief(approval(controller));
    const firstRun = controller.start();
    await pendingPlanSignal;
    expect(controller.pause()).toMatchObject({ ok: true, state: { phase: 'pausing' } });
    now = 16_000;
    resolvePendingPlan(null);
    await firstRun;
    expect(controller.getState()).toMatchObject({ phase: 'paused', elapsedSeconds: 1, remainingDurationSeconds: 59 });

    const resumed = controller.resume();
    await resumed;
    expect(controller.getState()).toMatchObject({ phase: 'stopped', elapsedSeconds: 3, remainingDurationSeconds: 57 });

    let expiryNow = 20_000;
    const expiringAuthority = createAuthority();
    let executeCount = 0;
    const expiringController = createController(expiringAuthority, {
      brief: { ...brief, durationSeconds: 1 },
      clock: () => expiryNow,
      stepSource: () => {
        expiryNow = 21_001;
        return step();
      },
      executeTransaction: async () => {
        executeCount += 1;
        return success({});
      },
    });
    expiringController.approveBrief(approval(expiringController));
    const expired = await expiringController.start();
    expect(expired).toMatchObject({
      ok: false,
      error: { code: 'duration_exhausted', nextAction: 'review-result' },
      state: { phase: 'paused', elapsedSeconds: 1, remainingDurationSeconds: 0, transactionsUsed: 0 },
    });
    expect(executeCount).toBe(0);
  });

  it('completes stopped authority while accepting the exact current revision', async () => {
    const authority = createAuthority();
    const packageRequests: CreativeRunPackageRequest[] = [];
    const controller = createController(authority, {
      preparePackage: async (request) => {
        packageRequests.push(request);
        return { ok: true, result: {} as never };
      },
    });
    controller.approveBrief(approval(controller));
    expect(controller.stop()).toMatchObject({ ok: true, state: { phase: 'stopped' } });
    expect(authority.state.runStatus).toBe('completed');
    expect(await controller.accept({ expectedSaveSafety: { status: 'saved', revision: 0 } })).toMatchObject({
      ok: true,
      state: { phase: 'accepted', packagePreparedRevision: 0 },
    });
    expect(packageRequests).toEqual([{
      expectedRevision: 0,
      expectedSaveSafety: { status: 'saved', revision: 0 },
      expectedPackageDigest: null,
    }]);
  });

  it.each([
    ['pause', 'paused'],
    ['stop', 'stopped'],
  ] as const)('accounts a late committed transaction before %s settles', async (action, expectedPhase) => {
    const authority = createAuthority();
    let resolveTransaction!: (result: AutomationSessionResult<unknown>) => void;
    let signalDispatch!: () => void;
    const dispatched = new Promise<void>((resolve) => { signalDispatch = resolve; });
    const pendingTransaction = new Promise<AutomationSessionResult<unknown>>((resolve) => { resolveTransaction = resolve; });
    const controller = createController(authority, {
      stepSource: () => step(),
      executeTransaction: async (_session, _run, input) => {
        authority.state.executeInputs.push(input);
        signalDispatch();
        return pendingTransaction;
      },
    });
    controller.approveBrief(approval(controller));
    const run = controller.start();
    await dispatched;
    const request = authority.state.executeInputs[0] as { expectedRevision: number; operationId: string };
    authority.state.revision = request.expectedRevision + 1;
    resolveTransaction(success({
      type: 'project.transaction.execute',
      fromRevision: request.expectedRevision,
      revision: request.expectedRevision + 1,
      provenance: { children: [] },
    }));
    expect(action === 'pause' ? controller.pause() : controller.stop()).toMatchObject({ ok: true, state: { phase: action === 'pause' ? 'pausing' : 'stopping' } });
    await run;
    const state = controller.getState();
    expect(state.phase).toBe(expectedPhase);
    expect(state.transactionsUsed).toBe(1);
    expect(state.lastDurableRevision).toBe(request.expectedRevision + 1);
    expect(state.lastDurableResult?.operationId).toBe(request.operationId);
    expect(authority.state.executeInputs).toHaveLength(1);
  });

  it('does not count a rejected transaction and enters recovery for an unsafe failure', async () => {
    const authority = createAuthority();
    const controller = createController(authority, {
      stepSource: () => step(),
      executeTransaction: async () => failure('revision_conflict', true),
    });
    controller.approveBrief(approval(controller));
    const result = await controller.start();
    expect(result).toMatchObject({ ok: false, error: { code: 'revision_conflict', nextAction: 'recover-manually' } });
    expect(controller.getState()).toMatchObject({ phase: 'recovery-required', transactionsUsed: 0, lastDurableRevision: 0 });
  });

  it('denies incompatible, expired, and revoked authority before dispatch', () => {
    const incompatible = createAuthority({ categories: ['structure'] });
    const incompatibleController = createController(incompatible);
    expect(incompatibleController.approveBrief(approval(incompatibleController))).toMatchObject({
      ok: false,
      error: { code: 'grant_incompatible', nextAction: 'request-grant' },
      state: { phase: 'awaiting-grant' },
    });

    const expired = createAuthority({ expiresAt: 9_999 });
    const expiredController = createController(expired);
    expect(expiredController.approveBrief(approval(expiredController))).toMatchObject({
      ok: false,
      error: { code: 'grant_expired' },
    });

    const revoked = createAuthority();
    const revokedBoundary: CreativeRunSessionBoundary = {
      ...revoked.boundary,
      listLocalSessions: () => [{
        sessionId,
        client: { name: 'Creative Run', identity: 'self-declared' },
        targetId,
        targetName: 'Creative project',
        observationClasses: ['structure', 'timeline', 'save-state'],
        expiresAt: 100_000,
        status: 'revoked',
      }],
    };
    const revokedController = createController({ ...revoked, boundary: revokedBoundary });
    expect(revokedController.approveBrief(approval(revokedController))).toMatchObject({
      ok: false,
      error: { code: 'session_revoked', nextAction: 'recover-manually' },
    });
  });

  it('keeps package preparation exact, target-free, and terminal on failure or revision drift', async () => {
    const authority = createAuthority();
    const packageRequests: unknown[] = [];
    let nextStep = true;
    const controller = createController(authority, {
      stepSource: () => {
        if (!nextStep) return null;
        nextStep = false;
        return step();
      },
      preparePackage: async (request) => {
        packageRequests.push(request);
        return { ok: false, error: { code: 'internal', retryable: true } };
      },
    });
    controller.approveBrief(approval(controller));
    await controller.start();
    const failed = await controller.accept({
      expectedSaveSafety: {
        type: 'project.save-safety',
        target: { projectId: targetId },
        currentRevision: 1,
        persistedRevision: 1,
        status: 'saved',
      },
    });
    expect(failed).toMatchObject({ ok: false, error: { code: 'internal' }, state: { phase: 'failed' } });
    expect(JSON.stringify(packageRequests)).not.toContain(targetId);
    expect(await controller.start()).toMatchObject({ ok: false, error: { code: 'run_not_ready' } });

    const drift = createAuthority();
    let driftStep = true;
    const driftController = createController(drift, {
      stepSource: () => {
        if (!driftStep) return null;
        driftStep = false;
        return step();
      },
      preparePackage: async () => ({ ok: true, result: {} as never }),
    });
    driftController.approveBrief(approval(driftController));
    await driftController.start();
    drift.state.revision = 2;
    expect(await driftController.accept({ expectedSaveSafety: { status: 'saved' } })).toMatchObject({
      ok: false,
      error: { code: 'revision_conflict', nextAction: 'recover-manually' },
      state: { phase: 'recovery-required', packagePreparedRevision: null },
    });
  });

  it('does not dispatch after a terminal run and never exposes observed target or provenance', async () => {
    const authority = createAuthority();
    let receivedObservation: unknown;
    let emitted = false;
    const controller = createController(authority, {
      stepSource: (context) => {
        receivedObservation = context.observation;
        if (emitted) return null;
        emitted = true;
        return step();
      },
    });
    controller.approveBrief(approval(controller));
    await controller.start();
    expect(JSON.stringify(receivedObservation)).not.toContain('target');
    expect(JSON.stringify(receivedObservation)).not.toContain('provenance');
    const count = authority.state.executeInputs.length;
    expect(await controller.start()).toMatchObject({ ok: false, error: { code: 'run_not_ready' } });
    expect(authority.state.executeInputs).toHaveLength(count);
  });

});
