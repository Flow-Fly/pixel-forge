import { signal } from '../core/signal';
import { userStore } from './user';

export interface Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  execute(): void | Promise<void>;
  undo(): void | Promise<void>;
}

class HistoryStore {
  undoStack = signal<Command[]>([]);
  redoStack = signal<Command[]>([]);
  
  // Computed signals for UI
  canUndo = signal<boolean>(false);
  canRedo = signal<boolean>(false);

  constructor() {
    // Update computed signals when stacks change
    // Since we don't have true computed signals in our simple implementation yet,
    // we'll update them manually in the methods.
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

    this.updateComputed();
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
  }

  private updateComputed() {
    this.canUndo.value = this.undoStack.value.length > 0;
    this.canRedo.value = this.redoStack.value.length > 0;
  }
  
  clear() {
    this.undoStack.value = [];
    this.redoStack.value = [];
    this.updateComputed();
  }
}

export const historyStore = new HistoryStore();
