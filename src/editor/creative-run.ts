import { ARTIST_MODE_MAX_TRANSACTIONS } from './automation-session';
import type {
  ArtistModeGrant,
  AutomationLocalArtistModeRun,
  AutomationLocalSession,
  AutomationSessionManager,
  AutomationSessionResult,
  InspectObservationClass,
  ArtistModeCategory,
} from './automation-session';
import type { AssetPackageResult } from './asset-package';
import type {
  EditorTransactionChildInput,
  EditorTransactionProfile,
  EditorTransactionResult,
} from './transaction';
import type { EditorError } from './contracts';
import type {
  CreativeRunRecovery,
  CreativeRunRecoveryDiagnosticBundle,
  CreativeRunRecoveryRewindInput,
} from './creative-run-recovery';

// fallow-ignore-next-line unused-export -- Public Creative Run bounds are part of the local controller contract.
export const CREATIVE_RUN_MAX_TIMELINE_ENTRIES = 200;
// fallow-ignore-next-line unused-export -- Public Creative Run bounds are part of the local controller contract.
export const CREATIVE_RUN_MAX_GOAL_LENGTH = 512;
// fallow-ignore-next-line unused-export -- Public Creative Run bounds are part of the local controller contract.
export const CREATIVE_RUN_MAX_CONSTRAINTS = 8;
// fallow-ignore-next-line unused-export -- Public Creative Run bounds are part of the local controller contract.
export const CREATIVE_RUN_MAX_CONSTRAINT_LENGTH = 256;
// fallow-ignore-next-line unused-export -- Public Creative Run bounds are part of the local controller contract.
export const CREATIVE_RUN_MAX_RUN_ID_LENGTH = 256;
// fallow-ignore-next-line unused-export -- Public Creative Run bounds are part of the local controller contract.
export const CREATIVE_RUN_MAX_OPERATION_ID_LENGTH = 256;

export type CreativeRunPhase =
  | 'draft'
  | 'awaiting-grant'
  | 'ready'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'accepting'
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'recovery-required';

export type CreativeRunContentEgressPosture = 'local-only' | 'approved-provider';

export interface CreativeBriefInput {
  readonly targetId: string;
  readonly targetName: string;
  readonly goal: string;
  readonly constraints: readonly string[];
  readonly requestedWriteCategories: readonly ArtistModeCategory[];
  readonly transactionLimit: number;
  readonly durationSeconds: number;
  readonly contentEgress: CreativeRunContentEgressPosture;
}

export interface CreativeBrief extends CreativeBriefInput {
  readonly runId: string;
  readonly revision: number;
}

export interface CreativeBriefApproval {
  readonly briefRevision: number;
  readonly targetId: string;
  readonly requestedWriteCategories: readonly ArtistModeCategory[];
  readonly transactionLimit: number;
  readonly durationSeconds: number;
  readonly contentEgress: CreativeRunContentEgressPosture;
}

export interface CreativeBriefPatch {
  readonly goal?: string;
  readonly constraints?: readonly string[];
  readonly requestedWriteCategories?: readonly ArtistModeCategory[];
  readonly transactionLimit?: number;
  readonly durationSeconds?: number;
  readonly contentEgress?: CreativeRunContentEgressPosture;
}

export interface CreativeRunStep {
  readonly profile: EditorTransactionProfile;
  readonly children: readonly EditorTransactionChildInput[];
}

export interface CreativeRunStepContext {
  readonly runId: string;
  readonly briefRevision: number;
  readonly revision: number;
  readonly transactionOrdinal: number;
  readonly observation: unknown;
}

export type CreativeRunStepSource = (
  context: CreativeRunStepContext,
) => CreativeRunStep | null | Promise<CreativeRunStep | null>;

export interface CreativeRunPackageRequest {
  readonly expectedRevision: number;
  readonly expectedSaveSafety: unknown;
  readonly expectedPackageDigest: string | null;
}

export type CreativeRunPackageResponse =
  | { readonly ok: true; readonly result: AssetPackageResult }
  | { readonly ok: false; readonly error: EditorError };

export type CreativeRunNextAction =
  | 'approve-brief'
  | 'request-grant'
  | 'start-run'
  | 'resume-run'
  | 'pause-run'
  | 'stop-run'
  | 'review-result'
  | 'retry-accept'
  | 'recover-manually'
  | 'rewind-run'
  | 'reject-run'
  | 'inspect-recovery'
  | 'resume-interrupted'
  | 'none';

export interface CreativeRunError {
  readonly code: string;
  readonly retryable: boolean;
  readonly nextAction: CreativeRunNextAction;
}

export type CreativeRunTimelineKind =
  | 'phase'
  | 'grant'
  | 'observation'
  | 'transaction'
  | 'budget'
  | 'failure'
  | 'package'
  | 'collapsed';

export interface CreativeRunTimelineEntry {
  readonly sequence: number;
  readonly timestamp: number;
  readonly kind: CreativeRunTimelineKind;
  readonly phase?: CreativeRunPhase;
  readonly observationClass?: InspectObservationClass;
  readonly profile?: EditorTransactionProfile;
  readonly operationId?: string;
  readonly ordinal?: number;
  readonly fromRevision?: number;
  readonly toRevision?: number;
  readonly outcome?: 'committed' | 'failed' | 'prepared' | 'exhausted';
  readonly errorCode?: string;
  readonly childCount?: number;
  readonly durationMs?: number;
  readonly count?: number;
}

export interface CreativeRunTransactionSummary {
  readonly operationId: string;
  readonly profile: EditorTransactionProfile;
  readonly ordinal: number;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly childCount: number;
  readonly durationMs: number;
}

export interface CreativeRunGrantSummary {
  readonly status: AutomationLocalArtistModeRun['status'];
  readonly categories: readonly ArtistModeCategory[];
  readonly transactionLimit: number;
  readonly transactionsUsed: number;
  readonly remainingTransactions: number;
  readonly expiresAt: number;
}

export interface CreativeRunState {
  readonly runId: string;
  readonly phase: CreativeRunPhase;
  readonly brief: CreativeBrief;
  readonly approvedBriefRevision: number | null;
  readonly target: { readonly id: string; readonly name: string };
  readonly sessionId: string;
  readonly currentRevision: number;
  readonly lastDurableRevision: number;
  readonly transactionsUsed: number;
  readonly transactionLimit: number;
  readonly remainingTransactions: number;
  readonly elapsedSeconds: number;
  readonly remainingDurationSeconds: number;
  readonly inFlight: 'observation' | 'step' | 'transaction' | null;
  readonly grant: CreativeRunGrantSummary | null;
  readonly lastDurableResult: CreativeRunTransactionSummary | null;
  readonly timeline: readonly CreativeRunTimelineEntry[];
  readonly collapsedTimelineEntries: number;
  readonly error: CreativeRunError | null;
  readonly nextAction: CreativeRunNextAction;
  readonly packagePreparedRevision: number | null;
  readonly recovery: CreativeRunRecovery['status'] | null;
}

export type CreativeRunActionResult =
  | { readonly ok: true; readonly state: CreativeRunState }
  | { readonly ok: false; readonly error: CreativeRunError; readonly state: CreativeRunState };

export type CreativeRunSessionBoundary = Pick<
  AutomationSessionManager,
  | 'listLocalSessions'
  | 'listLocalArtistModeRuns'
  | 'getArtistModeGrant'
  | 'pauseArtistMode'
  | 'resumeArtistMode'
  | 'completeArtistMode'
  | 'takeoverProjectWriteTurn'
  | 'observe'
  | 'executeArtistModeTransaction'
>;

export interface CreativeRunSessionEvents {
  readonly events?: EventTarget;
}

