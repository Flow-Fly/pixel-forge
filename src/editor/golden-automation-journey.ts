import pako from 'pako';
import type {
  AutomationFailure,
  AutomationAdapter,
  CatalogNegotiation,
  HistoryTransitionResult,
  ProjectCreateResult,
  ReloadResult,
  SaveResult,
} from './automation-adapter';
import {
  AutomationSessionManager,
  type ArtistModeGrant,
  type AutomationLocalTarget,
  type AutomationSessionResult,
  type InspectObservationClass,
} from './automation-session';
import {
  CreativeRunController,
  type CreativeBriefInput,
  type CreativeRunActionResult,
  type CreativeRunState,
  type CreativeRunStep,
  type CreativeRunStepContext,
} from './creative-run';
import {
  CreativeRunRecoveryCoordinator,
  digestProjectFile,
  type CreativeRunRecovery,
  type CreativeRunRecoveryRecord,
  type CreativeRunRecoveryPersistence,
} from './creative-run-recovery';
import { createProjectRecoveryTarget } from './creative-run-recovery-boundaries';
import {
  createFixtureSession,
  type FixtureSession,
} from './fixture-session';
import {
  ANIMATION_FRAME_COMMAND_ID,
  FRAME_TAG_COMMAND_ID,
  RASTER_PATCH_COMMAND_ID,
  STATIC_LAYER_TREE_COMMAND_ID,
  STATIC_PALETTE_COMMAND_ID,
  STRUCTURE_REFINEMENT_COMMAND_ID,
} from './catalog';
import type {
  AnimationEvaluationBundle,
} from './animation-observation';
import { reconstructAnimationGrids } from './animation-observation';
import type {
  ProjectLayerObservation,
  ProjectObservation,
} from './observations';
import type {
  RasterObservation,
} from './symbol-grid';
import type {
  EditorTransactionChildInput,
  EditorTransactionProfile,
  EditorTransactionResult,
} from './transaction';
import type {
  StaticLayerDeclaration,
} from './static-structure';
import type {
  StructureRefinementLayerDeclaration,
} from './structure-refinement';
import type {
  AssetPackageArtifact,
  AssetPackageResult,
} from './asset-package';
import type { EditorError, ProjectTarget } from './contracts';
import {
  decodeProjectFile,
  type ProjectFile,
  type ProjectFileInput,
} from '../types/project';

const GOLDEN_PROJECT_ID = 'golden-automation-project';
const GOLDEN_PROJECT_NAME = 'Golden Automation Journey';
const GOLDEN_RUN_ID = 'golden-automation-run';
const GOLDEN_WIDTH = 32;
const GOLDEN_HEIGHT = 32;
const GOLDEN_TRANSACTION_LIMIT = 16;
const GOLDEN_DURATION_SECONDS = 120;

const GOLDEN_PALETTE = Object.freeze([
  { id: 'golden-ink', color: '#3d348b' },
  { id: 'golden-sun', color: '#f3ca40' },
  { id: 'golden-coral', color: '#ee6c4d' },
  { id: 'golden-mint', color: '#70c1b3' },
]);

const INSPECTION_CLASSES = Object.freeze([
  'structure',
  'palette',
  'timeline',
  'raster',
  'render',
  'save-state',
] as const satisfies readonly InspectObservationClass[]);

const WRITE_CATEGORIES = Object.freeze(['structure', 'palette', 'timeline', 'raster'] as const);

export interface GoldenAutomationJourneyOptions {
  /** A caller-owned fixture keeps the public target available for preview checks. */
  readonly fixture?: FixtureSession;
}

export interface GoldenAutomationFailureProof {
  readonly error: AutomationFailure['error'];
  readonly revisionBefore: number;
  readonly revisionAfter: number;
}

export interface GoldenBudgetFailureProof {
  readonly firstTransaction: EditorTransactionResult;
  readonly exhausted: GoldenAutomationFailureProof;
  readonly restored: boolean;
}

export interface GoldenHistoryProof {
  readonly edit: EditorTransactionResult;
  readonly undo: HistoryTransitionResult;
  readonly redo: HistoryTransitionResult;
  readonly before: ProjectObservation;
  readonly after: ProjectObservation;
}

export interface GoldenRecoveryProof {
  readonly checkpointPersisted: boolean;
  readonly oldAuthorityInvalidated: boolean;
  readonly oldSessionId: string;
  readonly oldRunId: string;
  readonly freshSessionId: string;
  readonly freshRunId: string;
  readonly freshObservationCount: number;
  readonly reapproved: boolean;
  readonly revisionBeforeInterruption: number;
  readonly revisionAfterLateResult: number;
  readonly queuedWriteWasNotReplayed: boolean;
}

export interface GoldenPackageProof {
  readonly save: SaveResult;
  readonly reload: ReloadResult;
  readonly assetPackage: AssetPackageResult;
  readonly replay: AssetPackageResult;
  readonly decodedSource: ProjectFile;
  readonly persistedDocument: ProjectFile;
  readonly exact: {
    readonly reconstruction: boolean;
    readonly source: boolean;
    readonly persistedSource: boolean;
    readonly replay: boolean;
    readonly manifest: boolean;
    readonly spriteCells: boolean;
    readonly renderedDigests: boolean;
    readonly timingAndTags: boolean;
  };
}

export interface GoldenControllerProof {
  readonly initialPause: CreativeRunState;
  readonly midJourney: {
    readonly paused: CreativeRunState;
    readonly save: SaveResult;
    readonly reload: ReloadResult;
    readonly reobserved: ProjectObservation;
  };
  readonly originalAfterInterruption: CreativeRunState;
  readonly replacement: CreativeRunState;
  readonly accepted: CreativeRunState;
}

export interface GoldenAutomationJourneyResult {
  readonly negotiation: CatalogNegotiation;
  readonly creation: ProjectCreateResult;
  readonly initialObservation: ProjectObservation;
  readonly authority: {
    readonly sessionId: string;
    readonly runId: string;
    readonly grant: ArtistModeGrant;
  };
  readonly history: GoldenHistoryProof;
  readonly transactions: readonly EditorTransactionResult[];
  readonly beforeRefinement: AnimationEvaluationBundle;
  readonly afterRefinement: AnimationEvaluationBundle;
  readonly finalObservation: ProjectObservation;
  readonly finalAnimation: AnimationEvaluationBundle;
  readonly controller: GoldenControllerProof;
  readonly recovery: GoldenRecoveryProof;
  readonly package: GoldenPackageProof;
  readonly failures: {
    readonly staleRevision: GoldenAutomationFailureProof;
    readonly deniedOperation: GoldenAutomationFailureProof;
    readonly budget: GoldenBudgetFailureProof;
    readonly lateResult: {
      readonly suppressed: boolean;
      readonly transactionsUsed: number;
    };
    readonly interruptedResumption: {
      readonly originalPhase: CreativeRunState['phase'];
      readonly replacementPhase: CreativeRunState['phase'];
    };
  };
  readonly preview: {
    readonly revision: number;
    readonly frameCount: number;
    readonly tagId: string;
  };
}

