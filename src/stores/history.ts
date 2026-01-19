import { signal, computed } from '../core/signal';
import { userStore } from './user';
import { persistenceService } from '../services/persistence/indexed-db';
import { projectStore } from './project';
import { paletteStore } from './palette';
import { modeStore } from './mode';

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

interface HistoryContext {
  undoStack: Command[];
  redoStack: Command[];
  memoryUsage: number;
}

/**
 * HistoryStore - Manages undo/redo with mode-specific history stacks
 *
 * Story 3-6: Tilemap Undo/Redo Integration (Task 3)
 *
 * Key architecture:
 * - Separate history stacks for Art and Map modes (ARCH-9)
 * - Cmd+Z only undoes operations from the current mode
 * - Prevents UX disaster of undoing invisible operations
 * - Backward compatible: existing undoStack/redoStack are aliases for art stacks
 */
class HistoryStore {
  // Art mode history stacks (Story 3-6 Task 3.1)
  artUndoStack = signal<Command[]>([]);
  artRedoStack = signal<Command[]>([]);

  // Map mode history stacks (Story 3-6 Task 3.2)
  mapUndoStack = signal<Command[]>([]);
  mapRedoStack = signal<Command[]>([]);

  // Backward compatibility aliases (Story 3-6 Task 3.8)
  // Point to art stacks for existing code that uses these directly
  get undoStack() {
    return this.artUndoStack;
  }
  get redoStack() {
    return this.artRedoStack;
  }

  // Computed signals for UI - mode-aware (Story 3-6 Task 3.7)
  canUndo = computed(() => {
    const { undoStack } = this.getActiveStacks();
    return undoStack.value.length > 0;
  });

  canRedo = computed(() => {
    const { redoStack } = this.getActiveStacks();
    return redoStack.value.length > 0;
  });

  // Version signal - increments on undo/redo to trigger canvas re-render
  version = signal<number>(0);

  // Track total memory usage across both mode stacks (Story 3-6 Task 3.9)
  private memoryUsage = 0;

  // Context stack for isolated editing modes (e.g., brush editing)
  private contextStack: HistoryContext[] = [];

