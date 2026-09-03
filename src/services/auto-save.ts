import { effect, signal } from '../core/signal';
import type {
  ProjectSaveFailureCategory,
  ProjectSaveSafetyObservation,
  ProjectSaveSafetyState,
  ProjectSaveSafetyStatus,
} from '../editor/contracts';
import { defaultProjectContext, type ProjectContext } from '../stores/project-context';
import { projectRepository } from './persistence/indexed-db';
import type { ProjectRepository } from './persistence/project-repository';
import { createProjectThumbnail } from './project-thumbnail';
import { compositeFrame } from '../utils/canvas-utils';
import { productTelemetry } from './telemetry';

const AUTO_SAVE_DEBOUNCE_MS = 2000;

interface AutoSaveContextState {
  isDirty: boolean;
  changeRevision: number;
  persistedChangeRevision: number;
  persistedProjectRevision: number;
  lifecycleGeneration: number;
  targetId: string;
  status: ProjectSaveSafetyStatus;
  failure: ProjectSaveSafetyState['failure'];
  saveTimeout: ReturnType<typeof setTimeout> | null;
  saveQueue: Promise<void>;
  dispose: (() => void) | null;
  suppressSaveCount: number;
  inFlight: {
    changeRevision: number;
    projectRevision: number;
    projectId: string;
    generation: number;
  } | null;
}

const SAVE_FAILURE_MESSAGES: Record<ProjectSaveFailureCategory, string> = {
  storage_unavailable: 'storage unavailable',
  quota_exceeded: 'quota exceeded',
  serialization_failed: 'serialization failed',
  write_failed: 'write failed',
  internal: 'internal save failure',
};

/** A public save rejection contains only the stable category. */
export class ProjectSaveError extends Error {
  readonly category: ProjectSaveFailureCategory;
  // fallow-ignore-next-line unused-class-member -- Public retry guidance is part of the bounded error contract.
  readonly action = 'retry_latest' as const;

  constructor(category: ProjectSaveFailureCategory) {
    super(`Project save failed: ${SAVE_FAILURE_MESSAGES[category]}.`);
    this.name = 'ProjectSaveError';
    this.category = category;
  }
}

/**
 * Persists the current project to IndexedDB whenever the edit history
 * changes (debounced), and immediately when the window loses focus.
 *
 * Lives outside HistoryStore on purpose: history tracks commands, it should
 * not know how (or where) projects are persisted. This service observes
 * `historyStore.version` instead, which bumps on every execute/undo/redo.
 */
export interface AutoSaveServiceDependencies {
  readonly repository?: ProjectRepository;
}

export class AutoSaveService {
  readonly dirtyContexts = signal<ReadonlySet<ProjectContext>>(new Set());
  readonly saveSafetyStates = signal<ReadonlyMap<ProjectContext, ProjectSaveSafetyState>>(
    new Map()
  );

  private contextState = new Map<ProjectContext, AutoSaveContextState>();
  private dirtyContextSet = new Set<ProjectContext>();
  private blockedContexts = new WeakSet<ProjectContext>();
  private hasDocumentListeners = false;
  private readonly repository: ProjectRepository;

  constructor(dependencies: AutoSaveServiceDependencies = {}) {
    this.repository = dependencies.repository ?? projectRepository;
  }

  /** Start observing history changes. Idempotent. */
  start(context: ProjectContext = defaultProjectContext) {
    const state = this.getState(context);
    if (!state.isDirty && !state.inFlight && state.targetId !== context.project.id.value) {
      this.markLoaded(context);
    }
    this.blockedContexts.delete(context);
    if (!state.dispose) {
      let firstRun = true;
      state.dispose = effect(() => {
        // Subscribe to history changes (execute/undo/redo/clear all bump this)
        context.history.version.get();
        if (firstRun) {
          // Don't schedule a save just for booting up
          firstRun = false;
          return;
        }
        const observedGeneration = state.lifecycleGeneration;
        queueMicrotask(() => {
          if (
            this.contextState.get(context) === state
            && state.dispose
            && state.lifecycleGeneration === observedGeneration
          ) {
            this.markDirty(context);
          }
        });
      });
    }

    this.attachDocumentListeners();
    if (state.isDirty && !state.saveTimeout && state.status !== 'failed') {
      this.scheduleSave(context, state);
    }
  }

