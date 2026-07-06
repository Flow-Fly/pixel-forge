import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// happy-dom has neither IndexedDB nor canvas encoding — mock the boundaries.
vi.mock('../../src/services/persistence/indexed-db', () => ({
  persistenceService: {
    saveCurrentProject: vi.fn(async () => {}),
    loadCurrentProject: vi.fn(async () => null),
    clearCurrentProject: vi.fn(async () => {}),
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
  isBinaryData: vi.fn(() => true),
}));

import { persistenceService } from '../../src/services/persistence/indexed-db';
import { autoSaveService } from '../../src/services/auto-save';
import { historyStore, type Command } from '../../src/stores/history';

function makeCommand(): Command {
  return {
    id: 'test-cmd',
    name: 'Test command',
    execute() {},
    undo() {},
  };
}

describe('AutoSaveService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(persistenceService.saveCurrentProject).mockClear();
    autoSaveService.start();
  });

  afterEach(async () => {
    // Drain any pending debounce before tearing down
    await vi.runAllTimersAsync();
    autoSaveService.stop();
    historyStore.clear();
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it('does not save just because the app booted', async () => {
    await vi.advanceTimersByTimeAsync(5000);
    expect(persistenceService.saveCurrentProject).not.toHaveBeenCalled();
  });

  it('saves (debounced) after a command is executed', async () => {
    await historyStore.execute(makeCommand());
    // Let the effect microtask observe the version bump
    await Promise.resolve();

    expect(persistenceService.saveCurrentProject).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2500);
    expect(persistenceService.saveCurrentProject).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid commands into a single save', async () => {
    await historyStore.execute(makeCommand());
    await vi.advanceTimersByTimeAsync(500);
    await historyStore.execute(makeCommand());
    await vi.advanceTimersByTimeAsync(500);
    await historyStore.execute(makeCommand());

    await vi.advanceTimersByTimeAsync(2500);
    expect(persistenceService.saveCurrentProject).toHaveBeenCalledTimes(1);
  });

  it('saves after undo', async () => {
    await historyStore.execute(makeCommand());
    await vi.advanceTimersByTimeAsync(2500);
    vi.mocked(persistenceService.saveCurrentProject).mockClear();

    await historyStore.undo();
    await vi.advanceTimersByTimeAsync(2500);
    expect(persistenceService.saveCurrentProject).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately on window blur instead of waiting out the debounce', async () => {
    await historyStore.execute(makeCommand());
    await Promise.resolve();

    window.dispatchEvent(new Event('blur'));
    // performSave is async — let its microtasks settle without advancing time
    await vi.advanceTimersByTimeAsync(0);

    expect(persistenceService.saveCurrentProject).toHaveBeenCalledTimes(1);

    // The debounced timer was cancelled — no double save later
    await vi.advanceTimersByTimeAsync(5000);
    expect(persistenceService.saveCurrentProject).toHaveBeenCalledTimes(1);
  });
});
