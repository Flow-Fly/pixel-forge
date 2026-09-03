import type { ProjectRepository } from '../services/persistence/project-repository';
import {
  AutoSaveService,
  autoSaveService,
} from '../services/auto-save';
import type { ProjectContext } from '../stores/project-context';
import type { ProjectChangeEvent } from '../stores/project-store';
import {
  executeCanvasSize,
  previewCanvasSize,
  type CanvasOffset,
  type CanvasSizePreview,
  type CanvasSizeRequest,
} from './canvas-size';
import {
  cloneProjectChangeEvent,
  cloneSaveSafetyObservation,
  normalizeRenderByteLimit,
  observeProject,
  renderProject,
  type ProjectObservation,
  type ProjectObservationFailure,
  type ProjectObservationResult,
  type RenderObservation,
} from './observations';
import { editorCatalog, RENDER_OBSERVATION_MAX_BYTES } from './catalog';
import {
  isRecord,
  type EditorError,
  type ProjectSaveSafetyObservation,
  type ProjectTarget,
} from './contracts';

export type ProjectTargetResolver = (target: ProjectTarget) => ProjectContext | undefined;

export interface ProjectTargetRegistry {
  resolve(target: ProjectTarget): ProjectContext | undefined;
}

export type ProjectTargetLookup =
  | ProjectTargetResolver
  | ProjectTargetRegistry
  | ReadonlyMap<string, ProjectContext>;

export interface AutomationAdapterDependencies {
  readonly targetRegistry?: ProjectTargetLookup;
  readonly saveService?: AutoSaveService;
  readonly repository?: ProjectRepository;
  readonly maxRenderBytes?: number;
}

export interface AutomationSuccess<T> {
  readonly ok: true;
  readonly result: T;
}

export interface AutomationFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type AutomationResult<T> = AutomationSuccess<T> | AutomationFailure;

// fallow-ignore-next-line unused-type -- Public request type documents the adapter boundary.
export interface CatalogNegotiationRequest {
  readonly version: string;
}

export interface CatalogNegotiation {
  readonly type: 'catalog.negotiation';
  readonly requestedVersion: string;
  readonly version: string;
  readonly catalog: typeof editorCatalog;
}

export interface ProjectTargetRevision {
  readonly type: 'project.target';
  readonly target: ProjectTarget;
  readonly revision: number;
}

export interface CanvasResizePreviewResult {
  readonly type: 'project.canvas.resize.preview';
  readonly preview: CanvasSizePreview;
}

export interface CanvasResizeExecutionResult {
  readonly type: 'project.canvas.resize';
  readonly target: ProjectTarget;
  readonly revision: number;
  readonly event: ProjectChangeEvent;
}

export interface HistoryTransitionResult {
  readonly type: 'project.history.undo' | 'project.history.redo';
  readonly target: ProjectTarget;
  readonly revision: number;
  readonly event: ProjectChangeEvent;
}

export interface SaveResult {
  readonly type: 'project.save';
  readonly target: ProjectTarget;
  readonly revision: number;
  readonly saveSafety: ProjectSaveSafetyObservation;
}

export interface ReloadResult {
  readonly type: 'project.reload';
  readonly target: ProjectTarget;
  readonly revision: number;
  readonly observation: ProjectObservation;
}

type AdapterRequestRecord = Record<string, unknown>;
type RequestHandler = (input: AdapterRequestRecord) => Promise<AutomationResult<unknown>>;

type ProjectRequestInput = {
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
};