export interface CreativeRunControllerOptions {
  readonly sessionManager: CreativeRunSessionBoundary & CreativeRunSessionEvents;
  readonly sessionId: string;
  readonly runId: string;
  readonly brief: CreativeBriefInput;
  readonly stepSource: CreativeRunStepSource;
  readonly observationClass?: InspectObservationClass;
  readonly clock?: () => number;
  readonly getCurrentRevision?: () => number;
  readonly observe?: (
    sessionId: string,
    observationClass: InspectObservationClass,
    input: unknown,
  ) => Promise<AutomationSessionResult<unknown>>;
  readonly executeTransaction?: (
    sessionId: string,
    runId: string,
    input: unknown,
  ) => Promise<AutomationSessionResult<unknown>>;
  readonly preparePackage?: (
    request: CreativeRunPackageRequest,
  ) => Promise<CreativeRunPackageResponse>;
  /** Optional browser-local recovery collaborator for durable run safety. */
  readonly recovery?: CreativeRunRecovery;
  /**
   * Builds a replacement controller with a new session/run after interruption.
   * The factory owns session creation, fresh observation, and reapproval.
   */
  readonly createReplacementController?: (
    input: {
      readonly runId: string;
      readonly previousSessionId: string;
      readonly brief: CreativeBrief;
      readonly target: { readonly id: string; readonly name: string };
    },
  ) => Promise<{
    readonly controller: CreativeRunController;
    /** Session identity must be fresh, never the interrupted session. */
    readonly sessionId: string;
    /** Captured after constructing the replacement controller. */
    readonly observedRevision: number;
  }>;
  /** Optional explicit project-library action for opening a created copy. */
  readonly openRecoveryCopy?: (copyId: string) => Promise<void>;
}

export type CreativeRunRecoveryObservationResult = CreativeRunActionResult & {
  readonly observedRevision?: number;
};

type ReplacementControllerCandidate = {
  readonly controller: CreativeRunController;
  readonly sessionId: string;
  readonly observedRevision: number;
};

type ReplacementPreparation =
  | { readonly ok: true; readonly replacement: ReplacementControllerCandidate }
  | { readonly ok: false; readonly action: CreativeRunActionResult };

type ReplacementObservation =
  | { readonly ok: true; readonly observedRevision: number }
  | { readonly ok: false; readonly action: CreativeRunActionResult };

interface LiveAuthority {
  readonly session: AutomationLocalSession;
  readonly run: AutomationLocalArtistModeRun;
  readonly grant: ArtistModeGrant;
}

interface PendingLifecycle {
  readonly phase: 'paused' | 'stopped' | 'draft';
}

/**
 * Browser-local coordinator for one approved Creative Brief and one Artist
 * Mode run. It owns lifecycle fencing and content-free timeline projection;
 * project mutation remains inside the Automation Session policy gate.
 */
export class CreativeRunController {
  readonly events = new EventTarget();

  private readonly sessionManager: CreativeRunSessionBoundary;
  private readonly lifecycleEvents?: EventTarget;
  private readonly sessionId: string;
  private readonly stepSource: CreativeRunStepSource;
  private readonly observationClass: InspectObservationClass;
  private readonly clock: () => number;
  private readonly getCurrentRevision: () => number;
  private readonly observeBoundary: (
    sessionId: string,
    observationClass: InspectObservationClass,
    input: unknown,
  ) => Promise<AutomationSessionResult<unknown>>;
  private readonly executeBoundary: (
    sessionId: string,
    runId: string,
    input: unknown,
  ) => Promise<AutomationSessionResult<unknown>>;
  private readonly preparePackageBoundary?: (
    request: CreativeRunPackageRequest,
  ) => Promise<CreativeRunPackageResponse>;
  private readonly recovery?: CreativeRunRecovery;
  private readonly createReplacementController?: CreativeRunControllerOptions['createReplacementController'];
  private readonly openRecoveryCopyBoundary?: CreativeRunControllerOptions['openRecoveryCopy'];
  private readonly target: { readonly id: string; readonly name: string };
  private brief: CreativeBrief;
  private phase: CreativeRunPhase = 'draft';
  private approvedBriefRevision: number | null = null;
  private currentRevision: number;
  private lastDurableRevision: number;
  private transactionsUsed = 0;
  private transactionSequence = 0;
  private inFlight: CreativeRunState['inFlight'] = null;
  private lastDurableResult: CreativeRunTransactionSummary | null = null;
  private packagePreparedRevision: number | null = null;
  private error: CreativeRunError | null = null;
  private readonly timeline: CreativeRunTimelineEntry[] = [];
  private collapsedTimelineEntries = 0;
  private timelineSequence = 0;
  private lastTimelineTimestamp = 0;
  private generation = 0;
  private pendingLifecycle: PendingLifecycle | null = null;
  private loopPromise: Promise<CreativeRunActionResult> | null = null;
  private disposed = false;
  private activeDurationMs = 0;
  private activeSegmentStartedAt: number | null = null;
  private recoveryCheckpointPrepared = false;
  private replacementController: CreativeRunController | null = null;
  private interruptionPending = false;
  private interruptionReason: Parameters<CreativeRunRecovery['markInterrupted']>[0] = 'work-unsettled';
  private interruptionPromise: Promise<void> | null = null;
  private recoveryActionPromise: Promise<CreativeRunActionResult> | null = null;

  constructor(options: CreativeRunControllerOptions) {
    this.sessionManager = options.sessionManager;
    this.lifecycleEvents = options.sessionManager.events;
    this.sessionId = normalizeIdentity(options.sessionId, 'sessionId', CREATIVE_RUN_MAX_RUN_ID_LENGTH);
    const runId = normalizeIdentity(options.runId, 'runId', CREATIVE_RUN_MAX_RUN_ID_LENGTH);
    this.stepSource = options.stepSource;
    this.observationClass = options.observationClass ?? 'structure';
    this.clock = options.clock ?? (() => Date.now());
    this.getCurrentRevision = options.getCurrentRevision ?? (() => this.currentRevision);
    this.observeBoundary = options.observe ?? ((sessionId, observationClass, input) =>
      options.sessionManager.observe(sessionId, observationClass, input));
    this.executeBoundary = options.executeTransaction ?? ((sessionId, runId, input) =>
      options.sessionManager.executeArtistModeTransaction(sessionId, runId, input));
    this.preparePackageBoundary = options.preparePackage;
    this.recovery = options.recovery;
    this.createReplacementController = options.createReplacementController;
    this.openRecoveryCopyBoundary = options.openRecoveryCopy;
    this.brief = normalizeBrief(options.brief, runId);
    this.target = Object.freeze({ id: this.brief.targetId, name: this.brief.targetName });
    this.currentRevision = readRevision(this.getCurrentRevision, 0);
    this.lastDurableRevision = this.currentRevision;
    this.bindLifecycleEvents();
    this.appendTimeline({ kind: 'phase', phase: 'draft' });
  }

  getState(): CreativeRunState {
    const authority = this.readLiveAuthority();
    const transactionLimit = this.brief.transactionLimit;
    const transactionsUsed = this.transactionsUsed;
    const elapsedSeconds = Math.floor(this.readElapsedDurationMs() / 1000);
    return freezeTransport({
      runId: this.brief.runId,
      phase: this.phase,
      brief: this.brief,
      approvedBriefRevision: this.approvedBriefRevision,
      target: this.target,
      sessionId: this.sessionId,
      currentRevision: this.currentRevision,
      lastDurableRevision: this.lastDurableRevision,
      transactionsUsed,
      transactionLimit,
      remainingTransactions: Math.max(0, transactionLimit - transactionsUsed),
      elapsedSeconds,
      remainingDurationSeconds: Math.max(0, this.brief.durationSeconds - elapsedSeconds),
      inFlight: this.inFlight,
      grant: authority ? summarizeGrant(authority.run, authority.grant) : null,
      lastDurableResult: this.lastDurableResult,
      timeline: [...this.timeline],
      collapsedTimelineEntries: this.collapsedTimelineEntries,
      error: this.error,
      nextAction: this.nextAction(),
      packagePreparedRevision: this.packagePreparedRevision,
      recovery: this.recovery?.status ?? null,
    });
  }

  /** The replacement controller is intentionally separate from this terminal run. */
  get replacement(): CreativeRunController | null {
    return this.replacementController;
  }

  getRecoveryDiagnostics(): CreativeRunRecoveryDiagnosticBundle | null {
    return this.recovery?.getDiagnostics() ?? null;
  }

  // fallow-ignore-next-line unused-class-member -- Public panel refresh seam reads live authority after external lifecycle changes.
  refresh(): CreativeRunState {
    if (this.recoveryActionPromise) return this.getState();
    if (this.phase === 'awaiting-grant' && this.approvedBriefRevision === this.brief.revision) {
      const compatibility = this.checkAuthority();
      if (compatibility.ok) {
        this.clearError();
        this.setPhase('ready');
      }
    }
    this.publish();
    return this.getState();
  }