  /** Stop observing and drop pending saves. */
  stop(context?: ProjectContext) {
    if (context) {
      this.stopContext(context);
    } else {
      for (const activeContext of [...this.contextState.keys()]) {
        this.stopContext(activeContext);
      }
    }

    if (!this.hasStartedContexts()) {
      this.detachDocumentListeners();
    }
  }

  /** Mark the project dirty and (re)schedule a debounced save. */
  markDirty(context: ProjectContext = defaultProjectContext) {
    const state = this.getState(context);
    if (state.suppressSaveCount > 0) return;

    state.changeRevision++;
    state.failure = undefined;
    state.status = 'dirty';
    this.updateDirtyState(context, state);

    if (this.blockedContexts.has(context)) return;
    this.scheduleSave(context, state);
  }

  /** Save immediately if there are unsaved changes (blur/tab-hidden). */
  flushIfDirty = () => {
    for (const [context, state] of this.contextState) {
      if (!state.isDirty || state.status === 'failed' || this.blockedContexts.has(context)) continue;
      this.clearSaveTimeout(state);
      void this.performSave(context);
    }
  };

  /** Save the open project now, even if no edit debounce is pending. */
  async saveNow(context: ProjectContext = defaultProjectContext) {
    this.assertSaveAllowed(context);
    const state = this.getState(context);
    this.syncTarget(context, state);
    this.clearSaveTimeout(state);
    await this.performSave(context, { force: true, rethrow: true });
  }

  /** Save again when an edit lands while the previous write is in flight. */
  async saveUntilClean(context: ProjectContext = defaultProjectContext) {
    do {
      await this.saveNow(context);
    } while (this.isDirty(context));
  }

  /** Retry the newest dirty state for this exact project context. */
  async retryLatest(context: ProjectContext = defaultProjectContext) {
    this.assertSaveAllowed(context);
    const state = this.getState(context);
    this.syncTarget(context, state);
    if (!state.isDirty && state.status !== 'failed') return;

    this.clearSaveTimeout(state);
    await this.performSave(context, { rethrow: true });
  }

  /** Mark a context saved after a load or workspace restore. */
  markLoaded(context: ProjectContext = defaultProjectContext) {
    const state = this.getState(context);
    this.invalidatePendingSaves(context, state);
    state.targetId = context.project.id.value;
    state.changeRevision = 0;
    state.persistedChangeRevision = 0;
    state.persistedProjectRevision = context.project.revision.value;
    state.isDirty = false;
    state.status = 'saved';
    state.failure = undefined;
    this.updateDirtyState(context, state);
  }

  /** Block writes while continuing to record edits, then wait for a started write. */
  async pause(context: ProjectContext = defaultProjectContext): Promise<void> {
    this.blockedContexts.add(context);
    const state = this.contextState.get(context);
    if (!state) return;

    this.clearSaveTimeout(state);
    await state.saveQueue;
  }

  isDirty(context: ProjectContext = defaultProjectContext): boolean {
    return this.getState(context).isDirty;
  }

  getSaveSafetyState(context: ProjectContext = defaultProjectContext): ProjectSaveSafetyState {
    const state = this.getState(context);
    this.publishSaveSafetyState(context, state);
    return this.saveSafetyStates.value.get(context) ?? this.createSaveSafetyState(context, state);
  }

  getSaveSafetyObservation(
    context: ProjectContext = defaultProjectContext
  ): ProjectSaveSafetyObservation {
    return this.getSaveSafetyState(context);
  }

