import type { ProjectRepository } from '../services/persistence/project-repository';
import {
  ProjectAlreadyExistsError,
} from '../services/persistence/project-repository';
import {
  AutoSaveService,
  autoSaveService,
} from '../services/auto-save';
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
  renderProjectObservation,
  type LegacyRenderObservation,
  type ProjectObservation,
  type ProjectObservationFailure,
  type ProjectObservationResult,
  type RenderObservationRequest,
  type RenderObservationResult,
  type RenderObservation,
} from './observations';
import {
  editorCatalog,
  RASTER_GRID_MAX_STRING_LENGTH,
  RASTER_OBSERVATION_ID,
  RENDER_OBSERVATION_MAX_SCALE,
  RENDER_OBSERVATION_MIN_SCALE,
  RENDER_OBSERVATION_MAX_BYTES,
} from './catalog';
import {
  isRasterObservationFailure,
  observeRaster,
  type RasterObservation,
} from './symbol-grid';
import { DB32_COLORS } from '../stores/palette/types';
import { PROJECT_VERSION, type ProjectFile } from '../types/project';
import {
  createProjectContext,
  type ProjectContext,
} from '../stores/project-context';
import { DEFAULT_PROJECT_NAME, normalizeProjectName } from '../services/project-defaults';
import {
  hasOnlyKeys,
  isRecord,
  type EditorError,
  type ProjectSaveSafetyObservation,
  type ProjectTarget,
} from './contracts';
import {
  EDITOR_TRANSACTION_OPERATION_ID,
  executeEditorTransaction,
  readEditorTransactionTarget,
  type EditorTransactionResult,
} from './transaction';

// fallow-ignore-next-line unused-export -- Public operation ID is part of the adapter contract.
export { EDITOR_TRANSACTION_OPERATION_ID } from './transaction';

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
  readonly transactionIdFactory?: () => string;
  readonly transactionTagIdFactory?: () => string;
  readonly projectIdFactory?: () => string;
  readonly entityIdFactory?: () => string;
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

export interface ProjectCreateResult {
  readonly type: 'project.create';
  readonly kind: 'blank' | 'safe-copy';
  readonly target: ProjectTarget;
  readonly revision: 0;
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

interface ReloadSaveProof {
  readonly context: ProjectContext;
  readonly projectId: string;
  readonly revision: number;
  readonly saveSafety: ProjectSaveSafetyObservation;
}

interface CreatedTargetReservation {
  readonly target: ProjectTarget;
  readonly context: ProjectContext;
}

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
  'min',
  'max',
  'requestedVersion',
  'childIndex',
  'family',
  'phase',
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
  private readonly transactionIdFactory?: () => string;
  private readonly transactionTagIdFactory?: () => string;
  private readonly projectIdFactory: () => string;
  private readonly entityIdFactory: () => string;
  private readonly registeredTargets = new Map<string, ProjectContext>();
  private readonly targetLookup?: ProjectTargetLookup;
  private readonly latestEvents = new WeakMap<ProjectContext, ProjectChangeEvent>();
  private readonly eventCleanups = new WeakMap<ProjectContext, () => void>();
  private readonly reloadSaveProofs = new WeakMap<ProjectContext, ReloadSaveProof>();
  private readonly requestHandlers: Readonly<Record<string, RequestHandler>>;
  private negotiatedVersion: string | null = null;