  approveBrief(approval: CreativeBriefApproval): CreativeRunActionResult {
    const blocked = this.briefMutationBlock('approve-brief');
    if (blocked) return blocked;
    if (!this.canEditBrief()) return this.fail('invalid_transition', false, 'approve-brief');
    if (!matchesApproval(this.brief, approval)) {
      return this.fail('brief_revision_mismatch', false, 'approve-brief');
    }

    const wasPaused = this.phase === 'paused';
    this.approvedBriefRevision = this.brief.revision;
    this.clearError();
    const authority = this.checkAuthority();
    if (!authority.ok) {
      this.setPhase('awaiting-grant');
      return this.fail(authority.code, authority.retryable, authority.nextAction);
    }
    this.currentRevision = readRevision(this.getCurrentRevision, this.currentRevision);
    this.lastDurableRevision = this.currentRevision;
    this.appendTimeline({ kind: 'grant', outcome: 'prepared' });
    this.setPhase(wasPaused ? 'paused' : 'ready');
    return this.succeed();
  }

  refineBrief(patch: CreativeBriefPatch): CreativeRunActionResult {
    const blocked = this.briefMutationBlock('approve-brief');
    if (blocked) return blocked;
    if (!this.canEditBrief()) return this.fail('invalid_transition', false, 'approve-brief');
    let nextBrief: CreativeBrief;
    try {
      nextBrief = normalizeBrief({ ...this.brief, ...patch }, this.brief.runId, this.brief.revision + 1);
    } catch {
      return this.fail('invalid_request', false, 'approve-brief');
    }
    this.brief = nextBrief;
    this.approvedBriefRevision = null;
    this.packagePreparedRevision = null;
    this.clearError();
    this.generation += 1;

    const wasPaused = this.phase === 'paused';
    if (this.inFlight) {
      this.pendingLifecycle = { phase: 'draft' };
      this.setPhase('pausing');
      this.sessionManager.pauseArtistMode(this.sessionId, this.brief.runId);
      this.publish();
      return this.succeed();
    }
    if (this.phase === 'running' || this.phase === 'pausing' || this.phase === 'stopping') {
      this.sessionManager.pauseArtistMode(this.sessionId, this.brief.runId);
    }
    // A paused run keeps its pause boundary while the creator edits the brief.
    // Reapproval can therefore return to the same run through Resume without
    // silently starting a new write turn.
    this.setPhase(wasPaused ? 'paused' : 'draft');
    return this.succeed();
  }

  // fallow-ignore-next-line complexity -- Start rechecks exact brief, live authority, and write ownership before one run loop.
  async start(): Promise<CreativeRunActionResult> {
    if (this.disposed) return this.disposedResult();
    const busy = this.recoveryBusyResult('start-run');
    if (busy) return busy;
    if (this.recovery?.status.interrupted) return this.fail('recovery_resume_required', false, 'resume-interrupted');
    if (this.phase !== 'ready') return this.fail('run_not_ready', false, 'approve-brief');
    if (this.approvedBriefRevision !== this.brief.revision) {
      return this.fail('brief_approval_required', false, 'approve-brief');
    }
    const authority = this.checkAuthority();
    if (!authority.ok) {
      this.setPhase('awaiting-grant');
      return this.fail(authority.code, authority.retryable, authority.nextAction);
    }
    if (authority.authority.grant.status === 'paused' || authority.authority.run.status === 'paused') {
      const resumed = this.sessionManager.resumeArtistMode(this.sessionId, this.brief.runId);
      if (!resumed.ok) return this.failFromAdapter(resumed, 'start-run');
    }
    const live = this.checkAuthority();
    if (!live.ok || live.authority.grant.status !== 'running') {
      return this.fail('write_turn', true, 'start-run');
    }
    this.generation += 1;
    this.clearError();
    this.setPhase('running');
    return this.processSteps();
  }

  async resume(): Promise<CreativeRunActionResult> {
    if (this.disposed) return this.disposedResult();
    const busy = this.recoveryBusyResult('resume-run');
    if (busy) return busy;
    if (this.recovery?.status.interrupted) return this.fail('recovery_resume_required', false, 'resume-interrupted');
    if (this.phase !== 'paused') return this.fail('invalid_transition', false, 'resume-run');
    if (this.approvedBriefRevision !== this.brief.revision) {
      return this.fail('brief_approval_required', false, 'approve-brief');
    }
    const authority = this.checkAuthority();
    if (!authority.ok) return this.fail(authority.code, authority.retryable, authority.nextAction);
    const resumed = this.sessionManager.resumeArtistMode(this.sessionId, this.brief.runId);
    if (!resumed.ok) return this.failFromAdapter(resumed, 'resume-run');
    this.generation += 1;
    this.clearError();
    this.setPhase('running');
    return this.processSteps();
  }

  pause(): CreativeRunActionResult {
    if (this.disposed) return this.disposedResult();
    const busy = this.recoveryBusyResult('pause-run');
    if (busy) return busy;
    if (this.phase === 'paused' || this.phase === 'pausing') return this.succeed();
    if (this.phase !== 'running' && this.phase !== 'ready') {
      return this.fail('invalid_transition', false, 'pause-run');
    }
    this.generation += 1;
    this.pendingLifecycle = this.inFlight ? { phase: 'paused' } : null;
    this.sessionManager.pauseArtistMode(this.sessionId, this.brief.runId);
    if (this.inFlight) {
      this.setPhase('pausing');
    } else {
      this.setPhase('paused');
    }
    return this.succeed();
  }

  requestManualTakeover(ownerId: string): CreativeRunActionResult {
    if (this.disposed) return this.disposedResult();
    const busy = this.recoveryBusyResult('pause-run');
    if (busy) return busy;
    if (!isBoundedString(ownerId, 256)) return this.fail('invalid_request', false, 'pause-run');
    if (this.phase === 'accepted' || this.phase === 'rejected') {
      return this.fail('invalid_transition', false, 'none');
    }
    this.generation += 1;
    const wasInFlight = this.inFlight !== null;
    if (wasInFlight) this.pendingLifecycle = { phase: 'paused' };
    this.sessionManager.takeoverProjectWriteTurn(this.target.id, ownerId);
    if (wasInFlight) {
      this.setPhase('pausing');
    } else {
      this.pendingLifecycle = null;
      this.setPhase('paused');
    }
    this.clearError();
    return this.succeed();
  }

  stop(): CreativeRunActionResult {
    if (this.disposed) return this.disposedResult();
    const busy = this.recoveryBusyResult('stop-run');
    if (busy) return busy;
    if (this.phase === 'stopped' || this.phase === 'stopping') return this.succeed();
    if (!isReviewablePhase(this.phase)) {
      return this.fail('invalid_transition', false, 'stop-run');
    }
    this.generation += 1;
    this.pendingLifecycle = this.inFlight ? { phase: 'stopped' } : null;
    this.sessionManager.pauseArtistMode(this.sessionId, this.brief.runId);
    if (this.inFlight) {
      this.setPhase('stopping');
    } else {
      this.setPhase('stopped');
      this.completeAuthority();
    }
    return this.succeed();
  }

