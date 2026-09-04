import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
  AutomationSessionManager,
  type AutomationLocalTarget,
} from '../../src/editor/automation-session';
import {
  CreativeRunController,
  type CreativeRunStep,
} from '../../src/editor/creative-run';
import type {
  CreativeRunRecovery,
  CreativeRunRecoveryDiagnosticBundle,
  CreativeRunRecoveryRecord,
  CreativeRunRecoveryResult,
  CreativeRunRecoveryStatus,
} from '../../src/editor/creative-run-recovery';
import { CreativeRunRecoveryCoordinator } from '../../src/editor/creative-run-recovery';
import { digestProjectFile } from '../../src/editor/creative-run-recovery';
import { createProjectRecoveryTarget } from '../../src/editor/creative-run-recovery-boundaries';
import { IndexedDbCreativeRunRecoveryPersistence, projectRepository } from '../../src/services/persistence/indexed-db';
import type { Command } from '../../src/stores/history-store';
import { createProjectContext, type ProjectContext } from '../../src/stores/project-context';
import type { AutomationTransactionProvenance } from '../../src/editor/contracts';
import { createFixtureSession, type FixtureSession } from '../../src/editor/fixture-session';
import {
  restoreDefaultProjectContext,
  setActiveProjectContext,
} from '../../src/stores/project-context';
import '../../src/components/app/pixel-forge-app';
import '../../src/components/preview/pf-creative-run-panel';
import type { PFCreativeRunPanel } from '../../src/components/preview/pf-creative-run-panel';

const fixtures: FixtureSession[] = [];
const managers: AutomationSessionManager[] = [];
const recoveryContexts: ProjectContext[] = [];

class BrowserRecoveryDouble implements CreativeRunRecovery {
  private currentStatus: CreativeRunRecoveryStatus;
  private releaseCopy: (() => void) | null = null;
  holdCopy = false;
  readonly calls: string[] = [];
  record: CreativeRunRecoveryRecord = {} as CreativeRunRecoveryRecord;

  constructor(interrupted = false) {
    this.currentStatus = {
      outcome: interrupted ? 'recovery-required' : null,
      reason: interrupted ? 'work-unsettled' : null,
      recoveryCopyId: null,
      requiresReapproval: interrupted,
      interrupted,
      terminal: false,
    };
  }

  get status(): CreativeRunRecoveryStatus {
    return this.currentStatus;
  }

  async load(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('load');
    return this.result();
  }

  async checkpointBeforeFirstWrite(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('checkpoint');
    return this.result();
  }

  async recordCommittedTransaction(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('record');
    return this.result();
  }

  async markInterrupted(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('interrupted');
    this.currentStatus = {
      ...this.currentStatus,
      outcome: 'recovery-required',
      reason: 'work-unsettled',
      requiresReapproval: true,
      interrupted: true,
    };
    return this.result('recovery-required', 'work-unsettled', 'recover-manually');
  }

  async rewind(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('rewind');
    return this.result('rewound-to-owned-transaction', null, 'approve-brief');
  }

  async reject(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('reject');
    return this.result('restored-original-with-rejected-copy', null, 'none', 'recovery-copy');
  }

  async createCheckpointCopy(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('copy');
    if (this.holdCopy) {
      await new Promise<void>((resolve) => {
        this.releaseCopy = resolve;
      });
    }
    this.currentStatus = { ...this.currentStatus, recoveryCopyId: 'recovery-copy' };
    return this.result(null, null, 'review-result', 'recovery-copy');
  }

  releaseHeldCopy(): void {
    const release = this.releaseCopy;
    this.releaseCopy = null;
    release?.();
  }

