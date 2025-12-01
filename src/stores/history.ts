import { signal } from '../core/signal';

export interface Command {
  id: string;
  name: string;
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
    await command.execute();
    
    this.undoStack.value = [...this.undoStack.value, command];
    this.redoStack.value = []; // Clear redo stack on new action
    
    this.updateComputed();
  }

  async undo() {
    const undoStack = this.undoStack.value;
    if (undoStack.length === 0) return;

    const command = undoStack[undoStack.length - 1];
    await command.undo();

    this.undoStack.value = undoStack.slice(0, -1);
    this.redoStack.value = [...this.redoStack.value, command];
    
    this.updateComputed();
  }

  async redo() {
    const redoStack = this.redoStack.value;
    if (redoStack.length === 0) return;

    const command = redoStack[redoStack.length - 1];
    await command.execute();

    this.redoStack.value = redoStack.slice(0, -1);
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