  // fallow-ignore-next-line complexity -- Acceptance keeps exact revision and save-safety checks at the package boundary.
  async accept(
    options: { readonly expectedPackageDigest?: string | null; readonly expectedSaveSafety?: unknown } = {},
  ): Promise<CreativeRunActionResult> {
    if (this.disposed) return this.disposedResult();
    const busy = this.recoveryBusyResult('review-result');
    if (busy) return busy;
    if (this.phase !== 'stopped' && this.phase !== 'paused') {
      return this.fail('invalid_transition', false, 'review-result');
    }
    if (this.inFlight) return this.fail('in_flight', true, 'review-result');
    if (this.approvedBriefRevision !== this.brief.revision) {
      return this.fail('brief_approval_required', false, 'approve-brief');
    }
    const prepare = this.preparePackageBoundary;
    if (!prepare) return this.fail('unsupported', false, 'recover-manually');
    const expectedRevision = readRevision(this.getCurrentRevision, this.currentRevision);
    if (expectedRevision !== this.lastDurableRevision) {
      this.setPhase('recovery-required');
      return this.fail('revision_conflict', true, 'recover-manually');
    }
    this.currentRevision = expectedRevision;
    this.setPhase('accepting');
    const expectedSaveSafety = redactTransport(
      options.expectedSaveSafety ?? await this.readSaveSafety(expectedRevision),
    );
    if (isFailure(expectedSaveSafety)) {
      this.setPhase('failed');
      return this.failFromAdapter(expectedSaveSafety, 'retry-accept');
    }
    let result: CreativeRunPackageResponse;
    try {
      result = await prepare({
        expectedRevision,
        expectedSaveSafety,
        expectedPackageDigest: options.expectedPackageDigest ?? null,
      });
    } catch {
      this.setPhase('failed');
      return this.fail('package_failed', true, 'retry-accept');
    }
    if (!result.ok) {
      this.setPhase('failed');
      return this.failFromAdapter(result, 'retry-accept');
    }
    const afterRevision = readRevision(this.getCurrentRevision, expectedRevision);
    if (afterRevision !== expectedRevision) {
      this.setPhase('recovery-required');
      return this.fail('revision_conflict', true, 'recover-manually');
    }
    this.packagePreparedRevision = expectedRevision;
    this.appendTimeline({ kind: 'package', outcome: 'prepared', fromRevision: expectedRevision, toRevision: expectedRevision });
    this.completeAuthority();
    this.setPhase('accepted');
    return this.succeed();
  }

  /**
   * Rewind only while this run is paused or stopped. The recovery collaborator
   * fences the authority again and validates the owned history suffix before
   * asking the normal history boundary to undo anything.
   */
  async rewind(input: CreativeRunRecoveryRewindInput): Promise<CreativeRunActionResult> {
    return this.serializeRecoveryAction(() => this.rewindNow(input), 'rewind-run');
  }

  private async rewindNow(input: CreativeRunRecoveryRewindInput): Promise<CreativeRunActionResult> {
    const prepared = this.prepareRecoverySelection('rewind-run');
    if (!prepared.ok) return prepared.action;
    const result = await prepared.recovery.rewind(input);
    if (!result.ok) return this.recoveryFailure(result.reason ?? 'recovery_required');
    this.syncRecoveryRecord();
    this.approvedBriefRevision = null;
    this.packagePreparedRevision = null;
    this.clearError();
    this.setPhase('paused');
    return this.succeed();
  }

  /** Reject the old run only after an explicit creator confirmation. */
  async reject(confirmed = false): Promise<CreativeRunActionResult> {
    return this.serializeRecoveryAction(() => this.rejectNow(confirmed), 'reject-run');
  }

  private async rejectNow(confirmed: boolean): Promise<CreativeRunActionResult> {
    const prepared = this.prepareRecoverySelection('reject-run');
    if (!prepared.ok) return prepared.action;
    const result = await prepared.recovery.reject(confirmed);
    if (!result.ok) return this.recoveryFailure(result.reason ?? 'recovery_required');
    if (result.outcome === 'restored-original-with-rejected-copy') {
      this.completeAuthority();
      this.setPhase('rejected');
    } else if (result.outcome === 'preserved-original-with-checkpoint-copy') {
      this.completeAuthority();
      this.setPhase('recovery-required');
    }
    this.syncRecoveryRecord();
    this.clearError();
    return this.succeed();
  }

  async createRecoveryCopy(): Promise<CreativeRunActionResult> {
    return this.serializeRecoveryAction(() => this.createRecoveryCopyNow(), 'recover-manually');
  }

  private async createRecoveryCopyNow(): Promise<CreativeRunActionResult> {
    if (this.disposed) return this.disposedResult();
    if (!this.recovery) return this.fail('unsupported', false, 'recover-manually');
    if (this.inFlight) return this.fail('in_flight', true, 'recover-manually');
    const result = await this.recovery.createCheckpointCopy();
    if (!result.ok) return this.recoveryFailure(result.reason ?? 'recovery_required');
    this.clearError();
    return this.succeed();
  }

  async openRecoveryCopy(): Promise<CreativeRunActionResult> {
    return this.serializeRecoveryAction(() => this.openRecoveryCopyNow(), 'recover-manually');
  }

  private async openRecoveryCopyNow(): Promise<CreativeRunActionResult> {
    if (this.disposed) return this.disposedResult();
    const copyId = this.recovery?.status.recoveryCopyId;
    if (!copyId || !this.openRecoveryCopyBoundary) {
      return this.fail('unsupported', false, 'recover-manually');
    }
    try {
      await this.openRecoveryCopyBoundary(copyId);
    } catch {
      return this.fail('recovery_copy_open_failed', true, 'recover-manually');
    }
    return this.succeed();
  }

  /** Persist an interruption fact and require a fresh session on resume. */
  async markInterrupted(
    reason: Parameters<CreativeRunRecovery['markInterrupted']>[0] = 'work-unsettled',
  ): Promise<CreativeRunActionResult> {
    return this.serializeRecoveryAction(() => this.markInterruptedNow(reason), 'recover-manually');
  }

  private async markInterruptedNow(
    reason: Parameters<CreativeRunRecovery['markInterrupted']>[0],
  ): Promise<CreativeRunActionResult> {
    if (this.disposed) return this.disposedResult();
    if (!this.recovery) return this.fail('unsupported', false, 'recover-manually');
    if (this.inFlight) return this.fail('in_flight', true, 'recover-manually');
    this.generation += 1;
    this.sessionManager.pauseArtistMode(this.sessionId, this.brief.runId);
    const result = await this.recovery.markInterrupted(reason);
    if (!result.ok) return this.recoveryFailure(result.reason ?? 'recovery_required');
    this.setPhase('recovery-required');
    this.clearError();
    return this.succeed();
  }

  /** Reopen a recovered run through a new controller/session factory. */
  async resumeAfterInterruption(): Promise<CreativeRunActionResult> {
    return this.serializeRecoveryAction(() => this.resumeAfterInterruptionNow(), 'resume-interrupted');
  }

  private async resumeAfterInterruptionNow(): Promise<CreativeRunActionResult> {
    if (this.disposed) return this.disposedResult();
    if (!this.recovery || !this.recovery.status.interrupted) {
      return this.fail('invalid_transition', false, 'resume-interrupted');
    }
    const factory = this.createReplacementController;
    if (!factory) return this.fail('unsupported', false, 'recover-manually');
    const previousSessionId = this.recovery.record?.sessionId ?? this.sessionId;
    const prepared = await this.prepareReplacementController(factory, previousSessionId);
    if (!prepared.ok) return prepared.action;
    this.replacementController = prepared.replacement.controller;
    this.approvedBriefRevision = null;
    this.clearError();
    return this.succeed();
  }

  private async prepareReplacementController(
    factory: NonNullable<CreativeRunControllerOptions['createReplacementController']>,
    previousSessionId: string,
  ): Promise<ReplacementPreparation> {
    try {
      const replacement = await factory({
        runId: this.brief.runId,
        previousSessionId,
        brief: structuredClone(this.brief),
        target: this.target,
      });
      const observed = await replacement.controller.observeForRecovery();
      if (!observed.ok || observed.observedRevision === undefined) {
        return { ok: false, action: this.fail('recovery_observation_failed', false, 'recover-manually') };
      }
      const replacementState = replacement.controller.getState();
      if (!isValidReplacement(replacement, replacementState, previousSessionId, this.brief.runId, observed.observedRevision)) {
        return { ok: false, action: this.fail('recovery_session_invalid', false, 'recover-manually') };
      }
      return { ok: true, replacement };
    } catch {
      return { ok: false, action: this.fail('recovery_session_failed', true, 'resume-interrupted') };
    }
  }

  /** Perform a real authority-gated observation for a replacement run. */
  async observeForRecovery(): Promise<CreativeRunRecoveryObservationResult> {
    if (this.disposed) return this.disposedResult();
    const busy = this.recoveryBusyResult('recover-manually');
    if (busy) return busy;
    if (this.phase !== 'draft' || this.approvedBriefRevision !== null) {
      return this.fail('recovery_session_invalid', false, 'recover-manually');
    }
    const authority = this.checkAuthority();
    if (!authority.ok) return this.fail(authority.code, authority.retryable, authority.nextAction);
    const expectedRevision = readRevision(this.getCurrentRevision, this.currentRevision);
    const observation = await this.observeReplacementRevision(expectedRevision);
    if (!observation.ok) return observation.action;
    this.currentRevision = observation.observedRevision;
    this.lastDurableRevision = observation.observedRevision;
    const state = this.succeed();
    return state.ok ? { ...state, observedRevision: observation.observedRevision } : state;
  }

