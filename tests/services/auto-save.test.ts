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

vi.mock('../../src/services/project-thumbnail', () => ({
  createProjectThumbnail: vi.fn(async () => new Uint8Array([9, 9])),
}));

vi.mock('../../src/utils/canvas-binary', () => ({
  canvasToPngBytes: vi.fn(async () => new Uint8Array([1])),
  loadImageDataToCanvas: vi.fn(async () => {}),
}));

import { projectRepository } from '../../src/services/persistence/indexed-db';
import { autoSaveService } from '../../src/services/auto-save';
import { createProjectThumbnail } from '../../src/services/project-thumbnail';
import { historyStore, type Command } from '../../src/stores/history';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';

const createdContexts: ProjectContext[] = [];

function makeCommand(run?: () => void): Command {
  return {
    id: 'test-cmd',
    name: 'Test command',
    execute() {
      run?.();
    },
    undo() {},
  };
}

function createContext(id: string, name: string): ProjectContext {
  const context = createProjectContext();
  context.project.id.value = id;
  context.project.name.value = name;
  createdContexts.push(context);
  return context;
}

describe('AutoSaveService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(projectRepository.save).mockClear();
    vi.mocked(createProjectThumbnail).mockClear();
    autoSaveService.start();
  });

  afterEach(async () => {
    // Drain any pending debounce before tearing down
    await vi.runAllTimersAsync();
    autoSaveService.stop();
    historyStore.clear();
    await vi.runAllTimersAsync();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    vi.useRealTimers();
  });

  it('does not save just because the app booted', async () => {
    await vi.advanceTimersByTimeAsync(5000);
    expect(projectRepository.save).not.toHaveBeenCalled();
  });

  it('saves (debounced) after a command is executed', async () => {
    await historyStore.execute(makeCommand());
    // Let the effect microtask observe the version bump
    await Promise.resolve();

    expect(projectRepository.save).not.toHaveBeenCalled();
    expect(autoSaveService.isDirty()).toBe(true);

    await vi.advanceTimersByTimeAsync(2500);
    expect(projectRepository.save).toHaveBeenCalledTimes(1);
    expect(projectRepository.save).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
      thumbnail: new Uint8Array([9, 9]),
    });
    expect(createProjectThumbnail).toHaveBeenCalled();
    expect(autoSaveService.isDirty()).toBe(false);
  });

  it('coalesces rapid commands into a single save', async () => {
    await historyStore.execute(makeCommand());
    await vi.advanceTimersByTimeAsync(500);
    await historyStore.execute(makeCommand());
    await vi.advanceTimersByTimeAsync(500);
    await historyStore.execute(makeCommand());

    await vi.advanceTimersByTimeAsync(2500);
    expect(projectRepository.save).toHaveBeenCalledTimes(1);
  });

  it('saves after undo', async () => {
    await historyStore.execute(makeCommand());
    await vi.advanceTimersByTimeAsync(2500);
    vi.mocked(projectRepository.save).mockClear();

    await historyStore.undo();
    await vi.advanceTimersByTimeAsync(2500);
    expect(projectRepository.save).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately on window blur instead of waiting out the debounce', async () => {
    await historyStore.execute(makeCommand());
    await Promise.resolve();

    window.dispatchEvent(new Event('blur'));
    // performSave is async — let its microtasks settle without advancing time
    await vi.advanceTimersByTimeAsync(0);

    expect(projectRepository.save).toHaveBeenCalledTimes(1);

    // The debounced timer was cancelled — no double save later
    await vi.advanceTimersByTimeAsync(5000);
    expect(projectRepository.save).toHaveBeenCalledTimes(1);
  });

  it('keeps debounced saves tied to the context that became dirty', async () => {
    const contextA = createContext('project-a', 'Project A');
    const contextB = createContext('project-b', 'Project B');
    autoSaveService.start(contextA);
    autoSaveService.start(contextB);

    await contextA.history.execute(
      makeCommand(() => {
        contextA.project.name.value = 'Project A edited';
      })
    );
    await contextB.history.execute(
      makeCommand(() => {
        contextB.project.name.value = 'Project B edited';
      })
    );
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(2500);

    const savedProjects = new Map(
      vi.mocked(projectRepository.save).mock.calls.map(([id, project]) => [id, project.name])
    );

    expect(savedProjects.get('project-a')).toBe('Project A edited');
    expect(savedProjects.get('project-b')).toBe('Project B edited');
    expect(savedProjects.size).toBe(2);
    expect(createProjectThumbnail).toHaveBeenCalledTimes(2);
  });
});
