import { workspaceStore } from '../stores/workspace';
import type { ProjectContext } from '../stores/project-context';
import {
  AutomationAdapter,
  createAutomationAdapter,
  type AutomationAdapterDependencies,
  type AutomationFailure,
  type AutomationResult,
  type AutomationSuccess,
} from './automation-adapter';
import {
  ANIMATION_OBSERVATION_MAX_FRAMES,
  ANIMATION_OBSERVATION_MAX_KEYFRAMES,
  ANIMATION_OBSERVATION_MAX_CANVAS_DIMENSION,
  ANIMATION_OBSERVATION_MAX_FRAME_PIXELS,
  ANIMATION_OBSERVATION_MAX_CELLS,
  ANIMATION_OBSERVATION_MAX_CONTACT_SHEET_BYTES,
  ANIMATION_CEL_LINK_COMMAND_ID,
  ANIMATION_FRAME_COMMAND_ID,
  editorCatalog,
  CEL_UNLINK_COMMAND_ID,
  FRAME_TAG_COMMAND_ID,
  LAYER_STATE_COMMAND_ID,
  PROJECT_OBSERVATION_LIMITS,
  RASTER_GRID_MAX_CELLS,
  RASTER_GRID_MAX_REGION_HEIGHT,
  RASTER_GRID_MAX_REGION_WIDTH,
  RASTER_PATCH_COMMAND_ID,
  RENDER_OBSERVATION_MAX_BYTES,
  RENDER_OBSERVATION_MAX_PIXELS,
  RENDER_OBSERVATION_MAX_REGION_HEIGHT,
  RENDER_OBSERVATION_MAX_REGION_WIDTH,
  RENDER_OBSERVATION_MAX_SCALE,
  RENDER_OBSERVATION_MIN_SCALE,
  STATIC_LAYER_TREE_COMMAND_ID,
  STATIC_PALETTE_COMMAND_ID,
  STRUCTURE_REFINEMENT_COMMAND_ID,
} from './catalog';
import type { ProjectObservation } from './observations';
import { hasOnlyKeys, isRecord, type EditorError, type ProjectTarget } from './contracts';
import {
  EDITOR_TRANSACTION_OPERATION_ID,
  type EditorTransactionChildInput,
  type EditorTransactionProfile,
} from './transaction';
import {
  ProjectWriteTurnStore,
  type ProjectWriteTurnOwner,
} from './project-write-turn';

// fallow-ignore-next-line unused-export -- Public operation ID is part of the browser session contract.
export const AUTOMATION_SESSION_OPERATION_ID = 'automation.session';
// fallow-ignore-next-line unused-export -- Public contract version is negotiated by browser clients.
export const AUTOMATION_SESSION_CONTRACT_VERSION = '1.0';
// fallow-ignore-next-line unused-export -- Public request limit is shown to clients before approval.
export const AUTOMATION_SESSION_MAX_CLIENT_NAME_LENGTH = 128;
// fallow-ignore-next-line unused-export -- Public request limit is shown to clients before approval.
export const AUTOMATION_SESSION_MIN_LIFETIME_SECONDS = 1;
// fallow-ignore-next-line unused-export -- Public request limit is shown to clients before approval.
export const AUTOMATION_SESSION_MAX_LIFETIME_SECONDS = 60 * 60;
// fallow-ignore-next-line unused-export -- Public request limit is shown to clients before approval.
export const AUTOMATION_SESSION_MAX_PENDING_REQUESTS = 16;
export const ARTIST_MODE_MAX_TRANSACTIONS = 50;
// fallow-ignore-next-line unused-export -- Public transaction child bound is part of the Artist Mode contract.
export const ARTIST_MODE_MAX_CHILD_COMMANDS = 2;
// fallow-ignore-next-line unused-export -- Public run identity bound is validated at the browser boundary.
export const ARTIST_MODE_MAX_RUN_ID_LENGTH = 256;
// fallow-ignore-next-line unused-export -- Public run intent bound is validated at the browser boundary.
export const ARTIST_MODE_MAX_INTENT_LENGTH = 512;
// fallow-ignore-next-line unused-export -- Public operation identity bound is validated at the browser boundary.
export const ARTIST_MODE_MAX_OPERATION_ID_LENGTH = 256;
// fallow-ignore-next-line unused-export -- Public Artist Mode operation ID is negotiated by browser clients.
export const ARTIST_MODE_OPERATION_ID = 'automation.artist-mode';
const CURRENT_CATALOG_VERSION = editorCatalog.version;

// fallow-ignore-next-line unused-export -- Public class names are the stable content-class contract.
export const INSPECT_OBSERVATION_CLASSES = Object.freeze([
  'structure',
  'palette',
  'timeline',
  'raster',
  'render',
  'save-state',
] as const);

export type InspectObservationClass = (typeof INSPECT_OBSERVATION_CLASSES)[number];
export type AutomationSessionIdentity = 'self-declared';
// fallow-ignore-next-line unused-export -- Public Artist Mode categories are disclosed before approval.
export const ARTIST_MODE_CATEGORIES = Object.freeze([
  'structure',
  'palette',
  'timeline',
  'raster',
] as const);
export type ArtistModeCategory = (typeof ARTIST_MODE_CATEGORIES)[number];
export type ArtistModeRunStatus =
  | 'running'
  | 'paused'
  | 'budget-exhausted'
  | 'completed'
  | 'rejected'
  | 'revoked'
  | 'expired'
  | 'backgrounded';
// fallow-ignore-next-line unused-type -- Lifecycle state is part of the public browser session contract.
export type AutomationSessionStatus = 'active' | 'expired' | 'revoked' | 'backgrounded';

/**
 * The small public request contract. The browser never verifies the caller's
 * identity, so every request must carry the self-declared marker.
 */
export interface AutomationSessionRequestInput {
  readonly operation?: 'automation.session.request' | typeof AUTOMATION_SESSION_OPERATION_ID;
  readonly client: {
    readonly name: string;
    readonly identity: AutomationSessionIdentity;
  };
  readonly compatibility: {
    readonly minVersion: string;
    readonly maxVersion: string;
  };
  readonly observationClasses: readonly InspectObservationClass[];
  readonly lifetimeSeconds: number;
}

export interface AutomationSessionClient {
  readonly name: string;
  readonly identity: AutomationSessionIdentity;
}

export interface AutomationSessionRequestStatus {
  readonly type: 'automation.session.requested';
  readonly requestId: string;
  readonly client: AutomationSessionClient;
  readonly compatibility: AutomationSessionRequestInput['compatibility'];
  readonly observationClasses: readonly InspectObservationClass[];
  readonly lifetimeSeconds: number;
}

export interface AutomationSessionDenied {
  readonly type: 'automation.session.denied';
  readonly requestId: string;
  readonly reason: 'creator_denied';
}

export interface AutomationSessionLimits {
  readonly render: {
    readonly maxBytes: number;
    readonly region: {
      readonly maxWidth: number;
      readonly maxHeight: number;
      readonly maxPixels: number;
    };
    readonly scale: { readonly min: number; readonly max: number };
  };
  readonly raster: {
    readonly region: {
      readonly maxWidth: number;
      readonly maxHeight: number;
      readonly maxCells: number;
    };
  };
  readonly animation: {
    readonly maxFrames: number;
    readonly maxKeyframes: number;
    readonly maxCanvasWidth: number;
    readonly maxCanvasHeight: number;
    readonly maxFramePixels: number;
    readonly maxCells: number;
    readonly maxContactSheetBytes: number;
  };
  readonly project: typeof PROJECT_OBSERVATION_LIMITS;
}

export interface AutomationSessionGrant {
  readonly type: 'automation.session.granted';
  readonly sessionId: string;
  readonly client: AutomationSessionClient;
  readonly observationClasses: readonly InspectObservationClass[];
  readonly limits: AutomationSessionLimits;
  readonly expiresAt: number;
  readonly catalogVersion: typeof CURRENT_CATALOG_VERSION;
  readonly catalog: typeof editorCatalog;
}

/**
 * A strict write-authority request attached to an already approved inspect
 * session. The target and provenance are deliberately absent: the browser
 * supplies both from its private session and run records.
 */
// fallow-ignore-next-line unused-type -- Public Artist Mode request contract is consumed by browser clients.
export interface ArtistModeRequestInput {
  readonly operation?: 'automation.artist-mode.request' | typeof ARTIST_MODE_OPERATION_ID;
  readonly sessionId: string;
  readonly runId?: string;
  readonly runIntent?: string;
  readonly requestedWriteCategories: readonly ArtistModeCategory[];
  readonly requestedTransactionLimit: number;
  readonly requestedDurationSeconds: number;
}

export interface ArtistModeRequestStatus {
  readonly type: 'automation.artist-mode.requested';
  readonly requestId: string;
  readonly sessionId: string;
  readonly client: AutomationSessionClient;
  readonly runId: string;
  readonly runIntent?: string;
  readonly requestedWriteCategories: readonly ArtistModeCategory[];
  readonly requestedTransactionLimit: number;
  readonly requestedDurationSeconds: number;
  readonly remainingSessionSeconds: number;
}

export interface ArtistModeDenied {
  readonly type: 'automation.artist-mode.denied';
  readonly requestId: string;
  readonly reason: 'creator_denied';
}

export interface ArtistModeGrant {
  readonly type: 'automation.artist-mode.granted';
  readonly sessionId: string;
  readonly runId: string;
  readonly client: AutomationSessionClient;
  readonly categories: readonly ArtistModeCategory[];
  readonly transactionLimit: number;
  readonly childCommandLimit: typeof ARTIST_MODE_MAX_CHILD_COMMANDS;
  readonly transactionsUsed: number;
  readonly remainingTransactions: number;
  readonly expiresAt: number;
  readonly status: ArtistModeRunStatus;
  readonly catalogVersion: typeof CURRENT_CATALOG_VERSION;
  readonly operationIds: readonly [typeof EDITOR_TRANSACTION_OPERATION_ID];
  readonly profiles: readonly EditorTransactionProfile[];
}

export interface AutomationArtistModeEscalationRequest {
  readonly type: 'automation.artist-mode.escalation.requested';
  readonly requestId: string;
  readonly sessionId: string;
  readonly runId: string;
  readonly blockedAction: string;
  readonly blockedOperationId: string;
  readonly additionalTransactions: number;
}

export interface AutomationArtistModeEscalationDecision {
  readonly type:
    | 'automation.artist-mode.escalation.granted'
    | 'automation.artist-mode.escalation.denied';
  readonly requestId: string;
  readonly runId: string;
  readonly blockedOperationId: string;
  readonly additionalTransactions: number;
  readonly transactionLimit?: number;
}

export interface AutomationLocalArtistModeRun {
  readonly sessionId: string;
  readonly runId: string;
  readonly client: AutomationSessionClient;
  readonly targetId: string;
  readonly targetName: string;
  readonly intent?: string;
  readonly categories: readonly ArtistModeCategory[];
  readonly transactionLimit: number;
  readonly transactionsUsed: number;
  readonly remainingTransactions: number;
  readonly expiresAt: number;
  readonly status: ArtistModeRunStatus;
  readonly pendingEscalation: boolean;
}

export interface AutomationSessionDiscovery {
  readonly type: 'automation.session.discovery';
  readonly contractVersion: typeof AUTOMATION_SESSION_CONTRACT_VERSION;
  readonly session: typeof automationSessionCatalog;
  readonly compatibility: {
    readonly currentVersion: string;
    readonly minVersion: string;
    readonly maxVersion: string;
  };
  readonly request: {
    readonly clientName: { readonly min: number; readonly max: number };
    readonly identity: AutomationSessionIdentity;
    readonly observationClasses: readonly InspectObservationClass[];
    readonly lifetimeSeconds: { readonly min: number; readonly max: number };
  };
  readonly limits: AutomationSessionLimits;
  readonly catalog: typeof editorCatalog;
}

export interface AutomationLocalTarget {
  /** Browser-local Project Target identity. Never placed in client responses. */
  readonly id: string;
  /** Browser-local display name. Never placed in client responses. */
  readonly name: string;
  readonly context: ProjectContext;
  readonly workspaceItemId?: string;
}

export interface AutomationLocalTargetOption {
  /** Used only by the local approval DOM. */
  readonly id: string;
  /** Used only by the local approval DOM. */
  readonly name: string;
}

export interface AutomationSessionManagerOptions {
  readonly targets?: () => readonly AutomationLocalTarget[];
  readonly adapter?: AutomationAdapter;
  readonly adapterDependencies?: Omit<AutomationAdapterDependencies, 'targetRegistry'>;
  readonly writeTurns?: ProjectWriteTurnStore;
  readonly clock?: () => number;
  readonly isPageVisible?: () => boolean;
  readonly requestIdFactory?: () => string;
  readonly sessionIdFactory?: () => string;
  readonly runIdFactory?: () => string;
}

interface InternalSessionGrant {
  readonly sessionId: string;
  readonly targetId: string;
  readonly targetName: string;
  readonly context: ProjectContext;
  readonly client: AutomationSessionClient;
  readonly observationClasses: readonly InspectObservationClass[];
  readonly expiresAt: number;
  revisionBootstrap: 'available' | 'in-flight' | 'completed';
  status: AutomationSessionStatus;
}

interface InternalArtistModeRun {
  readonly sessionId: string;
  readonly runId: string;
  readonly targetId: string;
  readonly targetName: string;
  readonly context: ProjectContext;
  readonly client: AutomationSessionClient;
  readonly intent?: string;
  readonly categories: readonly ArtistModeCategory[];
  readonly expiresAt: number;
  transactionLimit: number;
  transactionsUsed: number;
  status: ArtistModeRunStatus;
  inFlight: boolean;
  pendingEscalation: InternalArtistModeEscalation | null;
  pendingTurnAction: PendingArtistTurnAction | null;
  readonly operationIds: Set<string>;
}

