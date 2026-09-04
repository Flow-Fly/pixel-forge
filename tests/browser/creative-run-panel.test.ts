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

afterEach(() => {
  document.body.replaceChildren();
  restoreDefaultProjectContext();
  for (const manager of managers.splice(0)) manager.dispose();
  for (const fixture of fixtures.splice(0)) fixture.dispose();
});

async function createRun(): Promise<{ element: PFCreativeRunPanel; controller: CreativeRunController; fixture: FixtureSession; manager: AutomationSessionManager }> {
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