  /** Run project load/reset work without treating reset signals as user edits. */
  async runWithoutSaving<T>(
    work: () => Promise<T>,
    context: ProjectContext = defaultProjectContext
  ): Promise<T> {
    const state = this.getState(context);
    this.invalidatePendingSaves(context, state);
    state.suppressSaveCount++;
    let completed = false;
    try {
      const result = await work();
      await Promise.resolve();
      completed = true;
      return result;
    } finally {
      state.suppressSaveCount--;
      if (completed) this.markLoaded(context);
    }
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.flushIfDirty();
    }
  };

  private async performSave(
    context: ProjectContext,
    options: { force?: boolean; rethrow?: boolean } = {}
  ): Promise<void> {
    this.assertSaveAllowed(context);
    const state = this.getState(context);
    this.syncTarget(context, state);
    const hadUnsavedChanges = state.isDirty;
    if (!state.isDirty && !options.force) return;

    if (options.force) {
      // Some direct project mutations do not create history entries. A forced
      // save is itself a request to persist the current state.
      state.changeRevision++;
      this.updateDirtyState(context, state);
      state.failure = undefined;
      state.status = 'dirty';
      this.publishSaveSafetyState(context, state);
    }

    const projectId = context.project.id.value;
    const requestedRevision = state.changeRevision;
    const requestedProjectRevision = context.project.revision.value;
    const requestedGeneration = state.lifecycleGeneration;
    const save = state.saveQueue.then(() =>
      this.writeProject(
        context,
        state,
        projectId,
        requestedRevision,
        requestedProjectRevision,
        requestedGeneration,
        {
          ...options,
          recordMilestone: hadUnsavedChanges,
        }
      )
    );

    // A failed save must not prevent the next queued request from running.
    state.saveQueue = save.catch(() => {});
    await save;
  }

  // fallow-ignore-next-line complexity -- Save sequencing keeps serialization, thumbnail derivation, persistence, and stale-request guards atomic.
  private async writeProject(
    context: ProjectContext,
    state: AutoSaveContextState,
    projectId: string,
    requestedRevision: number,
    requestedProjectRevision: number,
    requestedGeneration: number,
    options: { force?: boolean; rethrow?: boolean; recordMilestone: boolean }
  ): Promise<void> {
    if (
      requestedRevision <= state.persistedChangeRevision
      || requestedGeneration !== state.lifecycleGeneration
      || this.contextState.get(context) !== state
    ) return;

    this.assertSaveAllowed(context);
    const isCurrentRequest = () =>
      requestedGeneration === state.lifecycleGeneration
      && this.contextState.get(context) === state
      && state.targetId === projectId
      && context.project.id.value === projectId
      && state.changeRevision === requestedRevision
      && context.project.revision.value === requestedProjectRevision;

    if (isCurrentRequest()) {
      state.inFlight = {
        changeRevision: requestedRevision,
        projectRevision: requestedProjectRevision,
        projectId,
        generation: requestedGeneration,
      };
      state.status = 'saving';
      this.publishSaveSafetyState(context, state);
    }

    let projectData;
    try {
      projectData = await context.project.saveProject();
    } catch {
      return this.finishFailedSave(
        context,
        state,
        projectId,
        requestedRevision,
        requestedProjectRevision,
        requestedGeneration,
        'serialization_failed',
        options.rethrow
      );
    }

    const thumbnail = await createThumbnailSafely(context);
    this.assertSaveAllowed(context);

    // A context may have been loaded with another project while this request
    // was serializing. The old snapshot must not overwrite the new target.
    if (
      requestedGeneration !== state.lifecycleGeneration
      || this.contextState.get(context) !== state
      || state.targetId !== projectId
    ) {
      return;
    }

    try {
      await this.repository.save(projectId, projectData, {
        thumbnail,
      });
    } catch (error) {
      const category = classifyRepositoryFailure(error);
      return this.finishFailedSave(
        context,
        state,
        projectId,
        requestedRevision,
        requestedProjectRevision,
        requestedGeneration,
        category,
        options.rethrow
      );
    }

    const ownsRequest = this.ownsSaveRequest(
      context,
      state,
      projectId,
      requestedRevision,
      requestedProjectRevision,
      requestedGeneration
    );
    if (!ownsRequest || context.project.id.value !== projectId || state.targetId !== projectId) {
      if (ownsRequest) state.inFlight = null;
      return;
    }

    context.project.lastSaved.value = Date.now();
    state.inFlight = null;
    state.persistedChangeRevision = Math.max(
      state.persistedChangeRevision,
      requestedRevision
    );
    state.persistedProjectRevision = Math.max(
      state.persistedProjectRevision,
      requestedProjectRevision
    );
    this.updateDirtyState(context, state);
    if (state.changeRevision === requestedRevision && context.project.id.value === projectId) {
      state.failure = undefined;
      state.status = state.isDirty ? 'dirty' : 'saved';
      this.publishSaveSafetyState(context, state);
    } else if (state.isDirty) {
      state.status = 'dirty';
      this.publishSaveSafetyState(context, state);
    }

    if (options.recordMilestone) {
      productTelemetry.record({
        name: 'project_saved',
        dimensions: { destination: 'local_library' },
      });
    }
  }

  // fallow-ignore-next-line complexity -- Failure handling must distinguish stale, retargeted, and current requests before publishing state.
  private finishFailedSave(
    context: ProjectContext,
    state: AutoSaveContextState,
    projectId: string,
    requestedRevision: number,
    requestedProjectRevision: number,
    requestedGeneration: number,
    category: ProjectSaveFailureCategory,
    rethrow = false
  ): void {
    const ownsRequest = this.ownsSaveRequest(
      context,
      state,
      projectId,
      requestedRevision,
      requestedProjectRevision,
      requestedGeneration
    );
    if (!ownsRequest) {
      if (rethrow) throw new ProjectSaveError(category);
      return;
    }

    state.inFlight = null;
    if (context.project.id.value !== projectId || state.targetId !== projectId) {
      if (rethrow) throw new ProjectSaveError(category);
      return;
    }

    const isCurrentRequest =
      state.targetId === projectId
      && context.project.id.value === projectId
      && state.changeRevision === requestedRevision
      && context.project.revision.value === requestedProjectRevision;

    if (isCurrentRequest) {
      state.isDirty = true;
      state.failure = { category, action: 'retry_latest' };
      state.status = 'failed';
      this.setDirtyContext(context, true);
      this.publishSaveSafetyState(context, state);
    } else {
      state.failure = undefined;
      state.status = 'dirty';
      this.updateDirtyState(context, state);
    }

    if (rethrow) throw new ProjectSaveError(category);
  }

  private getState(context: ProjectContext): AutoSaveContextState {
    const existingState = this.contextState.get(context);
    if (existingState) return existingState;

    const state: AutoSaveContextState = {
      isDirty: false,
      changeRevision: 0,
      persistedChangeRevision: 0,
      persistedProjectRevision: context.project.revision.value,
      lifecycleGeneration: 0,
      targetId: context.project.id.value,
      status: 'saved',
      failure: undefined,
      saveTimeout: null,
      saveQueue: Promise.resolve(),
      dispose: null,
      suppressSaveCount: 0,
      inFlight: null,
    };
    this.contextState.set(context, state);
    this.publishSaveSafetyState(context, state);
    return state;
  }

  private stopContext(context: ProjectContext) {
    const state = this.contextState.get(context);
    if (!state) return;

    this.invalidatePendingSaves(context, state);
    state.dispose?.();
    state.dispose = null;
    this.clearSaveTimeout(state);
    this.contextState.delete(context);
    this.setDirtyContext(context, false);
    const nextStates = new Map(this.saveSafetyStates.value);
    nextStates.delete(context);
    this.saveSafetyStates.value = nextStates;
  }

  private hasStartedContexts(): boolean {
    for (const state of this.contextState.values()) {
      if (state.dispose) return true;
    }
    return false;
  }

  private attachDocumentListeners() {
    if (this.hasDocumentListeners) return;

    window.addEventListener('blur', this.flushIfDirty);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.hasDocumentListeners = true;
  }

  private detachDocumentListeners() {
    if (!this.hasDocumentListeners) return;

    window.removeEventListener('blur', this.flushIfDirty);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.hasDocumentListeners = false;
  }

  private clearSaveTimeout(state: AutoSaveContextState) {
    if (!state.saveTimeout) return;
    clearTimeout(state.saveTimeout);
    state.saveTimeout = null;
  }

  private ownsSaveRequest(
    context: ProjectContext,
    state: AutoSaveContextState,
    projectId: string,
    requestedRevision: number,
    requestedProjectRevision: number,
    requestedGeneration: number
  ) {
    return state.inFlight?.changeRevision === requestedRevision
      && state.inFlight.projectRevision === requestedProjectRevision
      && state.inFlight.projectId === projectId
      && state.inFlight.generation === requestedGeneration
      && requestedGeneration === state.lifecycleGeneration
      && this.contextState.get(context) === state;
  }

  private invalidatePendingSaves(context: ProjectContext, state: AutoSaveContextState) {
    state.lifecycleGeneration++;
    state.inFlight = null;
    this.clearSaveTimeout(state);
    if (state.status === 'saving') {
      state.status = state.isDirty ? 'dirty' : 'saved';
    }
    this.publishSaveSafetyState(context, state);
  }

  private scheduleSave(context: ProjectContext, state: AutoSaveContextState) {
    this.clearSaveTimeout(state);
    state.saveTimeout = setTimeout(() => {
      state.saveTimeout = null;
      void this.performSave(context);
    }, AUTO_SAVE_DEBOUNCE_MS);
  }

  private assertSaveAllowed(context: ProjectContext) {
    if (this.blockedContexts.has(context)) {
      throw new Error('Auto-save is paused for this project.');
    }
  }

  private setDirtyContext(context: ProjectContext, isDirty: boolean) {
    if (isDirty) {
      if (this.dirtyContextSet.has(context)) return;
      this.dirtyContextSet.add(context);
    } else {
      if (!this.dirtyContextSet.delete(context)) return;
    }

    this.dirtyContexts.value = new Set(this.dirtyContextSet);
  }

  private updateDirtyState(context: ProjectContext, state: AutoSaveContextState) {
    state.isDirty = state.persistedChangeRevision < state.changeRevision;
    this.setDirtyContext(context, state.isDirty);
    if (!state.isDirty && !state.inFlight) {
      state.status = 'saved';
      state.failure = undefined;
    }
    this.publishSaveSafetyState(context, state);
  }

  private syncTarget(context: ProjectContext, state: AutoSaveContextState) {
    if (state.inFlight || state.targetId === context.project.id.value) return;

    state.targetId = context.project.id.value;
    state.changeRevision = 0;
    state.persistedChangeRevision = 0;
    state.persistedProjectRevision = context.project.revision.value;
    state.failure = undefined;
    state.status = state.isDirty ? 'dirty' : 'saved';
    this.updateDirtyState(context, state);
  }

  private createSaveSafetyState(
    context: ProjectContext,
    state: AutoSaveContextState
  ): ProjectSaveSafetyState {
    const failure = state.failure;
    return {
      type: 'project.save-safety',
      target: { projectId: state.targetId || context.project.id.value },
      currentRevision: context.project.revision.value,
      persistedRevision: state.persistedProjectRevision,
      status: state.status,
      ...(failure ? { failure } : {}),
    };
  }

  // fallow-ignore-next-line complexity -- State publication compares every public field to avoid redundant signal notifications.
  private publishSaveSafetyState(context: ProjectContext, state: AutoSaveContextState) {
    const nextState = this.createSaveSafetyState(context, state);
    const previous = this.saveSafetyStates.value.get(context);
    if (
      previous
      && previous.target.projectId === nextState.target.projectId
      && previous.currentRevision === nextState.currentRevision
      && previous.persistedRevision === nextState.persistedRevision
      && previous.status === nextState.status
      && previous.failure?.category === nextState.failure?.category
      && previous.failure?.action === nextState.failure?.action
    ) {
      return;
    }

    const nextStates = new Map(this.saveSafetyStates.value);
    nextStates.set(context, nextState);
    this.saveSafetyStates.value = nextStates;
  }
}

