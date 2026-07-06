import { effect } from '../core/signal';
import { historyStore } from '../stores/history';
import { projectStore } from '../stores/project';
import { persistenceService } from './persistence/indexed-db';

const AUTO_SAVE_DEBOUNCE_MS = 2000;

/**
 * Persists the current project to IndexedDB whenever the edit history
 * changes (debounced), and immediately when the window loses focus.
 *
 * Lives outside HistoryStore on purpose: history tracks commands, it should
 * not know how (or where) projects are persisted. This service observes
 * `historyStore.version` instead, which bumps on every execute/undo/redo.
 */
export class AutoSaveService {
  private isDirty = false;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private dispose: (() => void) | null = null;

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
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    void this.performSave();
  };

  private onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.flushIfDirty();
    }
  };

  private async performSave() {
    if (!this.isDirty) return;

    try {
      const projectData = await projectStore.saveProject();
      await persistenceService.saveCurrentProject(projectData);
      this.isDirty = false;
      projectStore.lastSaved.value = Date.now();
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }
}

export const autoSaveService = new AutoSaveService();