interface InternalArtistModeEscalation {
  readonly requestId: string;
  readonly blockedOperationId: string;
  readonly additionalTransactions: number;
}

type PendingArtistTurnAction =
  | { readonly kind: 'release'; readonly status: ArtistModeRunStatus }
  | { readonly kind: 'manual'; readonly ownerId: string };

interface InternalApprovalTarget {
  readonly id: string;
  readonly name: string;
  readonly context: ProjectContext;
  readonly projectId: string;
}

interface InternalPendingRequest {
  readonly requestId: string;
  readonly client: AutomationSessionClient;
  readonly compatibility: AutomationSessionRequestInput['compatibility'];
  readonly observationClasses: readonly InspectObservationClass[];
  readonly lifetimeSeconds: number;
  approvalTargets?: readonly InternalApprovalTarget[];
}

interface InternalPendingArtistModeRequest {
  readonly requestId: string;
  readonly sessionId: string;
  readonly client: AutomationSessionClient;
  readonly runId: string;
  readonly runIntent?: string;
  readonly requestedWriteCategories: readonly ArtistModeCategory[];
  readonly requestedTransactionLimit: number;
  readonly requestedDurationSeconds: number;
  readonly targetId: string;
  readonly targetName: string;
  readonly context: ProjectContext;
  readonly projectId: string;
}

interface NormalizedObservationPolicyRequest {
  readonly sessionId: string;
  readonly operation: ObservationPolicyOperation;
  readonly observationClass: InspectObservationClass;
  readonly expectedRevision?: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

interface NormalizedTransactionPolicyRequest {
  readonly sessionId: string;
  readonly operation: typeof EDITOR_TRANSACTION_OPERATION_ID;
  readonly runId: string;
  readonly operationId: string;
  readonly profile: EditorTransactionProfile;
  readonly expectedRevision: number;
  readonly children: readonly EditorTransactionChildInput[];
}

type NormalizedPolicyRequest =
  | NormalizedObservationPolicyRequest
  | NormalizedTransactionPolicyRequest;

type ObservationPolicyOperation =
  | 'project.observe'
  | 'project.save-safety'
  | 'project.raster.observe'
  | 'project.render.observe'
  | 'project.animation.observe';

type SessionSuccess<T> = AutomationSuccess<T>;
type SessionFailure = AutomationFailure;
export type AutomationSessionResult<T> = SessionSuccess<T> | SessionFailure;

export interface AutomationLocalSession {
  readonly sessionId: string;
  readonly client: AutomationSessionClient;
  readonly targetId: string;
  readonly targetName: string;
  readonly observationClasses: readonly InspectObservationClass[];
  readonly expiresAt: number;
  readonly status: AutomationSessionStatus;
}

// fallow-ignore-next-line unused-export -- Public per-call bounds are disclosed before approval.
export const AUTOMATION_SESSION_LIMITS: AutomationSessionLimits = Object.freeze({
  render: Object.freeze({
    maxBytes: RENDER_OBSERVATION_MAX_BYTES,
    region: Object.freeze({
      maxWidth: RENDER_OBSERVATION_MAX_REGION_WIDTH,
      maxHeight: RENDER_OBSERVATION_MAX_REGION_HEIGHT,
      maxPixels: RENDER_OBSERVATION_MAX_PIXELS,
    }),
    scale: Object.freeze({ min: RENDER_OBSERVATION_MIN_SCALE, max: RENDER_OBSERVATION_MAX_SCALE }),
  }),
  raster: Object.freeze({
    region: Object.freeze({
      maxWidth: RASTER_GRID_MAX_REGION_WIDTH,
      maxHeight: RASTER_GRID_MAX_REGION_HEIGHT,
      maxCells: RASTER_GRID_MAX_CELLS,
    }),
  }),
  animation: Object.freeze({
    maxFrames: ANIMATION_OBSERVATION_MAX_FRAMES,
    maxKeyframes: ANIMATION_OBSERVATION_MAX_KEYFRAMES,
    maxCanvasWidth: ANIMATION_OBSERVATION_MAX_CANVAS_DIMENSION,
    maxCanvasHeight: ANIMATION_OBSERVATION_MAX_CANVAS_DIMENSION,
    maxFramePixels: ANIMATION_OBSERVATION_MAX_FRAME_PIXELS,
    maxCells: ANIMATION_OBSERVATION_MAX_CELLS,
    maxContactSheetBytes: ANIMATION_OBSERVATION_MAX_CONTACT_SHEET_BYTES,
  }),
  project: PROJECT_OBSERVATION_LIMITS,
});

// fallow-ignore-next-line unused-export -- Public contract metadata is consumed by external browser clients.
export const automationSessionCatalog = Object.freeze({
  operation: AUTOMATION_SESSION_OPERATION_ID,
  contractVersion: AUTOMATION_SESSION_CONTRACT_VERSION,
  catalogVersion: CURRENT_CATALOG_VERSION,
  identity: 'self-declared' as const,
  observationClasses: INSPECT_OBSERVATION_CLASSES,
  lifetimeSeconds: {
    min: AUTOMATION_SESSION_MIN_LIFETIME_SECONDS,
    max: AUTOMATION_SESSION_MAX_LIFETIME_SECONDS,
  },
  limits: AUTOMATION_SESSION_LIMITS,
  authority: 'inspect-only until an explicit Artist Mode grant',
  artistMode: Object.freeze({
    operation: ARTIST_MODE_OPERATION_ID,
    categories: ARTIST_MODE_CATEGORIES,
    maxTransactions: ARTIST_MODE_MAX_TRANSACTIONS,
    maxChildrenPerTransaction: ARTIST_MODE_MAX_CHILD_COMMANDS,
    compatibleOperationIds: [EDITOR_TRANSACTION_OPERATION_ID] as const,
    persistence: 'memory-only',
  }),
  persistence: 'memory-only',
});

/**
 * A browser-local policy gate. Callers pass a session and operation, never a
 * target. The gate captures and rechecks the exact ProjectContext binding
 * before and after every detached adapter operation.
 */
// fallow-ignore-next-line unused-export -- The gate is a public browser-owned policy surface.
export class AutomationPolicyGate {
  private readonly adapter: AutomationAdapter;
  private readonly writeTurns?: ProjectWriteTurnStore;
  private readonly getSession: (sessionId: string) => InternalSessionGrant | undefined;
  private readonly getArtistRun: (
    sessionId: string,
    runId: string,
  ) => InternalArtistModeRun | undefined;
  private readonly resolveTarget: (session: InternalSessionGrant) => ProjectContext | undefined;
  private readonly isManagerDisposed: () => boolean;
  private readonly isPageVisible: () => boolean;
  private readonly clock: () => number;
  private readonly expireSession: (session: InternalSessionGrant) => void;
  private readonly releaseArtistRun: (run: InternalArtistModeRun, status?: ArtistModeRunStatus) => void;
  private readonly completeArtistTransaction: (run: InternalArtistModeRun, operationId: string) => void;

  constructor(options: {
    readonly adapter: AutomationAdapter;
    readonly writeTurns?: ProjectWriteTurnStore;
    readonly getSession: (sessionId: string) => InternalSessionGrant | undefined;
    readonly getArtistRun?: (
      sessionId: string,
      runId: string,
    ) => InternalArtistModeRun | undefined;
    readonly resolveTarget: (session: InternalSessionGrant) => ProjectContext | undefined;
    readonly isManagerDisposed: () => boolean;
    readonly isPageVisible: () => boolean;
    readonly clock: () => number;
    readonly expireSession: (session: InternalSessionGrant) => void;
    readonly releaseArtistRun?: (run: InternalArtistModeRun, status?: ArtistModeRunStatus) => void;
    readonly completeArtistTransaction?: (run: InternalArtistModeRun, operationId: string) => void;
  }) {
    this.adapter = options.adapter;
    this.writeTurns = options.writeTurns;
    this.getSession = options.getSession;
    this.getArtistRun = options.getArtistRun ?? (() => undefined);
    this.resolveTarget = options.resolveTarget;
    this.isManagerDisposed = options.isManagerDisposed;
    this.isPageVisible = options.isPageVisible;
    this.clock = options.clock;
    this.expireSession = options.expireSession;
    this.releaseArtistRun = options.releaseArtistRun ?? (() => {});
    this.completeArtistTransaction = options.completeArtistTransaction ?? (() => {});
  }

  /** Dispatch a public inspect request after all policy checks pass. */
  // fallow-ignore-next-line complexity -- Every policy invariant must be checked before and after detached adapter work.
  async request(input: unknown): Promise<AutomationSessionResult<unknown>> {
    let request: NormalizedPolicyRequest;
    try {
      request = normalizePolicyRequest(input);
    } catch (error) {
      return failureFromUnknown(error);
    }

    if (request.operation === EDITOR_TRANSACTION_OPERATION_ID) {
      return this.requestArtistTransaction(request);
    }

    const session = this.getSession(request.sessionId);
    const sessionFailure = this.validateSession(session);
    if (sessionFailure) return sessionFailure;
    if (!session) return sessionFailureResult('session_missing');

    if (!session.observationClasses.includes(request.observationClass)) {
      return failureResult('capability_denied', false, { reason: 'observation_class' });
    }

    const context = this.resolveTarget(session);
    const bindingFailure = validateTargetBinding(session, context);
    if (bindingFailure) return bindingFailure;

    const isRevisionBootstrap = request.expectedRevision === undefined;
    if (session.revisionBootstrap === 'in-flight') {
      return failureResult('capability_denied', true, {
        reason: 'revision_bootstrap_in_flight',
      });
    }
    if (isRevisionBootstrap && session.revisionBootstrap === 'completed') {
      return failureResult('invalid_request', false, { reason: 'expected_revision' });
    }
    const expectedRevision = request.expectedRevision ?? context!.project.revision.value;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return failureResult('invalid_request', false, { reason: 'expected_revision' });
    }
    if (isRevisionBootstrap) session.revisionBootstrap = 'in-flight';

    const target: ProjectTarget = { projectId: session.targetId };
    const adapterInput = createAdapterInput(request, target, expectedRevision);
    let result: AutomationResult<unknown>;
    try {
      result = await this.dispatch(request, adapterInput);
    } catch (error) {
      if (isRevisionBootstrap) session.revisionBootstrap = 'available';
      return failureFromUnknown(error);
    }

    const postFailure = this.validateSession(session);
    if (postFailure) {
      if (isRevisionBootstrap) session.revisionBootstrap = 'available';
      return postFailure;
    }
    const currentContext = this.resolveTarget(session);
    const currentBindingFailure = validateTargetBinding(session, currentContext);
    if (currentBindingFailure) {
      if (isRevisionBootstrap) session.revisionBootstrap = 'available';
      return currentBindingFailure;
    }
    if (context?.project.revision.value !== expectedRevision) {
      if (isRevisionBootstrap) session.revisionBootstrap = 'available';
      return failureResult('revision_conflict', true);
    }

    if (!result.ok) {
      if (isRevisionBootstrap) session.revisionBootstrap = 'available';
      return sanitizeFailure(result);
    }
    try {
      const observation = stripTargetIdentity(
        filterObservation(request.observationClass, result.result)
      );
      if (isRevisionBootstrap) session.revisionBootstrap = 'completed';
      return success(observation);
    } catch {
      if (isRevisionBootstrap) session.revisionBootstrap = 'available';
      return failureResult('internal', true, { reason: 'observation_transport' });
    }
  }

  // fallow-ignore-next-line complexity -- Every transaction invariant is checked before and after detached adapter execution.
  private async requestArtistTransaction(
    request: NormalizedTransactionPolicyRequest,
  ): Promise<AutomationSessionResult<unknown>> {
    const session = this.getSession(request.sessionId);
    const sessionFailure = this.validateSession(session);
    if (sessionFailure) return sessionFailure;
    if (!session) return sessionFailureResult('session_missing');

    const run = this.getArtistRun(request.sessionId, request.runId);
    if (!run) return failureResult('capability_denied', false, { reason: 'run_missing' });
    const runFailure = this.validateArtistRun(run, session);
    if (runFailure) return runFailure;
    const context = this.resolveTarget(session);
    const bindingFailure = validateTargetBinding(session, context);
    if (bindingFailure) {
      this.releaseArtistRun(run, 'expired');
      return bindingFailure;
    }
    if (!this.isCategoryAllowed(run, request.profile, request.children)) {
      return failureResult('capability_denied', false, { reason: 'write_category' });
    }
    if (run.inFlight) {
      return failureResult('capability_denied', true, { reason: 'write_in_flight' });
    }
    if (run.operationIds.has(request.operationId)) {
      return failureResult('invalid_request', false, { reason: 'duplicate_operation' });
    }
    if (run.transactionsUsed >= run.transactionLimit) {
      this.pauseForBudget(run);
      return failureResult('limit_exceeded', false, {
        reason: 'transaction_budget',
        max: run.transactionLimit,
      });
    }
    if (run.context.project.revision.value !== request.expectedRevision) {
      return failureResult('revision_conflict', true, {
        expectedRevision: request.expectedRevision,
      });
    }

    const owner: ProjectWriteTurnOwner = {
      kind: 'artist-mode',
      sessionId: run.sessionId,
      runId: run.runId,
    };
    if (!this.hasWriteTurn(run, owner)) {
      return failureResult('capability_denied', true, { reason: 'write_turn' });
    }

    run.inFlight = true;
    const adapterInput = {
      operation: EDITOR_TRANSACTION_OPERATION_ID,
      profile: request.profile,
      target: { projectId: run.targetId },
      expectedRevision: request.expectedRevision,
      provenance: {
        clientId: run.client.name,
        sessionId: run.sessionId,
        runId: run.runId,
        operationId: request.operationId,
      },
      children: request.children,
    };
    let result: AutomationResult<unknown>;
    try {
      result = await this.adapter.executeTransaction(adapterInput);
    } catch (error) {
      run.inFlight = false;
      this.prepareArtistTurnSettlement(run, session);
      this.finalizeArtistTurn(run, this.canTransferManualTurn(run, session));
      return failureFromUnknown(error);
    }

    run.inFlight = false;
    if (!result.ok) {
      this.prepareArtistTurnSettlement(run, session);
      this.finalizeArtistTurn(run, this.canTransferManualTurn(run, session));
      return sanitizeFailure(result);
    }
    if (run.context.project.revision.value !== request.expectedRevision + 1) {
      this.prepareArtistTurnSettlement(run, session);
      this.finalizeArtistTurn(run, this.canTransferManualTurn(run, session));
      return failureResult('revision_conflict', true, {
        expectedRevision: request.expectedRevision,
      });
    }

    this.completeArtistTransaction(run, request.operationId);
    this.prepareArtistTurnSettlement(run, session);
    this.finalizeArtistTurn(run, this.canTransferManualTurn(run, session));
    return success(stripTargetIdentity(result.result));
  }