  constructor(dependencies: AutomationAdapterDependencies = {}) {
    this.targetLookup = dependencies.targetRegistry;
    const configuredResolver = createTargetResolver(dependencies.targetRegistry);
    this.resolveTarget = (target) =>
      this.registeredTargets.get(target.projectId) ?? configuredResolver(target);
    this.saveService = dependencies.saveService ?? autoSaveService;
    this.repository = dependencies.repository;
    this.maxRenderBytes = normalizeRenderByteLimit(dependencies.maxRenderBytes ?? NaN)
      ?? RENDER_OBSERVATION_MAX_BYTES;
    this.transactionIdFactory = dependencies.transactionIdFactory;
    this.transactionTagIdFactory = dependencies.transactionTagIdFactory;
    this.projectIdFactory = dependencies.projectIdFactory ?? (() => crypto.randomUUID());
    this.entityIdFactory = dependencies.entityIdFactory ?? (() => crypto.randomUUID());
    this.requestHandlers = {
      'catalog.negotiate': async (input) => this.negotiateCatalog(input),
      'project.create': async (input) => this.createProject(input),
      'project.target': async (input) => this.captureTargetRevision(input),
      'project.observe': async (input) => this.observeProject(input),
      'project.render.observe': (input) => this.observeRenderRequest(input),
      [RASTER_OBSERVATION_ID]: async (input) => this.observeRaster(input),
      'project.canvas.resize': (input) => this.dispatchCanvasResize(input),
      [EDITOR_TRANSACTION_OPERATION_ID]: (input) => this.executeTransaction(input),
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

  // fallow-ignore-next-line complexity -- Creation validates the fresh-only boundary, persistence, and context registration as one operation.
  async createProject(input: unknown): Promise<AutomationResult<ProjectCreateResult>> {
    try {
      this.assertNegotiated();
      if (!this.repository) {
        return failure('unsupported', false, { reason: 'create_repository' });
      }
      const request = normalizeProjectCreateRequest(input);
      const id = this.projectIdFactory();
      if (typeof id !== 'string' || id.length === 0) {
        return failure('internal', true, { reason: 'project_id' });
      }
      const target = { projectId: id };
      if (this.resolveTarget(target)) {
        return failure('invalid_state', false, { reason: 'project_id_collision' });
      }

      let project: ProjectFile;
      if (request.kind === 'blank') {
        project = createBlankProjectFile(request.name, request.width, request.height, this.entityIdFactory);
      } else {
        const source = this.resolveCapturedContext(request.source.target);
        this.assertSourceRevision(source, request.source.expectedRevision);
        project = structuredClone(await source.project.saveProject({ rebuildIndexBuffers: false }));
        this.assertSourceRevision(source, request.source.expectedRevision);
        project.name = request.name ?? `Copy of ${normalizeProjectName(project.name)}`;
      }

      let context: ProjectContext | undefined;
      try {
        context = createProjectContext();
        await this.saveService.runWithoutSaving(async () => {
          await context!.project.loadProject(project);
          context!.project.id.value = id;
          context!.project.lastSaved.value = Date.now();
        }, context);
      } catch (error) {
        if (context) {
          this.saveService.stop(context);
          context.dispose();
        }
        throw error;
      }

      let reservation: CreatedTargetReservation | undefined;
      try {
        // Reserve the adapter target synchronously before persistence. The
        // reservation is exact-identity reversible if the fresh-only create
        // rejects, so no post-persistence registration can fail or overwrite.
        reservation = this.reserveCreatedTarget(target, context);
        // ProjectRepository.create is the fresh-only persistence boundary. It
        // must reject a used key without changing the repository, so the only
        // compensation needed here is releasing our in-memory reservation.
        await this.repository.create(id, structuredClone(project));
      } catch (error) {
        if (reservation) this.rollbackCreatedTarget(reservation);
        this.saveService.stop(context);
        context.dispose();
        if (error instanceof ProjectAlreadyExistsError) {
          return failure('invalid_state', false, { reason: 'project_id_collision' });
        }
        throw error;
      }

      return success({
        type: 'project.create',
        kind: request.kind,
        target,
        revision: 0,
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

  /**
   * Keep the original synchronous frame-only method for direct callers. The
   * catalog request path uses the explicit asynchronous observation below.
   */
  observeRender(input: unknown): AutomationResult<LegacyRenderObservation> {
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

  async observeRenderRequest(input: unknown): Promise<AutomationResult<RenderObservation>> {
    try {
      this.assertNegotiated();
      const request = normalizeRenderObservationRequest(input);
      const context = this.prepareContext(request.target);
      this.assertCurrentRevision(context, request.expectedRevision);
      const result = await renderProjectObservation(context, request, this.maxRenderBytes);
      if (isRenderObservationFailure(result)) return result;
      return success(result);
    } catch (error) {
      return failureFromUnknown(error);
    }
  }

  async observeRaster(input: unknown): Promise<AutomationResult<RasterObservation>> {
    try {
      this.assertNegotiated();
      const request = normalizeProjectRequest(input);
      validateRasterTargetLength(request.target);
      const context = this.prepareContext(request.target);
      const result = await observeRaster(context, input);
      if (isRasterObservationFailure(result)) return result;
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

  async executeTransaction(
    input: unknown,
  ): Promise<AutomationResult<EditorTransactionResult>> {
    try {
      this.assertNegotiated();
      const target = readEditorTransactionTarget(input);
      const context = this.prepareContext(target);
      const result = await executeEditorTransaction(context, input, {
        transactionIdFactory: this.transactionIdFactory,
        tagIdFactory: this.transactionTagIdFactory,
        entityIdFactory: this.entityIdFactory,
      });
      return success({
        ...result,
        target: { projectId: result.target.projectId },
        event: cloneProjectChangeEvent(result.event),
        provenance: structuredClone(result.provenance),
        ...(result.compositeEquality
          ? { compositeEquality: structuredClone(result.compositeEquality) }
          : {}),
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
      const revision = context.project.revision.value;
      const persistedSaveSafety = this.saveService.getSaveSafetyObservation(context);
      const saveSafety = cloneSaveSafetyObservation(persistedSaveSafety);
      if (this.isExactSavedRevision(context, request.target, request.expectedRevision, persistedSaveSafety)) {
        this.reloadSaveProofs.set(context, {
          context,
          projectId: request.target.projectId,
          revision: request.expectedRevision,
          saveSafety: persistedSaveSafety,
        });
      } else {
        this.reloadSaveProofs.delete(context);
      }
      return success({
        type: 'project.save',
        target: { projectId: request.target.projectId },
        revision,
        saveSafety,
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
      if (!this.hasExactReloadSaveProof(context, request.target, request.expectedRevision)) {
        return failure('invalid_state', false, { reason: 'reload_save_required' });
      }

      const storedProject = await this.repository.load(request.target.projectId);
      if (!storedProject) {
        return failure('target_not_found', true);
      }

      this.revalidateCapturedContext(context, request.target, request.expectedRevision);
      if (!this.hasExactReloadSaveProof(context, request.target, request.expectedRevision)) {
        return failure('invalid_state', false, { reason: 'reload_save_required' });
      }
      await this.saveService.runWithoutSaving(async () => {
        await context.project.loadProject(storedProject, false, {
          preserveRevision: request.expectedRevision,
        });
        context.project.id.value = request.target.projectId;
      }, context);
      this.latestEvents.delete(context);
      this.reloadSaveProofs.delete(context);

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

  // fallow-ignore-next-line complexity -- Undo/redo validation and event restoration share one adapter boundary.
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

      const previousEvent = this.latestEvents.get(context);
      this.latestEvents.delete(context);
      try {
        if (phase === 'undo') {
          await context.history.undo();
        } else {
          await context.history.redo();
        }
      } catch (error) {
        if (previousEvent) this.latestEvents.set(context, previousEvent);
        throw error;
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
    const context = this.resolveContext(target);

    this.saveService.start(context);
    this.trackEvents(context);
    return context;
  }

  private resolveContext(target: ProjectTarget): ProjectContext {
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

    return context;
  }

  private resolveCapturedContext(target: ProjectTarget): ProjectContext {
    return this.resolveContext(target);
  }

  private assertSourceRevision(context: ProjectContext, expectedRevision: number): void {
    const currentRevision = context.project.revision.value;
    if (currentRevision !== expectedRevision) {
      throw adapterError('revision_conflict', true, {
        expectedRevision,
        currentRevision,
      });
    }
  }

  private reserveCreatedTarget(
    target: ProjectTarget,
    context: ProjectContext,
  ): CreatedTargetReservation {
    if (this.registeredTargets.has(target.projectId)) {
      throw adapterError('invalid_state', false, { reason: 'target_registration_collision' });
    }
    if (this.targetLookup instanceof Map && Map.prototype.has.call(this.targetLookup, target.projectId)) {
      throw adapterError('invalid_state', false, { reason: 'target_registration_collision' });
    }
    this.registeredTargets.set(target.projectId, context);
    try {
      if (this.targetLookup instanceof Map) {
        Map.prototype.set.call(this.targetLookup, target.projectId, context);
      }
    } catch (error) {
      this.registeredTargets.delete(target.projectId);
      throw error;
    }
    return { target, context };
  }

  private rollbackCreatedTarget(reservation: CreatedTargetReservation): void {
    if (this.registeredTargets.get(reservation.target.projectId) === reservation.context) {
      this.registeredTargets.delete(reservation.target.projectId);
    }
    if (
      this.targetLookup instanceof Map
      && Map.prototype.get.call(this.targetLookup, reservation.target.projectId) === reservation.context
    ) {
      Map.prototype.delete.call(this.targetLookup, reservation.target.projectId);
    }
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

  private isExactSavedRevision(
    context: ProjectContext,
    target: ProjectTarget,
    expectedRevision: number,
    saveSafety: ProjectSaveSafetyObservation,
  ): boolean {
    let resolvedContext: ProjectContext | undefined;
    try {
      resolvedContext = this.resolveTarget(target);
    } catch {
      return false;
    }

    return !context.isDisposed
      && context.project.id.value === target.projectId
      && context.project.revision.value === expectedRevision
      && saveSafety.target.projectId === target.projectId
      && saveSafety.currentRevision === expectedRevision
      && saveSafety.persistedRevision === expectedRevision
      && saveSafety.status === 'saved'
      && resolvedContext === context;
  }

  private hasExactReloadSaveProof(
    context: ProjectContext,
    target: ProjectTarget,
    expectedRevision: number,
  ): boolean {
    const proof = this.reloadSaveProofs.get(context);
    if (
      !proof
      || proof.context !== context
      || proof.projectId !== target.projectId
      || proof.revision !== expectedRevision
    ) {
      return false;
    }

    const saveSafety = this.saveService.getSaveSafetyObservation(context);
    return proof.saveSafety === saveSafety
      && this.isExactSavedRevision(context, target, expectedRevision, saveSafety);
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
  const registry: ProjectTargetRegistry = Object.freeze({
    resolve(target: ProjectTarget) {
      return targets.get(target.projectId);
    },
  });
  return registry;
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

type ProjectCreateRequest =
  | {
      readonly kind: 'blank';
      readonly name: string;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly kind: 'safe-copy';
      readonly name?: string;
      readonly source: {
        readonly target: ProjectTarget;
        readonly expectedRevision: number;
      };
    };

function normalizeProjectCreateRequest(input: unknown): ProjectCreateRequest {
  if (!isRecord(input)) throw adapterError('invalid_request', false, { reason: 'create_request' });
  if (input.operation !== undefined && input.operation !== 'project.create') {
    throw adapterError('invalid_request', false, { reason: 'operation' });
  }
  if (input.kind === 'blank') {
    assertExactKeys(input, ['operation', 'kind', 'name', 'width', 'height'], 'create_blank');
    return {
      kind: 'blank',
      name: normalizeCreateName(input.name),
      width: normalizeCreateDimension(input.width, 'width'),
      height: normalizeCreateDimension(input.height, 'height'),
    };
  }
  if (input.kind === 'safe-copy') {
    assertExactKeys(input, ['operation', 'kind', 'name', 'source'], 'create_safe_copy');
    if (!isRecord(input.source)) {
      throw adapterError('invalid_request', false, { reason: 'source' });
    }
    assertExactKeys(input.source, ['target', 'expectedRevision'], 'source');
    return {
      kind: 'safe-copy',
      ...(input.name === undefined ? {} : { name: normalizeCreateName(input.name) }),
      source: {
        target: normalizeTarget(input.source.target),
        expectedRevision: normalizeRevision(input.source.expectedRevision),
      },
    };
  }
  throw adapterError('invalid_request', false, { reason: 'kind' });
}

function normalizeCreateName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw adapterError('invalid_request', false, { reason: 'name' });
  }
  if (value.length > editorCatalog.limits.maxStringLength) {
    throw adapterError('limit_exceeded', false, {
      reason: 'name',
      max: editorCatalog.limits.maxStringLength,
    });
  }
  return value.trim();
}

function normalizeCreateDimension(value: unknown, reason: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 16 || value > 64) {
    throw adapterError('bounds_exceeded', false, { reason, max: 64 });
  }
  return value;
}

function createBlankProjectFile(
  name: string,
  width: number,
  height: number,
  entityIdFactory: () => string = () => crypto.randomUUID(),
): ProjectFile {
  const layerId = entityIdFactory();
  const frameId = entityIdFactory();
  const palette = [...DB32_COLORS];
  return {
    version: PROJECT_VERSION,
    name: name || DEFAULT_PROJECT_NAME,
    width,
    height,
    palette,
    paletteEntries: palette.map((color) => ({ id: entityIdFactory(), color })),
    layers: [{
      id: layerId,
      name: 'Layer 1',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 255,
      blendMode: 'normal',
      continuous: false,
      parentId: null,
      data: new Uint8Array(0),
    }],
    frames: [{
      id: frameId,
      duration: 100,
      cels: [{
        id: entityIdFactory(),
        layerId,
        data: new Uint8Array(0),
        opacity: 100,
      }],
    }],
    animation: { fps: 12, currentFrameIndex: 0 },
    tags: [],
  };
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  reason: string,
): void {
  if (!hasOnlyKeys(value, allowedKeys)) {
    throw adapterError('invalid_request', false, { reason });
  }
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

function validateRasterTargetLength(target: ProjectTarget): void {
  if (target.projectId.length > RASTER_GRID_MAX_STRING_LENGTH) {
    throw adapterError('limit_exceeded', false, {
      reason: 'target',
      max: RASTER_GRID_MAX_STRING_LENGTH,
    });
  }
}

function normalizeRenderRequest(input: unknown): ProjectRequestInput & { readonly frameId: string } {
  if (!isRecord(input)) throw adapterError('invalid_request', false, { reason: 'request' });
  assertExactKeys(input, ['operation', 'target', 'expectedRevision', 'revision', 'frameId'], 'render_compatibility');
  if (input.operation !== undefined && input.operation !== 'project.render.observe') {
    throw adapterError('invalid_request', false, { reason: 'operation' });
  }
  const frameId = input.frameId;
  if (typeof frameId !== 'string' || frameId.length === 0) {
    throw adapterError('invalid_request', false, { reason: 'frame_id' });
  }
  return {
    ...normalizeProjectRequest(input),
    frameId,
  };
}

// fallow-ignore-next-line complexity -- The adapter keeps legacy and explicit request validation at one public boundary.
function normalizeRenderObservationRequest(input: unknown): RenderObservationRequest {
  if (!isRecord(input)) throw adapterError('invalid_request', false, { reason: 'request' });
  assertExactKeys(input, [
    'operation',
    'target',
    'expectedRevision',
    'revision',
    'frameId',
    'source',
    'region',
    'background',
    'scale',
    'expectedDigest',
  ], 'render_request');
  if (input.operation !== undefined && input.operation !== 'project.render.observe') {
    throw adapterError('invalid_request', false, { reason: 'operation' });
  }

  const target = normalizeTarget(input.target);
  const expectedRevision = normalizeRevision(input.expectedRevision ?? input.revision);
  const hasExplicitShape = input.source !== undefined
    || input.region !== undefined
    || input.background !== undefined
    || input.scale !== undefined
    || input.expectedDigest !== undefined;
  if (!hasExplicitShape) {
    if (typeof input.frameId !== 'string' || input.frameId.length === 0) {
      throw adapterError('invalid_request', false, { reason: 'frame_id' });
    }
    return {
      target,
      expectedRevision,
      source: { kind: 'composite', frameId: normalizeRenderIdentity(input.frameId, 'frame_id') },
      background: { kind: 'transparent' },
      scale: RENDER_OBSERVATION_MIN_SCALE,
      expectedDigest: null,
    };
  }

  if (input.frameId !== undefined) {
    throw adapterError('invalid_request', false, { reason: 'source' });
  }
  if (input.source === undefined || input.background === undefined
      || input.scale === undefined || input.expectedDigest === undefined) {
    throw adapterError('invalid_request', false, { reason: 'render_fields' });
  }
  return {
    target,
    expectedRevision,
    source: normalizeRenderSource(input.source),
    ...(input.region === undefined ? {} : { region: normalizeRenderRegion(input.region) }),
    background: normalizeRenderBackground(input.background),
    scale: normalizeRenderScale(input.scale),
    expectedDigest: normalizeRenderDigest(input.expectedDigest),
  };
}

function normalizeRenderSource(value: unknown): RenderObservationRequest['source'] {
  if (!isRecord(value)) throw adapterError('invalid_request', false, { reason: 'source' });
  if (value.kind === 'composite') {
    assertExactKeys(value, ['kind', 'frameId'], 'composite_source');
    return { kind: 'composite', frameId: normalizeRenderIdentity(value.frameId, 'frame_id') };
  }
  if (value.kind === 'layer') {
    assertExactKeys(value, ['kind', 'layerId', 'frameId', 'celId'], 'layer_source');
    return {
      kind: 'layer',
      layerId: normalizeRenderIdentity(value.layerId, 'layer_id'),
      frameId: normalizeRenderIdentity(value.frameId, 'frame_id'),
      ...(value.celId === undefined ? {} : { celId: normalizeRenderIdentity(value.celId, 'cel_id') }),
    };
  }
  throw adapterError('invalid_request', false, { reason: 'source_kind' });
}

function normalizeRenderRegion(value: unknown): NonNullable<RenderObservationRequest['region']> {
  if (!isRecord(value)) throw adapterError('invalid_request', false, { reason: 'region' });
  assertExactKeys(value, ['x', 'y', 'width', 'height'], 'region');
  const x = normalizeRenderInteger(value.x, 'region_x');
  const y = normalizeRenderInteger(value.y, 'region_y');
  const width = normalizeRenderInteger(value.width, 'region_width');
  const height = normalizeRenderInteger(value.height, 'region_height');
  if (width < 1 || height < 1) {
    throw adapterError('bounds_exceeded', false, { reason: 'region_extent', min: 1 });
  }
  return { x, y, width, height };
}

function normalizeRenderBackground(value: unknown): RenderObservationRequest['background'] {
  if (!isRecord(value)) throw adapterError('invalid_request', false, { reason: 'background' });
  if (value.kind === 'transparent') {
    assertExactKeys(value, ['kind'], 'transparent_background');
    return { kind: 'transparent' };
  }
  if (value.kind === 'solid') {
    assertExactKeys(value, ['kind', 'color'], 'solid_background');
    if (typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color)) {
      throw adapterError('invalid_request', false, { reason: 'background_color' });
    }
    return { kind: 'solid', color: value.color.toLowerCase() };
  }
  throw adapterError('unsupported', false, { reason: 'background_kind' });
}

function normalizeRenderScale(value: unknown): number {
  if (!Number.isSafeInteger(value)
      || (value as number) < RENDER_OBSERVATION_MIN_SCALE
      || (value as number) > RENDER_OBSERVATION_MAX_SCALE) {
    throw adapterError('bounds_exceeded', false, {
      reason: 'scale',
      min: RENDER_OBSERVATION_MIN_SCALE,
      max: RENDER_OBSERVATION_MAX_SCALE,
    });
  }
  return value as number;
}

function normalizeRenderDigest(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw adapterError('invalid_request', false, { reason: 'digest' });
  }
  return value;
}

function normalizeRenderIdentity(value: unknown, reason: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw adapterError('invalid_request', false, { reason });
  }
  if (value.length > 256) throw adapterError('limit_exceeded', false, { reason, max: 256 });
  return value;
}

function normalizeRenderInteger(value: unknown, reason: string): number {
  if (!Number.isSafeInteger(value)) throw adapterError('invalid_request', false, { reason });
  return value as number;
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
  assertExactKeys(value, ['projectId'], 'target');
  return { projectId: normalizeRenderIdentity(value.projectId, 'target') };
}

function normalizeRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
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
  value: RenderObservationResult | LegacyRenderObservation,
): value is Extract<RenderObservationResult, { readonly ok: false }> {
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