interface JourneyAuthority {
  readonly manager: AutomationSessionManager;
  readonly target: AutomationLocalTarget;
  readonly sessionId: string;
  readonly runId: string;
  readonly grant: ArtistModeGrant;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

type GoldenPlan =
  | { readonly kind: 'static' }
  | { readonly kind: 'raster'; readonly frameIndex: number }
  | { readonly kind: 'frame'; readonly duration: number }
  | { readonly kind: 'tag' }
  | { readonly kind: 'refinement' };

interface JourneyPlanRuntime {
  readonly queue: readonly GoldenPlan[];
  cursor: number;
  initialPause: boolean;
  initialLateStep: Deferred<CreativeRunStep> | null;
  initialPauseStarted: Deferred<void>;
  interruptionStarted: Deferred<void>;
  interruptionLateStep: Deferred<CreativeRunStep> | null;
  interruptionArmed: boolean;
  beforeRefinement: AnimationEvaluationBundle | null;
  afterRefinement: AnimationEvaluationBundle | null;
  refinementTransaction: EditorTransactionResult | null;
  replacementAuthority: JourneyAuthority | null;
  freshObservationCount: number;
  readonly transactions: EditorTransactionResult[];
}

/**
 * Run the one approved Golden Automation Journey through public browser
 * contracts. This module intentionally describes only this scenario; it is
 * not a reusable fixture or a second command engine.
 */
// fallow-ignore-next-line complexity -- The approved journey is one bounded story across authority, run, recovery, and package seams.
export async function runGoldenAutomationJourney(
  options: GoldenAutomationJourneyOptions = {},
): Promise<GoldenAutomationJourneyResult> {
  const ownsFixture = options.fixture === undefined;
  const fixture = options.fixture ?? createFixtureSession({
    projectIdFactory: () => GOLDEN_PROJECT_ID,
    entityIdFactory: createEntityIdFactory(),
  });

  try {
    const negotiationResult = fixture.adapter.negotiateCatalog({ version: '1.0' });
    const negotiation = requireAdapterSuccess<CatalogNegotiation>(negotiationResult, 'catalog negotiation');
    const created = await fixture.createBlankProject(GOLDEN_PROJECT_NAME, GOLDEN_WIDTH, GOLDEN_HEIGHT);
    const target = created.creation.target;
    const context = fixture.getTargetContext(target);
    const authority = createAuthority(fixture, target, GOLDEN_RUN_ID, 'primary');

    const initialObservation = await observeStructure(authority, 0);
    const initialFrame = initialObservation.frames[0];
    const initialLayer = initialObservation.layers.find((layer) => layer.type === 'image');
    if (!initialFrame || !initialLayer) throw new Error('Golden project has no editable starting frame.');
    const initialCel = initialFrame.cels.find((cel) => cel.layerId === initialLayer.id);
    if (!initialCel) throw new Error('Golden project has no editable starting cel.');

    const history = await exerciseHistory(fixture.adapter, authority, initialObservation, initialFrame.id);
    const staleRevision = await captureStaleRevisionFailure(authority, history.after.revision, initialFrame.id);
    const deniedOperation = await captureDeniedObservation(authority, target, history.after.revision, initialLayer, initialFrame.id, initialCel.id);

    const runtime: JourneyPlanRuntime = {
      queue: [
        { kind: 'static' },
        { kind: 'raster', frameIndex: 0 },
        { kind: 'frame', duration: 180 },
        { kind: 'raster', frameIndex: 1 },
        { kind: 'frame', duration: 260 },
        { kind: 'raster', frameIndex: 2 },
        { kind: 'tag' },
        { kind: 'refinement' },
      ],
      cursor: 0,
      initialPause: true,
      initialLateStep: null,
      initialPauseStarted: deferred<void>(),
      interruptionStarted: deferred<void>(),
      interruptionLateStep: null,
      interruptionArmed: false,
      beforeRefinement: null,
      afterRefinement: null,
      refinementTransaction: null,
      replacementAuthority: null,
      freshObservationCount: 0,
      transactions: [],
    };

    const persistence = createDeterministicRecoveryPersistence();
    const brief: CreativeBriefInput = createBrief(target);
    const recoveryTarget = createProjectRecoveryTarget(
      context,
      fixture.repository,
      target,
      () => 'golden-recovery-copy',
    );
    const recovery = new CreativeRunRecoveryCoordinator({
      runId: GOLDEN_RUN_ID,
      sessionId: authority.sessionId,
      brief: { ...brief, runId: GOLDEN_RUN_ID, revision: 1 },
      target: recoveryTarget,
      persistence,
    });

    const primaryController = createController(
      fixture,
      authority,
      runtime,
      brief,
      recovery,
      () => createReplacementController(fixture, target, runtime, brief, authority.sessionId),
    );
    const initialApproval = approveController(primaryController);
    if (!initialApproval.ok) throw new Error(`Golden brief approval failed: ${initialApproval.error.code}`);

    const initialStart = primaryController.start();
    await runtime.initialPauseStarted.promise;
    const pauseDuringStep = primaryController.pause();
    if (!pauseDuringStep.ok) throw new Error(`Golden pause failed: ${pauseDuringStep.error.code}`);
    runtime.initialLateStep?.resolve(runtime.queue[0] ? stepForPlan(runtime.queue[0], initialObservation) : {
      profile: 'animation',
      children: [],
    });
    const initialPauseResult = await initialStart;
    if (!initialPauseResult.ok) throw new Error(`Golden initial run failed: ${initialPauseResult.error.code}`);

    const refinedApproval = primaryController.refineBrief({
      goal: 'Compose a small golden creature with an explicit editable timeline.',
    });
    if (!refinedApproval.ok) throw new Error(`Golden brief refinement failed: ${refinedApproval.error.code}`);
    const reapproval = approveController(primaryController);
    if (!reapproval.ok) throw new Error(`Golden brief reapproval failed: ${reapproval.error.code}`);

    let midJourneyPause: Deferred<void> | null = deferred<void>();
    let midJourneyPaused = false;
    const midJourneyListener = (event: Event): void => {
      const state = (event as CustomEvent<CreativeRunState>).detail;
      if (
        !midJourneyPaused
        && state.phase === 'running'
        && state.transactionsUsed === 1
        && state.inFlight === 'observation'
      ) {
        midJourneyPaused = true;
        primaryController.pause();
        midJourneyPause?.resolve();
        midJourneyPause = null;
      }
    };
    primaryController.events.addEventListener('creative-run-state-changed', midJourneyListener);
    const midJourneyResult = await primaryController.resume();
    primaryController.events.removeEventListener('creative-run-state-changed', midJourneyListener);
    if (!midJourneyResult.ok && midJourneyResult.error.code !== 'invalid_transition') {
      throw new Error(`Golden composed run paused unexpectedly: ${midJourneyResult.error.code}`);
    }
    if (!midJourneyPaused) {
      midJourneyPause?.resolve();
      throw new Error('Golden journey did not reach its save/reload pause boundary.');
    }

    const pausedState = primaryController.getState();
    const midSave = await saveRevision(fixture.adapter, target, pausedState.currentRevision);
    const midReload = await reloadRevision(fixture.adapter, target, pausedState.currentRevision);
    const midReobserved = await observeStructure(authority, pausedState.currentRevision);
    const midJourney = primaryController.resume();

    await runtime.interruptionStarted.promise;
    const revisionBeforeInterruption = primaryController.getState().currentRevision;
    const interruptionLateStep = runtime.interruptionLateStep;
    window.dispatchEvent(new Event('offline'));
    const lateFrame = midReobserved.frames[0];
    if (lateFrame) {
      interruptionLateStep?.resolve({
        profile: 'animation',
        children: [{
          command: ANIMATION_FRAME_COMMAND_ID,
          input: { kind: 'frame.duration', frameId: lateFrame.id, duration: lateFrame.duration + 1 },
        }],
      });
    }
    const interruptedRun = await midJourney;
    if (!interruptedRun.ok && interruptedRun.error.code !== 'recovery_resume_required') {
      throw new Error(`Golden interruption failed: ${interruptedRun.error.code}`);
    }
    await waitFor(() => recovery.status.interrupted);
    const originalAfterInterruption = primaryController.getState();
    const revisionAfterLateResult = await readPublicRevision(authority, revisionBeforeInterruption);
    const checkpointRecord = persistence.records.get(GOLDEN_RUN_ID);
    if (!checkpointRecord) throw new Error('Golden recovery checkpoint was not persisted.');

    const replacementResult = await primaryController.resumeAfterInterruption();
    if (!replacementResult.ok) throw new Error(`Golden replacement failed: ${replacementResult.error.code}`);
    const replacement = primaryController.replacement;
    if (!replacement) throw new Error('Golden recovery did not produce a replacement controller.');
    const replacementApproval = approveController(replacement);
    if (!replacementApproval.ok) throw new Error(`Golden replacement approval failed: ${replacementApproval.error.code}`);
    const replacementRun = await replacement.start();
    if (!replacementRun.ok) throw new Error(`Golden replacement run failed: ${replacementRun.error.code}`);
    const replacementState = replacement.getState();
    if (replacementState.phase !== 'stopped') throw new Error(`Golden replacement ended in ${replacementState.phase}.`);

    const replacementAuthority = runtime.replacementAuthority;
    if (!replacementAuthority) throw new Error('Golden replacement authority was not retained.');
    const finalObservation = await observeStructure(replacementAuthority, replacementState.currentRevision);
    const finalAnimation = await observeAnimationBundle(replacementAuthority, finalObservation);
    runtime.afterRefinement = finalAnimation;
    const finalSave = await saveRevision(fixture.adapter, target, replacementState.currentRevision);
    const accepted = await replacement.accept({ expectedSaveSafety: finalSave.saveSafety });
    if (!accepted.ok) throw new Error(`Golden package acceptance failed: ${accepted.error.code}`);

    const finalReload = await reloadRevision(fixture.adapter, target, finalSave.revision);
    const packageResult = await preparePackage(fixture.adapter, target, finalSave);
    const replay = await preparePackage(fixture.adapter, target, finalSave, packageResult.packageDigest);
    const packageProof = await buildPackageProof(
      fixture,
      target,
      packageResult,
      replay,
      finalObservation,
      finalAnimation,
      finalReload,
      finalSave,
    );

    const oldAuthorityInvalidated = authority.manager.listLocalArtistModeRuns().every((run) => run.status !== 'running' && run.status !== 'paused');
    const budget = await captureBudgetFailure(fixture, target, finalObservation, finalAnimation);
    const previewTag = finalAnimation.tags[0];
    if (!previewTag) throw new Error('Golden animation tag was not created.');

    primaryController.dispose();
    replacement.dispose();
    replacementAuthority.manager.dispose();
    authority.manager.dispose();

    const transactions = runtime.transactions.map((transaction) => structuredClone(transaction));
    const beforeRefinement = runtime.beforeRefinement;
    const afterRefinement = runtime.afterRefinement;
    const refinementTransaction = runtime.refinementTransaction;
    if (!beforeRefinement || !afterRefinement || !refinementTransaction) {
      throw new Error('Golden refinement evidence was not captured.');
    }

    const controllerProof: GoldenControllerProof = {
      initialPause: initialPauseResult.state,
      midJourney: {
        paused: pausedState,
        save: midSave,
        reload: midReload,
        reobserved: midReobserved,
      },
      originalAfterInterruption,
      replacement: replacementState,
      accepted: accepted.state,
    };
    const recoveryProof: GoldenRecoveryProof = {
      checkpointPersisted: checkpointRecord.transactions.length >= 1,
      oldAuthorityInvalidated,
      oldSessionId: authority.sessionId,
      oldRunId: authority.runId,
      freshSessionId: replacementState.sessionId,
      freshRunId: replacementState.runId,
      freshObservationCount: runtime.freshObservationCount,
      reapproved: replacementApproval.ok,
      revisionBeforeInterruption,
      revisionAfterLateResult,
      queuedWriteWasNotReplayed: revisionAfterLateResult === revisionBeforeInterruption,
    };

    if (ownsFixture) fixture.dispose();
    return {
      negotiation,
      creation: created.creation,
      initialObservation,
      authority: {
        sessionId: authority.sessionId,
        runId: authority.runId,
        grant: authority.grant,
      },
      history,
      transactions,
      beforeRefinement,
      afterRefinement,
      finalObservation,
      finalAnimation,
      controller: controllerProof,
      recovery: recoveryProof,
      package: packageProof,
      failures: {
        staleRevision,
        deniedOperation,
        budget,
        lateResult: {
          suppressed: initialPauseResult.state.transactionsUsed === 0,
          transactionsUsed: initialPauseResult.state.transactionsUsed,
        },
        interruptedResumption: {
          originalPhase: originalAfterInterruption.phase,
          replacementPhase: replacementState.phase,
        },
      },
      preview: {
        revision: finalAnimation.revision,
        frameCount: finalAnimation.frames.length,
        tagId: previewTag.id,
      },
    };
  } finally {
    if (ownsFixture) fixture.dispose();
  }
}

function createEntityIdFactory(): () => string {
  let sequence = 0;
  return () => `golden-entity-${++sequence}`;
}

function createBrief(target: ProjectTarget): CreativeBriefInput {
  return {
    targetId: target.projectId,
    targetName: GOLDEN_PROJECT_NAME,
    goal: 'Compose a deterministic editable golden automation journey.',
    constraints: ['Keep the 32 × 32 canvas.', 'Use only local public editor contracts.'],
    requestedWriteCategories: WRITE_CATEGORIES,
    transactionLimit: 12,
    durationSeconds: GOLDEN_DURATION_SECONDS,
    contentEgress: 'local-only',
  };
}

function createAuthority(
  fixture: FixtureSession,
  target: ProjectTarget,
  runId: string,
  suffix: string,
  transactionLimit = GOLDEN_TRANSACTION_LIMIT,
): JourneyAuthority {
  const context = fixture.getTargetContext(target);
  const localTarget: AutomationLocalTarget = {
    id: target.projectId,
    name: GOLDEN_PROJECT_NAME,
    context,
  };
  let requestSequence = 0;
  let sessionSequence = 0;
  const manager = new AutomationSessionManager({
    adapter: fixture.adapter,
    targets: () => [localTarget],
    isPageVisible: () => true,
    requestIdFactory: () => `golden-${suffix}-request-${++requestSequence}`,
    sessionIdFactory: () => `golden-${suffix}-session-${++sessionSequence}`,
  });
  const inspectRequest = requireSessionSuccess(manager.requestSession({
    client: { name: `Golden Automation ${suffix}`, identity: 'self-declared' },
    compatibility: { minVersion: '1.0', maxVersion: '1.0' },
    observationClasses: INSPECTION_CLASSES,
    lifetimeSeconds: GOLDEN_DURATION_SECONDS,
  }), 'inspect request');
  manager.captureLocalTargets(inspectRequest.requestId);
  const inspectGrant = requireSessionSuccess(
    manager.approveRequest(inspectRequest.requestId, target.projectId, INSPECTION_CLASSES),
    'inspect approval',
  );
  const artistRequest = requireSessionSuccess(manager.requestArtistMode({
    sessionId: inspectGrant.sessionId,
    runId,
    runIntent: 'Build one deterministic Golden Automation Journey asset.',
    requestedWriteCategories: WRITE_CATEGORIES,
    requestedTransactionLimit: transactionLimit,
    requestedDurationSeconds: GOLDEN_DURATION_SECONDS,
  }), 'Artist Mode request');
  manager.captureArtistModeTarget(artistRequest.requestId);
  const grant = requireSessionSuccess(
    manager.approveArtistMode(artistRequest.requestId, WRITE_CATEGORIES, transactionLimit),
    'Artist Mode approval',
  );
  return {
    manager,
    target: localTarget,
    sessionId: inspectGrant.sessionId,
    runId: grant.runId,
    grant,
  };
}

async function createReplacementController(
  fixture: FixtureSession,
  target: ProjectTarget,
  runtime: JourneyPlanRuntime,
  brief: CreativeBriefInput,
  _previousSessionId: string,
): Promise<{ readonly controller: CreativeRunController; readonly sessionId: string; readonly observedRevision: number }> {
  const authority = createAuthority(fixture, target, `${GOLDEN_RUN_ID}-replacement`, 'replacement');
  runtime.replacementAuthority = authority;
  const controller = createController(fixture, authority, runtime, brief, undefined, undefined, () => {
    if (runtime.freshObservationCount === 0) runtime.freshObservationCount = 1;
  });
  return {
    controller,
    sessionId: authority.sessionId,
    observedRevision: authority.target.context.project.revision.value,
  };
}

function createController(
  fixture: FixtureSession,
  authority: JourneyAuthority,
  runtime: JourneyPlanRuntime,
  brief: CreativeBriefInput,
  recovery: CreativeRunRecovery | undefined,
  createReplacement: (() => Promise<{ readonly controller: CreativeRunController; readonly sessionId: string; readonly observedRevision: number }>) | undefined,
  onObservation?: () => void,
): CreativeRunController {
  const controller = new CreativeRunController({
    sessionManager: authority.manager,
    sessionId: authority.sessionId,
    runId: authority.runId,
    brief,
    recovery,
    observationClass: 'structure',
    getCurrentRevision: () => authority.target.context.project.revision.value,
    observe: (sessionId, observationClass, input) => {
      onObservation?.();
      return authority.manager.observe(sessionId, observationClass, input);
    },
    executeTransaction: async (sessionId, runId, input) => {
      const result = await authority.manager.executeArtistModeTransaction(sessionId, runId, input);
      if (!result.ok) return result;
      const transaction = restoreTargetBinding(result.result as EditorTransactionResult, authority.target.id);
      runtime.transactions.push(structuredClone(transaction));
      runtime.cursor += 1;
      if (transaction.compositeEquality) {
        runtime.refinementTransaction = transaction;
      }
      return { ok: true, result: transaction };
    },
    preparePackage: async (request) => {
      const expectedSaveSafety = addTargetToSaveSafety(request.expectedSaveSafety, authority.target.id);
      const result = await fixture.adapter.request({
        operation: 'project.asset-package.prepare',
        target: { projectId: authority.target.id },
        expectedRevision: request.expectedRevision,
        expectedSaveSafety,
        expectedPackageDigest: request.expectedPackageDigest,
      });
      if (!result.ok) return result;
      return { ok: true, result: result.result as AssetPackageResult };
    },
    createReplacementController: createReplacement
      ? async () => createReplacement()
      : undefined,
    stepSource: (stepContext) => planGoldenStep(authority, runtime, stepContext),
  });
  return controller;
}

async function planGoldenStep(
  authority: JourneyAuthority,
  runtime: JourneyPlanRuntime,
  context: CreativeRunStepContext,
): Promise<CreativeRunStep | null> {
  const plan = runtime.queue[runtime.cursor];
  if (!plan) return null;
  if (runtime.initialPause) {
    runtime.initialPause = false;
    runtime.initialPauseStarted.resolve();
    const pending = deferred<CreativeRunStep>();
    runtime.initialLateStep = pending;
    return pending.promise;
  }
  if (plan.kind === 'raster' && runtime.cursor === 3 && !runtime.interruptionArmed) {
    runtime.interruptionArmed = true;
    runtime.interruptionStarted.resolve();
    const pending = deferred<CreativeRunStep>();
    runtime.interruptionLateStep = pending;
    return pending.promise;
  }
  if (plan.kind === 'refinement') {
    runtime.beforeRefinement = await observeAnimationBundle(authority, context.observation as ProjectObservation, context.revision);
  }
  if (plan.kind === 'raster') {
    return createRasterStep(authority, context.observation as ProjectObservation, plan.frameIndex);
  }
  return stepForPlan(plan, context.observation as ProjectObservation);
}

function stepForPlan(
  plan: GoldenPlan,
  observation: ProjectObservation,
): CreativeRunStep {
  switch (plan.kind) {
    case 'static':
      return createStaticStructureStep(observation);
    case 'raster':
      throw new Error('Golden raster steps require a public raster observation.');
    case 'frame':
      return {
        profile: 'animation',
        children: [{
          command: ANIMATION_FRAME_COMMAND_ID,
          input: { kind: 'frame.create', position: 'end', duration: plan.duration },
        }],
      };
    case 'tag': {
      const endFrameIndex = observation.frames.length - 1;
      return {
        profile: 'animation',
        children: [{
          command: FRAME_TAG_COMMAND_ID,
          input: {
            kind: 'tag.create',
            name: 'Golden Loop',
            color: '#70c1b3',
            startFrameIndex: 0,
            endFrameIndex,
          },
        }],
      };
    }
    case 'refinement':
      return createRefinementStep(observation);
  }
}

function createStaticStructureStep(observation: ProjectObservation): CreativeRunStep {
  const existing = observation.layers.find((layer) => layer.type === 'image');
  if (!existing) throw new Error('Golden static structure has no base image layer.');
  const groupId = 'golden-group';
  const highlightId = 'golden-highlight';
  const layers: StaticLayerDeclaration[] = [
    {
      id: groupId,
      name: 'Golden Creature',
      type: 'group',
      parentId: null,
      visible: true,
      locked: false,
      opacity: 255,
      blendMode: 'normal',
      continuous: false,
    },
    {
      id: existing.id,
      name: 'Golden Body',
      type: 'image',
      parentId: groupId,
      visible: existing.visible,
      locked: existing.locked,
      opacity: existing.opacity,
      blendMode: existing.blendMode as StaticLayerDeclaration['blendMode'],
      continuous: existing.continuous,
    },
    {
      id: highlightId,
      name: 'Golden Highlight',
      type: 'image',
      parentId: groupId,
      visible: true,
      locked: false,
      opacity: 255,
      blendMode: 'normal',
      continuous: false,
    },
  ];
  return {
    profile: 'static-structure',
    children: [
      {
        command: STATIC_PALETTE_COMMAND_ID,
        input: { kind: 'palette.declaration', entries: GOLDEN_PALETTE },
      },
      {
        command: STATIC_LAYER_TREE_COMMAND_ID,
        input: { kind: 'layer-tree.declaration', layers },
      },
    ],
  };
}

async function createRasterStep(
  authority: JourneyAuthority,
  observation: ProjectObservation,
  frameIndex: number,
): Promise<CreativeRunStep> {
  const layer = observation.layers.find((candidate) => candidate.name === 'Golden Body')
    ?? observation.layers.find((candidate) => candidate.type === 'image');
  const frame = observation.frames[frameIndex];
  if (!layer || !frame) throw new Error(`Golden raster target is missing at frame ${frameIndex}.`);
  const cel = frame.cels.find((candidate) => candidate.layerId === layer.id);
  if (!cel) throw new Error(`Golden raster cel is missing at frame ${frameIndex}.`);
  const region = { x: 0, y: 0, width: GOLDEN_WIDTH, height: GOLDEN_HEIGHT };
  const rasterResult = await authority.manager.observe(authority.sessionId, 'raster', {
    source: { kind: 'layer', layerId: layer.id, frameId: frame.id, celId: cel.id },
    region,
    expectedRevision: observation.revision,
  });
  if (!rasterResult.ok) throw new Error(`Golden raster observation failed: ${rasterResult.error.code}`);
  return createRasterStepFromObservation(
    rasterResult.result as RasterObservation,
    layer.id,
    frame.id,
    cel.id,
    region,
    frameIndex,
  );
}

function createRefinementStep(observation: ProjectObservation): CreativeRunStep {
  const layers: StructureRefinementLayerDeclaration[] = observation.layers.map((layer) => ({
    id: layer.id,
    name: refinedLayerName(layer),
    type: layer.type as StructureRefinementLayerDeclaration['type'],
    parentId: layer.parentId,
  }));
  return {
    profile: 'structure-refinement',
    children: [{
      command: STRUCTURE_REFINEMENT_COMMAND_ID,
      input: { kind: 'structure.refine', layers, mergePairs: [] },
    }],
  };
}

function refinedLayerName(layer: ProjectLayerObservation): string {
  if (layer.id === 'golden-group') return 'Golden Creature Refined';
  if (layer.name === 'Golden Body') return 'Golden Body Refined';
  if (layer.name === 'Golden Highlight') return 'Golden Highlight Refined';
  return `${layer.name} Refined`;
}

function createPattern(frameIndex: number): readonly string[] {
  const primary = ['a', 'b', 'c'][frameIndex] ?? 'a';
  const secondary = ['b', 'c', 'a'][frameIndex] ?? 'b';
  return [
    `...${primary}${primary}${primary}${primary}...`,
    `..${primary}${primary}${primary}${primary}${primary}${primary}..`,
    `.${primary}${primary}${secondary}${secondary}${secondary}${secondary}${primary}${primary}.`,
    `${primary}${primary}${secondary}${secondary}${secondary}${secondary}${secondary}${secondary}${primary}${primary}`,
    `${primary}${primary}${secondary}${secondary}${secondary}${secondary}${secondary}${secondary}${primary}${primary}`,
    `.${primary}${primary}${secondary}${secondary}${secondary}${secondary}${primary}${primary}.`,
    `..${primary}${primary}${primary}${primary}${primary}${primary}..`,
    `...${primary}${primary}${primary}${primary}...`,
  ];
}

function createRasterStepFromObservation(
  observation: RasterObservation,
  layerId: string,
  frameId: string,
  celId: string,
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  frameIndex: number,
): CreativeRunStep {
  return {
    profile: 'raster-patch',
    children: [{
      command: RASTER_PATCH_COMMAND_ID,
      input: {
        kind: 'raster.patch',
        layerId,
        frameId,
        celId,
        region,
        digest: observation.digest,
        legend: [
          { symbol: 'a', paletteEntryId: 'golden-ink' },
          { symbol: 'b', paletteEntryId: 'golden-sun' },
          { symbol: 'c', paletteEntryId: 'golden-coral' },
        ],
        patches: [{
          x: 8 + frameIndex * 2,
          y: 10,
          width: 10,
          height: 8,
          rows: createPattern(frameIndex),
        }],
      },
    }],
  };
}

async function observeStructure(authority: JourneyAuthority, expectedRevision: number): Promise<ProjectObservation> {
  const result = await authority.manager.observe(authority.sessionId, 'structure', { expectedRevision });
  if (!result.ok) throw new Error(`Golden structure observation failed: ${result.error.code}`);
  return result.result as ProjectObservation;
}

async function observeAnimationBundle(
  authority: JourneyAuthority,
  observationOrProject: ProjectObservation,
  expectedRevision = observationOrProject.revision,
): Promise<AnimationEvaluationBundle> {
  const result = await authority.manager.observe(authority.sessionId, 'timeline', {
    operation: 'project.animation.observe',
    expectedRevision,
    range: 'all',
    background: { kind: 'transparent' },
    scale: 1,
    keyframes: observationOrProject.frames.map((frame) => frame.id),
    expectedDigest: null,
  });
  if (!result.ok) throw new Error(`Golden animation observation failed: ${result.error.code}`);
  return restoreAnimationTarget(result.result as AnimationEvaluationBundle, authority.target.id);
}

function restoreAnimationTarget(bundle: AnimationEvaluationBundle, targetId: string): AnimationEvaluationBundle {
  const target = { projectId: targetId };
  return {
    ...bundle,
    target,
    request: { ...bundle.request, target },
    frames: bundle.frames.map((frame) => ({
      ...frame,
      render: { ...frame.render, target },
    })),
    keyframes: bundle.keyframes.map((keyframe) => ({ ...keyframe, target })),
  };
}

async function exerciseHistory(
  adapter: AutomationAdapter,
  authority: JourneyAuthority,
  initial: ProjectObservation,
  frameId: string,
): Promise<GoldenHistoryProof> {
  const edit = await executeManagerTransaction(authority, {
    operationId: 'golden-history-duration',
    profile: 'animation',
    expectedRevision: initial.revision,
    children: [{
      command: ANIMATION_FRAME_COMMAND_ID,
      input: { kind: 'frame.duration', frameId, duration: 110 },
    }],
  });
  const before = await observeStructure(authority, edit.revision);
  const undo = requireAdapterSuccess<HistoryTransitionResult>(await adapter.request({
    operation: 'project.history.undo',
    target: { projectId: authority.target.id },
    expectedRevision: edit.revision,
  }), 'history undo');
  const redo = requireAdapterSuccess<HistoryTransitionResult>(await adapter.request({
    operation: 'project.history.redo',
    target: { projectId: authority.target.id },
    expectedRevision: undo.revision,
  }), 'history redo');
  const after = await observeStructure(authority, redo.revision);
  return { edit, undo, redo, before, after };
}

async function captureStaleRevisionFailure(
  authority: JourneyAuthority,
  currentRevision: number,
  frameId: string,
): Promise<GoldenAutomationFailureProof> {
  const result = await authority.manager.executeArtistModeTransaction(authority.sessionId, authority.runId, {
    operationId: 'golden-stale-revision',
    profile: 'animation',
    expectedRevision: currentRevision - 1,
    children: [{
      command: ANIMATION_FRAME_COMMAND_ID,
      input: { kind: 'frame.duration', frameId, duration: 111 },
    }],
  });
  if (result.ok) throw new Error('Golden stale revision unexpectedly committed.');
  return { error: result.error, revisionBefore: currentRevision, revisionAfter: currentRevision };
}

async function captureDeniedObservation(
  authority: JourneyAuthority,
  target: ProjectTarget,
  expectedRevision: number,
  layer: ProjectLayerObservation,
  frameId: string,
  celId: string,
): Promise<GoldenAutomationFailureProof> {
  const request = requireSessionSuccess(authority.manager.requestSession({
    client: { name: 'Golden denied probe', identity: 'self-declared' },
    compatibility: { minVersion: '1.0', maxVersion: '1.0' },
    observationClasses: ['structure'],
    lifetimeSeconds: GOLDEN_DURATION_SECONDS,
  }), 'denied inspect request');
  authority.manager.captureLocalTargets(request.requestId);
  const grant = requireSessionSuccess(
    authority.manager.approveRequest(request.requestId, target.projectId, ['structure']),
    'denied inspect approval',
  );
  const observation = await authority.manager.observe(grant.sessionId, 'raster', {
    expectedRevision,
    source: { kind: 'layer', layerId: layer.id, frameId, celId },
    region: { x: 0, y: 0, width: GOLDEN_WIDTH, height: GOLDEN_HEIGHT },
  });
  authority.manager.revokeSession(grant.sessionId);
  if (observation.ok) throw new Error('Golden denied observation unexpectedly succeeded.');
  return { error: observation.error, revisionBefore: expectedRevision, revisionAfter: expectedRevision };
}

async function captureBudgetFailure(
  fixture: FixtureSession,
  target: ProjectTarget,
  observation: ProjectObservation,
  animation: AnimationEvaluationBundle,
): Promise<GoldenBudgetFailureProof> {
  const authority = createAuthority(fixture, target, 'golden-budget-run', 'budget', 1);
  const frame = observation.frames[0];
  if (!frame) throw new Error('Golden budget probe has no frame.');
  const first = await executeManagerTransaction(authority, {
    operationId: 'golden-budget-first',
    profile: 'animation',
    expectedRevision: observation.revision,
    children: [{
      command: ANIMATION_FRAME_COMMAND_ID,
      input: { kind: 'frame.duration', frameId: frame.id, duration: frame.duration + 1 },
    }],
  });
  const exhausted = await authority.manager.executeArtistModeTransaction(authority.sessionId, authority.runId, {
    operationId: 'golden-budget-second',
    profile: 'animation',
    expectedRevision: first.revision,
    children: [{
      command: ANIMATION_FRAME_COMMAND_ID,
      input: { kind: 'frame.duration', frameId: frame.id, duration: frame.duration + 2 },
    }],
  });
  if (exhausted.ok) throw new Error('Golden budget probe unexpectedly exceeded its limit.');
  const beforeUndo = first.revision;
  authority.manager.pauseArtistMode(authority.sessionId, authority.runId);
  const undo = requireAdapterSuccess<HistoryTransitionResult>(await fixture.adapter.request({
    operation: 'project.history.undo',
    target,
    expectedRevision: beforeUndo,
  }), 'budget probe undo');
  const after = await observeStructure(authority, undo.revision);
  authority.manager.dispose();
  return {
    firstTransaction: first,
    exhausted: { error: exhausted.error, revisionBefore: beforeUndo, revisionAfter: after.revision },
    restored: after.frames[0]?.duration === observation.frames[0]?.duration
      && after.revision === undo.revision
      && animation.frames[0]?.duration === observation.frames[0]?.duration,
  };
}

async function buildPackageProof(
  fixture: FixtureSession,
  target: ProjectTarget,
  assetPackage: AssetPackageResult,
  replay: AssetPackageResult,
  finalObservation: ProjectObservation,
  finalAnimation: AnimationEvaluationBundle,
  reload: ReloadResult,
  save: SaveResult,
): Promise<GoldenPackageProof> {
  const sourceArtifact = requirePackageArtifact(assetPackage, 'source');
  const manifestArtifact = requirePackageArtifact(assetPackage, 'manifest');
  const documents = await loadPackageDocuments(fixture, target, sourceArtifact);
  const exact = {
    reconstruction: hasExactReconstruction(finalAnimation),
    source: documents.sourceDigest === documents.persistedDigest,
    persistedSource: documents.sourceDigest === documents.persistedDigest && reload.revision === assetPackage.revision,
    replay: hasExactReplay(assetPackage, replay),
    manifest: hasExactManifest(assetPackage, target, finalAnimation, manifestArtifact),
    spriteCells: hasExactSpriteCells(assetPackage, finalAnimation),
    renderedDigests: hasExactRenderedDigests(assetPackage, finalAnimation),
    timingAndTags: hasExactTimingAndTags(documents.decodedSource, finalObservation, finalAnimation),
  };
  return {
    save,
    reload,
    assetPackage,
    replay,
    decodedSource: documents.decodedSource,
    persistedDocument: documents.persistedDocument,
    exact,
  };
}

async function loadPackageDocuments(
  fixture: FixtureSession,
  target: ProjectTarget,
  sourceArtifact: AssetPackageArtifact,
): Promise<{
  readonly decodedSource: ProjectFile;
  readonly persistedDocument: ProjectFile;
  readonly sourceDigest: string;
  readonly persistedDigest: string;
}> {
  const persistedInput = await fixture.repository.load(target.projectId);
  if (!persistedInput) throw new Error('Golden package has no persisted document.');
  const persistedDocument = decodeProjectFile(persistedInput);
  const decodedSource = decodeProjectFile(
    JSON.parse(pako.inflate(sourceArtifact.bytes, { to: 'string' })) as ProjectFileInput,
  );
  return {
    decodedSource,
    persistedDocument,
    sourceDigest: await digestProjectFile(decodedSource),
    persistedDigest: await digestProjectFile(persistedDocument),
  };
}

function requirePackageArtifact(assetPackage: AssetPackageResult, role: 'source' | 'manifest'): AssetPackageArtifact {
  const artifact = assetPackage.artifacts.find((candidate) => candidate.role === role);
  if (!artifact) throw new Error(`Golden package omitted ${role}.`);
  return artifact;
}

function hasExactReplay(assetPackage: AssetPackageResult, replay: AssetPackageResult): boolean {
  const replayArtifacts = new Map(replay.artifacts.map((artifact) => [artifact.role, artifact]));
  return assetPackage.packageDigest === replay.packageDigest
    && assetPackage.manifestDigest === replay.manifestDigest
    && assetPackage.artifacts.every((artifact) => sameBytes(artifact.bytes, replayArtifacts.get(artifact.role)?.bytes));
}

function hasExactManifest(
  assetPackage: AssetPackageResult,
  target: ProjectTarget,
  finalAnimation: AnimationEvaluationBundle,
  manifestArtifact: AssetPackageArtifact,
): boolean {
  const { manifest } = assetPackage;
  return manifest.target.projectId === target.projectId
    && manifest.revision === finalAnimation.revision
    && manifest.frames.length === finalAnimation.frames.length
    && manifest.tags.length === finalAnimation.tags.length
    && manifest.tags.every((tag, index) => sameTag(tag, finalAnimation.tags[index]))
    && sameBytes(manifestArtifact.bytes, new TextEncoder().encode(JSON.stringify(manifest)));
}

function hasExactSpriteCells(assetPackage: AssetPackageResult, finalAnimation: AnimationEvaluationBundle): boolean {
  const spriteCells = assetPackage.manifest.spriteSheet?.cells ?? [];
  return spriteCells.length === finalAnimation.frames.length
    && spriteCells.every((cell) => {
      const frame = finalAnimation.frames.find((candidate) => candidate.frameId === cell.frameId);
      return frame !== undefined
        && cell.duration === frame.duration
        && cell.renderDigest === frame.renderedDigest;
    });
}

function hasExactRenderedDigests(assetPackage: AssetPackageResult, finalAnimation: AnimationEvaluationBundle): boolean {
  const manifestFramesMatch = assetPackage.manifest.frames.every((frame) => {
    const observed = finalAnimation.frames.find((candidate) => candidate.frameId === frame.id);
    return observed !== undefined && frame.renderDigest === observed.renderedDigest;
  });
  const contactSheetMatches = finalAnimation.contactSheet.cells.every((cell) => {
    const frame = finalAnimation.frames.find((candidate) => candidate.frameId === cell.frameId);
    return frame !== undefined
      && cell.digest === frame.renderedDigest
      && sameContactCellPixels(finalAnimation, cell, frame.render.pixels);
  });
  return manifestFramesMatch && contactSheetMatches;
}

function hasExactTimingAndTags(
  decodedSource: ProjectFile,
  finalObservation: ProjectObservation,
  finalAnimation: AnimationEvaluationBundle,
): boolean {
  const animationDurations = finalAnimation.frames.map((frame) => frame.duration).join(',');
  return finalObservation.frames.map((frame) => frame.duration).join(',') === animationDurations
    && decodedSource.frames.map((frame) => frame.duration).join(',') === animationDurations
    && JSON.stringify(decodedSource.tags ?? []) === JSON.stringify(finalObservation.tags);
}

function hasExactReconstruction(finalAnimation: AnimationEvaluationBundle): boolean {
  return reconstructAnimationGrids(finalAnimation)
    .every((grid, index) => sameGrid(grid, finalAnimation.frames[index]?.grid));
}

function sameContactCellPixels(
  animation: AnimationEvaluationBundle,
  cell: AnimationEvaluationBundle['contactSheet']['cells'][number],
  pixels: Uint8Array,
): boolean {
  for (let y = 0; y < cell.height; y += 1) {
    for (let x = 0; x < cell.width; x += 1) {
      const sourceOffset = (y * cell.width + x) * 4;
      const sheetOffset = ((cell.y + y) * animation.contactSheet.width + cell.x + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        if (animation.contactSheet.pixels[sheetOffset + channel] !== pixels[sourceOffset + channel]) return false;
      }
    }
  }
  return true;
}

function sameGrid(
  left: AnimationEvaluationBundle['baseGrid'],
  right: AnimationEvaluationBundle['baseGrid'] | undefined,
): boolean {
  return right !== undefined
    && left.width === right.width
    && left.height === right.height
    && left.rows.length === right.rows.length
    && left.rows.every((row, index) => row === right.rows[index]);
}

function sameTag(
  left: { readonly id: string; readonly name: string; readonly color: string; readonly startFrameIndex: number; readonly endFrameIndex: number; readonly collapsed: boolean } | undefined,
  right: AnimationEvaluationBundle['tags'][number] | undefined,
): boolean {
  return left !== undefined && right !== undefined
    && left.id === right.id
    && left.name === right.name
    && left.color === right.color
    && left.startFrameIndex === right.startFrameIndex
    && left.endFrameIndex === right.endFrameIndex
    && left.collapsed === right.collapsed;
}

function sameBytes(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
  if (!left || !right || left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

async function preparePackage(
  adapter: AutomationAdapter,
  target: ProjectTarget,
  save: SaveResult,
  expectedPackageDigest: string | null = null,
): Promise<AssetPackageResult> {
  return requireAdapterSuccess<AssetPackageResult>(await adapter.request({
    operation: 'project.asset-package.prepare',
    target,
    expectedRevision: save.revision,
    expectedSaveSafety: save.saveSafety,
    expectedPackageDigest,
  }), 'asset package');
}

async function saveRevision(adapter: AutomationAdapter, target: ProjectTarget, expectedRevision: number): Promise<SaveResult> {
  return requireAdapterSuccess<SaveResult>(await adapter.request({ operation: 'project.save', target, expectedRevision }), 'project save');
}

async function reloadRevision(adapter: AutomationAdapter, target: ProjectTarget, expectedRevision: number): Promise<ReloadResult> {
  return requireAdapterSuccess<ReloadResult>(await adapter.request({ operation: 'project.reload', target, expectedRevision }), 'project reload');
}

async function executeManagerTransaction(
  authority: JourneyAuthority,
  input: {
    readonly operationId: string;
    readonly profile: EditorTransactionProfile;
    readonly expectedRevision: number;
    readonly children: readonly EditorTransactionChildInput[];
  },
): Promise<EditorTransactionResult> {
  const result = await authority.manager.executeArtistModeTransaction(
    authority.sessionId,
    authority.runId,
    input,
  );
  if (!result.ok) throw new Error(`Golden transaction failed: ${result.error.code}`);
  return restoreTargetBinding(result.result as EditorTransactionResult, authority.target.id);
}

function restoreTargetBinding(transaction: EditorTransactionResult, targetId: string): EditorTransactionResult {
  return {
    ...transaction,
    target: { projectId: targetId },
    provenance: {
      ...transaction.provenance,
      target: { projectId: targetId },
    },
  };
}

function addTargetToSaveSafety(value: unknown, targetId: string): unknown {
  if (!isRecordValue(value)) return value;
  return { ...value, target: { projectId: targetId } };
}

function createDeterministicRecoveryPersistence(): CreativeRunRecoveryPersistence & { readonly records: Map<string, CreativeRunRecoveryRecord> } {
  const records = new Map<string, CreativeRunRecoveryRecord>();
  return {
    records,
    async load(runId) {
      const record = records.get(runId);
      return record ? structuredClone(record) : null;
    },
    async save(record) {
      records.set(record.runId, structuredClone(record));
    },
  };
}

function approveController(controller: CreativeRunController): CreativeRunActionResult {
  const state = controller.getState();
  return controller.approveBrief({
    briefRevision: state.brief.revision,
    targetId: state.brief.targetId,
    requestedWriteCategories: state.brief.requestedWriteCategories,
    transactionLimit: state.brief.transactionLimit,
    durationSeconds: state.brief.durationSeconds,
    contentEgress: state.brief.contentEgress,
  });
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Golden journey timed out while waiting for public recovery state.');
}

async function readPublicRevision(authority: JourneyAuthority, expectedRevision: number): Promise<number> {
  const observation = await observeStructure(authority, expectedRevision);
  return observation.revision;
}

function requireAdapterSuccess<T>(
  result: { readonly ok: true; readonly result: unknown } | { readonly ok: false; readonly error: EditorError },
  operation: string,
): T {
  if (!result.ok) throw new Error(`Golden ${operation} failed: ${result.error.code} ${JSON.stringify(result.error.details ?? {})}`);
  return result.result as T;
}

function requireSessionSuccess<T>(
  result: AutomationSessionResult<T>,
  operation: string,
): T {
  if (!result.ok) throw new Error(`Golden ${operation} failed: ${result.error.code} ${JSON.stringify(result.error.details ?? {})}`);
  return result.result;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