  // fallow-ignore-next-line complexity -- Execution must distinguish every terminal, paused, expired, and bound run state.
  private validateArtistRun(
    run: InternalArtistModeRun,
    session: InternalSessionGrant,
  ): SessionFailure | undefined {
    if (run.sessionId !== session.sessionId || run.targetId !== session.targetId) {
      return failureResult('target_not_found', true, { reason: 'target_binding' });
    }
    if (run.context !== session.context || run.context.isDisposed) {
      this.releaseArtistRun(run, 'expired');
      return failureResult('target_not_found', true, {
        reason: run.context.isDisposed ? 'disposed' : 'target_rebound',
      });
    }
    if ((run.status === 'running' || run.status === 'paused') && this.clock() >= run.expiresAt) {
      this.releaseArtistRun(run, 'expired');
      return failureResult('capability_denied', false, { reason: 'run_expired' });
    }
    if (run.status === 'paused') {
      return failureResult('capability_denied', true, { reason: 'run_paused' });
    }
    if (run.status === 'budget-exhausted') {
      return failureResult('limit_exceeded', false, {
        reason: 'transaction_budget',
        max: run.transactionLimit,
      });
    }
    if (run.status !== 'running') {
      return failureResult('capability_denied', false, { reason: `run_${run.status}` });
    }
    return undefined;
  }

  private hasWriteTurn(run: InternalArtistModeRun, owner: ProjectWriteTurnOwner): boolean {
    return this.writeTurns ? this.writeTurns.has(run.targetId, owner) : false;
  }

  private pauseForBudget(run: InternalArtistModeRun): void {
    if (run.status === 'running') this.releaseArtistRun(run, 'budget-exhausted');
  }

  private artistTurnOwner(run: InternalArtistModeRun): ProjectWriteTurnOwner {
    return {
      kind: 'artist-mode',
      sessionId: run.sessionId,
      runId: run.runId,
    };
  }

  private prepareArtistTurnSettlement(
    run: InternalArtistModeRun,
    session: InternalSessionGrant,
  ): void {
    if (this.isManagerDisposed()) {
      run.pendingTurnAction = null;
      return;
    }
    const currentContext = this.resolveTarget(session);
    if (!validateTargetBinding(session, currentContext)) return;
    run.pendingTurnAction = null;
    this.releaseArtistRun(run, 'expired');
  }

  private canTransferManualTurn(
    run: InternalArtistModeRun,
    session: InternalSessionGrant,
  ): boolean {
    if (this.isManagerDisposed() || run.pendingTurnAction?.kind !== 'manual') return false;
    return !validateTargetBinding(session, this.resolveTarget(session));
  }

  private finalizeArtistTurn(run: InternalArtistModeRun, allowManualTransfer = true): void {
    if (!this.writeTurns) return;
    const pendingAction = run.pendingTurnAction;
    run.pendingTurnAction = null;
    const owner = this.artistTurnOwner(run);

    if (allowManualTransfer && pendingAction?.kind === 'manual') {
      this.writeTurns.release(run.targetId, owner);
      this.writeTurns.replaceWithManual(run.targetId, pendingAction.ownerId);
      return;
    }

    if (pendingAction?.kind === 'release' || run.status !== 'running') {
      this.writeTurns.release(run.targetId, owner);
    }
  }

  private isCategoryAllowed(
    run: InternalArtistModeRun,
    profile: EditorTransactionProfile,
    children: readonly EditorTransactionChildInput[],
  ): boolean {
    const required = categoriesForTransaction(profile, children);
    return required.every((category) => run.categories.includes(category));
  }

  /** Convenience method for callers that already have a session and class. */
  async observe(
    sessionId: string,
    observationClass: InspectObservationClass,
    input: unknown
  ): Promise<AutomationSessionResult<unknown>> {
    if (!isRecord(input)) return failureResult('invalid_request', false, { reason: 'request' });
    const operation = input.operation ?? operationForObservationClass(observationClass);
    return this.request({
      ...input,
      sessionId,
      operation,
      observationClass,
    });
  }

  private validateSession(session: InternalSessionGrant | undefined): SessionFailure | undefined {
    if (this.isManagerDisposed())
      return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    if (!this.isPageVisible())
      return failureResult('capability_denied', true, { reason: 'page_hidden' });
    if (!session) return sessionFailureResult('session_missing');
    if (session.status === 'revoked') return sessionFailureResult('session_revoked');
    if (session.status === 'backgrounded') return sessionFailureResult('session_backgrounded');
    if (session.status === 'expired' || this.clock() >= session.expiresAt) {
      this.expireSession(session);
      return sessionFailureResult('session_expired');
    }
    return undefined;
  }

  private async dispatch(
    request: NormalizedObservationPolicyRequest,
    input: Record<string, unknown>
  ): Promise<AutomationResult<unknown>> {
    switch (request.operation) {
      case 'project.observe':
      case 'project.save-safety':
        return this.adapter.observeProject(input);
      case 'project.raster.observe':
        return this.adapter.observeRaster(input);
      case 'project.render.observe':
        return this.adapter.observeRenderRequest(input);
      case 'project.animation.observe':
        return this.adapter.observeAnimation(input);
      default:
        return failureResult('capability_denied', false, { reason: 'inspect_only' });
    }
  }
}

/**
 * Browser-owned lifecycle and consent controller. Its maps are intentionally
 * private, in-memory, and cleared on disposal or a hidden-page transition.
 */
export class AutomationSessionManager {
  readonly events = new EventTarget();
  private readonly adapter: AutomationAdapter;
  readonly policyGate: AutomationPolicyGate;

  private readonly targetSource: () => readonly AutomationLocalTarget[];
  private readonly clock: () => number;
  private readonly isPageVisibleOverride?: () => boolean;
  private readonly requestIdFactory: () => string;
  private readonly sessionIdFactory: () => string;
  private readonly runIdFactory: () => string;
  private readonly writeTurns: ProjectWriteTurnStore;
  private readonly pendingRequests = new Map<string, InternalPendingRequest>();
  private readonly pendingArtistModeRequests = new Map<string, InternalPendingArtistModeRequest>();
  private readonly sessions = new Map<string, InternalSessionGrant>();
  private readonly artistRuns = new Map<string, InternalArtistModeRun>();
  private disposed = false;
  private visibilityListener: (() => void) | null = null;
  private wasPageVisible = true;