  private async observeReplacementRevision(expectedRevision: number): Promise<ReplacementObservation> {
    this.inFlight = 'observation';
    this.publish();
    let result: AutomationSessionResult<unknown>;
    try {
      result = await this.observeBoundary(this.sessionId, this.observationClass, { expectedRevision });
    } catch {
      result = failure('internal', true);
    } finally {
      this.inFlight = null;
    }
    if (!result.ok) return { ok: false, action: this.failFromAdapter(result, 'recover-manually') };
    const observedRevision = readObservedRevision(result.result);
    const currentRevision = readRevision(this.getCurrentRevision, expectedRevision);
    if (observedRevision === null || observedRevision !== expectedRevision || currentRevision !== expectedRevision) {
      return { ok: false, action: this.fail('revision_conflict', false, 'recover-manually') };
    }
    return { ok: true, observedRevision };
  }

  async loadRecoveryRecord(): Promise<CreativeRunActionResult> {
    return this.serializeRecoveryAction(() => this.loadRecoveryRecordNow(), 'recover-manually');
  }

  private async loadRecoveryRecordNow(): Promise<CreativeRunActionResult> {
    if (this.disposed) return this.disposedResult();
    if (!this.recovery) return this.fail('unsupported', false, 'recover-manually');
    const result = await this.recovery.load();
    if (!result.ok) return this.recoveryFailure(result.reason ?? 'recovery_required');
    const record = this.recovery.record;
    if (record) {
      this.syncRecoveryRecord();
      if (this.recovery.status.interrupted || record.phase === 'recovery-required') {
        this.approvedBriefRevision = null;
        this.setPhase('recovery-required');
      }
    }
    return this.succeed();
  }

  private syncRecoveryRecord(): void {
    const record = this.recovery?.record;
    if (!record) return;
    this.currentRevision = record.currentRevision;
    this.lastDurableRevision = record.lastDurableRevision;
    this.transactionsUsed = record.transactions.length;
  }

  private serializeRecoveryAction(
    action: () => Promise<CreativeRunActionResult>,
    nextAction: CreativeRunNextAction,
  ): Promise<CreativeRunActionResult> {
    if (this.recoveryActionPromise) return Promise.resolve(this.fail('recovery_busy', true, nextAction));
    const actionResult = Promise.resolve()
      .then(action)
      .catch(() => this.recoveryFailure('action-failed'));
    const guarded = actionResult.then(
      (result) => {
        this.finishRecoveryAction(guarded);
        return result;
      },
      (error: unknown) => {
        this.finishRecoveryAction(guarded);
        throw error;
      },
    );
    this.recoveryActionPromise = guarded;
    return guarded;
  }

  private finishRecoveryAction(completed: Promise<CreativeRunActionResult>): void {
    if (this.recoveryActionPromise !== completed) return;
    this.recoveryActionPromise = null;
    if (this.interruptionPending) this.startInterruptionPersistence();
  }

  private recoveryBusyResult(nextAction: CreativeRunNextAction): CreativeRunActionResult | null {
    if (!this.recoveryActionPromise) return null;
    return this.fail('recovery_busy', true, nextAction);
  }

  private briefMutationBlock(nextAction: CreativeRunNextAction): CreativeRunActionResult | null {
    if (this.disposed) return this.disposedResult();
    return this.recoveryBusyResult(nextAction);
  }

  private prepareRecoverySelection(
    nextAction: 'rewind-run' | 'reject-run',
  ): { readonly ok: true; readonly recovery: CreativeRunRecovery } | { readonly ok: false; readonly action: CreativeRunActionResult } {
    if (this.disposed) return { ok: false, action: this.disposedResult() };
    const recovery = this.recovery;
    if (!recovery) return { ok: false, action: this.fail('unsupported', false, 'recover-manually') };
    if (this.inFlight) return { ok: false, action: this.fail('in_flight', true, nextAction) };
    if (this.phase !== 'paused' && this.phase !== 'stopped' && this.phase !== 'recovery-required') {
      return { ok: false, action: this.fail('invalid_transition', false, nextAction) };
    }
    this.generation += 1;
    this.sessionManager.pauseArtistMode(this.sessionId, this.brief.runId);
    return { ok: true, recovery };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.interruptionPending = this.hasMutationAuthority();
    if (this.inFlight) this.pendingLifecycle = { phase: 'stopped' };
    this.sessionManager.pauseArtistMode(this.sessionId, this.brief.runId);
    this.unbindLifecycleEvents();
    this.setPhase('stopping');
    if (!this.inFlight && !this.recoveryActionPromise) this.startInterruptionPersistence();
  }

  /** Fence a hidden/offline/page-disposed controller without replaying work. */
  private interruptForLifecycle(reason: Parameters<CreativeRunRecovery['markInterrupted']>[0]): void {
    if (this.disposed || this.phase === 'accepted' || this.phase === 'rejected') return;
    if (this.recovery?.status.interrupted && !this.inFlight) return;
    if (!this.hasMutationAuthority()) return;
    this.generation += 1;
    this.interruptionPending = true;
    this.interruptionReason = reason;
    this.sessionManager.pauseArtistMode(this.sessionId, this.brief.runId);
    if (this.inFlight) {
      this.pendingLifecycle = { phase: 'stopped' };
      this.setPhase('stopping');
      return;
    }
    this.setPhase('recovery-required');
    this.startInterruptionPersistence();
  }

  private startInterruptionPersistence(): void {
    if (!this.interruptionPending || !this.recovery || this.interruptionPromise || this.recoveryActionPromise) return;
    this.interruptionPending = false;
    const pending = this.recovery.markInterrupted(this.interruptionReason);
    const guarded = pending.then((result) => {
      if (result.ok) {
        this.approvedBriefRevision = null;
        this.setPhase('recovery-required');
      } else {
        this.approvedBriefRevision = null;
        this.setPhase('recovery-required');
        this.error = {
          code: `recovery_${result.reason ?? 'persistence_failed'}`,
          retryable: false,
          nextAction: 'recover-manually',
        };
      }
      this.publish();
    }).catch(() => {
      this.error = {
        code: 'recovery_persistence',
        retryable: false,
        nextAction: 'recover-manually',
      };
      this.publish();
    }).finally(() => {
      this.interruptionPromise = null;
    });
    this.interruptionPromise = guarded;
  }

  private hasMutationAuthority(): boolean {
    if (this.recovery?.record) return true;
    if (this.approvedBriefRevision !== this.brief.revision) return false;
    return this.phase === 'ready'
      || this.phase === 'running'
      || this.phase === 'paused'
      || this.phase === 'stopped'
      || this.phase === 'pausing'
      || this.phase === 'stopping';
  }

