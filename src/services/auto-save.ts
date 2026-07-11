import { effect, signal } from '../core/signal';
import { defaultProjectContext, type ProjectContext } from '../stores/project-context';
import { projectRepository } from './persistence/indexed-db';
import { createProjectThumbnail } from './project-thumbnail';
import { log } from '../utils/log';
import { compositeFrame } from '../utils/canvas-utils';

const AUTO_SAVE_DEBOUNCE_MS = 2000;

interface AutoSaveContextState {
  isDirty: boolean;
  changeRevision: number;
  persistedRevision: number;
  saveTimeout: ReturnType<typeof setTimeout> | null;
  saveQueue: Promise<void>;
  dispose: (() => void) | null;
  suppressSaveCount: number;
}

/**
 * Persists the current project to IndexedDB whenever the edit history
 * changes (debounced), and immediately when the window loses focus.
 *
 * Lives outside HistoryStore on purpose: history tracks commands, it should
 * not know how (or where) projects are persisted. This service observes
 * `historyStore.version` instead, which bumps on every execute/undo/redo.
 */
class AutoSaveService {
  readonly dirtyContexts = signal<ReadonlySet<ProjectContext>>(new Set());

  private contextState = new Map<ProjectContext, AutoSaveContextState>();
  private dirtyContextSet = new Set<ProjectContext>();
  private hasDocumentListeners = false;

  /** Start observing history changes. Idempotent. */
  start(context: ProjectContext = defaultProjectContext) {
    const state = this.getState(context);
    if (state.dispose) return;

    let firstRun = true;
    state.dispose = effect(() => {
      // Subscribe to history changes (execute/undo/redo/clear all bump this)
      context.history.version.get();
      if (firstRun) {
        // Don't schedule a save just for booting up
        firstRun = false;
        return;
      }
      this.markDirty(context);
    });

    this.attachDocumentListeners();
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
    this.updateDirtyState(context, state);

    this.clearSaveTimeout(state);
    state.saveTimeout = setTimeout(() => {
      state.saveTimeout = null;
      void this.performSave(context);
    }, AUTO_SAVE_DEBOUNCE_MS);
  }

  /** Save immediately if there are unsaved changes (blur/tab-hidden). */
  flushIfDirty = () => {
    for (const [context, state] of this.contextState) {
      if (!state.isDirty) continue;
      this.clearSaveTimeout(state);
      void this.performSave(context);
    }
  };

  /** Save the open project now, even if no edit debounce is pending. */
  async saveNow(context: ProjectContext = defaultProjectContext) {
    const state = this.getState(context);
    this.clearSaveTimeout(state);
    await this.performSave(context, { force: true, rethrow: true });
  }

  isDirty(context: ProjectContext = defaultProjectContext): boolean {
    return this.dirtyContexts.value.has(context);
  }

  /**
   * Drop queued work and wait for a write that has already started.
   * Deletion can then run after every older write that could recreate the record.
   */
  async clearPendingSave(context: ProjectContext = defaultProjectContext): Promise<void> {
    const state = this.getState(context);
    this.clearSaveTimeout(state);
    state.persistedRevision = state.changeRevision;
    this.updateDirtyState(context, state);
    await state.saveQueue;
  }

  /** Run project load/reset work without treating reset signals as user edits. */
  async runWithoutSaving<T>(
    work: () => Promise<T>,
    context: ProjectContext = defaultProjectContext
  ): Promise<T> {
    const state = this.getState(context);
    state.suppressSaveCount++;
    try {
      const result = await work();
      await Promise.resolve();
      return result;
    } finally {
      state.suppressSaveCount--;
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
    const state = this.getState(context);
    if (!state.isDirty && !options.force) return;

    if (options.force) {
      // Some direct project mutations do not create history entries. A forced
      // save is itself a request to persist the current state.
      state.changeRevision++;
      this.updateDirtyState(context, state);
    }

    const projectId = context.project.id.value;
    const requestedRevision = state.changeRevision;
    const save = state.saveQueue.then(() =>
      this.writeProject(context, state, projectId, requestedRevision, options)
    );

    // A failed save must not prevent the next queued request from running.
    state.saveQueue = save.catch(() => {});
    await save;
  }

  private async writeProject(
    context: ProjectContext,
    state: AutoSaveContextState,
    projectId: string,
    requestedRevision: number,
    options: { force?: boolean; rethrow?: boolean }
  ): Promise<void> {
    if (requestedRevision <= state.persistedRevision) return;

    try {
      const projectData = await context.project.saveProject();
      const thumbnail = await createThumbnailSafely(context);
      await projectRepository.save(projectId, projectData, {
        thumbnail,
      });
      if (context.project.id.value === projectId) {
        context.project.lastSaved.value = Date.now();
      }
      state.persistedRevision = Math.max(state.persistedRevision, requestedRevision);
      this.updateDirtyState(context, state);
    } catch (error) {
      this.updateDirtyState(context, state);
      log.error('Auto-save failed:', error);
      if (options.rethrow) throw error;
    }
  }

  private getState(context: ProjectContext): AutoSaveContextState {
    const existingState = this.contextState.get(context);
    if (existingState) return existingState;

    const state: AutoSaveContextState = {
      isDirty: false,
      changeRevision: 0,
      persistedRevision: 0,
      saveTimeout: null,
      saveQueue: Promise.resolve(),
      dispose: null,
      suppressSaveCount: 0,
    };
    this.contextState.set(context, state);
    return state;
  }

  private stopContext(context: ProjectContext) {
    const state = this.contextState.get(context);
    if (!state) return;

    state.dispose?.();
    state.dispose = null;
    this.clearSaveTimeout(state);
    this.contextState.delete(context);
    this.setDirtyContext(context, false);
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
    state.isDirty = state.persistedRevision < state.changeRevision;
    this.setDirtyContext(context, state.isDirty);
  }
}

export const autoSaveService = new AutoSaveService();

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
  } catch (error) {
    log.error('Thumbnail generation failed:', error);
    return undefined;
  }
}