  // fallow-ignore-next-line complexity -- Manager construction wires the browser-owned policy and lifecycle callbacks together.
  constructor(options: AutomationSessionManagerOptions = {}) {
    this.targetSource = options.targets ?? defaultLocalTargetSource;
    this.clock = options.clock ?? (() => Date.now());
    this.isPageVisibleOverride = options.isPageVisible;
    this.requestIdFactory = options.requestIdFactory ?? createOpaqueId;
    this.sessionIdFactory = options.sessionIdFactory ?? createOpaqueId;
    this.runIdFactory = options.runIdFactory ?? createOpaqueId;
    this.writeTurns = options.writeTurns ?? new ProjectWriteTurnStore();

    const adapterDependencies = options.adapterDependencies ?? {};
    const resolveTarget = (target: ProjectTarget) => this.findTarget(target.projectId)?.context;
    this.adapter =
      options.adapter ??
      createAutomationAdapter({
        ...adapterDependencies,
        targetRegistry: resolveTarget,
      });
    this.adapter.negotiateCatalog({ version: CURRENT_CATALOG_VERSION });
    this.policyGate = new AutomationPolicyGate({
      adapter: this.adapter,
      writeTurns: this.writeTurns,
      getSession: (sessionId) => this.sessions.get(sessionId),
      getArtistRun: (sessionId, runId) => {
        const run = this.artistRuns.get(runId);
        return run?.sessionId === sessionId ? run : undefined;
      },
      resolveTarget: (session) => this.findTarget(session.targetId)?.context,
      isManagerDisposed: () => this.disposed,
      isPageVisible: () => this.isPageVisible(),
      clock: this.clock,
      expireSession: (session) => {
        session.status = 'expired';
        this.releaseArtistRunsForSession(session.sessionId, 'expired');
      },
      releaseArtistRun: (run, status) => this.releaseArtistRun(run, status),
      completeArtistTransaction: (run, operationId) => this.completeArtistTransaction(run, operationId),
    });

    this.wasPageVisible = this.currentPageVisibility();
    if (!this.wasPageVisible) this.backgroundAutomation();
    if (typeof document !== 'undefined') {
      this.visibilityListener = () => this.handleVisibilityChange();
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  /** Discover only public compatibility and catalog data. */
  discover(): AutomationSessionDiscovery {
    return cloneTransport({
      type: 'automation.session.discovery',
      contractVersion: AUTOMATION_SESSION_CONTRACT_VERSION,
      session: automationSessionCatalog,
      compatibility: {
        currentVersion: CURRENT_CATALOG_VERSION,
        minVersion: CURRENT_CATALOG_VERSION,
        maxVersion: CURRENT_CATALOG_VERSION,
      },
      request: {
        clientName: {
          min: 1,
          max: AUTOMATION_SESSION_MAX_CLIENT_NAME_LENGTH,
        },
        identity: 'self-declared',
        observationClasses: INSPECT_OBSERVATION_CLASSES,
        lifetimeSeconds: {
          min: AUTOMATION_SESSION_MIN_LIFETIME_SECONDS,
          max: AUTOMATION_SESSION_MAX_LIFETIME_SECONDS,
        },
      },
      limits: AUTOMATION_SESSION_LIMITS,
      catalog: structuredClone(editorCatalog),
    });
  }

  /** Validate and queue one request for visible local approval. */
  requestSession(input: unknown): AutomationSessionResult<AutomationSessionRequestStatus> {
    if (this.disposed)
      return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    if (!this.isPageVisible())
      return failureResult('capability_denied', true, { reason: 'page_hidden' });
    if (this.pendingRequests.size >= AUTOMATION_SESSION_MAX_PENDING_REQUESTS) {
      return failureResult('limit_exceeded', false, { reason: 'pending_requests' });
    }

    let request: AutomationSessionRequestInput;
    try {
      request = normalizeSessionRequest(input);
      assertCompatibleRange(request.compatibility);
    } catch (error) {
      return failureFromUnknown(error);
    }

    for (const pending of this.pendingRequests.values()) {
      if (samePendingRequest(pending, request)) {
        return failureResult('invalid_request', false, { reason: 'duplicate_request' });
      }
    }

    const requestId = this.createUniqueId(this.requestIdFactory, this.pendingRequests);
    if (!requestId) return failureResult('internal', true, { reason: 'request_id' });
    const pending: InternalPendingRequest = {
      requestId,
      client: { ...request.client },
      compatibility: { ...request.compatibility },
      observationClasses: [...request.observationClasses],
      lifetimeSeconds: request.lifetimeSeconds,
    };
    this.pendingRequests.set(requestId, pending);
    const status = this.publicPendingRequest(pending);
    this.events.dispatchEvent(new CustomEvent('automation-session-requested', { detail: status }));
    return success(status);
  }

  listPendingRequests(): readonly AutomationSessionRequestStatus[] {
    return cloneTransport(
      [...this.pendingRequests.values()].map((pending) => this.publicPendingRequest(pending))
    );
  }

  /**
   * Request one bounded Artist Mode run for an already approved inspect
   * session. This request is content-free and never accepts a target or
   * provenance record from the caller.
   */
  // fallow-ignore-next-line complexity -- Request validation binds one session and one target without exposing either to the caller.
  requestArtistMode(input: unknown): AutomationSessionResult<ArtistModeRequestStatus> {
    if (this.disposed)
      return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    if (!this.isPageVisible())
      return failureResult('capability_denied', true, { reason: 'page_hidden' });
    if (this.pendingRequests.size + this.pendingArtistModeRequests.size >= AUTOMATION_SESSION_MAX_PENDING_REQUESTS) {
      return failureResult('limit_exceeded', false, { reason: 'pending_requests' });
    }

    let request: NormalizedArtistModeRequest;
    try {
      request = normalizeArtistModeRequest(input);
    } catch (error) {
      return failureFromUnknown(error);
    }

    const session = this.sessions.get(request.sessionId);
    const sessionFailure = this.validateManagerSession(session);
    if (sessionFailure) return sessionFailure;
    if (!session) return sessionFailureResult('session_missing');
    const target = this.findTarget(session.targetId);
    if (!target || target.context !== session.context || target.context.isDisposed
        || target.context.project.id.value !== session.targetId) {
      return failureResult('target_not_found', true, { reason: 'target_binding' });
    }
    if ([...this.artistRuns.values()].some((run) => run.sessionId === session.sessionId)) {
      return failureResult('invalid_request', false, { reason: 'run_already_granted' });
    }
    if ([...this.pendingArtistModeRequests.values()].some(
      (pending) => pending.sessionId === session.sessionId,
    )) {
      return failureResult('invalid_request', false, { reason: 'duplicate_request' });
    }

    const runId = request.runId ?? this.createUniqueId(this.runIdFactory, this.artistRuns);
    if (!runId) return failureResult('internal', true, { reason: 'run_id' });
    if ([...this.artistRuns.values()].some((run) => run.runId === runId)
        || [...this.pendingArtistModeRequests.values()].some((pending) => pending.runId === runId)) {
      return failureResult('invalid_request', false, { reason: 'duplicate_run' });
    }
    const requestId = this.createRequestId();
    if (!requestId) return failureResult('internal', true, { reason: 'request_id' });

    const pending: InternalPendingArtistModeRequest = {
      requestId,
      sessionId: session.sessionId,
      client: { ...session.client },
      runId,
      ...(request.runIntent === undefined ? {} : { runIntent: request.runIntent }),
      requestedWriteCategories: [...request.requestedWriteCategories],
      requestedTransactionLimit: request.requestedTransactionLimit,
      requestedDurationSeconds: request.requestedDurationSeconds,
      targetId: target.id,
      targetName: target.name,
      context: target.context,
      projectId: target.context.project.id.value,
    };
    this.pendingArtistModeRequests.set(requestId, pending);
    const status = this.publicArtistModeRequest(pending);
    this.events.dispatchEvent(new CustomEvent('automation-artist-mode-requested', { detail: status }));
    return success(status);
  }

  listPendingArtistModeRequests(): readonly ArtistModeRequestStatus[] {
    return cloneTransport(
      [...this.pendingArtistModeRequests.values()].map((pending) => this.publicArtistModeRequest(pending)),
    );
  }

  listPendingArtistModeEscalations(): readonly AutomationArtistModeEscalationRequest[] {
    return cloneTransport(
      [...this.artistRuns.values()]
        .flatMap((run) => {
          const escalation = run.pendingEscalation;
          if (!escalation) return [];
          return [{
            type: 'automation.artist-mode.escalation.requested' as const,
            requestId: escalation.requestId,
            sessionId: run.sessionId,
            runId: run.runId,
            blockedAction: EDITOR_TRANSACTION_OPERATION_ID,
            blockedOperationId: escalation.blockedOperationId,
            additionalTransactions: escalation.additionalTransactions,
          }];
        }),
    );
  }

  /** Capture the exact local target displayed for an Artist Mode request. */
  captureArtistModeTarget(requestId: string): AutomationLocalTargetOption | null {
    const pending = this.pendingArtistModeRequests.get(requestId);
    if (!pending || this.disposed || !this.isPageVisible()) return null;
    return cloneTransport({ id: pending.targetId, name: pending.targetName });
  }

  /**
   * Approve a subset and a transaction limit for one pending Artist Mode
   * request. The target is already bound by the inspect session and is
   * revalidated here before the write turn is acquired.
   */
  // fallow-ignore-next-line complexity -- Approval atomically validates the subset, limit, session, target, and write turn.
  approveArtistMode(
    requestId: string,
    categoriesOrApproval:
      | readonly ArtistModeCategory[]
      | { readonly categories: readonly ArtistModeCategory[]; readonly transactionLimit: number },
    transactionLimit?: number,
  ): AutomationSessionResult<ArtistModeGrant> {
    if (this.disposed)
      return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    if (!this.isPageVisible())
      return failureResult('capability_denied', true, { reason: 'page_hidden' });
    const pending = this.pendingArtistModeRequests.get(requestId);
    if (!pending) return failureResult('capability_denied', false, { reason: 'request_missing' });

    let approvalCategories: unknown;
    let approvalLimit: unknown;
    if (isRecord(categoriesOrApproval) && !Array.isArray(categoriesOrApproval)) {
      approvalCategories = categoriesOrApproval.categories;
      approvalLimit = categoriesOrApproval.transactionLimit;
    } else {
      approvalCategories = categoriesOrApproval;
      approvalLimit = transactionLimit;
    }
    let categories: readonly ArtistModeCategory[];
    let limit: number;
    try {
      categories = normalizeGrantedArtistCategories(approvalCategories, pending.requestedWriteCategories);
      limit = normalizeArtistTransactionLimit(
        approvalLimit,
        pending.requestedTransactionLimit,
      );
    } catch (error) {
      return failureFromUnknown(error);
    }

    const session = this.sessions.get(pending.sessionId);
    const sessionFailure = this.validateManagerSession(session);
    if (sessionFailure) return sessionFailure;
    if (!session) return sessionFailureResult('session_missing');
    const target = this.findTarget(pending.targetId);
    if (
      !target ||
      target.context !== pending.context ||
      target.name !== pending.targetName ||
      target.context.isDisposed ||
      target.context.project.id.value !== pending.projectId ||
      session.context !== pending.context ||
      session.targetId !== pending.targetId
    ) {
      return failureResult('target_not_found', true, { reason: 'target_binding' });
    }

    const runId = pending.runId;
    const owner: ProjectWriteTurnOwner = {
      kind: 'artist-mode',
      sessionId: pending.sessionId,
      runId,
    };
    const turn = this.writeTurns.acquire(pending.targetId, owner);
    if (!turn.ok) return failureResult('capability_denied', true, { reason: 'write_turn' });

    const expiresAt = Math.min(
      session.expiresAt,
      this.clock() + pending.requestedDurationSeconds * 1000,
    );
    const run: InternalArtistModeRun = {
      sessionId: pending.sessionId,
      runId,
      targetId: pending.targetId,
      targetName: pending.targetName,
      context: pending.context,
      client: { ...pending.client },
      ...(pending.runIntent === undefined ? {} : { intent: pending.runIntent }),
      categories: [...categories],
      expiresAt,
      transactionLimit: limit,
      transactionsUsed: 0,
      status: 'running',
      inFlight: false,
      pendingEscalation: null,
      pendingTurnAction: null,
      operationIds: new Set(),
    };
    this.pendingArtistModeRequests.delete(requestId);
    this.artistRuns.set(runId, run);
    const grant = this.publicArtistModeGrant(run);
    this.events.dispatchEvent(new CustomEvent('automation-artist-mode-granted', { detail: grant }));
    return success(grant);
  }

  denyArtistMode(requestId: string): AutomationSessionResult<ArtistModeDenied> {
    if (this.disposed)
      return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    const pending = this.pendingArtistModeRequests.get(requestId);
    if (!pending) return failureResult('capability_denied', false, { reason: 'request_missing' });
    this.pendingArtistModeRequests.delete(requestId);
    const denied = cloneTransport({
      type: 'automation.artist-mode.denied' as const,
      requestId,
      reason: 'creator_denied' as const,
    });
    this.events.dispatchEvent(new CustomEvent('automation-artist-mode-denied', { detail: denied }));
    return success(denied);
  }

  listLocalArtistModeRuns(): readonly AutomationLocalArtistModeRun[] {
    const now = this.clock();
    for (const run of this.artistRuns.values()) {
      if ((run.status === 'running' || run.status === 'paused') && now >= run.expiresAt) {
        this.releaseArtistRun(run, 'expired');
      }
    }
    return cloneTransport([...this.artistRuns.values()].map((run) => this.publicLocalArtistRun(run)));
  }

  // fallow-ignore-next-line unused-class-member -- Public target-free grant lookup is consumed by Artist Mode clients.
  getArtistModeGrant(
    sessionId: string,
    runId: string,
  ): AutomationSessionResult<ArtistModeGrant> {
    const run = this.artistRuns.get(runId);
    if (!run || run.sessionId !== sessionId) {
      return failureResult('capability_denied', false, { reason: 'run_missing' });
    }
    return success(this.publicArtistModeGrant(run));
  }

  pauseArtistMode(sessionId: string, runId: string): AutomationSessionResult<ArtistModeGrant> {
    const run = this.findArtistRun(sessionId, runId);
    if (!run) return failureResult('capability_denied', false, { reason: 'run_missing' });
    const sessionFailure = this.validateArtistLifecycle(sessionId, run);
    if (sessionFailure) return sessionFailure;
    if (run.status === 'running') this.releaseArtistRun(run, 'paused');
    else if (run.status !== 'paused') {
      return failureResult('capability_denied', false, { reason: `run_${run.status}` });
    }
    return success(this.publicArtistModeGrant(run));
  }

  // fallow-ignore-next-line complexity -- Resuming requires rechecking every live authority binding before reacquiring the turn.
  resumeArtistMode(sessionId: string, runId: string): AutomationSessionResult<ArtistModeGrant> {
    if (this.disposed)
      return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    if (!this.isPageVisible())
      return failureResult('capability_denied', true, { reason: 'page_hidden' });
    const run = this.findArtistRun(sessionId, runId);
    if (!run) return failureResult('capability_denied', false, { reason: 'run_missing' });
    const session = this.sessions.get(sessionId);
    const sessionFailure = this.validateManagerSession(session);
    if (sessionFailure) return sessionFailure;
    if (!session) return sessionFailureResult('session_missing');
    const target = this.findTarget(run.targetId);
    if (
      !target ||
      target.context !== run.context ||
      target.context.isDisposed ||
      target.context.project.id.value !== run.targetId ||
      session.context !== run.context ||
      session.targetId !== run.targetId
    ) {
      this.releaseArtistRun(run, 'expired');
      return failureResult('target_not_found', true, { reason: 'target_binding' });
    }
    if ((run.status === 'running' || run.status === 'paused') && this.clock() >= run.expiresAt) {
      this.releaseArtistRun(run, 'expired');
      return failureResult('capability_denied', false, { reason: 'run_expired' });
    }
    if (run.status !== 'paused') {
      return failureResult('capability_denied', false, { reason: `run_${run.status}` });
    }
    if (run.transactionsUsed >= run.transactionLimit) {
      run.status = 'budget-exhausted';
      return failureResult('limit_exceeded', false, { reason: 'transaction_budget' });
    }
    const owner: ProjectWriteTurnOwner = { kind: 'artist-mode', sessionId, runId };
    const turn = this.writeTurns.acquire(run.targetId, owner);
    if (!turn.ok) return failureResult('capability_denied', true, { reason: 'write_turn' });
    run.status = 'running';
    return success(this.publicArtistModeGrant(run));
  }

  // fallow-ignore-next-line code-duplication -- Completion repeats the local lifecycle guard shared with pause/reject controls.
  completeArtistMode(sessionId: string, runId: string): AutomationSessionResult<ArtistModeGrant> {
    const run = this.findArtistRun(sessionId, runId);
    if (!run) return failureResult('capability_denied', false, { reason: 'run_missing' });
    const sessionFailure = this.validateArtistLifecycle(sessionId, run);
    if (sessionFailure) return sessionFailure;
    if (run.status !== 'running' && run.status !== 'paused' && run.status !== 'budget-exhausted') {
      return failureResult('capability_denied', false, { reason: `run_${run.status}` });
    }
    this.releaseArtistRun(run, 'completed');
    return success(this.publicArtistModeGrant(run));
  }

  // fallow-ignore-next-line code-duplication -- Rejection repeats the local lifecycle guard shared with pause/complete controls.
  rejectArtistMode(sessionId: string, runId: string): AutomationSessionResult<ArtistModeGrant> {
    const run = this.findArtistRun(sessionId, runId);
    if (!run) return failureResult('capability_denied', false, { reason: 'run_missing' });
    const sessionFailure = this.validateArtistLifecycle(sessionId, run);
    if (sessionFailure) return sessionFailure;
    if (run.status !== 'running' && run.status !== 'paused') {
      return failureResult('capability_denied', false, { reason: `run_${run.status}` });
    }
    this.releaseArtistRun(run, 'rejected');
    return success(this.publicArtistModeGrant(run));
  }

  /** Synchronously pause an Artist Mode run before a manual turn takes over. */
  takeoverProjectWriteTurn(targetId: string, ownerId = 'manual'): boolean {
    const previous = this.writeTurns.owner(targetId);
    if (previous?.kind === 'artist-mode') {
      const run = this.artistRuns.get(previous.runId);
      if (run?.inFlight) {
        run.status = 'paused';
        run.pendingEscalation = null;
        run.pendingTurnAction = { kind: 'manual', ownerId };
        return true;
      }
      if (run) this.releaseArtistRun(run, 'paused');
      else this.writeTurns.release(targetId, previous);
    }
    this.writeTurns.replaceWithManual(targetId, ownerId);
    return previous !== undefined;
  }

  // fallow-ignore-next-line unused-class-member -- Public manual takeover seam is consumed by editor coordination.
  acquireManualProjectWriteTurn(
    targetId: string,
    ownerId: string,
  ): AutomationSessionResult<{ readonly type: 'project.write-turn.manual' }> {
    if (typeof targetId !== 'string' || targetId.length === 0 || typeof ownerId !== 'string' || ownerId.length === 0) {
      return failureResult('invalid_request', false, { reason: 'write_turn' });
    }
    const turn = this.writeTurns.acquire(targetId, { kind: 'manual', ownerId });
    if (!turn.ok) return failureResult('capability_denied', true, { reason: 'write_turn' });
    return success({ type: 'project.write-turn.manual' });
  }

  // fallow-ignore-next-line unused-class-member -- Public manual takeover seam is consumed by editor coordination.
  releaseManualProjectWriteTurn(targetId: string, ownerId: string): boolean {
    return this.writeTurns.release(targetId, { kind: 'manual', ownerId });
  }

  /** Dispatch one transaction escalation request for local creator approval. */
  requestArtistModeEscalation(input: unknown): AutomationSessionResult<AutomationArtistModeEscalationRequest> {
    if (this.disposed)
      return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    if (!this.isPageVisible())
      return failureResult('capability_denied', true, { reason: 'page_hidden' });
    let request: NormalizedEscalationRequest;
    try {
      request = normalizeEscalationRequest(input);
    } catch (error) {
      return failureFromUnknown(error);
    }
    const run = this.findArtistRun(request.sessionId, request.runId);
    if (!run) return failureResult('capability_denied', false, { reason: 'run_missing' });
    if (run.status !== 'budget-exhausted') {
      return failureResult('invalid_state', false, { reason: 'escalation_not_needed' });
    }
    if (run.pendingEscalation) return failureResult('invalid_request', false, { reason: 'duplicate_escalation' });
    if (request.additionalTransactions > ARTIST_MODE_MAX_TRANSACTIONS - run.transactionLimit) {
      return failureResult('limit_exceeded', false, { reason: 'transaction_budget', max: ARTIST_MODE_MAX_TRANSACTIONS });
    }
    const requestId = this.createRequestId();
    if (!requestId) return failureResult('internal', true, { reason: 'request_id' });
    run.pendingEscalation = {
      requestId,
      blockedOperationId: request.blockedOperationId,
      additionalTransactions: request.additionalTransactions,
    };
    const status = cloneTransport({
      type: 'automation.artist-mode.escalation.requested' as const,
      requestId,
      sessionId: run.sessionId,
      runId: run.runId,
      blockedAction: request.blockedAction,
      blockedOperationId: request.blockedOperationId,
      additionalTransactions: request.additionalTransactions,
    });
    this.events.dispatchEvent(new CustomEvent('automation-artist-mode-escalation-requested', { detail: status }));
    return success(status);
  }

  approveArtistModeEscalation(
    requestId: string,
  ): AutomationSessionResult<AutomationArtistModeEscalationDecision> {
    const run = [...this.artistRuns.values()].find((candidate) => candidate.pendingEscalation?.requestId === requestId);
    if (!run || !run.pendingEscalation) return failureResult('capability_denied', false, { reason: 'request_missing' });
    const session = this.sessions.get(run.sessionId);
    const sessionFailure = this.validateManagerSession(session);
    if (sessionFailure) return sessionFailure;
    if (!session) return sessionFailureResult('session_missing');
    const additional = run.pendingEscalation.additionalTransactions;
    const blockedOperationId = run.pendingEscalation.blockedOperationId;
    run.transactionLimit += additional;
    run.pendingEscalation = null;
    run.status = 'paused';
    this.writeTurns.release(run.targetId, { kind: 'artist-mode', sessionId: run.sessionId, runId: run.runId });
    const decision = cloneTransport({
      type: 'automation.artist-mode.escalation.granted' as const,
      requestId,
      runId: run.runId,
      blockedOperationId,
      additionalTransactions: additional,
      transactionLimit: run.transactionLimit,
    });
    this.events.dispatchEvent(new CustomEvent('automation-artist-mode-escalation-granted', { detail: decision }));
    return success(decision);
  }

  // fallow-ignore-next-line code-duplication -- Denial shares the pending escalation lookup with approval.
  denyArtistModeEscalation(
    requestId: string,
  ): AutomationSessionResult<AutomationArtistModeEscalationDecision> {
    const run = [...this.artistRuns.values()].find((candidate) => candidate.pendingEscalation?.requestId === requestId);
    if (!run || !run.pendingEscalation) return failureResult('capability_denied', false, { reason: 'request_missing' });
    const additional = run.pendingEscalation.additionalTransactions;
    const blockedOperationId = run.pendingEscalation.blockedOperationId;
    run.pendingEscalation = null;
    const decision = cloneTransport({
      type: 'automation.artist-mode.escalation.denied' as const,
      requestId,
      runId: run.runId,
      blockedOperationId,
      additionalTransactions: additional,
    });
    this.events.dispatchEvent(new CustomEvent('automation-artist-mode-escalation-denied', { detail: decision }));
    return success(decision);
  }

  /** Capture the exact local target/context choices shown for one request. */
  captureLocalTargets(requestId: string): readonly AutomationLocalTargetOption[] {
    const pending = this.pendingRequests.get(requestId);
    if (!pending || this.disposed || !this.isPageVisible()) return [];

    pending.approvalTargets = this.readTargets()
      .filter(
        (target) => !target.context.isDisposed && target.context.project.id.value === target.id
      )
      .map((target) => ({
        id: target.id,
        name: target.name,
        context: target.context,
        projectId: target.context.project.id.value,
      }));
    return cloneTransport(pending.approvalTargets.map(({ id, name }) => ({ id, name })));
  }

  /** Browser-local session management data; never a client response. */
  listLocalSessions(): readonly AutomationLocalSession[] {
    const now = this.clock();
    for (const session of this.sessions.values()) {
      if (session.status === 'active' && now >= session.expiresAt) session.status = 'expired';
    }
    return cloneTransport(
      [...this.sessions.values()].map((session) => ({
        sessionId: session.sessionId,
        client: session.client,
        targetId: session.targetId,
        targetName: session.targetName,
        observationClasses: session.observationClasses,
        expiresAt: session.expiresAt,
        status: session.status,
      }))
    );
  }

  // fallow-ignore-next-line complexity -- Approval binds one target, subset, lifetime, and opaque session atomically.
  approveRequest(
    requestId: string,
    targetId: string,
    observationClasses: readonly InspectObservationClass[]
  ): AutomationSessionResult<AutomationSessionGrant> {
    if (this.disposed)
      return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    if (!this.isPageVisible())
      return failureResult('capability_denied', true, { reason: 'page_hidden' });
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return failureResult('capability_denied', false, { reason: 'request_missing' });

    let selectedClasses: readonly InspectObservationClass[];
    try {
      selectedClasses = normalizeGrantedClasses(observationClasses, pending.observationClasses);
      if (typeof targetId !== 'string' || targetId.length === 0) {
        throw sessionError('invalid_request', false, { reason: 'target' });
      }
    } catch (error) {
      return failureFromUnknown(error);
    }

    const target = this.findTarget(targetId);
    const capturedTarget = pending.approvalTargets?.find((candidate) => candidate.id === targetId);
    if (
      !capturedTarget ||
      !target ||
      capturedTarget.context.isDisposed ||
      target.context.isDisposed ||
      target.context.project.id.value !== target.id ||
      capturedTarget.name !== target.name ||
      capturedTarget.context !== target.context ||
      capturedTarget.projectId !== target.context.project.id.value
    ) {
      return failureResult('target_not_found', true);
    }

    const sessionId = this.createUniqueId(this.sessionIdFactory, this.sessions);
    if (!sessionId) return failureResult('internal', true, { reason: 'session_id' });
    const expiresAt = this.clock() + pending.lifetimeSeconds * 1000;
    if (!Number.isSafeInteger(expiresAt))
      return failureResult('internal', true, { reason: 'expiry' });
    const session: InternalSessionGrant = {
      sessionId,
      targetId: target.id,
      targetName: target.name,
      context: target.context,
      client: { ...pending.client },
      observationClasses: [...selectedClasses],
      expiresAt,
      revisionBootstrap: 'available',
      status: 'active',
    };
    this.pendingRequests.delete(requestId);
    this.sessions.set(sessionId, session);
    const grant = this.publicGrant(session);
    this.events.dispatchEvent(new CustomEvent('automation-session-granted', { detail: grant }));
    return success(grant);
  }

  denyRequest(requestId: string): AutomationSessionResult<AutomationSessionDenied> {
    if (this.disposed)
      return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return failureResult('capability_denied', false, { reason: 'request_missing' });
    this.pendingRequests.delete(requestId);
    const denied = cloneTransport({
      type: 'automation.session.denied' as const,
      requestId,
      reason: 'creator_denied' as const,
    });
    this.events.dispatchEvent(new CustomEvent('automation-session-denied', { detail: denied }));
    return success(denied);
  }

  /** Synchronously revoke a live grant. The next gate call fails. */
  revokeSession(
    sessionId: string
  ): AutomationSessionResult<{ readonly type: 'automation.session.revoked' }> {
    if (this.disposed)
      return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    const session = this.sessions.get(sessionId);
    if (!session) return failureResult('capability_denied', false, { reason: 'session_missing' });
    session.status = 'revoked';
    this.releaseArtistRunsForSession(sessionId, 'revoked');
    const revoked = cloneTransport({ type: 'automation.session.revoked' as const });
    this.events.dispatchEvent(new CustomEvent('automation-session-revoked', { detail: revoked }));
    return success(revoked);
  }

  async requestObservation(input: unknown): Promise<AutomationSessionResult<unknown>> {
    return this.policyGate.request(input);
  }

  async observe(
    sessionId: string,
    observationClass: InspectObservationClass,
    input: unknown
  ): Promise<AutomationSessionResult<unknown>> {
    return this.policyGate.observe(sessionId, observationClass, input);
  }

  /** Submit one target-free Artist Mode transaction proposal to the policy gate. */
  async requestTransaction(input: unknown): Promise<AutomationSessionResult<unknown>> {
    return this.policyGate.request(input);
  }

  async executeArtistModeTransaction(
    sessionId: string,
    runId: string,
    input: unknown,
  ): Promise<AutomationSessionResult<unknown>> {
    if (!isRecord(input)) return failureResult('invalid_request', false, { reason: 'request' });
    return this.policyGate.request({
      ...input,
      operation: EDITOR_TRANSACTION_OPERATION_ID,
      sessionId,
      runId,
    });
  }

  /** Clear all pending requests and grants; no context or project is changed. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingRequests.clear();
    this.pendingArtistModeRequests.clear();
    for (const session of this.sessions.values()) session.status = 'revoked';
    for (const run of this.artistRuns.values()) {
      run.pendingTurnAction = null;
      this.releaseArtistRun(run, 'revoked');
    }
    this.sessions.clear();
    if (this.visibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }
    this.visibilityListener = null;
  }

  private handleVisibilityChange(): void {
    this.isPageVisible();
  }

  private isPageVisible(): boolean {
    const visible = this.currentPageVisibility();
    if (!visible && this.wasPageVisible) this.backgroundAutomation();
    this.wasPageVisible = visible;
    return visible;
  }

  private currentPageVisibility(): boolean {
    if (this.isPageVisibleOverride) return this.isPageVisibleOverride();
    return typeof document === 'undefined' || document.visibilityState === 'visible';
  }

  private backgroundAutomation(): void {
    const hadPendingRequests = this.pendingRequests.size > 0;
    const hadSessions = this.sessions.size > 0;
    this.pendingRequests.clear();
    this.pendingArtistModeRequests.clear();
    for (const session of this.sessions.values()) session.status = 'backgrounded';
    for (const run of this.artistRuns.values()) this.releaseArtistRun(run, 'backgrounded');
    if (hadPendingRequests || hadSessions) {
      this.events.dispatchEvent(new CustomEvent('automation-session-backgrounded'));
    }
  }

  // fallow-ignore-next-line code-duplication -- Manager controls repeat the gate's lifecycle checks at local UI boundaries.
  private validateManagerSession(session: InternalSessionGrant | undefined): SessionFailure | undefined {
    if (this.disposed) return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    if (!this.isPageVisible()) return failureResult('capability_denied', true, { reason: 'page_hidden' });
    if (!session) return sessionFailureResult('session_missing');
    if (session.status === 'revoked') return sessionFailureResult('session_revoked');
    if (session.status === 'backgrounded') return sessionFailureResult('session_backgrounded');
    if (session.status === 'expired' || this.clock() >= session.expiresAt) {
      session.status = 'expired';
      this.releaseArtistRunsForSession(session.sessionId, 'expired');
      return sessionFailureResult('session_expired');
    }
    return undefined;
  }

  private releaseArtistRunsForSession(sessionId: string, status: ArtistModeRunStatus): void {
    for (const run of this.artistRuns.values()) {
      if (run.sessionId === sessionId) this.releaseArtistRun(run, status);
    }
  }

  private artistTurnOwner(run: InternalArtistModeRun): ProjectWriteTurnOwner {
    return {
      kind: 'artist-mode',
      sessionId: run.sessionId,
      runId: run.runId,
    };
  }

  private releaseArtistRun(run: InternalArtistModeRun, status?: ArtistModeRunStatus): void {
    if (status) {
      run.status = status;
      if (status !== 'budget-exhausted') run.pendingEscalation = null;
    }
    if (run.inFlight) {
      if (run.pendingTurnAction?.kind !== 'manual') {
        run.pendingTurnAction = {
          kind: 'release',
          status: status ?? run.status,
        };
      }
      return;
    }
    this.writeTurns.release(run.targetId, this.artistTurnOwner(run));
  }

  // fallow-ignore-next-line complexity -- Local lifecycle controls repeat the exact session, target, and expiry guard.
  private validateArtistLifecycle(
    sessionId: string,
    run: InternalArtistModeRun,
  ): SessionFailure | undefined {
    if (this.disposed) return failureResult('capability_denied', false, { reason: 'manager_disposed' });
    if (!this.isPageVisible()) return failureResult('capability_denied', true, { reason: 'page_hidden' });
    const session = this.sessions.get(sessionId);
    const sessionFailure = this.validateManagerSession(session);
    if (sessionFailure) return sessionFailure;
    if (!session) return sessionFailureResult('session_missing');
    if (run.sessionId !== session.sessionId || run.targetId !== session.targetId) {
      return failureResult('target_not_found', true, { reason: 'target_binding' });
    }
    if (run.context !== session.context || run.context.isDisposed) {
      this.releaseArtistRun(run, 'expired');
      return failureResult('target_not_found', true, { reason: 'target_binding' });
    }
    if ((run.status === 'running' || run.status === 'paused') && this.clock() >= run.expiresAt) {
      this.releaseArtistRun(run, 'expired');
      return failureResult('capability_denied', false, { reason: 'run_expired' });
    }
    return undefined;
  }

  private completeArtistTransaction(run: InternalArtistModeRun, operationId: string): void {
    run.operationIds.add(operationId);
    run.transactionsUsed += 1;
    if (run.transactionsUsed >= run.transactionLimit && run.status === 'running') {
      run.status = 'budget-exhausted';
    }
    this.events.dispatchEvent(new CustomEvent('automation-artist-mode-progress', {
      detail: cloneTransport(this.publicArtistModeGrant(run)),
    }));
  }

  private findArtistRun(sessionId: string, runId: string): InternalArtistModeRun | undefined {
    const run = this.artistRuns.get(runId);
    return run?.sessionId === sessionId ? run : undefined;
  }

  private createRequestId(): string | null {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const value = this.requestIdFactory();
      if (
        typeof value === 'string' &&
        value.length > 0 &&
        !this.pendingRequests.has(value) &&
        !this.pendingArtistModeRequests.has(value)
      ) {
        return value;
      }
    }
    return null;
  }

  private readTargets(): readonly AutomationLocalTarget[] {
    try {
      return this.targetSource().filter(
        (target) =>
          typeof target.id === 'string' &&
          target.id.length > 0 &&
          typeof target.name === 'string' &&
          target.context instanceof Object
      );
    } catch {
      return [];
    }
  }

  private findTarget(targetId: string): AutomationLocalTarget | undefined {
    return this.readTargets().find((target) => target.id === targetId);
  }

  private publicPendingRequest(pending: InternalPendingRequest): AutomationSessionRequestStatus {
    return cloneTransport({
      type: 'automation.session.requested' as const,
      requestId: pending.requestId,
      client: pending.client,
      compatibility: pending.compatibility,
      observationClasses: pending.observationClasses,
      lifetimeSeconds: pending.lifetimeSeconds,
    });
  }

  private publicArtistModeRequest(
    pending: InternalPendingArtistModeRequest,
  ): ArtistModeRequestStatus {
    return cloneTransport({
      type: 'automation.artist-mode.requested' as const,
      requestId: pending.requestId,
      sessionId: pending.sessionId,
      client: pending.client,
      runId: pending.runId,
      ...(pending.runIntent === undefined ? {} : { runIntent: pending.runIntent }),
      requestedWriteCategories: pending.requestedWriteCategories,
      requestedTransactionLimit: pending.requestedTransactionLimit,
      requestedDurationSeconds: pending.requestedDurationSeconds,
      remainingSessionSeconds: this.remainingSessionSeconds(pending.sessionId),
    });
  }

  private remainingSessionSeconds(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;
    return Math.max(0, Math.ceil((session.expiresAt - this.clock()) / 1000));
  }

  private publicArtistModeGrant(run: InternalArtistModeRun): ArtistModeGrant {
    return cloneTransport({
      type: 'automation.artist-mode.granted' as const,
      sessionId: run.sessionId,
      runId: run.runId,
      client: run.client,
      categories: run.categories,
      transactionLimit: run.transactionLimit,
      childCommandLimit: ARTIST_MODE_MAX_CHILD_COMMANDS as typeof ARTIST_MODE_MAX_CHILD_COMMANDS,
      transactionsUsed: run.transactionsUsed,
      remainingTransactions: Math.max(0, run.transactionLimit - run.transactionsUsed),
      expiresAt: run.expiresAt,
      status: run.status,
      catalogVersion: CURRENT_CATALOG_VERSION,
      operationIds: [EDITOR_TRANSACTION_OPERATION_ID] as const,
      profiles: profilesForCategories(run.categories),
    });
  }

  private publicLocalArtistRun(run: InternalArtistModeRun): AutomationLocalArtistModeRun {
    return {
      sessionId: run.sessionId,
      runId: run.runId,
      client: run.client,
      targetId: run.targetId,
      targetName: run.targetName,
      ...(run.intent === undefined ? {} : { intent: run.intent }),
      categories: run.categories,
      transactionLimit: run.transactionLimit,
      transactionsUsed: run.transactionsUsed,
      remainingTransactions: Math.max(0, run.transactionLimit - run.transactionsUsed),
      expiresAt: run.expiresAt,
      status: run.status,
      pendingEscalation: run.pendingEscalation !== null,
    };
  }

  private publicGrant(session: InternalSessionGrant): AutomationSessionGrant {
    return cloneTransport({
      type: 'automation.session.granted' as const,
      sessionId: session.sessionId,
      client: session.client,
      observationClasses: session.observationClasses,
      limits: AUTOMATION_SESSION_LIMITS,
      expiresAt: session.expiresAt,
      catalogVersion: CURRENT_CATALOG_VERSION,
      catalog: structuredClone(editorCatalog),
    });
  }

  private createUniqueId(
    factory: () => string,
    existing: ReadonlyMap<string, unknown>
  ): string | null {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const value = factory();
      if (typeof value === 'string' && value.length > 0 && !existing.has(value)) return value;
    }
    return null;
  }
}

/** The app's browser-owned controller surface. */
export const automationSessionController = new AutomationSessionManager();

function defaultLocalTargetSource(): readonly AutomationLocalTarget[] {
  return workspaceStore.items.value.map((item) => ({
    id: item.context.project.id.value,
    name: item.context.project.name.value,
    context: item.context,
    workspaceItemId: item.id,
  }));
}

function samePendingRequest(
  pending: InternalPendingRequest,
  request: AutomationSessionRequestInput
): boolean {
  return (
    pending.client.name === request.client.name &&
    pending.client.identity === request.client.identity &&
    pending.compatibility.minVersion === request.compatibility.minVersion &&
    pending.compatibility.maxVersion === request.compatibility.maxVersion &&
    pending.lifetimeSeconds === request.lifetimeSeconds &&
    pending.observationClasses.length === request.observationClasses.length &&
    pending.observationClasses.every(
      (observationClass, index) => observationClass === request.observationClasses[index]
    )
  );
}

interface NormalizedArtistModeRequest {
  readonly sessionId: string;
  readonly runId?: string;
  readonly runIntent?: string;
  readonly requestedWriteCategories: readonly ArtistModeCategory[];
  readonly requestedTransactionLimit: number;
  readonly requestedDurationSeconds: number;
}

interface NormalizedEscalationRequest {
  readonly sessionId: string;
  readonly runId: string;
  readonly blockedAction: string;
  readonly blockedOperationId: string;
  readonly additionalTransactions: number;
}

// fallow-ignore-next-line complexity -- The strict Artist Mode request schema keeps all authority bounds at the browser boundary.
function normalizeArtistModeRequest(input: unknown): NormalizedArtistModeRequest {
  const value = cloneRequest(input);
  if (!isRecord(value)) throw sessionError('invalid_request', false, { reason: 'request' });
  assertExactKeys(
    value,
    [
      'operation',
      'sessionId',
      'runId',
      'runIntent',
      'requestedWriteCategories',
      'requestedTransactionLimit',
      'requestedDurationSeconds',
      'catalogVersion',
      'contractVersion',
    ],
    'artist_mode_request',
  );
  if (
    value.operation !== undefined &&
    value.operation !== ARTIST_MODE_OPERATION_ID &&
    value.operation !== 'automation.artist-mode.request'
  ) {
    throw sessionError('invalid_request', false, { reason: 'operation' });
  }
  if (value.catalogVersion !== undefined && value.catalogVersion !== CURRENT_CATALOG_VERSION) {
    throw sessionError('unsupported', false, { reason: 'catalog_compatibility' });
  }
  if (value.contractVersion !== undefined && value.contractVersion !== AUTOMATION_SESSION_CONTRACT_VERSION) {
    throw sessionError('unsupported', false, { reason: 'contract_compatibility' });
  }
  const sessionId = normalizeBoundedIdentity(value.sessionId, 'session');
  const runId = value.runId === undefined
    ? undefined
    : normalizeBoundedIdentity(value.runId, 'run_id', ARTIST_MODE_MAX_RUN_ID_LENGTH);
  const runIntent = value.runIntent === undefined
    ? undefined
    : normalizeRunIntent(value.runIntent);
  if (runId === undefined && runIntent === undefined) {
    throw sessionError('invalid_request', false, { reason: 'run_identity' });
  }
  return {
    sessionId,
    ...(runId === undefined ? {} : { runId }),
    ...(runIntent === undefined ? {} : { runIntent }),
    requestedWriteCategories: normalizeRequestedArtistCategories(value.requestedWriteCategories),
    requestedTransactionLimit: normalizeArtistTransactionLimit(value.requestedTransactionLimit, ARTIST_MODE_MAX_TRANSACTIONS),
    requestedDurationSeconds: normalizeDuration(value.requestedDurationSeconds),
  };
}

// fallow-ignore-next-line code-duplication -- Escalation compatibility checks mirror the primary Artist Mode request contract.
function normalizeEscalationRequest(input: unknown): NormalizedEscalationRequest {
  const value = cloneRequest(input);
  if (!isRecord(value)) throw sessionError('invalid_request', false, { reason: 'request' });
  assertExactKeys(value, [
    'operation',
    'sessionId',
    'runId',
    'blockedAction',
    'blockedOperationId',
    'additionalTransactions',
    'catalogVersion',
    'contractVersion',
  ], 'escalation_request');
  if (value.operation !== undefined && value.operation !== `${ARTIST_MODE_OPERATION_ID}.escalate`) {
    throw sessionError('invalid_request', false, { reason: 'operation' });
  }
  if (value.catalogVersion !== undefined && value.catalogVersion !== CURRENT_CATALOG_VERSION) {
    throw sessionError('unsupported', false, { reason: 'catalog_compatibility' });
  }
  if (value.contractVersion !== undefined && value.contractVersion !== AUTOMATION_SESSION_CONTRACT_VERSION) {
    throw sessionError('unsupported', false, { reason: 'contract_compatibility' });
  }
  const blockedAction = normalizeBoundedIdentity(value.blockedAction, 'blocked_action');
  if (blockedAction !== EDITOR_TRANSACTION_OPERATION_ID) {
    throw sessionError('unsupported', false, { reason: 'blocked_action' });
  }
  const blockedOperationId = normalizeBoundedIdentity(
    value.blockedOperationId,
    'blocked_operation_id',
    ARTIST_MODE_MAX_OPERATION_ID_LENGTH,
  );
  const additionalTransactions = normalizeAdditionalTransactions(value.additionalTransactions);
  return {
    sessionId: normalizeBoundedIdentity(value.sessionId, 'session'),
    runId: normalizeBoundedIdentity(value.runId, 'run_id', ARTIST_MODE_MAX_RUN_ID_LENGTH),
    blockedAction,
    blockedOperationId,
    additionalTransactions,
  };
}

function normalizeRequestedArtistCategories(value: unknown): readonly ArtistModeCategory[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > ARTIST_MODE_CATEGORIES.length) {
    throw sessionError('invalid_request', false, { reason: 'write_categories' });
  }
  const result: ArtistModeCategory[] = [];
  for (const item of value) {
    if (!isArtistModeCategory(item)) throw sessionError('unsupported', false, { reason: 'write_category' });
    if (result.includes(item)) throw sessionError('invalid_request', false, { reason: 'write_category_duplicate' });
    result.push(item);
  }
  return result;
}

function normalizeGrantedArtistCategories(
  value: unknown,
  requested: readonly ArtistModeCategory[],
): readonly ArtistModeCategory[] {
  const categories = normalizeRequestedArtistCategories(value);
  if (categories.some((category) => !requested.includes(category))) {
    throw sessionError('capability_denied', false, { reason: 'write_category_not_requested' });
  }
  return categories;
}

function normalizeArtistTransactionLimit(value: unknown, requestedLimit: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw sessionError('bounds_exceeded', false, { reason: 'transaction_limit', min: 1 });
  }
  const limit = value as number;
  if (limit > requestedLimit || limit > ARTIST_MODE_MAX_TRANSACTIONS) {
    throw sessionError('bounds_exceeded', false, {
      reason: 'transaction_limit',
      max: Math.min(requestedLimit, ARTIST_MODE_MAX_TRANSACTIONS),
    });
  }
  return limit;
}

function normalizeAdditionalTransactions(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > ARTIST_MODE_MAX_TRANSACTIONS) {
    throw sessionError('bounds_exceeded', false, {
      reason: 'additional_transactions',
      min: 1,
      max: ARTIST_MODE_MAX_TRANSACTIONS,
    });
  }
  return value as number;
}