  getDiagnostics(): CreativeRunRecoveryDiagnosticBundle {
    return {
      schemaVersion: 1,
      phase: 'ready',
      outcome: this.currentStatus.outcome,
      reason: this.currentStatus.reason,
      transactionCount: 0,
      eventCount: this.calls.length,
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

  private result(
    outcome: CreativeRunRecoveryResult['outcome'] = this.currentStatus.outcome,
    reason: CreativeRunRecoveryResult['reason'] = this.currentStatus.reason,
    nextAction: CreativeRunRecoveryResult['nextAction'] = 'none',
    recoveryCopyId: string | null = this.currentStatus.recoveryCopyId,
  ): CreativeRunRecoveryResult {
    return { ok: true, outcome, reason, nextAction, recoveryCopyId };
  }
}

afterEach(() => {
  document.body.replaceChildren();
  restoreDefaultProjectContext();
  for (const manager of managers.splice(0)) manager.dispose();
  for (const fixture of fixtures.splice(0)) fixture.dispose();
  for (const context of recoveryContexts.splice(0)) context.dispose();
});

async function createRun(recovery?: CreativeRunRecovery): Promise<{ element: PFCreativeRunPanel; controller: CreativeRunController; fixture: FixtureSession; manager: AutomationSessionManager }> {
  const fixture = createFixtureSession();
  fixtures.push(fixture);
  await fixture.runAnimationObservation();
  const target: AutomationLocalTarget = {
    id: fixture.target.projectId,
    name: 'Creative Fixture',
    context: fixture.projectContext,
  };
  let requestNumber = 0;
  const manager = new AutomationSessionManager({
    targets: () => [target],
    isPageVisible: () => true,
    requestIdFactory: () => `creative-browser-request-${++requestNumber}`,
    sessionIdFactory: () => 'creative-browser-session',
  });
  managers.push(manager);

  const inspect = manager.requestSession({
    client: { name: 'Creative Run Chromium', identity: 'self-declared' },
    compatibility: { minVersion: '1.0', maxVersion: '1.0' },
    observationClasses: ['structure', 'timeline'],
    lifetimeSeconds: 60,
  });
  if (!inspect.ok) throw new Error('Expected an inspect request.');
  manager.captureLocalTargets(inspect.result.requestId);
  const inspectGrant = manager.approveRequest(inspect.result.requestId, target.id, ['structure', 'timeline']);
  if (!inspectGrant.ok) throw new Error('Expected an inspect grant.');
  const artistRequest = manager.requestArtistMode({
    sessionId: inspectGrant.result.sessionId,
    runId: 'creative-browser-run',
    runIntent: 'Prepare one fixture title card',
    requestedWriteCategories: ['structure', 'timeline'],
    requestedTransactionLimit: 2,
    requestedDurationSeconds: 60,
  });
  if (!artistRequest.ok) throw new Error('Expected an Artist Mode request.');
  manager.captureArtistModeTarget(artistRequest.result.requestId);
  const artistGrant = manager.approveArtistMode(artistRequest.result.requestId, ['structure', 'timeline'], 2);
  if (!artistGrant.ok) throw new Error('Expected an Artist Mode grant.');

  const layer = fixture.projectContext.layers.layers.value[0];
  if (!layer) throw new Error('Expected a fixture layer.');
  let emitted = false;
  const controller = new CreativeRunController({
    sessionManager: manager,
    sessionId: inspectGrant.result.sessionId,
    runId: artistGrant.result.runId,
    brief: {
      targetId: target.id,
      targetName: target.name,
      goal: 'Make a calm title card',
      constraints: ['Keep the existing canvas'],
      requestedWriteCategories: ['structure', 'timeline'],
      transactionLimit: 2,
      durationSeconds: 30,
      contentEgress: 'local-only',
    },
    getCurrentRevision: () => fixture.projectContext.project.revision.value,
    recovery,
    stepSource: () => {
      if (emitted) return null;
      emitted = true;
      return {
        profile: 'layer-and-tag',
        children: [
          {
            command: 'project.layer.state',
            input: { kind: 'layer.visibility', layerId: layer.id, visible: false },
          },
          {
            command: 'project.animation.frame-tag',
            input: {
              kind: 'tag.create',
              name: 'Creative Run fixture',
              color: '#123456',
              startFrameIndex: 0,
              endFrameIndex: 0,
            },
          },
        ],
      };
    },
  });
  controller.approveBrief({
    briefRevision: 1,
    targetId: target.id,
    requestedWriteCategories: ['structure', 'timeline'],
    transactionLimit: 2,
    durationSeconds: 30,
    contentEgress: 'local-only',
  });
  const element = document.createElement('pf-creative-run-panel') as PFCreativeRunPanel;
  element.controller = controller;
  document.body.append(element);
  await element.updateComplete;
  return { element, controller, fixture, manager };
}

function deferred(): { readonly promise: Promise<void>; readonly release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function recoveryProvenance(
  operationId: string,
  runId: string,
  projectId: string,
  fromRevision: number,
  toRevision: number,
): AutomationTransactionProvenance {
  return {
    source: 'automation',
    transactionId: operationId,
    clientId: 'Chromium recovery fixture',
    sessionId: `${runId}-session`,
    runId,
    operationId,
    target: { projectId },
    fromRevision,
    toRevision,
    transitionCount: 1,
    transitionsTruncated: false,
    transitions: [],
    children: [],
  };
}

async function createIndexedRecoveryJourney(kind: 'safe' | 'conflict'): Promise<{
  readonly primary: ProjectContext;
  readonly secondary: ProjectContext;
  readonly recoveryResult: Awaited<ReturnType<CreativeRunRecoveryCoordinator['reject']>>;
  readonly copyId: string | null;
  readonly checkpointDigest: string;
  readonly postRunDigest: string;
}> {
  const primary = createProjectContext();
  const secondary = createProjectContext();
  recoveryContexts.push(primary, secondary);
  const suffix = crypto.randomUUID();
  const primaryId = `browser-recovery-primary-${suffix}`;
  const secondaryId = `browser-recovery-secondary-${suffix}`;
  primary.project.id.value = primaryId;
  primary.project.name.value = 'Browser recovery original';
  secondary.project.id.value = secondaryId;
  secondary.project.name.value = 'Browser recovery secondary';
  const normalizedPrimary = await primary.project.saveProject();
  await primary.project.loadProject(normalizedPrimary, false, { preserveRevision: 0 });
  const secondaryBefore = await secondary.project.saveProject();
  setActiveProjectContext(primary);

  const runId = `browser-recovery-run-${suffix}`;
  const releaseCreate = deferred();
  let createStarted!: () => void;
  const createStartedPromise = new Promise<void>((resolve) => { createStarted = resolve; });
  const delayedRepository = {
    create: async (...args: Parameters<typeof projectRepository.create>) => {
      createStarted();
      await releaseCreate.promise;
      return projectRepository.create(...args);
    },
  };
  const target = createProjectRecoveryTarget(
    primary,
    delayedRepository,
    { projectId: primaryId },
    () => `browser-recovery-copy-${suffix}`,
  );
  const brief = {
    runId,
    revision: 1,
    targetId: primaryId,
    targetName: 'Browser recovery original',
    goal: 'Verify safe local recovery',
    constraints: [],
    requestedWriteCategories: ['structure'] as const,
    transactionLimit: 2,
    durationSeconds: 60,
    contentEgress: 'local-only' as const,
  };
  const persistence = new IndexedDbCreativeRunRecoveryPersistence();
  const dependencies = {
    runId,
    sessionId: `${runId}-session`,
    brief,
    target,
    persistence,
  };
  const recovery = new CreativeRunRecoveryCoordinator(dependencies);
  await recovery.checkpointBeforeFirstWrite({ expectedRevision: 0 });
  const operationId = `${runId}:step:1`;
  const beforeName = primary.project.name.value;
  const command: Command = {
    id: operationId,
    name: 'Browser recovery transaction',
    provenance: recoveryProvenance(operationId, runId, primaryId, 0, 1),
    execute: () => { primary.project.name.value = 'Browser recovery result'; },
    undo: () => { primary.project.name.value = beforeName; },
  };
  await primary.history.execute(command);
  await recovery.recordCommittedTransaction({
    operationId,
    ordinal: 1,
    fromRevision: 0,
    toRevision: 1,
    provenance: recoveryProvenance(operationId, runId, primaryId, 0, 1),
    durationMs: 12,
  });

  let reloaded = new CreativeRunRecoveryCoordinator(dependencies);
  await reloaded.load();
  const checkpointDigest = reloaded.record?.checkpoint.sourceDigest;
  const postRunDigest = reloaded.record?.transactions.at(-1)?.postDigest;
  if (!checkpointDigest || !postRunDigest) throw new Error('Expected persisted recovery digests.');
  let recoveryContext = primary;
  if (kind === 'conflict') {
    const manualCommand: Command = {
      id: `${runId}:manual`,
      name: 'Manual browser edit',
      execute: () => { primary.project.name.value = 'Browser manual edit'; },
      undo: () => { primary.project.name.value = 'Browser recovery result'; },
    };
    await primary.history.execute(manualCommand);
    primary.history.clear();

    const savedManualProject = await primary.project.saveProject();
    await projectRepository.save(primaryId, savedManualProject);
    const reopened = createProjectContext();
    recoveryContexts.push(reopened);
    reopened.project.id.value = primaryId;
    const reopenedProject = await projectRepository.load(primaryId);
    if (!reopenedProject) throw new Error('Expected the saved conflict project.');
    await reopened.project.loadProject(reopenedProject, false, { preserveRevision: 2 });
    primary.dispose();
    recoveryContext = reopened;
    const reopenedTarget = createProjectRecoveryTarget(
      reopened,
      delayedRepository,
      { projectId: primaryId },
      () => `browser-recovery-copy-${suffix}`,
    );
    const reopenedDependencies = { ...dependencies, target: reopenedTarget };
    reloaded = new CreativeRunRecoveryCoordinator(reopenedDependencies);
    await reloaded.load();
  }
  setActiveProjectContext(recoveryContext);
  const recoveryPromise = reloaded.reject(true);
  await createStartedPromise;
  setActiveProjectContext(secondary);
  releaseCreate.release();
  const recoveryResult = await recoveryPromise;
  const copyId = recoveryResult.recoveryCopyId;
  expect(await secondary.project.saveProject()).toEqual(secondaryBefore);
  return {
    primary: recoveryContext,
    secondary,
    recoveryResult,
    copyId,
    checkpointDigest,
    postRunDigest,
  };
}

describe('Creative Run panel in Chromium', () => {
  it('shows approved brief, factual activity, budget state, and keyboard controls', async () => {
    const { element, controller, fixture } = await createRun();

    await expect.element(page.getByRole('heading', { name: 'Creative Run' })).toBeVisible();
    await expect.element(page.getByText('Goal: Make a calm title card')).toBeVisible();
    await expect.element(page.getByText('Creative Fixture')).toBeVisible();
    await expect.element(page.getByText('Requested authority')).toBeVisible();
    await expect.element(page.getByText('Run time')).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Start Run' })).toBeVisible();
    expect(element.shadowRoot?.querySelector('fieldset.toolbar legend')?.textContent).toContain('Creative Run controls');

    const start = page.getByRole('button', { name: 'Start Run' });
    await userEvent.click(start);
    await expect.poll(() => controller.getState().phase).toBe('stopped');
    await expect.element(page.getByText('transaction (committed)')).toBeVisible();
    await userEvent.click(page.getByText('transaction (committed)'));
    const transaction = controller.getState().timeline.find((entry) => entry.kind === 'transaction');
    expect(transaction).toBeDefined();
    const transactionDetail = element.shadowRoot?.querySelector<HTMLDetailsElement>('details.transaction-detail');
    await expect.poll(() => transactionDetail?.open).toBe(true);
    expect(transactionDetail?.textContent).toContain(`layer-and-tag · ${transaction?.operationId} · ordinal ${transaction?.ordinal}`);
    expect(fixture.projectContext.project.revision.value).toBe(transaction?.toRevision);
    expect(JSON.stringify(controller.getState().timeline)).not.toContain('Make a calm title card');

    const stop = page.getByRole('button', { name: 'Stop' });
    await expect.element(stop).toBeVisible();
    const firstControl = element.shadowRoot?.querySelector<HTMLButtonElement>('button:not([disabled])');
    firstControl?.focus();
    expect(element.shadowRoot?.activeElement).toBe(firstControl);
  });

  it('renders a narrow-friendly empty state without inventing authority', async () => {
    const element = document.createElement('pf-creative-run-panel') as PFCreativeRunPanel;
    document.body.append(element);
    await element.updateComplete;
    await expect.element(page.getByRole('status')).toHaveTextContent('No active Creative Run.');
    expect(element.shadowRoot?.querySelector('button')).toBeNull();
  });

  it('renders recovery actions as keyboard controls and fences a busy copy action', async () => {
    const recovery = new BrowserRecoveryDouble();
    const { element, controller } = await createRun(recovery);
    controller.stop();
    await element.updateComplete;

    await expect.element(page.getByText('Recovery safety')).toBeVisible();
    const reject = page.getByRole('button', { name: 'Reject Run…' });
    await expect.element(reject).toBeVisible();
    await userEvent.click(reject);
    await expect.element(page.getByRole('dialog', { name: 'Confirm reject' })).toBeVisible();
    const cancel = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancel);
    await expect.element(page.getByRole('dialog', { name: 'Confirm reject' })).not.toBeInTheDocument();

    recovery.holdCopy = true;
    await userEvent.click(page.getByRole('button', { name: 'Create Recovery Copy' }));
    const copyButton = page.getByRole('button', { name: 'Create Recovery Copy' });
    await expect.element(copyButton).toBeDisabled();
    expect(Array.from(element.shadowRoot?.querySelectorAll('button') ?? [])
      .map((button) => button.textContent?.trim() ?? '')
      .some((label) => /download|upload|delete|overwrite/i.test(label))).toBe(false);
    recovery.releaseHeldCopy();
    await expect.poll(() => recovery.calls.filter((call) => call === 'copy').length).toBe(1);
    await expect.element(page.getByRole('button', { name: 'Open Recovery Copy' })).toBeVisible();
  });

  it('persists an offline interruption in Chromium and does not replay or create a copy', async () => {
    const recovery = new BrowserRecoveryDouble();
    const { element, controller } = await createRun(recovery);
    window.dispatchEvent(new Event('offline'));
    await expect.poll(() => recovery.calls.includes('interrupted')).toBe(true);
    await expect.poll(() => controller.getState().phase).toBe('recovery-required');
    await expect.element(page.getByText('This run was interrupted. A new session, fresh observation, and approval are required before writing.')).toBeVisible();
    expect(recovery.calls).not.toContain('copy');
    expect(controller.getState().transactionsUsed).toBe(0);

    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recovery.calls.filter((call) => call === 'interrupted')).toHaveLength(1);
    controller.dispose();
    await element.updateComplete;
  });

  it('runs persisted safe reject and conflict-copy journeys without crossing active tabs', async () => {
    const safe = await createIndexedRecoveryJourney('safe');
    expect(safe.recoveryResult).toMatchObject({
      ok: true,
      outcome: 'restored-original-with-rejected-copy',
    });
    expect(safe.primary.project.name.value).toBe('Browser recovery original');
    expect(safe.primary.project.revision.value).toBe(2);
    expect(await digestProjectFile(await safe.primary.project.saveProject())).toBe(safe.checkpointDigest);
    if (!safe.copyId) throw new Error('Expected a safe recovery copy.');
    const safeCopy = await projectRepository.load(safe.copyId);
    expect(safeCopy?.name).toBe('Rejected Result Recovery Copy');
    expect(await digestProjectFile({ ...safeCopy!, name: 'Browser recovery result' })).toBe(safe.postRunDigest);
    await projectRepository.delete(safe.copyId);

    const conflict = await createIndexedRecoveryJourney('conflict');
    expect(conflict.recoveryResult).toMatchObject({
      ok: true,
      outcome: 'preserved-original-with-checkpoint-copy',
    });
    expect(conflict.primary.project.name.value).toBe('Browser manual edit');
    expect(conflict.primary.project.revision.value).toBe(2);
    expect(await digestProjectFile(await conflict.primary.project.saveProject())).not.toBe(conflict.checkpointDigest);
    if (!conflict.copyId) throw new Error('Expected a conflict recovery copy.');
    const conflictCopy = await projectRepository.load(conflict.copyId);
    expect(conflictCopy?.name).toBe('Checkpoint Recovery Copy');
    expect(await digestProjectFile({ ...conflictCopy!, name: 'Browser recovery original' })).toBe(conflict.checkpointDigest);
    await projectRepository.delete(conflict.copyId);
    await projectRepository.delete(conflict.primary.project.id.value);
  });

  it('lets the composed app render and control a supplied run without creating one', async () => {
    const { controller, fixture, manager } = await createRun();
    const revisionBefore = fixture.projectContext.project.revision.value;
    document.body.replaceChildren();
    const app = document.createElement('pixel-forge-app') as HTMLElement & {
      creativeRunController: CreativeRunController | null;
      updateComplete: Promise<unknown>;
    };
    app.creativeRunController = controller;
    document.body.append(app);
    await app.updateComplete;

    const panel = app.shadowRoot?.querySelector('pf-creative-run-panel') as PFCreativeRunPanel | null;
    expect(panel?.controller).toBe(controller);
    await expect.element(page.getByRole('heading', { name: 'Creative Run' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Start Run' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Start Run' }));
    await expect.poll(() => controller.getState().phase).toBe('stopped');
    expect(fixture.projectContext.project.revision.value).toBe(revisionBefore + 1);
    expect(manager.listLocalArtistModeRuns()[0]?.status).toBe('completed');
  });

  it('completes the deterministic two-project supervision journey without touching the second project', async () => {
    const primary = createFixtureSession({ projectId: 'creative-journey-primary' });
    const secondary = createFixtureSession({ projectId: 'creative-journey-secondary' });
    fixtures.push(primary, secondary);
    await primary.runAnimationObservation();
    await secondary.runAnimationObservation();
    const primaryBefore = primary.projectContext.project.revision.value;
    const secondaryBefore = secondary.projectContext.project.revision.value;
    const primaryTarget: AutomationLocalTarget = {
      id: primary.target.projectId,
      name: 'Journey primary',
      context: primary.projectContext,
    };
    const secondaryTarget: AutomationLocalTarget = {
      id: secondary.target.projectId,
      name: 'Journey secondary',
      context: secondary.projectContext,
    };
    let requestNumber = 0;
    const manager = new AutomationSessionManager({
      targets: () => [primaryTarget, secondaryTarget],
      isPageVisible: () => true,
      requestIdFactory: () => `journey-request-${++requestNumber}`,
      sessionIdFactory: () => 'journey-session',
    });
    managers.push(manager);
    const inspect = manager.requestSession({
      client: { name: 'Journey client', identity: 'self-declared' },
      compatibility: { minVersion: '1.0', maxVersion: '1.0' },
      observationClasses: ['structure', 'timeline', 'save-state'],
      lifetimeSeconds: 60,
    });
    if (!inspect.ok) throw new Error('Expected a journey inspect request.');
    manager.captureLocalTargets(inspect.result.requestId);
    const inspectGrant = manager.approveRequest(inspect.result.requestId, primaryTarget.id, ['structure', 'timeline', 'save-state']);
    if (!inspectGrant.ok) throw new Error('Expected a journey inspect grant.');
    const artistRequest = manager.requestArtistMode({
      sessionId: inspectGrant.result.sessionId,
      runId: 'journey-run',
      runIntent: 'Prepare a deterministic title card',
      requestedWriteCategories: ['structure', 'timeline'],
      requestedTransactionLimit: 2,
      requestedDurationSeconds: 60,
    });
    if (!artistRequest.ok) throw new Error('Expected a journey Artist Mode request.');
    manager.captureArtistModeTarget(artistRequest.result.requestId);
    const artistGrant = manager.approveArtistMode(artistRequest.result.requestId, ['structure', 'timeline'], 2);
    if (!artistGrant.ok) throw new Error('Expected a journey Artist Mode grant.');
    const layer = primary.projectContext.layers.layers.value[0];
    if (!layer) throw new Error('Expected a journey fixture layer.');
    const createStep = (tagName: string, visible: boolean) => ({
      profile: 'layer-and-tag' as const,
      children: [
        {
          command: 'project.layer.state' as const,
          input: { kind: 'layer.visibility', layerId: layer.id, visible },
        },
        {
          command: 'project.animation.frame-tag' as const,
          input: {
            kind: 'tag.create',
            name: tagName,
            color: '#123456',
            startFrameIndex: 0,
            endFrameIndex: 0,
          },
        },
      ],
    });
    const durationFrame = primary.projectContext.animation.frames.value[1];
    if (!durationFrame) throw new Error('Expected a journey fixture animation frame.');
    const createAnimationStep = () => ({
      profile: 'animation' as const,
      children: [
        {
          command: 'project.animation.frame' as const,
          input: {
            kind: 'frame.duration' as const,
            frameId: durationFrame.id,
            duration: durationFrame.duration + 20,
          },
        },
      ],
    });
    let stepNumber = 0;
    let resolveSecondPlan!: (value: CreativeRunStep | null) => void;
    let signalSecondPlan!: () => void;
    const secondPlanRequested = new Promise<void>((resolve) => { signalSecondPlan = resolve; });
    const pendingSecondPlan = new Promise<CreativeRunStep | null>((resolve) => { resolveSecondPlan = resolve; });
    let transactionNumber = 0;
    let signalTransaction!: () => void;
    const transactionDispatched = new Promise<void>((resolve) => { signalTransaction = resolve; });
    let releaseTransaction!: () => void;
    const pendingTransaction = new Promise<void>((resolve) => { releaseTransaction = resolve; });
    let signalPackage!: () => void;
    const packageRequested = new Promise<void>((resolve) => { signalPackage = resolve; });
    let releasePackage!: () => void;
    const pendingPackage = new Promise<void>((resolve) => { releasePackage = resolve; });
    const firstStep = createStep('Journey first', false);
    const secondStep = createAnimationStep();
    const controller = new CreativeRunController({
      sessionManager: manager,
      sessionId: inspectGrant.result.sessionId,
      runId: artistGrant.result.runId,
      brief: {
        targetId: primaryTarget.id,
        targetName: primaryTarget.name,
        goal: 'Make a calm title card',
        constraints: ['Keep the existing canvas'],
        requestedWriteCategories: ['structure', 'timeline'],
        transactionLimit: 2,
        durationSeconds: 30,
        contentEgress: 'local-only',
      },
      getCurrentRevision: () => primary.projectContext.project.revision.value,
      stepSource: () => {
        if (stepNumber === 0) {
          stepNumber += 1;
          return firstStep;
        }
        if (stepNumber === 1) {
          stepNumber += 1;
          signalSecondPlan();
          return pendingSecondPlan;
        }
        if (stepNumber === 2) {
          stepNumber += 1;
          return secondStep;
        }
        return null;
      },
      executeTransaction: async (sessionId, runId, input) => {
        transactionNumber += 1;
        const result = manager.executeArtistModeTransaction(sessionId, runId, input);
        if (transactionNumber === 2) {
          signalTransaction();
          await pendingTransaction;
        }
        return result;
      },
      preparePackage: async (request) => {
        signalPackage();
        await pendingPackage;
        const packageResult = await primary.adapter.request({
          operation: 'project.asset-package.prepare',
          target: { projectId: primaryTarget.id },
          expectedRevision: request.expectedRevision,
          expectedSaveSafety: {
            ...(request.expectedSaveSafety as Record<string, unknown>),
            target: { projectId: primaryTarget.id },
          },
          expectedPackageDigest: request.expectedPackageDigest,
        });
        return packageResult.ok
          ? { ok: true, result: packageResult.result as never }
          : { ok: false, error: packageResult.error };
      },
    });
    controller.approveBrief({
      briefRevision: 1,
      targetId: primaryTarget.id,
      requestedWriteCategories: ['structure', 'timeline'],
      transactionLimit: 2,
      durationSeconds: 30,
      contentEgress: 'local-only',
    });

    setActiveProjectContext(primary.projectContext);
    const firstRunPromise = controller.start();
    await secondPlanRequested;
    expect(controller.pause()).toMatchObject({ ok: true, state: { phase: 'pausing' } });
    setActiveProjectContext(secondary.projectContext);
    resolveSecondPlan(secondStep);
    const pausedRun = await firstRunPromise;
    expect(pausedRun).toMatchObject({ ok: true, state: { phase: 'paused', transactionsUsed: 1 } });
    expect(primary.projectContext.project.revision.value).toBe(primaryBefore + 1);
    expect(secondary.projectContext.project.revision.value).toBe(secondaryBefore);

    const resumedRunPromise = controller.resume();
    await transactionDispatched;
    expect(controller.stop()).toMatchObject({ ok: true, state: { phase: 'stopping' } });
    releaseTransaction();
    const stoppedRun = await resumedRunPromise;
    expect(stoppedRun).toMatchObject({ ok: true, state: { phase: 'stopped', transactionsUsed: 2 } });
    expect(manager.listLocalArtistModeRuns()[0]?.status).toBe('completed');
    expect(primary.projectContext.project.revision.value).toBe(primaryBefore + 2);
    expect(secondary.projectContext.project.revision.value).toBe(secondaryBefore);

    const saved = await primary.adapter.request({
      operation: 'project.save',
      target: { projectId: primaryTarget.id },
      expectedRevision: primary.projectContext.project.revision.value,
    });
    if (!saved.ok) throw new Error('Expected the journey project to save.');
    const acceptedPromise = controller.accept({
      expectedSaveSafety: (saved.result as { readonly saveSafety: unknown }).saveSafety,
    });
    await packageRequested;
    setActiveProjectContext(secondary.projectContext);
    releasePackage();
    const accepted = await acceptedPromise;
    expect(accepted).toMatchObject({ ok: true, state: { phase: 'accepted', packagePreparedRevision: primaryBefore + 2 } });
    expect(primary.projectContext.project.revision.value).toBe(primaryBefore + 2);
    expect(secondary.projectContext.project.revision.value).toBe(secondaryBefore);
    expect(JSON.stringify(controller.getState().timeline)).not.toContain(primaryTarget.id);
  }, 30_000);
});