const CURRENT_CATALOG_VERSION = editorCatalog.version;
const CANONICAL_OPERATION_IDS: ReadonlySet<string> = new Set(
  editorCatalog.operations.map((operation) => operation.id),
);
const SAFE_ERROR_CODES = new Set<EditorError['code']>([
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
const SAFE_ERROR_DETAIL_KEYS = new Set([
  'reason',
  'resource',
  'feature',
  'axis',
  'expectedRevision',
  'currentRevision',
  'limitId',
  'max',
  'requestedVersion',
]);

/**
 * Transport-neutral client for the editor command and observation surface.
 * A target is resolved once at the beginning of each request and the captured
 * ProjectContext is used for the rest of that request.
 */
export class AutomationAdapter {
  private readonly resolveTarget: ProjectTargetResolver;
  private readonly saveService: AutoSaveService;
  private readonly repository?: ProjectRepository;
  private readonly maxRenderBytes: number;
  private readonly latestEvents = new WeakMap<ProjectContext, ProjectChangeEvent>();
  private readonly eventCleanups = new WeakMap<ProjectContext, () => void>();
  private readonly requestHandlers: Readonly<Record<string, RequestHandler>>;
  private negotiatedVersion: string | null = null;

  constructor(dependencies: AutomationAdapterDependencies = {}) {
    this.resolveTarget = createTargetResolver(dependencies.targetRegistry);
    this.saveService = dependencies.saveService ?? autoSaveService;
    this.repository = dependencies.repository;
    this.maxRenderBytes = normalizeRenderByteLimit(dependencies.maxRenderBytes ?? NaN)
      ?? RENDER_OBSERVATION_MAX_BYTES;
    this.requestHandlers = {
      'catalog.negotiate': async (input) => this.negotiateCatalog(input),
      'project.target': async (input) => this.captureTargetRevision(input),
      'project.observe': async (input) => this.observeProject(input),
      'project.render.observe': async (input) => this.observeRender(input),
      'project.canvas.resize': (input) => this.dispatchCanvasResize(input),
      'project.history.undo': (input) => this.undo(input),
      'project.history.redo': (input) => this.redo(input),
      'project.save': (input) => this.save(input),
      'project.reload': (input) => this.reload(input),
    };
  }

  negotiateCatalog(input: unknown): AutomationResult<CatalogNegotiation> {
    this.negotiatedVersion = null;
    try {
      const request = normalizeCatalogNegotiation(input);
      const requested = parseVersion(request.version);
      const current = parseVersion(CURRENT_CATALOG_VERSION);
      if (!requested || !current) {
        return failure('unsupported', false, { reason: 'catalog_version' });
      }
      if (requested.major !== current.major) {
        return failure('unsupported', false, {
          reason: 'catalog_major',
          requestedVersion: request.version,
        });
      }

      this.negotiatedVersion = CURRENT_CATALOG_VERSION;
      return success({
        type: 'catalog.negotiation',
        requestedVersion: request.version,
        version: CURRENT_CATALOG_VERSION,
        catalog: cloneCatalog(),
      });
    } catch (error) {
      return failureFromUnknown(error);
    }
  }

  captureTargetRevision(input: unknown): AutomationResult<ProjectTargetRevision> {
    try {
      this.assertNegotiated();
      const target = normalizeTargetRequest(input);
      const context = this.prepareContext(target);
      return success({
        type: 'project.target',
        target: { projectId: target.projectId },
        revision: context.project.revision.value,
      });
    } catch (error) {
      return failureFromUnknown(error);
    }
  }

  observeProject(input: unknown): AutomationResult<ProjectObservation> {
    try {
      this.assertNegotiated();
      const request = normalizeProjectRequest(input);
      const context = this.prepareContext(request.target);
      this.assertCurrentRevision(context, request.expectedRevision);
      const observation = observeProject(context, request.target, {
        saveSafety: this.saveService.getSaveSafetyObservation(context),
        lastEvent: this.latestEvents.get(context),
      });
      if (isProjectObservationFailure(observation)) return observation;
      return success(observation);
    } catch (error) {
      return failureFromUnknown(error);
    }
  }

  observeRender(input: unknown): AutomationResult<RenderObservation> {
    try {
      this.assertNegotiated();
      const request = normalizeRenderRequest(input);
      const context = this.prepareContext(request.target);
      this.assertCurrentRevision(context, request.expectedRevision);
      const result = renderProject(context, request.target, request.frameId, this.maxRenderBytes);
      if (isRenderObservationFailure(result)) return result;
      return success(result);
    } catch (error) {
      return failureFromUnknown(error);
    }
  }

  previewCanvasResize(input: unknown): AutomationResult<CanvasResizePreviewResult> {
    try {
      this.assertNegotiated();
      const request = normalizeCanvasSizeRequest(input);
      const context = this.prepareContext(request.target);
      const result = previewCanvasSize(context, request);
      if (!result.ok) return result;
      return success({
        type: 'project.canvas.resize.preview',
        preview: result.preview,
      });
    } catch (error) {
      return failureFromUnknown(error);
    }
  }

  async executeCanvasResize(
    input: unknown,
    options: { readonly confirmed?: boolean; readonly preview?: CanvasSizePreview } = {},
  ): Promise<AutomationResult<CanvasResizeExecutionResult>> {
    try {
      this.assertNegotiated();
      const request = normalizeCanvasSizeRequest(input);
      const context = this.prepareContext(request.target);
      const result = await executeCanvasSize(context, request, options);
      if (!result.ok) return result;
      return success({
        type: 'project.canvas.resize',
        target: { projectId: request.target.projectId },
        revision: result.revision,
        event: cloneProjectChangeEvent(result.event),
      });
    } catch (error) {
      return failureFromUnknown(error);
    }
  }

  async undo(input: unknown): Promise<AutomationResult<HistoryTransitionResult>> {
    return await this.runHistoryTransition(input, 'undo');
  }

  async redo(input: unknown): Promise<AutomationResult<HistoryTransitionResult>> {
    return await this.runHistoryTransition(input, 'redo');
  }

  async save(input: unknown): Promise<AutomationResult<SaveResult>> {
    try {
      this.assertNegotiated();
      const request = normalizeProjectRequest(input);
      const context = this.prepareContext(request.target);
      this.assertCurrentRevision(context, request.expectedRevision);
      await this.saveService.saveNow(context);
      return success({
        type: 'project.save',
        target: { projectId: request.target.projectId },
        revision: context.project.revision.value,
        saveSafety: cloneSaveSafetyObservation(this.saveService.getSaveSafetyObservation(context)),
      });
    } catch (error) {
      return failureFromUnknown(error);
    }
  }

  async reload(input: unknown): Promise<AutomationResult<ReloadResult>> {
    try {
      this.assertNegotiated();
      const request = normalizeProjectRequest(input);
      const context = this.prepareContext(request.target);
      this.assertCurrentRevision(context, request.expectedRevision);
      if (!this.repository) {
        return failure('unsupported', false, { reason: 'reload_repository' });
      }

      const storedProject = await this.repository.load(request.target.projectId);
      if (!storedProject) {
        return failure('target_not_found', true);
      }

      this.revalidateCapturedContext(context, request.target, request.expectedRevision);
      await this.saveService.runWithoutSaving(async () => {
        await context.project.loadProject(storedProject, false, {
          preserveRevision: request.expectedRevision,
        });
        context.project.id.value = request.target.projectId;
      }, context);
      this.latestEvents.delete(context);

      const observation = observeProject(context, request.target, {
        saveSafety: this.saveService.getSaveSafetyObservation(context),
      });
      if (isProjectObservationFailure(observation)) return observation;
      return success({
        type: 'project.reload',
        target: { projectId: request.target.projectId },
        revision: context.project.revision.value,
        observation,
      });
    } catch (error) {
      return failureFromUnknown(error);
    }
  }

  /** Dispatch one catalog-backed request using stable operation identifiers. */
  async request(input: unknown): Promise<AutomationResult<unknown>> {
    try {
      if (!isRecord(input)) return failure('invalid_request', false, { reason: 'request' });
      const operation = input.operation;
      if (typeof operation !== 'string') return failure('invalid_request', false, { reason: 'operation' });
      const handler = this.requestHandler(operation);
      if (!handler) return failure('unsupported', false, { reason: 'operation' });
      return await handler(input);
    } catch (error) {
      return failureFromUnknown(error);
    }
  }

  private requestHandler(operation: string): RequestHandler | undefined {
    if (!CANONICAL_OPERATION_IDS.has(operation)) return undefined;
    return this.requestHandlers[operation];
  }

  private dispatchCanvasResize(input: AdapterRequestRecord): Promise<AutomationResult<unknown>> {
    if (input.action !== undefined && input.action !== 'preview' && input.action !== 'execute') {
      return Promise.resolve(failure('invalid_request', false, { reason: 'action' }));
    }
    if (input.action === 'preview') {
      return Promise.resolve(this.previewCanvasResize(input));
    }
    return this.executeCanvasResize(input, {
      confirmed: input.confirmed === true,
      preview: isCanvasSizePreview(input.preview) ? input.preview : undefined,
    });
  }

  private async runHistoryTransition(
    input: unknown,
    phase: 'undo' | 'redo',
  ): Promise<AutomationResult<HistoryTransitionResult>> {
    try {
      this.assertNegotiated();
      const request = normalizeProjectRequest(input);
      const context = this.prepareContext(request.target);
      this.assertCurrentRevision(context, request.expectedRevision);
      const stack = phase === 'undo' ? context.history.undoStack.value : context.history.redoStack.value;
      const command = stack[stack.length - 1];
      if (!command || command.managesProjectRevision !== true) {
        return failure('invalid_state', false, { reason: `history_${phase}` });
      }

      this.latestEvents.delete(context);
      if (phase === 'undo') {
        await context.history.undo();
      } else {
        await context.history.redo();
      }

      const event = this.latestEvents.get(context);
      if (!event) return failure('internal', true, { reason: 'missing_change_event' });
      return success({
        type: phase === 'undo' ? 'project.history.undo' : 'project.history.redo',
        target: { projectId: request.target.projectId },
        revision: event.toRevision,
        event: cloneProjectChangeEvent(event),
      });
    } catch (error) {
      return failureFromUnknown(error);
    }
  }

  private assertNegotiated(): void {
    if (!this.negotiatedVersion) {
      throw adapterError('unsupported', false, { reason: 'catalog_negotiation_required' });
    }
  }

  private prepareContext(target: ProjectTarget): ProjectContext {
    let context: ProjectContext | undefined;
    try {
      context = this.resolveTarget(target);
    } catch {
      throw adapterError('target_not_found', true);
    }
    if (!context || context.isDisposed || context.project.id.value !== target.projectId) {
      throw adapterError('target_not_found', true, {
        ...(context?.isDisposed ? { reason: 'disposed' } : {}),
      });
    }

    this.saveService.start(context);
    this.trackEvents(context);
    return context;
  }

  private assertCurrentRevision(context: ProjectContext, expectedRevision: number): void {
    const currentRevision = context.project.revision.value;
    if (currentRevision !== expectedRevision) {
      throw adapterError('revision_conflict', true, {
        expectedRevision,
        currentRevision,
      });
    }
  }

  private revalidateCapturedContext(
    context: ProjectContext,
    target: ProjectTarget,
    expectedRevision: number,
  ): void {
    let resolvedContext: ProjectContext | undefined;
    try {
      resolvedContext = this.resolveTarget(target);
    } catch {
      throw adapterError('target_not_found', true);
    }
    if (resolvedContext !== context) {
      throw adapterError('target_not_found', true, { reason: 'target_rebound' });
    }
    if (context.isDisposed) {
      throw adapterError('target_not_found', true, { reason: 'disposed' });
    }
    if (context.project.id.value !== target.projectId) {
      throw adapterError('target_not_found', true, { reason: 'target_identity' });
    }
    this.assertCurrentRevision(context, expectedRevision);
  }

  private trackEvents(context: ProjectContext): void {
    if (this.eventCleanups.has(context)) return;

    const listener = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (!isProjectChangeEvent(detail)) return;
      this.latestEvents.set(context, cloneProjectChangeEvent(detail));
    };
    context.projectChangeEvents.addEventListener('project-change', listener);
    this.eventCleanups.set(context, () => {
      context.projectChangeEvents.removeEventListener('project-change', listener);
    });
  }
}

export function createAutomationAdapter(
  dependencies: AutomationAdapterDependencies = {},
): AutomationAdapter {
  return new AutomationAdapter(dependencies);
}

// fallow-ignore-next-line unused-export -- Public registry helper is consumed by adapter clients.
export function createProjectTargetRegistry(
  contexts: Iterable<ProjectContext>,
): ProjectTargetRegistry {
  const targets = new Map<string, ProjectContext>();
  for (const context of contexts) targets.set(context.project.id.value, context);
  return {
    resolve(target) {
      return targets.get(target.projectId);
    },
  };
}

function createTargetResolver(lookup: ProjectTargetLookup | undefined): ProjectTargetResolver {
  if (!lookup) return () => undefined;
  if (typeof lookup === 'function') return lookup;
  if (isTargetRegistry(lookup)) return (target) => lookup.resolve(target);
  return (target) => lookup.get(target.projectId);
}

function isTargetRegistry(value: ProjectTargetLookup): value is ProjectTargetRegistry {
  return typeof value === 'object' && value !== null && 'resolve' in value;
}

function normalizeCatalogNegotiation(input: unknown): CatalogNegotiationRequest {
  if (!isRecord(input)) throw adapterError('invalid_request', false, { reason: 'catalog_request' });
  const version = input.version ?? input.requestedVersion;
  if (typeof version !== 'string' || !parseVersion(version)) {
    throw adapterError('invalid_request', false, { reason: 'catalog_version' });
  }
  return { version };
}

function normalizeTargetRequest(input: unknown): ProjectTarget {
  if (!isRecord(input)) throw adapterError('invalid_request', false, { reason: 'request' });
  return normalizeTarget(input.target);
}

function normalizeProjectRequest(input: unknown): ProjectRequestInput {
  if (!isRecord(input)) throw adapterError('invalid_request', false, { reason: 'request' });
  return {
    target: normalizeTarget(input.target),
    expectedRevision: normalizeRevision(input.expectedRevision ?? input.revision),
  };
}

function normalizeRenderRequest(input: unknown): ProjectRequestInput & { readonly frameId: string } {
  if (!isRecord(input)) throw adapterError('invalid_request', false, { reason: 'request' });
  const frameId = input.frameId;
  if (typeof frameId !== 'string' || frameId.length === 0) {
    throw adapterError('invalid_request', false, { reason: 'frame_id' });
  }
  return {
    ...normalizeProjectRequest(input),
    frameId,
  };
}

function normalizeCanvasSizeRequest(input: unknown): CanvasSizeRequest {
  if (!isRecord(input)) throw adapterError('invalid_request', false, { reason: 'request' });
  const offset = input.offset === undefined ? { x: 0, y: 0 } : normalizeOffset(input.offset);
  return {
    target: normalizeTarget(input.target),
    expectedRevision: normalizeRevision(input.expectedRevision ?? input.revision),
    width: normalizeNumber(input.width, 'width'),
    height: normalizeNumber(input.height, 'height'),
    offset,
  };
}

function normalizeTarget(value: unknown): ProjectTarget {
  if (!isRecord(value) || typeof value.projectId !== 'string' || value.projectId.length === 0) {
    throw adapterError('invalid_request', false, { reason: 'target' });
  }
  return { projectId: value.projectId };
}

function normalizeRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw adapterError('invalid_request', false, { reason: 'expected_revision' });
  }
  return value;
}