function normalizeDuration(value: unknown): number {
  return normalizeLifetime(value);
}

function normalizeRunIntent(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw sessionError('invalid_request', false, { reason: 'run_intent' });
  }
  if (value.length > ARTIST_MODE_MAX_INTENT_LENGTH) {
    throw sessionError('limit_exceeded', false, { reason: 'run_intent', max: ARTIST_MODE_MAX_INTENT_LENGTH });
  }
  return value.trim();
}

function normalizeBoundedIdentity(value: unknown, reason: string, max = ARTIST_MODE_MAX_RUN_ID_LENGTH): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw sessionError('invalid_request', false, { reason });
  }
  if (value.length > max) throw sessionError('limit_exceeded', false, { reason, max });
  return value;
}

function isArtistModeCategory(value: unknown): value is ArtistModeCategory {
  return typeof value === 'string' && (ARTIST_MODE_CATEGORIES as readonly string[]).includes(value);
}

// fallow-ignore-next-line complexity -- The strict session schema keeps every public bound before queuing.
function normalizeSessionRequest(input: unknown): AutomationSessionRequestInput {
  const value = cloneRequest(input);
  if (!isRecord(value)) throw sessionError('invalid_request', false, { reason: 'request' });
  assertExactKeys(
    value,
    [
      'operation',
      'client',
      'compatibility',
      'observationClasses',
      'requestedObservationClasses',
      'lifetimeSeconds',
      'requestedLifetimeSeconds',
    ],
    'request'
  );

  if (
    value.operation !== undefined &&
    value.operation !== 'automation.session.request' &&
    value.operation !== AUTOMATION_SESSION_OPERATION_ID
  ) {
    throw sessionError('invalid_request', false, { reason: 'operation' });
  }

  const client = normalizeClient(value.client);
  const compatibility = normalizeCompatibility(value.compatibility);
  const classesValue = value.observationClasses ?? value.requestedObservationClasses;
  if (value.observationClasses !== undefined && value.requestedObservationClasses !== undefined) {
    throw sessionError('invalid_request', false, { reason: 'observation_classes' });
  }
  const observationClasses = normalizeRequestedClasses(classesValue);
  const lifetimeValue = value.lifetimeSeconds ?? value.requestedLifetimeSeconds;
  if (value.lifetimeSeconds !== undefined && value.requestedLifetimeSeconds !== undefined) {
    throw sessionError('invalid_request', false, { reason: 'lifetime' });
  }
  const lifetimeSeconds = normalizeLifetime(lifetimeValue);
  return { client, compatibility, observationClasses, lifetimeSeconds };
}