  // Auto-save state
  private isDirty = false;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
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
   * Get the active undo/redo stacks based on current mode (Story 3-6 Task 3.3)
   */
  private getActiveStacks() {
    const mode = modeStore.mode.value;
    if (mode === 'map') {
      return {
        undoStack: this.mapUndoStack,
        redoStack: this.mapRedoStack,
      };
    }
    return {
      undoStack: this.artUndoStack,
      redoStack: this.artRedoStack,
    };
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

  /**
   * Execute a command and add to the appropriate mode stack (Story 3-6 Task 3.4)
   */
  async execute(command: Command) {
    // Auto-stamp with userId if not provided
    if (!command.userId) {
      command.userId = userStore.getCurrentUserId();
    }
    if (!command.timestamp) {
      command.timestamp = Date.now();
    }

    await command.execute();

    // Get mode-appropriate stack and push command
    const { undoStack, redoStack } = this.getActiveStacks();
    undoStack.value = [...undoStack.value, command];
    redoStack.value = []; // Clear redo stack on new action

    // Update memory tracking
    if (command.memorySize) {
      this.memoryUsage += command.memorySize;
    }

    // Enforce limits
    this.enforceHistoryLimits();
    this.version.value++;
    this.scheduleAutoSave();

    // Update palette usage indicators
    paletteStore.refreshUsedColors();
  }

  /**
   * Add a command to history WITHOUT executing it (Story 3-6)
   * Used by tools that apply changes visually during stroke and create command on mouseUp.
   * The command has already been "executed" visually, so we just add it to history.
   */
  addWithoutExecuting(command: Command) {
    // Auto-stamp with userId if not provided
    if (!command.userId) {
      command.userId = userStore.getCurrentUserId();
    }
    if (!command.timestamp) {
      command.timestamp = Date.now();
    }

    // Get mode-appropriate stack and push command
    const { undoStack, redoStack } = this.getActiveStacks();
    undoStack.value = [...undoStack.value, command];
    redoStack.value = []; // Clear redo stack on new action

    // Update memory tracking
    if (command.memorySize) {
      this.memoryUsage += command.memorySize;
    }

    // Enforce limits
    this.enforceHistoryLimits();
    this.version.value++;
    this.scheduleAutoSave();
  }

  /**
   * Enforce history limits by removing oldest commands when necessary.
   * Applied to the current mode's stacks (both undo and redo).
   *
   * Strategy:
   * 1. If over memory limit, first clear redo stack (expendable)
   * 2. Then prune oldest from undo stack if still over limits
   */
  private enforceHistoryLimits() {
    const { undoStack, redoStack } = this.getActiveStacks();
    let undoStackCopy = [...undoStack.value];
    let redoStackCopy = [...redoStack.value];

    // Count limit applies to undo stack only (redo is temporary)
    while (undoStackCopy.length > MAX_HISTORY_COUNT) {
      const removed = undoStackCopy.shift();
      if (removed?.memorySize) {
        this.memoryUsage -= removed.memorySize;
      }
    }

    // Memory limit: first prune redo stack (expendable), then undo stack
    while (this.memoryUsage > MAX_HISTORY_SIZE_BYTES && redoStackCopy.length > 0) {
      const removed = redoStackCopy.shift(); // Remove oldest redo (furthest from current state)
      if (removed?.memorySize) {
        this.memoryUsage -= removed.memorySize;
      }
    }

    // If still over memory limit, prune undo stack
    while (this.memoryUsage > MAX_HISTORY_SIZE_BYTES && undoStackCopy.length > 1) {
      const removed = undoStackCopy.shift();
      if (removed?.memorySize) {
        this.memoryUsage -= removed.memorySize;
      }
    }

    undoStack.value = undoStackCopy;
    redoStack.value = redoStackCopy;
  }

  /**
   * Get current memory usage for debugging/UI.
   * Tracks memory from both mode stacks (Story 3-6 Task 3.9)
   */
  getMemoryUsage(): number {
    return this.memoryUsage;
  }

  /**
   * Undo the last command in the current mode's stack (Story 3-6 Task 3.5)
   */
  async undo() {
    const targetUserId = userStore.getCurrentUserId();
    const { undoStack, redoStack } = this.getActiveStacks();
    const undoStackValue = undoStack.value;

    // Find last command for this user
    let commandIndex = -1;
    for (let i = undoStackValue.length - 1; i >= 0; i--) {
      const cmd = undoStackValue[i];
      // Commands without userId are treated as belonging to any user (backward compat)
      if (!cmd.userId || cmd.userId === targetUserId) {
        commandIndex = i;
        break;
      }
    }

    if (commandIndex === -1) return;

    const command = undoStackValue[commandIndex];
    await command.undo();

    // Remove from undo stack
    const newUndoStack = [...undoStackValue];
    newUndoStack.splice(commandIndex, 1);
    undoStack.value = newUndoStack;

    // Add to redo stack
    redoStack.value = [...redoStack.value, command];

    this.version.value++;
    this.scheduleAutoSave();

    // Update palette usage indicators
    paletteStore.refreshUsedColors();
  }

  /**
   * Redo the last undone command in the current mode's stack (Story 3-6 Task 3.6)
   */
  async redo() {
    const targetUserId = userStore.getCurrentUserId();
    const { undoStack, redoStack } = this.getActiveStacks();
    const redoStackValue = redoStack.value;

    // Find last undone command for this user
    let commandIndex = -1;
    for (let i = redoStackValue.length - 1; i >= 0; i--) {
      const cmd = redoStackValue[i];
      if (!cmd.userId || cmd.userId === targetUserId) {
        commandIndex = i;
        break;
      }
    }

    if (commandIndex === -1) return;

    const command = redoStackValue[commandIndex];
    await command.execute();

    // Remove from redo stack
    const newRedoStack = [...redoStackValue];
    newRedoStack.splice(commandIndex, 1);
    redoStack.value = newRedoStack;

    // Add back to undo stack
    undoStack.value = [...undoStack.value, command];

    this.version.value++;
    this.scheduleAutoSave();

    // Update palette usage indicators
    paletteStore.refreshUsedColors();
  }

  /**
   * Clear all history stacks (both modes)
   */
  clear() {
    this.artUndoStack.value = [];
    this.artRedoStack.value = [];
    this.mapUndoStack.value = [];
    this.mapRedoStack.value = [];
    this.memoryUsage = 0;
    this.version.value++;
  }

  /**
   * Push current history context onto the stack and start fresh.
   * Used for isolated editing modes like brush editing.
   * Note: This operates on the current mode's stacks.
   */
  pushContext() {
    const { undoStack, redoStack } = this.getActiveStacks();

    // Save current state
    this.contextStack.push({
      undoStack: [...undoStack.value],
      redoStack: [...redoStack.value],
      memoryUsage: this.memoryUsage,
    });

    // Start fresh for current mode
    undoStack.value = [];
    redoStack.value = [];
    this.memoryUsage = 0;
    this.version.value++;
  }

  /**
   * Pop and restore the previous history context.
   * Discards the current context (any isolated edits are lost).
   */
  popContext() {
    const context = this.contextStack.pop();
    if (!context) {
      console.warn('No history context to restore');
      return;
    }

    const { undoStack, redoStack } = this.getActiveStacks();

    // Restore previous state
    undoStack.value = context.undoStack;
    redoStack.value = context.redoStack;
    this.memoryUsage = context.memoryUsage;
    this.version.value++;
  }

  /**
   * Check if currently in a nested context.
   */
  isInContext(): boolean {
    return this.contextStack.length > 0;
  }
}

export const historyStore = new HistoryStore();