function normalizeNumber(value: unknown, reason: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw adapterError('invalid_request', false, { reason });
  }
  return value;
}

function normalizeOffset(value: unknown): CanvasOffset {
  if (!isRecord(value)) throw adapterError('invalid_request', false, { reason: 'offset' });
  return {
    x: normalizeNumber(value.x, 'offset'),
    y: normalizeNumber(value.y, 'offset'),
  };
}

function parseVersion(value: string): { readonly major: number; readonly minor: number } | null {
  const match = /^(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return Number.isSafeInteger(major) && Number.isSafeInteger(minor)
    ? { major, minor }
    : null;
}

function cloneCatalog(): typeof editorCatalog {
  return structuredClone(editorCatalog);
}

// fallow-ignore-next-line complexity -- The transport validator checks every nested preview field before dispatch.
function isCanvasSizePreview(value: unknown): value is CanvasSizePreview {
  if (!isRecord(value) || !isRecord(value.request)) return false;
  const request = value.request;
  if (!isRecord(request.target) || !isRecord(request.offset)) return false;
  if (typeof request.target.projectId !== 'string') return false;
  if (!isFiniteNumber(request.expectedRevision) ||
      !isFiniteNumber(request.width) || !isFiniteNumber(request.height)) return false;
  if (!isFiniteNumber(request.offset.x) || !isFiniteNumber(request.offset.y)) return false;
  return isFiniteNumber(value.currentWidth)
    && isFiniteNumber(value.currentHeight)
    && isRecord(value.crop)
    && typeof value.requiresConfirmation === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRenderObservationFailure(
  value: RenderObservation | { readonly ok: false; readonly error: EditorError },
): value is { readonly ok: false; readonly error: EditorError } {
  return 'ok' in value && value.ok === false;
}

function isProjectObservationFailure(
  value: ProjectObservationResult,
): value is ProjectObservationFailure {
  return 'ok' in value && value.ok === false;
}

function isProjectChangeEvent(value: unknown): value is ProjectChangeEvent {
  return isRecord(value)
    && value.type === 'project-change'
    && typeof value.target === 'string'
    && typeof value.fromRevision === 'number'
    && typeof value.toRevision === 'number'
    && typeof value.transactionId === 'string'
    && Array.isArray(value.domains);
}

function success<T>(result: T): AutomationSuccess<T> {
  return { ok: true, result };
}

function failure(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
): AutomationFailure {
  return { ok: false, error: { code, retryable, ...(details ? { details } : {}) } };
}

function failureFromUnknown(error: unknown): AutomationFailure {
  return failureFromError(toEditorError(error));
}

function failureFromError(error: EditorError): AutomationFailure {
  return {
    ok: false,
    error: {
      code: SAFE_ERROR_CODES.has(error.code) ? error.code : 'internal',
      retryable: error.retryable === true,
      ...(error.details ? { details: sanitizeDetails(error.details) } : {}),
    },
  };
}

function toEditorError(error: unknown): EditorError {
  if (isRecord(error) && isRecord(error.editorError)) {
    return normalizeEditorError(error.editorError);
  }
  if (isRecord(error) && typeof error.code === 'string' && 'retryable' in error) {
    return normalizeEditorError(error);
  }
  return { code: 'internal', retryable: true, details: { reason: 'unexpected_failure' } };
}

function normalizeEditorError(value: Record<string, unknown>): EditorError {
  const code = SAFE_ERROR_CODES.has(value.code as EditorError['code'])
    ? value.code as EditorError['code']
    : 'internal';
  return {
    code,
    retryable: value.retryable === true,
    ...(isRecord(value.details) ? { details: sanitizeDetails(value.details) } : {}),
  };
}

function sanitizeDetails(
  details: Record<string, unknown>,
): Readonly<Record<string, string | number>> {
  const safe: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!SAFE_ERROR_DETAIL_KEYS.has(key)) continue;
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
      safe[key] = value;
    }
  }
  return safe;
}

class AdapterRequestError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'AdapterRequestError';
    this.editorError = editorError;
  }
}

function adapterError(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
): AdapterRequestError {
  return new AdapterRequestError({
    code,
    retryable,
    ...(details ? { details } : {}),
  });
}