function normalizeClient(value: unknown): AutomationSessionClient {
  if (!isRecord(value)) throw sessionError('invalid_request', false, { reason: 'client' });
  assertExactKeys(value, ['name', 'identity'], 'client');
  if (value.identity !== 'self-declared') {
    throw sessionError('invalid_request', false, { reason: 'identity' });
  }
  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    throw sessionError('invalid_request', false, { reason: 'client_name' });
  }
  const name = value.name.trim();
  if (name.length > AUTOMATION_SESSION_MAX_CLIENT_NAME_LENGTH) {
    throw sessionError('limit_exceeded', false, {
      reason: 'client_name',
      max: AUTOMATION_SESSION_MAX_CLIENT_NAME_LENGTH,
    });
  }
  return { name, identity: 'self-declared' };
}

function normalizeCompatibility(value: unknown): AutomationSessionRequestInput['compatibility'] {
  if (!isRecord(value)) throw sessionError('invalid_request', false, { reason: 'compatibility' });
  assertExactKeys(value, ['minVersion', 'maxVersion'], 'compatibility');
  if (typeof value.minVersion !== 'string' || typeof value.maxVersion !== 'string') {
    throw sessionError('invalid_request', false, { reason: 'compatibility_version' });
  }
  if (!parseVersion(value.minVersion) || !parseVersion(value.maxVersion)) {
    throw sessionError('invalid_request', false, { reason: 'compatibility_version' });
  }
  return { minVersion: value.minVersion, maxVersion: value.maxVersion };
}

