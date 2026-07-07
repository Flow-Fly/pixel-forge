import { effect } from '../core/signal';
import { animationStore } from '../stores/animation';
import { historyStore } from '../stores/history';
import { projectStore } from '../stores/project';
import { projectRepository } from './persistence/indexed-db';
import { createProjectThumbnail } from './project-thumbnail';
import { log } from '../utils/log';

const AUTO_SAVE_DEBOUNCE_MS = 2000;

/**
 * Persists the current project to IndexedDB whenever the edit history
 * changes (debounced), and immediately when the window loses focus.
 *
 * Lives outside HistoryStore on purpose: history tracks commands, it should
 * not know how (or where) projects are persisted. This service observes
 * `historyStore.version` instead, which bumps on every execute/undo/redo.
 */
class AutoSaveService {
  private isDirty = false;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private dispose: (() => void) | null = null;
  private suppressSaveCount = 0;

  /** Start observing history changes. Idempotent. */
  start() {
    if (this.dispose) return;

    let firstRun = true;
    this.dispose = effect(() => {
      // Subscribe to history changes (execute/undo/redo/clear all bump this)
      historyStore.version.get();
      if (firstRun) {
        // Don't schedule a save just for booting up
        firstRun = false;
        return;
      }
      this.markDirty();
    });

    window.addEventListener('blur', this.flushIfDirty);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Stop observing and drop any pending save. */
  stop() {
    this.dispose?.();
    this.dispose = null;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    window.removeEventListener('blur', this.flushIfDirty);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Mark the project dirty and (re)schedule a debounced save. */
  markDirty() {
    if (this.suppressSaveCount > 0) return;

    this.isDirty = true;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      void this.performSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
  }

  /** Save immediately if there are unsaved changes (blur/tab-hidden). */
  flushIfDirty = () => {
    if (!this.isDirty) return;
    this.clearSaveTimeout();
    void this.performSave();
  };

  /** Save the open project now, even if no edit debounce is pending. */
  async saveNow() {
    this.clearSaveTimeout();
    await this.performSave({ force: true, rethrow: true });
  }

  /** Drop a pending debounce without writing. Used when the open project is deleted. */
  clearPendingSave() {
    this.clearSaveTimeout();
    this.isDirty = false;
  }

  /** Run project load/reset work without treating reset signals as user edits. */
  async runWithoutSaving<T>(work: () => Promise<T>): Promise<T> {
    this.suppressSaveCount++;
    try {
      const result = await work();
      await Promise.resolve();
      return result;
    } finally {
      this.suppressSaveCount--;
    }
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.flushIfDirty();
    }
  };

  private async performSave(
    options: { force?: boolean; rethrow?: boolean } = {}
  ) {
    if (!this.isDirty && !options.force) return;

    try {
      const projectData = await projectStore.saveProject();
      const thumbnail = await createThumbnailSafely();
      await projectRepository.save(projectStore.id.value, projectData, {
        thumbnail,
      });
      this.isDirty = false;
      projectStore.lastSaved.value = Date.now();
    } catch (error) {
      log.error('Auto-save failed:', error);
      if (options.rethrow) throw error;
    }
  }

  private clearSaveTimeout() {
    if (!this.saveTimeout) return;
    clearTimeout(this.saveTimeout);
    this.saveTimeout = null;
  }
}

export const autoSaveService = new AutoSaveService();

async function createThumbnailSafely(): Promise<Uint8Array | undefined> {
  const frame = animationStore.frames.value[0];
  if (!frame) return undefined;

  try {
    return await createProjectThumbnail({
      frameId: frame.id,
      width: projectStore.width.value,
      height: projectStore.height.value,
    });
  } catch (error) {
    log.error('Thumbnail generation failed:', error);
    return undefined;
  }
}
