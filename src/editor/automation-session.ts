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
  editorCatalog,
  PROJECT_OBSERVATION_LIMITS,
  RASTER_GRID_MAX_CELLS,
  RASTER_GRID_MAX_REGION_HEIGHT,
  RASTER_GRID_MAX_REGION_WIDTH,
  RENDER_OBSERVATION_MAX_BYTES,
  RENDER_OBSERVATION_MAX_PIXELS,
  RENDER_OBSERVATION_MAX_REGION_HEIGHT,
  RENDER_OBSERVATION_MAX_REGION_WIDTH,
  RENDER_OBSERVATION_MAX_SCALE,
  RENDER_OBSERVATION_MIN_SCALE,
} from './catalog';
import type { ProjectObservation } from './observations';
import { hasOnlyKeys, isRecord, type EditorError, type ProjectTarget } from './contracts';

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
  readonly clock?: () => number;
  readonly isPageVisible?: () => boolean;
  readonly requestIdFactory?: () => string;
  readonly sessionIdFactory?: () => string;
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

interface NormalizedPolicyRequest {
  readonly sessionId: string;
  readonly operation: PolicyOperation;
  readonly observationClass: InspectObservationClass;
  readonly expectedRevision?: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

type PolicyOperation =
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
  authority: 'inspect-only',
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
  private readonly getSession: (sessionId: string) => InternalSessionGrant | undefined;
  private readonly resolveTarget: (session: InternalSessionGrant) => ProjectContext | undefined;
  private readonly isManagerDisposed: () => boolean;
  private readonly isPageVisible: () => boolean;
  private readonly clock: () => number;
  private readonly expireSession: (session: InternalSessionGrant) => void;

  constructor(options: {
    readonly adapter: AutomationAdapter;
    readonly getSession: (sessionId: string) => InternalSessionGrant | undefined;
    readonly resolveTarget: (session: InternalSessionGrant) => ProjectContext | undefined;
    readonly isManagerDisposed: () => boolean;
    readonly isPageVisible: () => boolean;
    readonly clock: () => number;
    readonly expireSession: (session: InternalSessionGrant) => void;
  }) {
    this.adapter = options.adapter;
    this.getSession = options.getSession;
    this.resolveTarget = options.resolveTarget;
    this.isManagerDisposed = options.isManagerDisposed;
    this.isPageVisible = options.isPageVisible;
    this.clock = options.clock;
    this.expireSession = options.expireSession;
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
    request: NormalizedPolicyRequest,
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
  private readonly pendingRequests = new Map<string, InternalPendingRequest>();
  private readonly sessions = new Map<string, InternalSessionGrant>();
  private disposed = false;
  private visibilityListener: (() => void) | null = null;
  private wasPageVisible = true;

  constructor(options: AutomationSessionManagerOptions = {}) {
    this.targetSource = options.targets ?? defaultLocalTargetSource;
    this.clock = options.clock ?? (() => Date.now());
    this.isPageVisibleOverride = options.isPageVisible;
    this.requestIdFactory = options.requestIdFactory ?? createOpaqueId;
    this.sessionIdFactory = options.sessionIdFactory ?? createOpaqueId;

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
      getSession: (sessionId) => this.sessions.get(sessionId),
      resolveTarget: (session) => this.findTarget(session.targetId)?.context,
      isManagerDisposed: () => this.disposed,
      isPageVisible: () => this.isPageVisible(),
      clock: this.clock,
      expireSession: (session) => {
        session.status = 'expired';
      },
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

  /** Clear all pending requests and grants; no context or project is changed. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingRequests.clear();
    for (const session of this.sessions.values()) session.status = 'revoked';
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
    for (const session of this.sessions.values()) session.status = 'backgrounded';
    if (hadPendingRequests || hadSessions) {
      this.events.dispatchEvent(new CustomEvent('automation-session-backgrounded'));
    }
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

const POLICY_OPERATION_ALIASES: Readonly<Record<string, PolicyOperation>> = {
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
};

// fallow-ignore-next-line complexity -- Operation aliases and write rejection form one inspect-only dispatch gate.
function normalizePolicyOperation(value: unknown): PolicyOperation {
  if (typeof value !== 'string') throw sessionError('unsupported', false, { reason: 'operation' });
  const operation = POLICY_OPERATION_ALIASES[value];
  if (operation) return operation;
  if (value.startsWith('project.')) {
    throw sessionError('capability_denied', false, { reason: 'inspect_only' });
  }
  throw sessionError('unsupported', false, { reason: 'operation' });
}

function operationForObservationClass(observationClass: InspectObservationClass): PolicyOperation {
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

function observationClassForOperation(
  operation: PolicyOperation
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
  request: NormalizedPolicyRequest,
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
  operation: PolicyOperation,
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