function assertCompatibleRange(range: AutomationSessionRequestInput['compatibility']): void {
  const min = parseVersion(range.minVersion);
  const max = parseVersion(range.maxVersion);
  const current = parseVersion(CURRENT_CATALOG_VERSION);
  if (!min || !max || !current)
    throw sessionError('invalid_request', false, { reason: 'compatibility_version' });
  if (compareVersion(min, max) > 0) {
    throw sessionError('invalid_request', false, { reason: 'compatibility_range' });
  }
  if (
    current.major !== min.major ||
    current.major !== max.major ||
    compareVersion(current, min) < 0 ||
    compareVersion(current, max) > 0
  ) {
    throw sessionError('unsupported', false, { reason: 'catalog_compatibility' });
  }
}

function normalizeRequestedClasses(value: unknown): readonly InspectObservationClass[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > INSPECT_OBSERVATION_CLASSES.length
  ) {
    throw sessionError('invalid_request', false, { reason: 'observation_classes' });
  }
  const result: InspectObservationClass[] = [];
  for (const entry of value) {
    if (!isInspectObservationClass(entry)) {
      throw sessionError('unsupported', false, { reason: 'observation_class' });
    }
    if (result.includes(entry)) {
      throw sessionError('invalid_request', false, { reason: 'observation_duplicate' });
    }
    result.push(entry);
  }
  return result;
}

function normalizeGrantedClasses(
  value: unknown,
  requested: readonly InspectObservationClass[]
): readonly InspectObservationClass[] {
  const granted = normalizeRequestedClasses(value);
  if (granted.some((item) => !requested.includes(item))) {
    throw sessionError('capability_denied', false, { reason: 'observation_not_requested' });
  }
  return granted;
}

function normalizeLifetime(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < AUTOMATION_SESSION_MIN_LIFETIME_SECONDS ||
    (value as number) > AUTOMATION_SESSION_MAX_LIFETIME_SECONDS
  ) {
    throw sessionError('bounds_exceeded', false, {
      reason: 'lifetime',
      min: AUTOMATION_SESSION_MIN_LIFETIME_SECONDS,
      max: AUTOMATION_SESSION_MAX_LIFETIME_SECONDS,
    });
  }
  return value as number;
}

// fallow-ignore-next-line complexity -- The policy boundary validates identity, class, operation, revision, and payload together.
function normalizePolicyRequest(input: unknown): NormalizedPolicyRequest {
  const value = cloneRequest(input);
  if (!isRecord(value)) throw sessionError('invalid_request', false, { reason: 'request' });
  if (containsTargetKey(value))
    throw sessionError('invalid_request', false, { reason: 'target_forbidden' });
  if (containsProvenanceKey(value))
    throw sessionError('invalid_request', false, { reason: 'provenance_forbidden' });
  if (typeof value.sessionId !== 'string' || value.sessionId.length === 0) {
    throw sessionError('invalid_request', false, { reason: 'session' });
  }
  if (value.catalogVersion !== undefined) {
    if (value.catalogVersion !== CURRENT_CATALOG_VERSION) {
      throw sessionError('unsupported', false, { reason: 'catalog_compatibility' });
    }
  }
  if (
    value.contractVersion !== undefined &&
    value.contractVersion !== AUTOMATION_SESSION_CONTRACT_VERSION
  ) {
    throw sessionError('unsupported', false, { reason: 'contract_compatibility' });
  }
  const operation = normalizePolicyOperation(value.operation);
  if (operation === EDITOR_TRANSACTION_OPERATION_ID) {
    return normalizeTransactionPolicyRequest(value);
  }
  const classValue = value.observationClass ?? value.contentClass;
  if (value.observationClass !== undefined && value.contentClass !== undefined) {
    throw sessionError('invalid_request', false, { reason: 'observation_class' });
  }
  if (!isInspectObservationClass(classValue)) {
    throw sessionError('invalid_request', false, { reason: 'observation_class' });
  }
  const operationClass = observationClassForOperation(operation);
  if (operationClass && operationClass !== classValue) {
    throw sessionError('invalid_request', false, { reason: 'operation_class' });
  }
  if (
    operation === 'project.observe' &&
    classValue !== 'structure' &&
    classValue !== 'palette' &&
    classValue !== 'timeline' &&
    classValue !== 'save-state'
  ) {
    throw sessionError('invalid_request', false, { reason: 'operation_class' });
  }
  if (value.expectedRevision !== undefined && value.revision !== undefined) {
    throw sessionError('invalid_request', false, { reason: 'expected_revision' });
  }
  const expectedRevision =
    value.expectedRevision === undefined && value.revision === undefined
      ? undefined
      : normalizeRevision(value.expectedRevision ?? value.revision);
  const payload = { ...value };
  delete payload.sessionId;
  delete payload.operation;
  delete payload.observationClass;
  delete payload.contentClass;
  delete payload.catalogVersion;
  delete payload.contractVersion;
  delete payload.expectedRevision;
  delete payload.revision;
  validatePolicyPayload(operation, payload);
  return {
    sessionId: value.sessionId,
    operation,
    observationClass: classValue,
    expectedRevision,
    payload,
  };
}

function normalizeTransactionPolicyRequest(
  value: Record<string, unknown>,
): NormalizedTransactionPolicyRequest {
  assertExactKeys(value, [
    'operation',
    'sessionId',
    'runId',
    'operationId',
    'profile',
    'expectedRevision',
    'children',
    'catalogVersion',
    'contractVersion',
  ], 'transaction_request');
  const runId = normalizeBoundedIdentity(value.runId, 'run_id', ARTIST_MODE_MAX_RUN_ID_LENGTH);
  const operationId = normalizeBoundedIdentity(
    value.operationId,
    'operation_id',
    ARTIST_MODE_MAX_OPERATION_ID_LENGTH,
  );
  const profile = normalizeTransactionProfile(value.profile);
  const expectedRevision = normalizeRevision(value.expectedRevision);
  const children = normalizeTransactionChildren(value.children, profile);
  return {
    sessionId: normalizeBoundedIdentity(value.sessionId, 'session'),
    operation: EDITOR_TRANSACTION_OPERATION_ID,
    runId,
    operationId,
    profile,
    expectedRevision,
    children,
  };
}

function normalizeTransactionProfile(value: unknown): EditorTransactionProfile {
  if (
    value === 'layer-and-tag' ||
    value === 'static-structure' ||
    value === 'structure-refinement' ||
    value === 'animation' ||
    value === 'raster-patch'
  ) return value;
  throw sessionError('unsupported', false, { reason: 'profile' });
}

function normalizeTransactionChildren(
  value: unknown,
  profile: EditorTransactionProfile,
): readonly EditorTransactionChildInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > ARTIST_MODE_MAX_CHILD_COMMANDS) {
    throw sessionError('limit_exceeded', false, { reason: 'transaction_children', max: ARTIST_MODE_MAX_CHILD_COMMANDS });
  }
  const children = value.map((child) => {
    if (!isRecord(child)) throw sessionError('invalid_request', false, { reason: 'child' });
    assertExactKeys(child, ['command', 'input'], 'child');
    if (typeof child.command !== 'string' || !isRecord(child.input)) {
      throw sessionError('invalid_request', false, { reason: 'child' });
    }
    if (containsTargetKey(child.input)) {
      throw sessionError('invalid_request', false, { reason: 'target_forbidden' });
    }
    if (containsProvenanceKey(child.input)) {
      throw sessionError('invalid_request', false, { reason: 'provenance_forbidden' });
    }
    return {
      command: child.command as EditorTransactionChildInput['command'],
      input: structuredClone(child.input),
    };
  });
  validateTransactionChildCommands(profile, children);
  return children;
}

// fallow-ignore-next-line complexity -- Profile-family validation rejects unsupported mutation shapes before adapter dispatch.
function validateTransactionChildCommands(
  profile: EditorTransactionProfile,
  children: readonly EditorTransactionChildInput[],
): void {
  const commandIds = new Set<string>(children.map((child) => child.command));
  const knownCommandIds = new Set([
    LAYER_STATE_COMMAND_ID,
    FRAME_TAG_COMMAND_ID,
    STATIC_PALETTE_COMMAND_ID,
    STATIC_LAYER_TREE_COMMAND_ID,
    ANIMATION_FRAME_COMMAND_ID,
    ANIMATION_CEL_LINK_COMMAND_ID,
    CEL_UNLINK_COMMAND_ID,
    STRUCTURE_REFINEMENT_COMMAND_ID,
    RASTER_PATCH_COMMAND_ID,
  ]);
  if ([...commandIds].some((command) => !knownCommandIds.has(command))) {
    throw sessionError('unsupported', false, { reason: 'child_command' });
  }
  const expectedCount = profile === 'layer-and-tag' || profile === 'static-structure' ? 2 : 1;
  if (children.length !== expectedCount) {
    throw sessionError('invalid_request', false, { reason: 'children_count' });
  }
  const expectedCommands = profile === 'layer-and-tag'
    ? [LAYER_STATE_COMMAND_ID, FRAME_TAG_COMMAND_ID]
    : profile === 'static-structure'
      ? [STATIC_PALETTE_COMMAND_ID, STATIC_LAYER_TREE_COMMAND_ID]
      : profile === 'structure-refinement'
        ? [STRUCTURE_REFINEMENT_COMMAND_ID]
        : profile === 'raster-patch'
          ? [RASTER_PATCH_COMMAND_ID]
          : [ANIMATION_FRAME_COMMAND_ID, ANIMATION_CEL_LINK_COMMAND_ID, CEL_UNLINK_COMMAND_ID, FRAME_TAG_COMMAND_ID];
  if (expectedCount === 1) {
    if (!expectedCommands.includes(children[0]?.command)) {
      throw sessionError('invalid_request', false, { reason: 'child_family' });
    }
    return;
  }
  if (expectedCommands.some((command) => !commandIds.has(command))) {
    throw sessionError('invalid_request', false, { reason: 'child_family' });
  }
}

const POLICY_OPERATION_ALIASES: Readonly<Record<string, ObservationPolicyOperation | typeof EDITOR_TRANSACTION_OPERATION_ID>> = {
  structure: 'project.observe',
  palette: 'project.observe',
  timeline: 'project.observe',
  'save-state': 'project.observe',
  'project.save-safety': 'project.save-safety',
  raster: 'project.raster.observe',
  render: 'project.render.observe',
  'project.observe': 'project.observe',
  'project.raster.observe': 'project.raster.observe',
  'project.render.observe': 'project.render.observe',
  'project.animation.observe': 'project.animation.observe',
  [EDITOR_TRANSACTION_OPERATION_ID]: EDITOR_TRANSACTION_OPERATION_ID,
};

// fallow-ignore-next-line complexity -- Operation aliases and write rejection form one inspect-only dispatch gate.
function normalizePolicyOperation(
  value: unknown,
): ObservationPolicyOperation | typeof EDITOR_TRANSACTION_OPERATION_ID {
  if (typeof value !== 'string') throw sessionError('unsupported', false, { reason: 'operation' });
  const operation = POLICY_OPERATION_ALIASES[value];
  if (operation) return operation;
  if (value.startsWith('project.')) {
    throw sessionError('capability_denied', false, { reason: 'inspect_only' });
  }
  throw sessionError('unsupported', false, { reason: 'operation' });
}

