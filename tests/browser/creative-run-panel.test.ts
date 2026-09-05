import { afterEach, describe, expect, it } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import {
  AutomationSessionManager,
  type AutomationLocalTarget,
} from '../../src/editor/automation-session';
import {
  CreativeRunController,
  type CreativeRunControllerOptions,
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
  private releaseRewind: (() => void) | null = null;
  holdCopy = false;
  holdRewind = false;
  readonly calls: string[] = [];
  record: CreativeRunRecoveryRecord | null = null;

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

  async reactivateAfterReapproval(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('reactivate');
    this.currentStatus = { ...this.currentStatus, requiresReapproval: false, interrupted: false };
    return this.result(null, null, 'none');
  }

  async rewind(): Promise<CreativeRunRecoveryResult> {
    this.calls.push('rewind');
    if (this.holdRewind) {
      await new Promise<void>((resolve) => {
        this.releaseRewind = resolve;
      });
    }
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

  releaseHeldRewind(): void {
    const release = this.releaseRewind;
    this.releaseRewind = null;
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

interface CreateRunOptions {
  readonly fixture?: FixtureSession;
  readonly sessionId?: string;
  readonly runId?: string;
  readonly approve?: boolean;
  readonly createReplacementController?: CreativeRunControllerOptions['createReplacementController'];
  readonly stepSource?: CreativeRunControllerOptions['stepSource'];
  readonly preparePackage?: CreativeRunControllerOptions['preparePackage'];
}

interface BrowserRunAuthority {
  readonly manager: AutomationSessionManager;
  readonly target: AutomationLocalTarget;
  readonly sessionId: string;
  readonly runId: string;
}

async function createRun(
  recovery?: CreativeRunRecovery,
  options: CreateRunOptions = {},
): Promise<{ element: PFCreativeRunPanel; controller: CreativeRunController; fixture: FixtureSession; manager: AutomationSessionManager }> {
  const fixture = await prepareFixture(options);
  const authority = createBrowserAuthority(fixture, options);
  const controller = createBrowserController(authority, fixture, recovery, options);
  if (options.approve !== false) approveBrowserRun(controller, authority.target.id);
  const element = document.createElement('pf-creative-run-panel') as PFCreativeRunPanel;
  element.controller = controller;
  document.body.append(element);
  await element.updateComplete;
  return { element, controller, fixture, manager: authority.manager };
}

async function prepareFixture(options: CreateRunOptions): Promise<FixtureSession> {
  const fixture = options.fixture ?? createFixtureSession();
  if (options.fixture) return fixture;
  fixtures.push(fixture);
  await fixture.runAnimationObservation();
  return fixture;
}

function createBrowserAuthority(
  fixture: FixtureSession,
  options: CreateRunOptions,
): BrowserRunAuthority {
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
    sessionIdFactory: () => options.sessionId ?? 'creative-browser-session',
  });
  managers.push(manager);

  const inspect = manager.requestSession({
    client: { name: 'Creative Run Chromium', identity: 'self-declared' },
    compatibility: { minVersion: '1.0', maxVersion: '1.0' },
    observationClasses: ['structure', 'timeline', 'save-state'],
    lifetimeSeconds: 60,
  });
  if (!inspect.ok) throw new Error('Expected an inspect request.');
  manager.captureLocalTargets(inspect.result.requestId);
  const inspectGrant = manager.approveRequest(inspect.result.requestId, target.id, ['structure', 'timeline', 'save-state']);
  if (!inspectGrant.ok) throw new Error('Expected an inspect grant.');
  const artistRequest = manager.requestArtistMode({
    sessionId: inspectGrant.result.sessionId,
    runId: options.runId ?? 'creative-browser-run',
    runIntent: 'Prepare one fixture title card',
    requestedWriteCategories: ['structure', 'timeline'],
    requestedTransactionLimit: 2,
    requestedDurationSeconds: 60,
  });
  if (!artistRequest.ok) throw new Error('Expected an Artist Mode request.');
  manager.captureArtistModeTarget(artistRequest.result.requestId);
  const artistGrant = manager.approveArtistMode(artistRequest.result.requestId, ['structure', 'timeline'], 2);
  if (!artistGrant.ok) throw new Error('Expected an Artist Mode grant.');
  return {
    manager,
    target,
    sessionId: inspectGrant.result.sessionId,
    runId: artistGrant.result.runId,
  };
}

function createBrowserController(
  authority: BrowserRunAuthority,
  fixture: FixtureSession,
  recovery: CreativeRunRecovery | undefined,
  options: CreateRunOptions,
): CreativeRunController {
  const layer = fixture.projectContext.layers.layers.value[0];
  if (!layer) throw new Error('Expected a fixture layer.');
  let emitted = false;
  const controller = new CreativeRunController({
    sessionManager: authority.manager,
    sessionId: authority.sessionId,
    runId: authority.runId,
    brief: {
      targetId: authority.target.id,
      targetName: authority.target.name,
      goal: 'Make a calm title card',
      constraints: ['Keep the existing canvas'],
      requestedWriteCategories: ['structure', 'timeline'],
      transactionLimit: 2,
      durationSeconds: 30,
      contentEgress: 'local-only',
    },
    getCurrentRevision: () => fixture.projectContext.project.revision.value,
    recovery,
    createReplacementController: options.createReplacementController,
    preparePackage: options.preparePackage,
    stepSource: options.stepSource ?? (() => {
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
    }),
  });
  return controller;
}

function approveBrowserRun(controller: CreativeRunController, targetId: string): void {
  controller.approveBrief({
    briefRevision: 1,
    targetId,
    requestedWriteCategories: ['structure', 'timeline'],
    transactionLimit: 2,
    durationSeconds: 30,
    contentEgress: 'local-only',
  });
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

async function createIndexedRecoveryJourney(kind: 'safe' | 'conflict' | 'rewind'): Promise<{
  readonly primary: ProjectContext;
  readonly secondary: ProjectContext;
  readonly recoveryResult: CreativeRunRecoveryResult;
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
  if (kind === 'rewind') {
    setActiveProjectContext(primary);
    const recoveryResult = await reloaded.rewind({ checkpoint: true });
    expect(await secondary.project.saveProject()).toEqual(secondaryBefore);
    return {
      primary,
      secondary,
      recoveryResult,
      copyId: null,
      checkpointDigest,
      postRunDigest,
    };
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
  // fallow-ignore-next-line complexity -- This browser proof keeps the public run, focus, and progressive disclosure assertions together.
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
    expect(element.shadowRoot?.querySelector('.surface')?.getAttribute('data-run-id')).toBe(controller.getState().runId);
    expect(element.shadowRoot?.querySelector('.surface')?.getAttribute('data-target-id')).toBe(controller.getState().target.id);
    for (const button of element.shadowRoot?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
      expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }

    const timeline = element.shadowRoot?.querySelector<HTMLDetailsElement>('.timeline-disclosure');
    expect(timeline?.open).toBe(true);
    timeline?.removeAttribute('open');
    expect(element.shadowRoot?.querySelector('.status')?.textContent).toContain('stopped');
    const authority = element.shadowRoot?.querySelector('.authority')?.textContent ?? '';
    expect(authority).toContain('Transactions');
    expect(authority).toContain('Grant');
    expect(authority).toContain('Revision');
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
    element.style.inlineSize = '240px';
    controller.stop();
    await element.updateComplete;

    await expect.element(page.getByText('Recovery safety')).toBeVisible();
    const reject = page.getByRole('button', { name: 'Reject Run…' });
    await expect.element(reject).toBeVisible();
    await userEvent.click(reject);
    await expect.element(page.getByRole('dialog', { name: 'Confirm reject' })).toBeVisible();
    await expect.element(page.getByText(/resets conventional undo\/redo history/)).toBeVisible();
    await expect.poll(() => element.shadowRoot?.activeElement?.textContent?.trim()).toBe('Cancel');
    const surface = element.shadowRoot?.querySelector<HTMLElement>('.surface');
    expect(surface && surface.scrollWidth <= surface.clientWidth).toBe(true);
    const cancel = page.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancel);
    await expect.element(page.getByRole('dialog', { name: 'Confirm reject' })).not.toBeInTheDocument();

    const checkpointRewind = page.getByRole('button', { name: 'Rewind to Checkpoint…' });
    await userEvent.click(checkpointRewind);
    const rewindDialog = page.getByRole('dialog', { name: 'Confirm rewind' });
    await expect.element(rewindDialog).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.element(rewindDialog).not.toBeInTheDocument();

    recovery.holdRewind = true;
    await userEvent.click(checkpointRewind);
    await userEvent.click(page.getByRole('button', { name: 'Rewind', exact: true }));
    await expect.poll(() => recovery.calls.filter((call) => call === 'rewind').length).toBe(1);
    await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(element.shadowRoot?.querySelector('.surface-content')?.hasAttribute('inert')).toBe(true);
    recovery.releaseHeldRewind();
    await expect.poll(() => recovery.calls.filter((call) => call === 'rewind').length).toBe(1);
    await expect.element(rewindDialog).not.toBeInTheDocument();

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
    expect(element.shadowRoot?.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(element.shadowRoot?.querySelector('[role="status"]')?.textContent).toContain('interrupted');
    expect(recovery.calls).not.toContain('copy');
    expect(controller.getState().transactionsUsed).toBe(0);

    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recovery.calls.filter((call) => call === 'interrupted')).toHaveLength(1);
    controller.dispose();
    await element.updateComplete;
  });

  it('persists a hidden-tab interruption when visibility changes to hidden', async () => {
    const recovery = new BrowserRecoveryDouble();
    const { controller } = await createRun(recovery);
    const previousVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await expect.poll(() => recovery.calls.includes('interrupted')).toBe(true);
      await expect.poll(() => controller.getState().phase).toBe('recovery-required');
    } finally {
      if (previousVisibility) {
        Object.defineProperty(document, 'visibilityState', previousVisibility);
      } else {
        Reflect.deleteProperty(document, 'visibilityState');
      }
    }
    expect(recovery.calls).not.toContain('copy');
    expect(controller.getState().transactionsUsed).toBe(0);
  });

  it('fences orientation and suspension events without resuming on foreground return', async () => {
    const recovery = new BrowserRecoveryDouble();
    const { controller } = await createRun(recovery);

    window.dispatchEvent(new Event('orientationchange'));
    await expect.poll(() => recovery.calls.includes('interrupted')).toBe(true);
    await expect.poll(() => controller.getState().phase).toBe('recovery-required');

    document.dispatchEvent(new Event('freeze'));
    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recovery.calls.filter((call) => call === 'interrupted')).toHaveLength(1);
    expect(controller.getState().phase).toBe('recovery-required');
    expect(controller.getState().transactionsUsed).toBe(0);
    controller.dispose();
  });

  it('hands reload recovery to a fresh observed session and rebinds the panel', async () => {
    const recovery = new BrowserRecoveryDouble();
    let replacement: Awaited<ReturnType<typeof createRun>> | null = null;
    let secondReplacement: Awaited<ReturnType<typeof createRun>> | null = null;
    const originalFixture = createFixtureSession();
    fixtures.push(originalFixture);
    await originalFixture.runAnimationObservation();
    const original = await createRun(recovery, {
      fixture: originalFixture,
      createReplacementController: async () => {
        const replacementRecovery = new BrowserRecoveryDouble();
        replacement = await createRun(replacementRecovery, {
          fixture: originalFixture,
          sessionId: 'creative-browser-replacement-session',
          runId: 'creative-browser-replacement-run',
          approve: false,
          createReplacementController: async () => {
            secondReplacement = await createRun(undefined, {
              fixture: originalFixture,
              sessionId: 'creative-browser-second-replacement-session',
              runId: 'creative-browser-second-replacement-run',
              approve: false,
            });
            secondReplacement.element.remove();
            return {
              controller: secondReplacement.controller,
              sessionId: 'creative-browser-second-replacement-session',
              observedRevision: -1,
            };
          },
        });
        replacement.element.remove();
        return {
          controller: replacement.controller,
          sessionId: 'creative-browser-replacement-session',
          observedRevision: -1,
        };
      },
    });
    await original.controller.markInterrupted();
    await expect.element(page.getByRole('button', { name: 'Resume with New Session…' })).toBeVisible();

    await userEvent.click(page.getByRole('button', { name: 'Resume with New Session…' }));
    await expect.poll(() => original.controller.replacement !== null).toBe(true);
    expect(original.controller.replacement).not.toBeNull();
    const replacementController = original.controller.replacement;
    if (!replacementController) throw new Error('Expected a replacement controller.');
    expect(replacementController.getState()).toMatchObject({
      phase: 'draft',
      approvedBriefRevision: null,
      sessionId: 'creative-browser-replacement-session',
      runId: 'creative-browser-replacement-run',
    });
    expect(original.controller.getState().approvedBriefRevision).toBeNull();
    expect(original.controller.getState().phase).toBe('recovery-required');
    await expect.element(page.getByText('Run creative-browser-replacement-run, Brief revision 1')).toBeVisible();
    expect(replacement).not.toBeNull();
    if (!replacement) throw new Error('Expected the first replacement controller.');
    await replacement.controller.markInterrupted();
    await expect.element(page.getByRole('button', { name: 'Resume with New Session…' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Resume with New Session…' }));
    await expect.poll(() => replacement.controller.replacement !== null).toBe(true);
    expect(secondReplacement).not.toBeNull();
    await expect.element(page.getByText('Run creative-browser-second-replacement-run, Brief revision 1')).toBeVisible();
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

    const rewind = await createIndexedRecoveryJourney('rewind');
    expect(rewind.recoveryResult).toMatchObject({
      ok: true,
      outcome: 'rewound-to-owned-transaction',
    });
    expect(rewind.primary.project.name.value).toBe('Browser recovery original');
    expect(rewind.primary.project.revision.value).toBe(2);
    expect(await digestProjectFile(await rewind.primary.project.saveProject())).toBe(rewind.checkpointDigest);
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

  // fallow-ignore-next-line complexity -- This browser proof keeps responsive dominance and control reachability together.
  it('keeps the result viewport dominant and the same run panel reachable in Chrome portrait', async () => {
    const { controller, element } = await createRun();
    element.remove();
    const app = document.createElement('pixel-forge-app') as HTMLElement & {
      creativeRunController: CreativeRunController | null;
      updateComplete: Promise<unknown>;
    };
    app.creativeRunController = controller;
    document.body.append(app);

    try {
      await page.viewport(390, 844);
      await app.updateComplete;

      const root = app.shadowRoot;
      const workspace = root?.querySelector<HTMLElement>('.workspace');
      const panels = root?.querySelector<HTMLElement>('.panels');
      const toolbar = root?.querySelector<HTMLElement>('.toolbar');
      const runPanel = root?.querySelector<HTMLElement>('pf-panel[panel-id="creative-run"]');
      const otherPanels = [...(root?.querySelectorAll<HTMLElement>('.panels > pf-panel:not([panel-id="creative-run"])') ?? [])];

      expect(getComputedStyle(toolbar!).display).toBe('none');
      expect(workspace?.getBoundingClientRect().width).toBeLessThanOrEqual(390);
      expect(panels?.getBoundingClientRect().width).toBeLessThanOrEqual(390);
      expect(workspace?.getBoundingClientRect().height).toBeGreaterThan(panels?.getBoundingClientRect().height ?? 0);
      expect(getComputedStyle(runPanel!).display).not.toBe('none');
      expect(otherPanels.every((panel) => getComputedStyle(panel).display === 'none')).toBe(true);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
      expect(root?.querySelector('pf-creative-run-panel')?.getAttribute('data-run-id')).toBeNull();
      const runSurface = runPanel?.querySelector('pf-creative-run-panel')?.shadowRoot?.querySelector('[data-run-id]');
      expect(runSurface?.getAttribute('data-run-id')).toBe(controller.getState().runId);
      expect(app.hasAttribute('data-agent-mode')).toBe(true);

      const panelToggle = runPanel?.shadowRoot?.querySelector<HTMLButtonElement>('.header-toggle');
      const panelContent = runPanel?.shadowRoot?.querySelector<HTMLElement>('.content');
      expect(panelToggle?.getAttribute('aria-controls')).toBe(panelContent?.id);
      expect(panelContent?.hasAttribute('hidden')).toBe(false);

      const timeline = root?.querySelector('pf-timeline')?.shadowRoot;
      const playback = timeline?.querySelector('pf-playback-controls')?.shadowRoot;
      for (const button of playback?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
        expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      }

      await page.viewport(844, 390);
      await app.updateComplete;
      expect(workspace?.getBoundingClientRect().width).toBeGreaterThan(0);
      expect(panels?.getBoundingClientRect().width).toBeGreaterThanOrEqual(280);
      expect(getComputedStyle(toolbar!).display).toBe('none');
      expect(otherPanels.every((panel) => getComputedStyle(panel).display === 'none')).toBe(true);
      const canvas = root?.querySelector<HTMLElement>('pf-canvas-viewport');
      expect((canvas?.getBoundingClientRect().width ?? 0) * (canvas?.getBoundingClientRect().height ?? 0))
        .toBeGreaterThan((panels?.getBoundingClientRect().width ?? 0) * (panels?.getBoundingClientRect().height ?? 0));
      const landscapePlayback = root?.querySelector('pf-timeline')?.shadowRoot
        ?.querySelector<HTMLElement>('pf-playback-controls');
      for (const button of landscapePlayback?.shadowRoot?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
        expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
        expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      }
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
      await page.viewport(390, 844);
    } finally {
      await page.viewport(1280, 800);
    }
  });

  it('keeps the ordinary narrow editor intact when Agent Mode is not active', async () => {
    const app = document.createElement('pixel-forge-app') as HTMLElement & { updateComplete: Promise<unknown> };
    document.body.append(app);

    try {
      await page.viewport(390, 844);
      await app.updateComplete;

      const root = app.shadowRoot;
      expect(app.hasAttribute('data-agent-mode')).toBe(false);
      const toolbar = root?.querySelector<HTMLElement>('.toolbar');
      expect(toolbar).not.toBeNull();
      if (!toolbar) throw new Error('Expected the ordinary editor toolbar.');
      expect(getComputedStyle(toolbar).display).not.toBe('none');
      expect(root?.querySelectorAll('.panels > pf-panel')).toHaveLength(4);
    } finally {
      await page.viewport(1280, 800);
    }
  });

  it('preserves recovery truth when the same controller crosses portrait and desktop viewports', async () => {
    const recovery = new BrowserRecoveryDouble();
    const { element, controller } = await createRun(recovery);
    element.remove();
    localStorage.removeItem('pf-panel-states');

    const app = document.createElement('pixel-forge-app') as HTMLElement & {
      creativeRunController: CreativeRunController | null;
      updateComplete: Promise<unknown>;
    };
    app.creativeRunController = controller;
    document.body.append(app);
    try {
      await controller.markInterrupted('work-unsettled');
      await app.updateComplete;

      const runPanel = app.shadowRoot?.querySelector('pf-panel[panel-id="creative-run"]')
        ?.querySelector('pf-creative-run-panel') as PFCreativeRunPanel | null;
      const timeline = runPanel?.shadowRoot?.querySelector<HTMLDetailsElement>('.timeline-disclosure');
      timeline?.removeAttribute('open');
      const initial = controller.getState();
      const recoveryTruth = {
        runId: initial.runId,
        targetId: initial.target.id,
        currentRevision: initial.currentRevision,
        lastDurableRevision: initial.lastDurableRevision,
        transactionsUsed: initial.transactionsUsed,
        packagePreparedRevision: initial.packagePreparedRevision,
        recovery: initial.recovery,
      };
      expect(recoveryTruth.recovery).toMatchObject({
        outcome: 'recovery-required',
        reason: 'work-unsettled',
        interrupted: true,
        requiresReapproval: true,
      });

      for (const viewport of [[195, 422], [1280, 800]] as const) {
        await page.viewport(viewport[0], viewport[1]);
        await app.updateComplete;
        expect(runPanel?.shadowRoot?.querySelector<HTMLDetailsElement>('.timeline-disclosure')?.open).toBe(false);
        expect(runPanel?.shadowRoot?.querySelector('.status')?.textContent).toContain('recovery required');
        expect(runPanel?.shadowRoot?.querySelector('.recovery-summary')?.textContent).toContain('interrupted');
        expect(runPanel?.shadowRoot?.querySelector<HTMLElement>('[data-run-id]')?.dataset.runId)
          .toBe(recoveryTruth.runId);
        expect(runPanel?.shadowRoot?.querySelector<HTMLElement>('[data-run-id]')?.dataset.targetId)
          .toBe(recoveryTruth.targetId);
        expect(controller.getState()).toMatchObject({
          runId: recoveryTruth.runId,
          currentRevision: recoveryTruth.currentRevision,
          lastDurableRevision: recoveryTruth.lastDurableRevision,
          transactionsUsed: recoveryTruth.transactionsUsed,
          packagePreparedRevision: recoveryTruth.packagePreparedRevision,
          recovery: recoveryTruth.recovery,
        });
      }
    } finally {
      await page.viewport(1280, 800);
    }
  });

  // fallow-ignore-next-line complexity -- This Chromium proof keeps the complete creator journey and portrait emulation together.
  it('completes Brief to accept through the portrait controls with reduced motion and 200% CSS density', async () => {
    const fixture = createFixtureSession();
    fixtures.push(fixture);
    await fixture.runAnimationObservation();
    const portraitRevisionBefore = fixture.projectContext.project.revision.value;
    const layer = fixture.projectContext.layers.layers.value[0];
    const frame = fixture.projectContext.animation.frames.value[1];
    if (!layer || !frame) throw new Error('Expected the portrait journey fixture.');

    let planNumber = 0;
    let releasePendingPlan!: () => void;
    const pendingPlan = new Promise<void>((resolve) => { releasePendingPlan = resolve; });
    const firstStep: CreativeRunStep = {
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
            name: 'Portrait journey',
            color: '#123456',
            startFrameIndex: 0,
            endFrameIndex: 0,
          },
        },
      ],
    };
    const secondStep: CreativeRunStep = {
      profile: 'animation',
      children: [
        {
          command: 'project.animation.frame',
          input: { kind: 'frame.duration', frameId: frame.id, duration: frame.duration + 20 },
        },
      ],
    };

    const { controller, element } = await createRun(undefined, {
      fixture,
      stepSource: async () => {
        if (planNumber === 0) {
          planNumber += 1;
          return firstStep;
        }
        if (planNumber === 1) {
          planNumber += 1;
          await pendingPlan;
          return secondStep;
        }
        if (planNumber === 2) {
          planNumber += 1;
          return secondStep;
        }
        return null;
      },
      preparePackage: async () => ({ ok: true, result: {} as never }),
    });
    element.remove();
    setActiveProjectContext(fixture.projectContext);

    const app = document.createElement('pixel-forge-app') as HTMLElement & {
      creativeRunController: CreativeRunController | null;
      updateComplete: Promise<unknown>;
    };
    app.creativeRunController = controller;
    document.body.append(app);

    const browserCdp = cdp();
    try {
      await browserCdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      // A 195 CSS-pixel layout viewport is the reduced viewport Chromium
      // exposes for a 390-pixel phone viewed at 200% browser zoom.
      await page.viewport(195, 422);
      await app.updateComplete;

      expect(window.innerWidth).toBe(195);
      expect(window.visualViewport?.width).toBe(195);
      expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
      expect(app.hasAttribute('data-agent-mode')).toBe(true);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);

      const root = app.shadowRoot;
      const workspace = root?.querySelector<HTMLElement>('.workspace');
      const panels = root?.querySelector<HTMLElement>('.panels');
      const canvas = root?.querySelector<HTMLElement>('pf-canvas-viewport');
      const compactPlaybackHost = root?.querySelector('pf-timeline')?.shadowRoot?.querySelector<HTMLElement>('pf-playback-controls');
      expect(getComputedStyle(compactPlaybackHost!).display).not.toBe('none');
      expect((canvas?.getBoundingClientRect().height ?? 0)).toBeGreaterThan(0);
      expect(canvas?.getBoundingClientRect().height).toBeGreaterThanOrEqual(
        (workspace?.getBoundingClientRect().height ?? 0) - 120,
      );
      for (const button of compactPlaybackHost?.shadowRoot?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
        expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
        expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      }
      const runPanel = root?.querySelector('pf-panel[panel-id="creative-run"]')
        ?.querySelector('pf-creative-run-panel') as PFCreativeRunPanel | null;
      for (const button of runPanel?.shadowRoot?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
        if (button.getClientRects().length === 0) continue;
        expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
        expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      }
      expect((canvas?.getBoundingClientRect().width ?? 0) * (canvas?.getBoundingClientRect().height ?? 0))
        .toBeGreaterThan((panels?.getBoundingClientRect().width ?? 0) * (panels?.getBoundingClientRect().height ?? 0));

      await expect.element(page.getByText('Approved Creative Brief')).toBeVisible();
      await userEvent.click(page.getByRole('button', { name: 'Start Run' }));
      await expect.poll(() => controller.getState().phase).toBe('running');

      await userEvent.click(page.getByRole('button', { name: 'Pause' }));
      await expect.poll(() => controller.getState().phase).toBe('pausing');
      releasePendingPlan();
      await expect.poll(() => controller.getState().phase).toBe('paused');
      expect(controller.getState().transactionsUsed).toBe(1);

      await userEvent.click(page.getByText('Refine Brief', { exact: true }));
      await userEvent.fill(page.getByRole('textbox', { name: 'New goal' }), 'Make a portrait title card');
      await userEvent.click(page.getByRole('button', { name: 'Apply Brief Revision' }));
      await expect.poll(() => controller.getState().brief.revision).toBe(2);
      expect(controller.getState().phase).toBe('paused');
      await userEvent.click(page.getByRole('button', { name: 'Approve Brief' }));
      await expect.poll(() => controller.getState().approvedBriefRevision).toBe(2);
      expect(controller.getState().phase).toBe('paused');

      await userEvent.click(page.getByRole('button', { name: 'Resume Run' }));
      await expect.poll(() => controller.getState().phase).toBe('paused');
      expect(controller.getState().transactionsUsed).toBe(2);
      await userEvent.click(page.getByRole('button', { name: 'Stop' }));
      await expect.poll(() => controller.getState().phase).toBe('stopped');

      const timeline = app.shadowRoot?.querySelector('pf-timeline')?.shadowRoot;
      const playbackHost = timeline?.querySelector<HTMLElement>('pf-playback-controls');
      expect(getComputedStyle(playbackHost!).display).not.toBe('none');
      setActiveProjectContext(fixture.projectContext);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await expect.element(page.getByRole('button', { name: 'Play playback' })).toBeVisible();
      await userEvent.click(page.getByRole('button', { name: 'Play playback' }));
      await expect.poll(() => fixture.projectContext.animation.isPlaying.value).toBe(true);
      await userEvent.click(page.getByRole('button', { name: 'Pause playback' }));
      await expect.poll(() => fixture.projectContext.animation.isPlaying.value).toBe(false);

      await userEvent.click(page.getByRole('button', { name: 'Accept / Prepare Package' }));
      await expect.poll(() => controller.getState().phase).toBe('accepted');
      expect(controller.getState().packagePreparedRevision).toBe(fixture.projectContext.project.revision.value);
      expect(controller.getState().transactionsUsed).toBe(2);
      expect(fixture.projectContext.project.revision.value).toBe(portraitRevisionBefore + 2);

      const acceptedState = controller.getState();
      const acceptedPanel = app.shadowRoot?.querySelector('pf-panel[panel-id="creative-run"]')
        ?.querySelector('pf-creative-run-panel') as PFCreativeRunPanel | null;
      const acceptedTimeline = acceptedPanel?.shadowRoot?.querySelector<HTMLDetailsElement>('.timeline-disclosure');
      acceptedTimeline?.removeAttribute('open');
      await acceptedPanel?.updateComplete;
      expect(acceptedPanel?.shadowRoot?.querySelector('.status')?.textContent).toContain('accepted');
      const acceptedAuthority = acceptedPanel?.shadowRoot?.querySelector('.authority')?.textContent ?? '';
      expect(acceptedAuthority).toContain('Grant');
      expect(acceptedAuthority).toContain('remaining');
      expect(acceptedAuthority).toContain('Package prepared');
      const acceptedTruth = {
        runId: acceptedState.runId,
        targetId: acceptedState.target.id,
        currentRevision: acceptedState.currentRevision,
        lastDurableRevision: acceptedState.lastDurableRevision,
        transactionsUsed: acceptedState.transactionsUsed,
        packagePreparedRevision: acceptedState.packagePreparedRevision,
        recovery: acceptedState.recovery,
      };

      await page.viewport(1280, 800);
      await app.updateComplete;
      expect(app.shadowRoot?.querySelector('pf-timeline')?.hasAttribute('compact')).toBe(false);
      expect(acceptedPanel?.shadowRoot?.querySelector('.timeline-disclosure')?.open).toBe(false);
      expect(acceptedPanel?.shadowRoot?.querySelector('.status')?.textContent).toContain('accepted');
      expect(acceptedPanel?.shadowRoot?.querySelector<HTMLElement>('[data-run-id]')?.dataset.runId)
        .toBe(acceptedTruth.runId);
      expect(acceptedPanel?.shadowRoot?.querySelector<HTMLElement>('[data-run-id]')?.dataset.targetId)
        .toBe(acceptedTruth.targetId);
      expect(controller.getState()).toMatchObject({
        runId: acceptedTruth.runId,
        currentRevision: acceptedTruth.currentRevision,
        lastDurableRevision: acceptedTruth.lastDurableRevision,
        transactionsUsed: acceptedTruth.transactionsUsed,
        packagePreparedRevision: acceptedTruth.packagePreparedRevision,
        recovery: acceptedTruth.recovery,
      });

      await page.viewport(195, 422);
      await app.updateComplete;
      expect(app.shadowRoot?.querySelector('pf-timeline')?.hasAttribute('compact')).toBe(true);
      expect(acceptedPanel?.shadowRoot?.querySelector('.timeline-disclosure')?.open).toBe(false);
      expect(acceptedPanel?.shadowRoot?.querySelector('.status')?.textContent).toContain('accepted');
      expect(acceptedPanel?.shadowRoot?.querySelector<HTMLElement>('[data-run-id]')?.dataset.runId)
        .toBe(acceptedTruth.runId);
      expect(acceptedPanel?.shadowRoot?.querySelector('.authority')?.textContent).toContain('Package prepared');
      expect(controller.getState()).toMatchObject({
        runId: acceptedTruth.runId,
        currentRevision: acceptedTruth.currentRevision,
        lastDurableRevision: acceptedTruth.lastDurableRevision,
        transactionsUsed: acceptedTruth.transactionsUsed,
        packagePreparedRevision: acceptedTruth.packagePreparedRevision,
        recovery: acceptedTruth.recovery,
      });
    } finally {
      await browserCdp.send('Emulation.setEmulatedMedia', { features: [] });
      await browserCdp.send('Emulation.clearDeviceMetricsOverride');
      await page.viewport(1280, 800);
    }
  }, 30_000);

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
