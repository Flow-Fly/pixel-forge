import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// happy-dom has neither IndexedDB nor canvas encoding — mock the boundaries.
vi.mock('../../src/services/persistence/indexed-db', () => ({
  projectRepository: {
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    getLastOpenedProjectId: vi.fn(async () => null),
    setLastOpenedProjectId: vi.fn(async () => {}),
    getWorkspaceState: vi.fn(async () => null),
    setWorkspaceState: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/utils/canvas-binary', () => ({
  canvasToPngBytes: vi.fn(async () => new Uint8Array([1])),
  loadImageDataToCanvas: vi.fn(async () => {}),
}));

import { historyStore, type Command } from '../../src/stores/history';
import { defaultProjectContext } from '../../src/stores/project-context';
import { userStore } from '../../src/stores/user';

interface TrackedCommand extends Command {
  executeCount: number;
  undoCount: number;
  documentValue: number;
}

function makeCommand(
  id: string,
  opts: { userId?: string; memorySize?: number } = {}
): TrackedCommand {
  const cmd: TrackedCommand = {
    id,
    name: `Command ${id}`,
    userId: opts.userId,
    memorySize: opts.memorySize,
    executeCount: 0,
    undoCount: 0,
    documentValue: 0,
    execute() {
      cmd.executeCount++;
      cmd.documentValue++;
    },
    undo() {
      cmd.undoCount++;
      cmd.documentValue--;
    },
  };
  return cmd;
}

const MB = 1024 * 1024;

describe('HistoryStore', () => {
  beforeEach(() => {
    // Fake timers keep the auto-save debounce from firing mid-test
    vi.useFakeTimers();
    historyStore.clear();
    userStore.setCurrentUser({ id: 'local-user', name: 'Local User' });
  });

  afterEach(() => {
    historyStore.clear();
    vi.useRealTimers();
  });

  it('executes the command and pushes it onto the undo stack', async () => {
    const cmd = makeCommand('a');
    await historyStore.execute(cmd);

    expect(cmd.executeCount).toBe(1);
    expect(historyStore.undoStack.value).toHaveLength(1);
    expect(historyStore.canUndo.value).toBe(true);
    expect(historyStore.canRedo.value).toBe(false);
  });

  it('undo reverses the last command and enables redo', async () => {
    const cmd = makeCommand('a');
    await historyStore.execute(cmd);
    await historyStore.undo();

    expect(cmd.undoCount).toBe(1);
    expect(historyStore.undoStack.value).toHaveLength(0);
    expect(historyStore.redoStack.value).toHaveLength(1);
    expect(historyStore.canUndo.value).toBe(false);
    expect(historyStore.canRedo.value).toBe(true);
  });

  it('redo re-executes the undone command', async () => {
    const cmd = makeCommand('a');
    await historyStore.execute(cmd);
    await historyStore.undo();
    await historyStore.redo();

    expect(cmd.executeCount).toBe(2);
    expect(historyStore.undoStack.value).toHaveLength(1);
    expect(historyStore.redoStack.value).toHaveLength(0);
  });

  it('preserves document and history state when initial execution fails', async () => {
    const cmd = makeCommand('a');
    cmd.execute = () => {
      throw new Error('initial execution failed');
    };

    const undoStackBeforeFailure = historyStore.undoStack.value;
    const redoStackBeforeFailure = historyStore.redoStack.value;
    const versionBeforeFailure = historyStore.version.value;
    const revisionBeforeFailure = defaultProjectContext.project.revision.value;
    await expect(historyStore.execute(cmd)).rejects.toThrow('initial execution failed');

    expect(historyStore.undoStack.value).toEqual(undoStackBeforeFailure);
    expect(historyStore.redoStack.value).toEqual(redoStackBeforeFailure);
    expect(historyStore.version.value).toBe(versionBeforeFailure);
    expect(defaultProjectContext.project.revision.value).toBe(revisionBeforeFailure);
    expect(cmd.documentValue).toBe(0);
  });

  it('preserves pending redo commands when replay fails', async () => {
    const cmd = makeCommand('a');
    const execute = cmd.execute.bind(cmd);
    cmd.execute = () => {
      if (cmd.executeCount > 0) throw new Error('replay failed');
      execute();
    };

    await historyStore.execute(cmd);
    await historyStore.undo();

    const undoStackBeforeFailure = historyStore.undoStack.value;
    const redoStackBeforeFailure = historyStore.redoStack.value;
    const versionBeforeFailure = historyStore.version.value;
    const revisionBeforeFailure = defaultProjectContext.project.revision.value;
    const documentBeforeFailure = cmd.documentValue;
    await expect(historyStore.redo()).rejects.toThrow('replay failed');
    expect(historyStore.undoStack.value).toEqual(undoStackBeforeFailure);
    expect(historyStore.redoStack.value).toEqual(redoStackBeforeFailure);
    expect(historyStore.canRedo.value).toBe(true);
    expect(historyStore.version.value).toBe(versionBeforeFailure);
    expect(defaultProjectContext.project.revision.value).toBe(revisionBeforeFailure);
    expect(cmd.executeCount).toBe(1);
    expect(cmd.documentValue).toBe(documentBeforeFailure);
  });

  it('preserves both stacks when undo replay fails', async () => {
    const cmd = makeCommand('a');
    const undo = cmd.undo.bind(cmd);
    cmd.undo = () => {
      if (cmd.undoCount > 0) throw new Error('undo replay failed');
      undo();
    };

    await historyStore.execute(cmd);
    await historyStore.undo();
    await historyStore.redo();
    await historyStore.execute(makeCommand('b'));
    await historyStore.undo();

    const undoStackBeforeFailure = historyStore.undoStack.value;
    const redoStackBeforeFailure = historyStore.redoStack.value;
    const versionBeforeFailure = historyStore.version.value;
    const revisionBeforeFailure = defaultProjectContext.project.revision.value;
    const documentBeforeFailure = cmd.documentValue;
    await expect(historyStore.undo()).rejects.toThrow('undo replay failed');
    expect(historyStore.undoStack.value).toEqual(undoStackBeforeFailure);
    expect(historyStore.redoStack.value).toEqual(redoStackBeforeFailure);
    expect(historyStore.canRedo.value).toBe(true);
    expect(historyStore.version.value).toBe(versionBeforeFailure);
    expect(defaultProjectContext.project.revision.value).toBe(revisionBeforeFailure);
    expect(cmd.undoCount).toBe(1);
    expect(cmd.documentValue).toBe(documentBeforeFailure);
  });

  it('undo/undo/redo/redo restores order (a, b) correctly', async () => {
    const a = makeCommand('a');
    const b = makeCommand('b');
    await historyStore.execute(a);
    await historyStore.execute(b);

    await historyStore.undo(); // undoes b
    expect(b.undoCount).toBe(1);
    expect(a.undoCount).toBe(0);

    await historyStore.undo(); // undoes a
    expect(a.undoCount).toBe(1);

    await historyStore.redo(); // re-runs a
    expect(a.executeCount).toBe(2);
    await historyStore.redo(); // re-runs b
    expect(b.executeCount).toBe(2);
  });

  it('a new command clears the redo stack', async () => {
    await historyStore.execute(makeCommand('a'));
    await historyStore.undo();
    expect(historyStore.redoStack.value).toHaveLength(1);

    await historyStore.execute(makeCommand('b'));
    expect(historyStore.redoStack.value).toHaveLength(0);
    expect(historyStore.canRedo.value).toBe(false);
  });

  it('undo skips commands belonging to other users', async () => {
    const mine = makeCommand('mine', { userId: 'local-user' });
    const theirs = makeCommand('theirs', { userId: 'other-user' });
    await historyStore.execute(mine);
    await historyStore.execute(theirs); // most recent, but not ours

    await historyStore.undo();

    expect(mine.undoCount).toBe(1);
    expect(theirs.undoCount).toBe(0);
    expect(historyStore.undoStack.value.map((c) => c.id)).toEqual(['theirs']);
  });

  it('stamps executed commands with the current user id', async () => {
    const cmd = makeCommand('a');
    await historyStore.execute(cmd);
    expect(cmd.userId).toBe('local-user');
  });

  it('evicts oldest commands past the 100-command limit', async () => {
    for (let i = 0; i < 105; i++) {
      await historyStore.execute(makeCommand(`c${i}`));
    }

    const stack = historyStore.undoStack.value;
    expect(stack).toHaveLength(100);
    expect(stack[0].id).toBe('c5');
    expect(stack[99].id).toBe('c104');
  });

  it('evicts oldest commands past the 50MB memory budget', async () => {
    await historyStore.execute(makeCommand('big1', { memorySize: 30 * MB }));
    await historyStore.execute(makeCommand('big2', { memorySize: 30 * MB }));

    // 60MB > 50MB budget: big1 is evicted
    expect(historyStore.undoStack.value.map((c) => c.id)).toEqual(['big2']);
    expect(historyStore.getMemoryUsage()).toBe(30 * MB);
  });

  it('clear resets stacks and the memory accounting', async () => {
    await historyStore.execute(makeCommand('a', { memorySize: 10 * MB }));
    historyStore.clear();

    expect(historyStore.undoStack.value).toHaveLength(0);
    expect(historyStore.redoStack.value).toHaveLength(0);
    expect(historyStore.getMemoryUsage()).toBe(0);
    expect(historyStore.canUndo.value).toBe(false);
  });

  it('pushContext isolates history; popContext restores and discards', async () => {
    const outer = makeCommand('outer');
    await historyStore.execute(outer);

    historyStore.pushContext();
    expect(historyStore.isInContext()).toBe(true);
    expect(historyStore.canUndo.value).toBe(false);

    const inner = makeCommand('inner');
    await historyStore.execute(inner);
    expect(historyStore.undoStack.value.map((c) => c.id)).toEqual(['inner']);

    historyStore.popContext();
    expect(historyStore.isInContext()).toBe(false);
    expect(historyStore.undoStack.value.map((c) => c.id)).toEqual(['outer']);
    expect(historyStore.canUndo.value).toBe(true);
  });
});