function operationForObservationClass(observationClass: InspectObservationClass): ObservationPolicyOperation {
  switch (observationClass) {
    case 'raster':
      return 'project.raster.observe';
    case 'render':
      return 'project.render.observe';
    case 'timeline':
      return 'project.observe';
    case 'structure':
      return 'project.observe';
    case 'palette':
      return 'project.observe';
    case 'save-state':
      return 'project.observe';
    default:
      return 'project.observe';
  }
}

function profilesForCategories(categories: readonly ArtistModeCategory[]): readonly EditorTransactionProfile[] {
  const profiles: EditorTransactionProfile[] = [];
  if (categories.includes('structure')) profiles.push('structure-refinement');
  if (categories.includes('structure') && categories.includes('palette')) profiles.push('static-structure');
  if (categories.includes('structure') && categories.includes('timeline')) profiles.push('layer-and-tag');
  if (categories.includes('timeline')) profiles.push('animation');
  if (categories.includes('raster')) profiles.push('raster-patch');
  return profiles;
}

// fallow-ignore-next-line complexity -- Explicit category mapping preserves the existing transaction profile contract.
function categoriesForTransaction(
  profile: EditorTransactionProfile,
  children: readonly EditorTransactionChildInput[],
): readonly ArtistModeCategory[] {
  if (profile === 'structure-refinement') return ['structure'];
  if (profile === 'raster-patch') return ['raster'];
  if (profile === 'static-structure') {
    const categories: ArtistModeCategory[] = [];
    for (const child of children) {
      if (child.command === 'project.palette.declaration') categories.push('palette');
      if (child.command === 'project.layer.tree') categories.push('structure');
    }
    return [...new Set(categories)];
  }
  if (profile === 'animation') return ['timeline'];

  const categories: ArtistModeCategory[] = [];
  for (const child of children) {
    if (child.command === 'project.layer.state') categories.push('structure');
    if (child.command === 'project.animation.frame-tag') categories.push('timeline');
  }
  return [...new Set(categories)];
}

function observationClassForOperation(
  operation: ObservationPolicyOperation
): InspectObservationClass | undefined {
  switch (operation) {
    case 'project.raster.observe':
      return 'raster';
    case 'project.render.observe':
      return 'render';
    case 'project.animation.observe':
      return 'timeline';
    case 'project.save-safety':
      return 'save-state';
    default:
      return undefined;
  }
}

function createAdapterInput(
  request: NormalizedObservationPolicyRequest,
  target: ProjectTarget,
  expectedRevision: number
): Record<string, unknown> {
  return {
    operation: request.operation,
    target,
    expectedRevision,
    ...request.payload,
  };
}

// fallow-ignore-next-line complexity -- Each observation shape has explicit bounded fields before adapter execution.
function validatePolicyPayload(
  operation: ObservationPolicyOperation,
  payload: Readonly<Record<string, unknown>>
): void {
  const allowed =
    operation === 'project.observe' || operation === 'project.save-safety'
      ? ['']
      : operation === 'project.raster.observe'
        ? ['source', 'region']
        : operation === 'project.render.observe'
          ? ['frameId', 'source', 'region', 'background', 'scale', 'expectedDigest']
          : ['range', 'background', 'scale', 'keyframes', 'expectedDigest'];
  if (!hasOnlyKeys(payload, allowed))
    throw sessionError('invalid_request', false, { reason: 'request_fields' });

  if (operation === 'project.raster.observe') {
    validateRegion(
      payload.region,
      {
        maxWidth: AUTOMATION_SESSION_LIMITS.raster.region.maxWidth,
        maxHeight: AUTOMATION_SESSION_LIMITS.raster.region.maxHeight,
        maxPixels: AUTOMATION_SESSION_LIMITS.raster.region.maxCells,
      },
      'raster_region'
    );
    validateSource(payload.source, 'raster_source');
  }
  if (operation === 'project.render.observe') {
    if (
      payload.scale !== undefined &&
      (!Number.isSafeInteger(payload.scale) ||
        (payload.scale as number) < RENDER_OBSERVATION_MIN_SCALE ||
        (payload.scale as number) > RENDER_OBSERVATION_MAX_SCALE)
    ) {
      throw sessionError('bounds_exceeded', false, {
        reason: 'scale',
        min: RENDER_OBSERVATION_MIN_SCALE,
        max: RENDER_OBSERVATION_MAX_SCALE,
      });
    }
    if (payload.region !== undefined) {
      validateRegion(payload.region, AUTOMATION_SESSION_LIMITS.render.region, 'render_region');
    }
    if (payload.source !== undefined) validateSource(payload.source, 'render_source');
    if (payload.frameId !== undefined) validateIdentity(payload.frameId, 'frame_id');
    validateDigest(payload.expectedDigest);
  }
  if (operation === 'project.animation.observe') {
    if (payload.keyframes !== undefined) {
      if (
        !Array.isArray(payload.keyframes) ||
        payload.keyframes.length < 1 ||
        payload.keyframes.length > ANIMATION_OBSERVATION_MAX_KEYFRAMES
      ) {
        throw sessionError('bounds_exceeded', false, {
          reason: 'keyframes',
          max: ANIMATION_OBSERVATION_MAX_KEYFRAMES,
        });
      }
      for (const keyframe of payload.keyframes) validateIdentity(keyframe, 'keyframe');
    }
    validateIdentityFromRecord(payload.range, 'tagId', 'range');
    validateDigest(payload.expectedDigest);
  }
}

function validateRegion(
  value: unknown,
  limits: { readonly maxWidth: number; readonly maxHeight: number; readonly maxPixels: number },
  reason: string
): void {
  if (!isRecord(value)) throw sessionError('invalid_request', false, { reason });
  assertExactKeys(value, ['x', 'y', 'width', 'height'], reason);
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!Number.isSafeInteger(value[key])) throw sessionError('invalid_request', false, { reason });
  }
  const width = value.width as number;
  const height = value.height as number;
  if (
    width < 1 ||
    height < 1 ||
    width > limits.maxWidth ||
    height > limits.maxHeight ||
    width * height > limits.maxPixels
  ) {
    throw sessionError('bounds_exceeded', false, { reason, max: limits.maxPixels });
  }
}

function validateSource(value: unknown, reason: string): void {
  if (!isRecord(value)) throw sessionError('invalid_request', false, { reason });
  if (value.kind === 'composite') {
    assertExactKeys(value, ['kind', 'frameId'], reason);
    validateIdentity(value.frameId, 'frame_id');
    return;
  }
  if (value.kind === 'layer') {
    assertExactKeys(value, ['kind', 'layerId', 'frameId', 'celId'], reason);
    validateIdentity(value.layerId, 'layer_id');
    validateIdentity(value.frameId, 'frame_id');
    validateIdentity(value.celId, 'cel_id');
    return;
  }
  throw sessionError('invalid_request', false, { reason });
}

function validateIdentity(value: unknown, reason: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > PROJECT_OBSERVATION_LIMITS.maxStringLength
  ) {
    throw sessionError('limit_exceeded', false, {
      reason,
      max: PROJECT_OBSERVATION_LIMITS.maxStringLength,
    });
  }
}

function validateIdentityFromRecord(value: unknown, key: string, reason: string): void {
  if (value === undefined || value === 'all') return;
  if (!isRecord(value)) throw sessionError('invalid_request', false, { reason });
  assertExactKeys(value, [key], reason);
  validateIdentity(value[key], key);
}

function validateDigest(value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw sessionError('invalid_request', false, { reason: 'digest' });
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  reason: string
): void {
  if (!hasOnlyKeys(value, allowedKeys)) throw sessionError('invalid_request', false, { reason });
}

function filterObservation(observationClass: InspectObservationClass, value: unknown): unknown {
  if (observationClass === 'structure' && isProjectObservation(value)) {
    return {
      type: 'project.structure.observation',
      revision: value.revision,
      canvas: value.canvas,
      currentFrameId: value.currentFrameId,
      fps: value.fps,
      layers: value.layers,
      frames: value.frames,
      tags: value.tags,
      history: value.history,
      lastEvent: value.lastEvent,
    };
  }
  if (observationClass === 'palette' && isProjectObservation(value)) {
    return {
      type: 'project.palette.observation',
      revision: value.revision,
      palette: value.palette,
    };
  }
  if (observationClass === 'timeline' && isProjectObservation(value)) {
    return {
      type: 'project.timeline.observation',
      revision: value.revision,
      currentFrameId: value.currentFrameId,
      fps: value.fps,
      frames: value.frames.map((frame) => ({
        id: frame.id,
        order: frame.order,
        duration: frame.duration,
      })),
      tags: value.tags,
    };
  }
  if (observationClass === 'save-state' && isProjectObservation(value)) {
    return {
      type: 'project.save-state.observation',
      revision: value.revision,
      saveSafety: value.saveSafety,
    };
  }
  return value;
}

/** Remove the browser-local project binding from every client observation. */
function stripTargetIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripTargetIdentity(item));
  if (value === null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;

  const stripped: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'target') stripped[key] = stripTargetIdentity(child);
  }
  return stripped;
}

function isProjectObservation(value: unknown): value is ProjectObservation {
  return (
    isRecord(value) &&
    value.type === 'project.observation' &&
    isRecord(value.target) &&
    typeof value.revision === 'number' &&
    Array.isArray(value.layers) &&
    Array.isArray(value.frames) &&
    Array.isArray(value.tags) &&
    Array.isArray(value.palette)
  );
}

function validateTargetBinding(
  session: InternalSessionGrant,
  context: ProjectContext | undefined
): SessionFailure | undefined {
  if (!context || context !== session.context || context.isDisposed) {
    return failureResult('target_not_found', true, {
      reason: context?.isDisposed ? 'disposed' : 'target_rebound',
    });
  }
  if (context.project.id.value !== session.targetId) {
    return failureResult('target_not_found', true, { reason: 'target_rebound' });
  }
  return undefined;
}

function isInspectObservationClass(value: unknown): value is InspectObservationClass {
  return (
    typeof value === 'string' && (INSPECT_OBSERVATION_CLASSES as readonly string[]).includes(value)
  );
}

function normalizeRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw sessionError('invalid_request', false, { reason: 'expected_revision' });
  }
  return value as number;
}

function containsTargetKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsTargetKey);
  if (!isRecord(value)) return false;
  if (Object.prototype.hasOwnProperty.call(value, 'target')) return true;
  return Object.values(value).some(containsTargetKey);
}

function containsProvenanceKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProvenanceKey);
  if (!isRecord(value)) return false;
  if (Object.prototype.hasOwnProperty.call(value, 'provenance')) return true;
  return Object.values(value).some(containsProvenanceKey);
}

function cloneRequest(value: unknown): Record<string, unknown> {
  try {
    const clone = structuredClone(value);
    if (!isRecord(clone)) return clone as Record<string, unknown>;
    return clone;
  } catch {
    throw sessionError('invalid_request', false, { reason: 'request' });
  }
}

function cloneTransport<T>(value: T): T {
  const clone = structuredClone(value);
  freezeTransport(clone);
  return clone;
}

function freezeTransport(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeTransport(child);
}

function success<T>(result: T): SessionSuccess<T> {
  return cloneTransport({ ok: true as const, result });
}

function failureResult(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>
): SessionFailure {
  return cloneTransport({
    ok: false as const,
    error: { code, retryable, ...(details ? { details } : {}) },
  });
}

function sessionFailureResult(reason: string): SessionFailure {
  return failureResult('capability_denied', false, { reason });
}

function failureFromUnknown(error: unknown): SessionFailure {
  if (isRecord(error) && isRecord(error.editorError)) {
    const editorError = error.editorError;
    const code = isEditorErrorCode(editorError.code) ? editorError.code : 'internal';
    return failureResult(
      code,
      editorError.retryable === true,
      sanitizeDetails(editorError.details, code !== 'revision_conflict')
    );
  }
  return failureResult('internal', true, { reason: 'unexpected_failure' });
}

function sanitizeFailure(result: AutomationFailure): SessionFailure {
  return failureResult(
    result.error.code,
    result.error.retryable,
    sanitizeDetails(result.error.details, result.error.code !== 'revision_conflict')
  );
}

function sanitizeDetails(
  value: unknown,
  includeExpectedRevision = true
): Readonly<Record<string, string | number>> | undefined {
  if (!isRecord(value)) return undefined;
  const safe: Record<string, string | number> = {};
  const keys = includeExpectedRevision
    ? ['reason', 'min', 'max', 'expectedRevision', 'limitId']
    : ['reason', 'min', 'max', 'limitId'];
  for (const key of keys) {
    const item = value[key];
    if (typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item)))
      safe[key] = item;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

const EDITOR_ERROR_CODES: ReadonlySet<EditorError['code']> = new Set([
  'invalid_request',
  'capability_denied',
  'project_not_found',
  'target_not_found',
  'revision_conflict',
  'invalid_state',
  'bounds_exceeded',
  'limit_exceeded',
  'cancelled',
  'unsupported',
  'internal',
]);

function isEditorErrorCode(value: unknown): value is EditorError['code'] {
  return typeof value === 'string' && EDITOR_ERROR_CODES.has(value as EditorError['code']);
}

// fallow-ignore-next-line code-duplication -- Session compatibility parses the same stable major.minor shape as the adapter.
function parseVersion(value: string): { readonly major: number; readonly minor: number } | null {
  const match = /^(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return Number.isSafeInteger(major) && Number.isSafeInteger(minor) ? { major, minor } : null;
}

function compareVersion(
  first: { readonly major: number; readonly minor: number },
  second: { readonly major: number; readonly minor: number }
): number {
  return first.major - second.major || first.minor - second.minor;
}

function sessionError(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>
): Error & { readonly editorError: EditorError } {
  const error = new Error(code) as Error & { readonly editorError: EditorError };
  Object.defineProperty(error, 'editorError', {
    value: { code, retryable, ...(details ? { details } : {}) },
    enumerable: false,
  });
  return error;
}

function createOpaqueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