export const autoSaveService = new AutoSaveService();

/** Create an isolated save boundary for deterministic adapter fixtures. */
export function createAutoSaveService(
  dependencies: AutoSaveServiceDependencies = {}
): AutoSaveService {
  return new AutoSaveService(dependencies);
}

async function createThumbnailSafely(context: ProjectContext): Promise<Uint8Array | undefined> {
  const frame = context.animation.frames.value[0];
  if (!frame) return undefined;

  try {
    return await createProjectThumbnail({
      compositeFrame: (frameId, targetCtx) => compositeFrame(frameId, targetCtx, { context }),
      frameId: frame.id,
      width: context.project.width.value,
      height: context.project.height.value,
    });
  } catch {
    return undefined;
  }
}

// fallow-ignore-next-line complexity -- IndexedDB surfaces several stable browser failure names and messages that map to one public category.
function classifyRepositoryFailure(error: unknown): ProjectSaveFailureCategory {
  const name = typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name
    : getErrorName(error);
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (
    name === 'QuotaExceededError'
    || name === 'QuotaError'
    || message.includes('quota')
    || message.includes('storage full')
  ) {
    return 'quota_exceeded';
  }

  if (
    name === 'InvalidStateError'
    || name === 'NotFoundError'
    || name === 'TransactionInactiveError'
    || name === 'AbortError'
    || message.includes('indexeddb')
    || message.includes('storage unavailable')
    || message.includes('database unavailable')
  ) {
    return 'storage_unavailable';
  }

  if (name === 'UnknownError' || name === 'InternalError') return 'internal';
  return 'write_failed';
}

function getErrorName(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}
