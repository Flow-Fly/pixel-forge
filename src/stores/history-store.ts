import { signal } from '../core/signal';
import { userStore } from './user';
import { log } from '../utils/log';
import type { createPaletteStore } from './palette/store';
import type { AutomationTransactionProvenance } from '../editor/contracts';

// Configuration constants for history limits
const MAX_HISTORY_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_HISTORY_COUNT = 100;

export interface Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  memorySize?: number; // Optional for backwards compatibility
  /** Canvas Size owns its compact project-change event and revision. */
  managesProjectRevision?: boolean;
  /** Bounded automation identity retained with the conventional history entry. */
  provenance?: AutomationTransactionProvenance;
  /** Finalize a prepared transition after history bookkeeping succeeds. */
  commitTransition?(): void | Promise<void>;
  /** Restore a prepared transition when history bookkeeping fails. */
  rollbackTransition?(): void | Promise<void>;
  execute(): void | Promise<void>;
  undo(): void | Promise<void>;
}

type HistoryTransitionPhase = 'execute' | 'undo' | 'redo';

interface HistoryTransition {
  phase: HistoryTransitionPhase;
  command: Command;
}

type HistoryTransitionHandler = (transition: HistoryTransition) => void;

interface HistoryContext {
  undoStack: Command[];
  redoStack: Command[];
  memoryUsage: number;
}

interface HistoryStateSnapshot extends HistoryContext {
  canUndo: boolean;
  canRedo: boolean;
  version: number;
}

type HistoryPaletteStore = ReturnType<typeof createPaletteStore>;

export interface HistoryStoreDependencies {
  palette: HistoryPaletteStore;
  onTransition?: HistoryTransitionHandler;
}

class HistoryStore {
  undoStack = signal<Command[]>([]);
  redoStack = signal<Command[]>([]);

  // Computed signals for UI
  canUndo = signal<boolean>(false);
  canRedo = signal<boolean>(false);

  // UI invalidation signal - increments after each completed history transition.
  version = signal<number>(0);

  // Track total memory usage
  private memoryUsage = 0;
  private readonly palette: HistoryPaletteStore;
  private readonly onTransition?: HistoryTransitionHandler;

  // Context stack for isolated editing modes (e.g., brush editing)
  private contextStack: HistoryContext[] = [];

  constructor(dependencies: HistoryStoreDependencies) {
    this.palette = dependencies.palette;
    this.onTransition = dependencies.onTransition;
  }

  // NOTE: persistence is intentionally NOT a concern of this store.
  // AutoSaveService (src/services/auto-save.ts) observes `version` and
  // saves the project; history only tracks commands.

  execute(command: Command) {
    // Auto-stamp with userId if not provided
    if (!command.userId) {
      command.userId = userStore.getCurrentUserId();
    }
    if (!command.timestamp) {
      command.timestamp = Date.now();
    }

    return this.runTransition(
      command,
      'execute',
      () => command.execute(),
      () => {
        this.undoStack.value = [...this.undoStack.value, command];
        this.redoStack.value = []; // Clear redo stack on new action
      },
    );
  }

