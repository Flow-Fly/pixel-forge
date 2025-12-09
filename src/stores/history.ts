import { signal } from '../core/signal';
import { userStore } from './user';
import { persistenceService } from '../services/persistence/indexed-db';
import { projectStore } from './project';

// Configuration constants for history limits
const MAX_HISTORY_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_HISTORY_COUNT = 100;
const AUTO_SAVE_DEBOUNCE_MS = 2000;

export interface Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  memorySize?: number; // Optional for backwards compatibility
  execute(): void | Promise<void>;
  undo(): void | Promise<void>;
}

class HistoryStore {
  undoStack = signal<Command[]>([]);
  redoStack = signal<Command[]>([]);

  // Computed signals for UI
  canUndo = signal<boolean>(false);
  canRedo = signal<boolean>(false);

  // Version signal - increments on undo/redo to trigger canvas re-render
  version = signal<number>(0);

  // Track total memory usage
  private memoryUsage = 0;

  // Auto-save state
  private isDirty = false;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Update computed signals when stacks change
    // Since we don't have true computed signals in our simple implementation yet,
    // we'll update them manually in the methods.

    // Set up blur listener for immediate save
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', () => this.saveOnBlur());
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.saveOnBlur();
        }
      });
    }
  }

  /**
   * Schedule a debounced auto-save.
   */
  private scheduleAutoSave() {
    this.isDirty = true;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.performAutoSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
  }

  /**
   * Perform the actual save to IndexedDB.
   */
  private async performAutoSave() {
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

  /**
   * Save immediately on blur/visibility change if dirty.
   */
  private saveOnBlur() {
    if (this.isDirty) {
      // Cancel pending debounced save
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
      this.performAutoSave();
    }
  }

  async execute(command: Command) {
    // Auto-stamp with userId if not provided
    if (!command.userId) {
      command.userId = userStore.getCurrentUserId();
    }
    if (!command.timestamp) {
      command.timestamp = Date.now();
    }

    await command.execute();

    this.undoStack.value = [...this.undoStack.value, command];
    this.redoStack.value = []; // Clear redo stack on new action

    // Update memory tracking
    if (command.memorySize) {
      this.memoryUsage += command.memorySize;
    }

    // Enforce limits
    this.enforceHistoryLimits();
    this.updateComputed();
    this.scheduleAutoSave();
  }

  /**
   * Enforce history limits by removing oldest commands when necessary.
   */
  private enforceHistoryLimits() {
    let stack = [...this.undoStack.value];

    // Remove oldest commands if over count limit
    while (stack.length > MAX_HISTORY_COUNT) {
      const removed = stack.shift();
      if (removed?.memorySize) {
        this.memoryUsage -= removed.memorySize;
      }
    }

    // Remove oldest commands if over memory limit
    while (this.memoryUsage > MAX_HISTORY_SIZE_BYTES && stack.length > 1) {
      const removed = stack.shift();
      if (removed?.memorySize) {
        this.memoryUsage -= removed.memorySize;
      }
    }

    this.undoStack.value = stack;
  }

  /**
   * Get current memory usage for debugging/UI.
   */
  getMemoryUsage(): number {
    return this.memoryUsage;
  }

  async undo() {
    const targetUserId = userStore.getCurrentUserId();
    const undoStack = this.undoStack.value;

    // Find last command for this user
    let commandIndex = -1;
    for (let i = undoStack.length - 1; i >= 0; i--) {
      const cmd = undoStack[i];
      // Commands without userId are treated as belonging to any user (backward compat)
      if (!cmd.userId || cmd.userId === targetUserId) {
        commandIndex = i;
        break;
      }
    }

    if (commandIndex === -1) return;

    const command = undoStack[commandIndex];
    await command.undo();

    // Remove from undo stack
    const newUndoStack = [...undoStack];
    newUndoStack.splice(commandIndex, 1);
    this.undoStack.value = newUndoStack;

    // Add to redo stack
    this.redoStack.value = [...this.redoStack.value, command];

    this.updateComputed();
    this.scheduleAutoSave();
  }

  async redo() {
    const targetUserId = userStore.getCurrentUserId();
    const redoStack = this.redoStack.value;

    // Find last undone command for this user
    let commandIndex = -1;
    for (let i = redoStack.length - 1; i >= 0; i--) {
      const cmd = redoStack[i];
      if (!cmd.userId || cmd.userId === targetUserId) {
        commandIndex = i;
        break;
      }
    }

    if (commandIndex === -1) return;

    const command = redoStack[commandIndex];
    await command.execute();

    // Remove from redo stack
    const newRedoStack = [...redoStack];
    newRedoStack.splice(commandIndex, 1);
    this.redoStack.value = newRedoStack;

    // Add back to undo stack
    this.undoStack.value = [...this.undoStack.value, command];

    this.updateComputed();
    this.scheduleAutoSave();
  }

  private updateComputed() {
    this.canUndo.value = this.undoStack.value.length > 0;
    this.canRedo.value = this.redoStack.value.length > 0;
    this.version.value++;
  }
  
  clear() {
    this.undoStack.value = [];
    this.redoStack.value = [];
    this.updateComputed();
  }
}

export const historyStore = new HistoryStore();