  private bindLifecycleEvents(): void {
    this.lifecycleEvents?.addEventListener('automation-session-backgrounded', this.handleSessionInterruption);
    this.lifecycleEvents?.addEventListener('automation-session-revoked', this.handleSessionInterruption);
    if (typeof window === 'undefined') return;
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('orientationchange', this.handleOrientationChange);
    document.addEventListener('freeze', this.handleFreeze);
    window.addEventListener('pagehide', this.handlePageHide);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private unbindLifecycleEvents(): void {
    this.lifecycleEvents?.removeEventListener('automation-session-backgrounded', this.handleSessionInterruption);
    this.lifecycleEvents?.removeEventListener('automation-session-revoked', this.handleSessionInterruption);
    if (typeof window === 'undefined') return;
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('orientationchange', this.handleOrientationChange);
    document.removeEventListener('freeze', this.handleFreeze);
    window.removeEventListener('pagehide', this.handlePageHide);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private readonly handleOffline = (): void => {
    this.interruptForLifecycle('work-unsettled');
  };

  private readonly handleOrientationChange = (): void => {
    this.interruptForLifecycle('work-unsettled');
  };

  private readonly handleFreeze = (): void => {
    this.interruptForLifecycle('work-unsettled');
  };

  private readonly handlePageHide = (): void => {
    this.interruptForLifecycle('work-unsettled');
  };

  private readonly handleSessionInterruption = (): void => {
    const authority = this.readLiveAuthority();
    if (!authority || authority.session.status === 'active') return;
    this.interruptForLifecycle('work-unsettled');
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.interruptForLifecycle('work-unsettled');
  };

  private async processSteps(): Promise<CreativeRunActionResult> {
    if (this.loopPromise) return this.loopPromise;
    const loop = this.runSteps();
    this.loopPromise = loop;
    try {
      return await loop;
    } finally {
      if (this.loopPromise === loop) this.loopPromise = null;
    }
  }

  // fallow-ignore-next-line complexity -- The bounded run loop checks each detached observation and transaction at its lifecycle fence.
  private async runSteps(): Promise<CreativeRunActionResult> {
    while (this.phase === 'running') {
      const generation = this.generation;
      const authority = this.checkAuthority();
      if (!authority.ok) {
        if (isInterruptionAuthorityCode(authority.code)) {
          this.interruptForLifecycle('work-unsettled');
          await this.flushInterruptionPersistence();
          break;
        }
        this.setPhase('failed');
        return this.fail(authority.code, authority.retryable, authority.nextAction);
      }
      const budgetFailure = this.checkRunBudget();
      if (budgetFailure) return budgetFailure;

      const expectedRevision = readRevision(this.getCurrentRevision, this.currentRevision);
      this.currentRevision = expectedRevision;
      const observation = await this.captureObservation(generation, expectedRevision);
      if (!this.canContinue(generation)) {
        this.settlePendingLifecycle();
        await this.flushInterruptionPersistence();
        break;
      }
      if (!observation.ok) {
        this.setPhase('failed');
        return this.failFromAdapter(observation, 'recover-manually');
      }
      this.appendTimeline({ kind: 'observation', observationClass: this.observationClass, fromRevision: expectedRevision, toRevision: expectedRevision, outcome: 'prepared' });

      if (this.recovery?.status.requiresReapproval) {
        const reactivated = await this.recovery.reactivateAfterReapproval(expectedRevision);
        if (!reactivated.ok) {
          this.setPhase('recovery-required');
          return this.recoveryFailure(reactivated.reason ?? 'recovery_required');
        }
        this.recoveryCheckpointPrepared = true;
        this.syncRecoveryRecord();
      }

      const planned = await this.planStep(generation, expectedRevision, observation.result);
      if (!this.canContinue(generation)) {
        this.settlePendingLifecycle();
        await this.flushInterruptionPersistence();
        break;
      }
      if (!planned.ok) {
        this.setPhase('failed');
        return this.fail('step_failed', true, 'recover-manually');
      }
      if (planned.step === null) {
        this.sessionManager.pauseArtistMode(this.sessionId, this.brief.runId);
        this.setPhase('stopped');
        this.completeAuthority();
        break;
      }
      if (!isValidStep(planned.step)) {
        this.setPhase('failed');
        return this.fail('invalid_request', false, 'recover-manually');
      }

      const dispatchBudgetFailure = this.checkRunBudget();
      if (dispatchBudgetFailure) return dispatchBudgetFailure;

      const operationSequence = ++this.transactionSequence;
      const operationId = createOperationId(this.brief.runId, operationSequence);
      if (this.recovery && !this.recoveryCheckpointPrepared) {
        const checkpoint = await this.recovery.checkpointBeforeFirstWrite({ expectedRevision });
        if (!checkpoint.ok) {
          this.setPhase('recovery-required');
          return this.fail(checkpoint.reason ?? 'checkpoint_persistence', false, 'recover-manually');
        }
        this.recoveryCheckpointPrepared = true;
        if (!this.canContinue(generation)) {
          this.settlePendingLifecycle();
          await this.flushInterruptionPersistence();
          break;
        }
      }
      const dispatched = await this.dispatchStep(operationId, expectedRevision, planned.step);
      const result = dispatched.result;
      if (result.ok) {
        const transaction = readTransactionResult(result.result);
        if (!transaction || transaction.fromRevision !== expectedRevision || transaction.revision !== expectedRevision + 1) {
          this.setPhase('recovery-required');
          return this.fail('revision_conflict', true, 'recover-manually');
        }
        const recorded = await this.recordCommittedTransaction(
          operationId,
          planned.step.profile,
          transaction,
          dispatched.durationMs,
        );
        if (!recorded) {
          this.setPhase('recovery-required');
          return this.fail('recovery_persistence', true, 'recover-manually');
        }
        if (this.transactionsUsed >= this.brief.transactionLimit) {
          this.appendTimeline({ kind: 'budget', ordinal: this.transactionsUsed, outcome: 'committed' });
          if (this.pendingLifecycle) this.settlePendingLifecycle();
          else this.setPhase('paused');
          await this.flushInterruptionPersistence();
          this.clearError();
          break;
        }
      } else {
        this.appendTimeline({
          kind: 'failure',
          operationId,
          profile: planned.step.profile,
          errorCode: result.error.code,
          outcome: 'failed',
          durationMs: dispatched.durationMs,
        });
        if (this.pendingLifecycle) {
          this.settlePendingLifecycle();
          await this.flushInterruptionPersistence();
          break;
        }
        this.setPhase(isUnsafeFailure(result.error.code) ? 'recovery-required' : 'failed');
        return this.failFromAdapter(result, isUnsafeFailure(result.error.code) ? 'recover-manually' : 'review-result');
      }
      this.settlePendingLifecycle();
      await this.flushInterruptionPersistence();
      if (this.phase !== 'running') break;
    }
    return this.succeed();
  }

  private checkRunBudget(): CreativeRunActionResult | null {
    if (this.transactionsUsed >= this.brief.transactionLimit) {
      return this.pauseForBudget('limit_exceeded');
    }
    if (!this.hasDurationBudget()) {
      return this.pauseForBudget('duration_exhausted');
    }
    return null;
  }

  private async captureObservation(
    generation: number,
    expectedRevision: number,
  ): Promise<AutomationSessionResult<unknown>> {
    this.inFlight = 'observation';
    this.publish();
    try {
      return await this.observeBoundary(this.sessionId, this.observationClass, { expectedRevision });
    } catch {
      return failure('internal', true);
    } finally {
      this.inFlight = null;
      if (!this.canContinue(generation)) this.publish();
    }
  }

  private async planStep(
    generation: number,
    expectedRevision: number,
    observation: unknown,
  ): Promise<{ readonly ok: true; readonly step: CreativeRunStep | null } | { readonly ok: false }> {
    this.inFlight = 'step';
    this.publish();
    try {
      const step = await this.stepSource({
        runId: this.brief.runId,
        briefRevision: this.brief.revision,
        revision: expectedRevision,
        transactionOrdinal: this.transactionsUsed + 1,
        observation: redactTransport(observation),
      });
      return { ok: true, step };
    } catch {
      return { ok: false };
    } finally {
      this.inFlight = null;
      if (!this.canContinue(generation)) this.publish();
    }
  }

  private async dispatchStep(
    operationId: string,
    expectedRevision: number,
    step: CreativeRunStep,
  ): Promise<{ readonly result: AutomationSessionResult<unknown>; readonly durationMs: number }> {
    const startedAt = readClock(this.clock);
    this.inFlight = 'transaction';
    this.publish();
    let result: AutomationSessionResult<unknown>;
    try {
      result = await this.executeBoundary(this.sessionId, this.brief.runId, {
        profile: step.profile,
        operationId,
        expectedRevision,
        children: detach(step.children),
      });
    } catch {
      result = failure('internal', true);
    } finally {
      this.inFlight = null;
    }
    return { result, durationMs: Math.max(0, Math.round(readClock(this.clock) - startedAt)) };
  }

  private async recordCommittedTransaction(
    operationId: string,
    profile: EditorTransactionProfile,
    transaction: EditorTransactionResult,
    durationMs: number,
  ): Promise<boolean> {
    this.transactionsUsed += 1;
    this.currentRevision = transaction.revision;
    this.lastDurableRevision = transaction.revision;
    const summary = summarizeTransaction(operationId, profile, transaction, durationMs, this.transactionsUsed);
    this.lastDurableResult = summary;
    this.appendTimeline({
      kind: 'transaction',
      operationId,
      profile,
      ordinal: summary.ordinal,
      fromRevision: summary.fromRevision,
      toRevision: summary.toRevision,
      childCount: summary.childCount,
      durationMs: summary.durationMs,
      outcome: 'committed',
    });
    if (!this.recovery) return true;
    const result = await this.recovery.recordCommittedTransaction({
      operationId,
      ordinal: summary.ordinal,
      fromRevision: summary.fromRevision,
      toRevision: summary.toRevision,
      provenance: transaction.provenance,
      durationMs,
    });
    return result.ok;
  }

  private canContinue(generation: number): boolean {
    return this.phase === 'running' && generation === this.generation;
  }

  private settlePendingLifecycle(): void {
    if (!this.pendingLifecycle) return;
    const next = this.pendingLifecycle.phase;
    this.pendingLifecycle = null;
    this.sessionManager.pauseArtistMode(this.sessionId, this.brief.runId);
    this.setPhase(next);
    if (next === 'stopped') this.completeAuthority();
  }

  private async flushInterruptionPersistence(): Promise<void> {
    this.startInterruptionPersistence();
    if (this.interruptionPromise) await this.interruptionPromise;
  }

  private readSaveSafety(expectedRevision: number): Promise<unknown> {
    return this.observeBoundary(this.sessionId, 'save-state', { expectedRevision }).then((result) => {
      if (!result.ok) return result;
      if (isRecordValue(result.result) && 'saveSafety' in result.result) {
        return result.result.saveSafety;
      }
      return result.result;
    }).catch(() => failure('internal', true));
  }

  // fallow-ignore-next-line complexity -- Authority compatibility is an explicit session, target, grant, budget, and observation gate.
  private checkAuthority():
    | { readonly ok: true; readonly authority: LiveAuthority }
    | { readonly ok: false; readonly code: string; readonly retryable: boolean; readonly nextAction: CreativeRunNextAction } {
    const authority = this.readLiveAuthority();
    if (!authority) return { ok: false, code: 'grant_required', retryable: true, nextAction: 'request-grant' };
    if (authority.session.targetId !== this.target.id) {
      return { ok: false, code: 'target_mismatch', retryable: false, nextAction: 'recover-manually' };
    }
    if (authority.session.status !== 'active') {
      return { ok: false, code: `session_${authority.session.status}`, retryable: false, nextAction: 'recover-manually' };
    }
    if (authority.run.targetId !== this.target.id) {
      return { ok: false, code: 'target_mismatch', retryable: false, nextAction: 'recover-manually' };
    }
    if (authority.run.status !== 'running' && authority.run.status !== 'paused') {
      return { ok: false, code: `run_${authority.run.status}`, retryable: false, nextAction: authority.run.status === 'budget-exhausted' ? 'review-result' : 'recover-manually' };
    }
    if (!this.brief.requestedWriteCategories.every((category) => authority.grant.categories.includes(category))) {
      return { ok: false, code: 'grant_incompatible', retryable: false, nextAction: 'request-grant' };
    }
    if (authority.grant.transactionLimit < this.brief.transactionLimit) {
      return { ok: false, code: 'grant_incompatible', retryable: false, nextAction: 'request-grant' };
    }
    if (authority.grant.expiresAt <= this.clock()) {
      return { ok: false, code: 'grant_expired', retryable: false, nextAction: 'recover-manually' };
    }
    if (!authority.session.observationClasses.includes(this.observationClass)) {
      return { ok: false, code: 'observation_denied', retryable: false, nextAction: 'request-grant' };
    }
    return { ok: true, authority };
  }

  private readLiveAuthority(): LiveAuthority | null {
    const session = this.sessionManager.listLocalSessions().find((candidate) => candidate.sessionId === this.sessionId);
    const run = this.sessionManager.listLocalArtistModeRuns().find((candidate) => candidate.runId === this.brief.runId);
    if (!session || !run) return null;
    const grantResult = this.sessionManager.getArtistModeGrant(this.sessionId, this.brief.runId);
    if (!grantResult.ok) return null;
    return { session, run, grant: grantResult.result };
  }

  private completeAuthority(): void {
    const authority = this.readLiveAuthority();
    if (!authority) return;
    if (authority.run.status === 'running' || authority.run.status === 'paused' || authority.run.status === 'budget-exhausted') {
      this.sessionManager.completeArtistMode(this.sessionId, this.brief.runId);
    }
  }

  private canEditBrief(): boolean {
    return this.phase !== 'accepted' && this.phase !== 'rejected' && this.phase !== 'accepting';
  }

  private setPhase(phase: CreativeRunPhase): void {
    if (phase === 'running') this.beginActiveDuration();
    else this.endActiveDuration();
    if (this.phase === phase) {
      this.publish();
      return;
    }
    this.phase = phase;
    this.appendTimeline({ kind: 'phase', phase });
    this.publish();
  }

  private beginActiveDuration(): void {
    if (this.activeSegmentStartedAt === null) {
      this.activeSegmentStartedAt = readClock(this.clock);
    }
  }

  private endActiveDuration(): void {
    if (this.activeSegmentStartedAt === null) return;
    this.activeDurationMs += Math.max(0, readClock(this.clock) - this.activeSegmentStartedAt);
    this.activeSegmentStartedAt = null;
  }

  private readElapsedDurationMs(): number {
    const activeSegmentMs = this.activeSegmentStartedAt === null
      ? 0
      : Math.max(0, readClock(this.clock) - this.activeSegmentStartedAt);
    return this.activeDurationMs + activeSegmentMs;
  }

  private hasDurationBudget(): boolean {
    return this.readElapsedDurationMs() < this.brief.durationSeconds * 1000;
  }

  private pauseForBudget(
    code: 'limit_exceeded' | 'duration_exhausted',
  ): CreativeRunActionResult {
    this.sessionManager.pauseArtistMode(this.sessionId, this.brief.runId);
    this.appendTimeline({ kind: 'budget', ordinal: this.transactionsUsed, outcome: 'exhausted' });
    this.setPhase('paused');
    return this.fail(code, false, 'review-result');
  }

  private clearError(): void {
    this.error = null;
  }

  // fallow-ignore-next-line complexity -- Every externally visible phase maps to one truthful next action.
  private nextAction(): CreativeRunNextAction {
    if (this.error) return this.error.nextAction;
    if (this.recovery?.status.interrupted) return 'resume-interrupted';
    if (this.recovery?.status.requiresReapproval) return 'approve-brief';
    switch (this.phase) {
      case 'draft': return 'approve-brief';
      case 'awaiting-grant': return 'request-grant';
      case 'ready': return 'start-run';
      case 'running': return 'pause-run';
      case 'paused': return 'resume-run';
      case 'stopped': return 'review-result';
      case 'accepting': return 'none';
      case 'accepted':
      case 'rejected': return 'none';
      case 'pausing':
      case 'stopping': return 'none';
      case 'failed': return 'review-result';
      case 'recovery-required': return 'recover-manually';
      default: return 'none';
    }
  }

  private appendTimeline(entry: Omit<CreativeRunTimelineEntry, 'sequence' | 'timestamp'>): void {
    const timestamp = Math.max(this.lastTimelineTimestamp, readClock(this.clock));
    this.lastTimelineTimestamp = timestamp;
    const next: CreativeRunTimelineEntry = {
      ...entry,
      sequence: ++this.timelineSequence,
      timestamp,
    };
    if (this.timeline.length < CREATIVE_RUN_MAX_TIMELINE_ENTRIES) {
      this.timeline.push(next);
      return;
    }
    const alreadyCollapsed = this.timeline[0]?.kind === 'collapsed';
    this.collapsedTimelineEntries += alreadyCollapsed ? 1 : 2;
    if (alreadyCollapsed) {
      this.timeline.splice(1, 1);
      this.timeline[0] = {
        ...this.timeline[0],
        count: this.collapsedTimelineEntries,
      };
    } else {
      const first = this.timeline[0];
      this.timeline.splice(0, 2);
      this.timeline.unshift({
        sequence: first?.sequence ?? next.sequence,
        timestamp: first?.timestamp ?? next.timestamp,
        kind: 'collapsed',
        count: this.collapsedTimelineEntries,
      });
    }
    this.timeline.push(next);
  }

  private publish(): void {
    this.events.dispatchEvent(new CustomEvent('creative-run-state-changed', {
      detail: this.getState(),
    }));
  }

  private succeed(): CreativeRunActionResult {
    this.publish();
    return { ok: true, state: this.getState() };
  }

  private fail(code: string, retryable: boolean, nextAction: CreativeRunNextAction): CreativeRunActionResult {
    this.error = { code, retryable, nextAction };
    this.appendTimeline({ kind: 'failure', errorCode: code, outcome: 'failed' });
    this.publish();
    return { ok: false, error: this.error, state: this.getState() };
  }

  private failFromAdapter(
    result: { readonly ok: false; readonly error: EditorError },
    nextAction: CreativeRunNextAction,
  ): CreativeRunActionResult {
    return this.fail(result.error.code, result.error.retryable, nextAction);
  }

  private recoveryFailure(reason: string): CreativeRunActionResult {
    this.setPhase('recovery-required');
    return this.fail(`recovery_${reason.replaceAll('-', '_')}`, false, 'recover-manually');
  }

  private disposedResult(): CreativeRunActionResult {
    const error: CreativeRunError = {
      code: 'disposed',
      retryable: false,
      nextAction: 'none',
    };
    return { ok: false, error, state: this.getState() };
  }
}

// fallow-ignore-next-line unused-export -- Public factory keeps browser consumers independent from the controller constructor.
export function createCreativeRun(options: CreativeRunControllerOptions): CreativeRunController {
  return new CreativeRunController(options);
}

// fallow-ignore-next-line complexity -- Brief normalization applies every bounded field and exact authority posture together.
function normalizeBrief(
  input: CreativeBriefInput | CreativeBrief,
  runId: string,
  revision = 1,
): CreativeBrief {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('invalid revision');
  if (!isBoundedString(input.targetId, 256) || !isBoundedString(input.targetName, 256)) {
    throw new Error('invalid target');
  }
  if (!isBoundedString(input.goal, CREATIVE_RUN_MAX_GOAL_LENGTH)) throw new Error('invalid goal');
  if (!Array.isArray(input.constraints) || input.constraints.length > CREATIVE_RUN_MAX_CONSTRAINTS) {
    throw new Error('invalid constraints');
  }
  if (input.constraints.some((constraint) => !isBoundedString(constraint, CREATIVE_RUN_MAX_CONSTRAINT_LENGTH))) {
    throw new Error('invalid constraints');
  }
  const categories = normalizeCategories(input.requestedWriteCategories);
  if (!Number.isSafeInteger(input.transactionLimit) || input.transactionLimit < 1 || input.transactionLimit > ARTIST_MODE_MAX_TRANSACTIONS) {
    throw new Error('invalid transaction limit');
  }
  if (!Number.isSafeInteger(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > 3600) {
    throw new Error('invalid duration');
  }
  if (input.contentEgress !== 'local-only' && input.contentEgress !== 'approved-provider') {
    throw new Error('invalid egress posture');
  }
  return Object.freeze({
    runId: normalizeIdentity(runId, 'runId', CREATIVE_RUN_MAX_RUN_ID_LENGTH),
    revision,
    targetId: input.targetId,
    targetName: input.targetName,
    goal: input.goal,
    constraints: [...input.constraints],
    requestedWriteCategories: categories,
    transactionLimit: input.transactionLimit,
    durationSeconds: input.durationSeconds,
    contentEgress: input.contentEgress,
  });
}

function normalizeCategories(value: unknown): readonly ArtistModeCategory[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) throw new Error('invalid categories');
  const valid = new Set<ArtistModeCategory>(['structure', 'palette', 'timeline', 'raster']);
  const categories = value.map((category) => {
    if (typeof category !== 'string' || !valid.has(category as ArtistModeCategory)) throw new Error('invalid category');
    return category as ArtistModeCategory;
  });
  if (new Set(categories).size !== categories.length) throw new Error('duplicate category');
  return categories;
}

function matchesApproval(brief: CreativeBrief, approval: CreativeBriefApproval): boolean {
  if (!approval || approval.briefRevision !== brief.revision || approval.targetId !== brief.targetId) return false;
  if (approval.transactionLimit !== brief.transactionLimit || approval.durationSeconds !== brief.durationSeconds) return false;
  if (approval.contentEgress !== brief.contentEgress) return false;
  return sameArray(approval.requestedWriteCategories, brief.requestedWriteCategories);
}

function sameArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function isValidStep(value: unknown): value is CreativeRunStep {
  if (!value || typeof value !== 'object') return false;
  const step = value as Partial<CreativeRunStep>;
  return typeof step.profile === 'string' && Array.isArray(step.children);
}

function isReviewablePhase(phase: CreativeRunPhase): boolean {
  return phase === 'running' || phase === 'ready' || phase === 'paused' || phase === 'stopped';
}

function readTransactionResult(value: unknown): EditorTransactionResult | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<EditorTransactionResult>;
  if (typeof candidate.fromRevision !== 'number' || typeof candidate.revision !== 'number') return null;
  if (!candidate.provenance || typeof candidate.provenance !== 'object') return null;
  return candidate as EditorTransactionResult;
}

function summarizeTransaction(
  operationId: string,
  profile: EditorTransactionProfile,
  result: EditorTransactionResult,
  durationMs: number,
  ordinal: number,
): CreativeRunTransactionSummary {
  return {
    operationId,
    profile,
    ordinal,
    fromRevision: result.fromRevision,
    toRevision: result.revision,
    childCount: result.provenance.children.length,
    durationMs,
  };
}

function summarizeGrant(
  run: AutomationLocalArtistModeRun,
  grant: ArtistModeGrant,
): CreativeRunGrantSummary {
  return {
    status: run.status,
    categories: grant.categories,
    transactionLimit: grant.transactionLimit,
    transactionsUsed: grant.transactionsUsed,
    remainingTransactions: grant.remainingTransactions,
    expiresAt: grant.expiresAt,
  };
}

function createOperationId(runId: string, sequence: number): string {
  const suffix = `:step:${sequence}`;
  const prefixLength = Math.max(0, CREATIVE_RUN_MAX_OPERATION_ID_LENGTH - suffix.length);
  return `${runId.slice(0, prefixLength)}${suffix}`;
}

function isUnsafeFailure(code: EditorError['code']): boolean {
  return code === 'target_not_found' || code === 'revision_conflict' || code === 'internal';
}

function isInterruptionAuthorityCode(code: string): boolean {
  return code === 'session_backgrounded'
    || code === 'session_revoked'
    || code === 'session_expired'
    || code === 'run_backgrounded'
    || code === 'run_revoked'
    || code === 'run_expired';
}

function isValidReplacement(
  replacement: {
    readonly sessionId: string;
  },
  state: CreativeRunState,
  previousSessionId: string,
  previousRunId: string,
  observedRevision: number,
): boolean {
  return replacement.sessionId !== previousSessionId
    && state.sessionId === replacement.sessionId
    && state.runId !== previousRunId
    && state.approvedBriefRevision === null
    && state.phase === 'draft'
    && state.currentRevision === observedRevision;
}

function readObservedRevision(value: unknown): number | null {
  if (!isRecordValue(value)) return null;
  const revision = value.revision;
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function normalizeIdentity(value: unknown, reason: string, max: number): string {
  if (!isBoundedString(value, max)) throw new Error(`invalid ${reason}`);
  return value;
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readRevision(reader: () => number, fallback: number): number {
  try {
    const value = reader();
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function readClock(clock: () => number): number {
  try {
    const value = clock();
    return Number.isFinite(value) ? value : Date.now();
  } catch {
    return Date.now();
  }
}

function detach<T>(value: T): T {
  return structuredClone(value);
}

function redactTransport<T>(value: T): T {
  return detachAndRedact(value) as T;
}

function detachAndRedact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => detachAndRedact(item));
  if (value === null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  const redacted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'target' || key === 'provenance') continue;
    redacted[key] = detachAndRedact(child);
  }
  return redacted;
}

function freezeTransport<T>(value: T): T {
  freezeValue(value);
  return value;
}

// fallow-ignore-next-line code-duplication -- The controller freezes its detached state without coupling to Automation Session transport.
function freezeValue(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeValue(child);
}

function failure(code: EditorError['code'], retryable: boolean): AutomationSessionResult<never> {
  return { ok: false, error: { code, retryable } };
}

function isFailure(value: unknown): value is { readonly ok: false; readonly error: EditorError } {
  return Boolean(value && typeof value === 'object' && 'ok' in value && (value as { ok?: unknown }).ok === false);
}