  /**
   * Enforce history limits by removing oldest commands when necessary.
   */
  private enforceHistoryLimits() {
    const stack = [...this.undoStack.value];

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

  undo() {
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
    return this.runTransition(
      command,
      'undo',
      () => command.undo(),
      () => {
        // Remove from undo stack
        const newUndoStack = [...undoStack];
        newUndoStack.splice(commandIndex, 1);
        this.undoStack.value = newUndoStack;

        // Add to redo stack
        this.redoStack.value = [...this.redoStack.value, command];
      },
    );
  }

  redo() {
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
    return this.runTransition(
      command,
      'redo',
      () => command.execute(),
      () => {
        // Remove from redo stack
        const newRedoStack = [...redoStack];
        newRedoStack.splice(commandIndex, 1);
        this.redoStack.value = newRedoStack;

        // Add back to undo stack
        this.undoStack.value = [...this.undoStack.value, command];
      },
    );
  }

  // fallow-ignore-next-line complexity -- One transaction boundary sequences command, history, palette, and staged project commit.
  private async runTransition(
    command: Command,
    phase: HistoryTransitionPhase,
    applyCommand: () => void | Promise<void>,
    updateStacks: () => void,
  ): Promise<void> {
    const transaction = getTransactionalCommand(command);
    const previousState = transaction ? this.captureState() : undefined;
    let transitionPrepared = false;

    try {
      await applyCommand();
      transitionPrepared = transaction !== undefined;
      this.onTransition?.({ phase, command });
      updateStacks();
      if (phase === 'execute' && command.memorySize) {
        this.memoryUsage += command.memorySize;
      }
      this.enforceHistoryLimits();

      if (transaction) {
        // Transaction commands stage their project event. The palette refresh
        // is the last fallible history bookkeeping step before commit.
        this.palette.refreshUsedColors();
        await transaction.commitTransition();
        // Signal.set only records local state and queues effects; it does not
        // invoke observers synchronously. This is the final no-throw update.
        this.updateComputed();
      } else {
        this.updateComputed();
        this.palette.refreshUsedColors();
      }
    } catch (error) {
      if (transaction && transitionPrepared && previousState) {
        const rollbackError = await rollbackTransaction(transaction);
        this.restoreState(previousState);
        if (rollbackError) throw rollbackError;
      }
      throw error;
    }
  }

  private captureState(): HistoryStateSnapshot {
    return {
      undoStack: this.undoStack.value,
      redoStack: this.redoStack.value,
      memoryUsage: this.memoryUsage,
      canUndo: this.canUndo.value,
      canRedo: this.canRedo.value,
      version: this.version.value,
    };
  }

  private restoreState(snapshot: HistoryStateSnapshot): void {
    this.undoStack.value = snapshot.undoStack;
    this.redoStack.value = snapshot.redoStack;
    this.memoryUsage = snapshot.memoryUsage;
    this.canUndo.value = snapshot.canUndo;
    this.canRedo.value = snapshot.canRedo;
    this.version.value = snapshot.version;
  }

  private updateComputed() {
    this.canUndo.value = this.undoStack.value.length > 0;
    this.canRedo.value = this.redoStack.value.length > 0;
    this.version.value++;
  }

  clear() {
    this.undoStack.value = [];
    this.redoStack.value = [];
    this.memoryUsage = 0;
    this.updateComputed();
  }

  /**
   * Push current history context onto the stack and start fresh.
   * Used for isolated editing modes like brush editing.
   */
  pushContext() {
    // Save current state
    this.contextStack.push({
      undoStack: [...this.undoStack.value],
      redoStack: [...this.redoStack.value],
      memoryUsage: this.memoryUsage,
    });

    // Start fresh
    this.undoStack.value = [];
    this.redoStack.value = [];
    this.memoryUsage = 0;
    this.updateComputed();
  }

  /**
   * Pop and restore the previous history context.
   * Discards the current context (any isolated edits are lost).
   */
  popContext() {
    const context = this.contextStack.pop();
    if (!context) {
      log.warn('No history context to restore');
      return;
    }

    // Restore previous state
    this.undoStack.value = context.undoStack;
    this.redoStack.value = context.redoStack;
    this.memoryUsage = context.memoryUsage;
    this.updateComputed();
  }

  /**
   * Check if currently in a nested context.
   */
  isInContext(): boolean {
    return this.contextStack.length > 0;
  }
}

type TransactionalCommand = Command & {
  commitTransition(): void | Promise<void>;
  rollbackTransition(): void | Promise<void>;
};

function getTransactionalCommand(command: Command): TransactionalCommand | undefined {
  return typeof command.commitTransition === 'function'
    && typeof command.rollbackTransition === 'function'
    ? command as TransactionalCommand
    : undefined;
}

async function rollbackTransaction(command: TransactionalCommand): Promise<unknown | null> {
  try {
    await command.rollbackTransition();
    return null;
  } catch (error) {
    return error;
  }
}

export function createHistoryStore(dependencies: HistoryStoreDependencies) {
  return new HistoryStore(dependencies);
}
