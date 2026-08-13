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
import { autoSaveService, ProjectSaveError } from '../../src/services/auto-save';
import { createProjectThumbnail } from '../../src/services/project-thumbnail';
import { projectLibrary } from '../../src/services/project-library';
import { productTelemetry } from '../../src/services/telemetry';
import { historyStore, type Command } from '../../src/stores/history';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';

const createdContexts: ProjectContext[] = [];

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settleSaveQueue() {
  for (let index = 0; index < 20; index++) {
    await Promise.resolve();
  }
}

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
    const record = vi.spyOn(productTelemetry, 'record');
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
    expect(record).toHaveBeenCalledWith({
      name: 'project_saved',
      dimensions: { destination: 'local_library' },
    });
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

  it('pauses pending saves and observes new edits again after restart', async () => {
    const context = createContext('paused-project', 'Paused project');
    autoSaveService.start(context);
    await context.history.execute(makeCommand());
    await Promise.resolve();

    await autoSaveService.pause(context);
    await vi.advanceTimersByTimeAsync(2500);

    expect(projectRepository.save).not.toHaveBeenCalled();
    expect(autoSaveService.isDirty(context)).toBe(true);

    autoSaveService.start(context);
    await vi.advanceTimersByTimeAsync(2500);

    expect(projectRepository.save).toHaveBeenCalledWith(
      'paused-project',
      expect.objectContaining({ name: 'Paused project' }),
      expect.any(Object)
    );
    expect(autoSaveService.isDirty(context)).toBe(false);
  });

  it('records edits made while paused and saves them after restart', async () => {
    const context = createContext('paused-edit-project', 'Before deletion');
    autoSaveService.start(context);
    await autoSaveService.pause(context);

    await context.history.execute(
      makeCommand(() => {
        context.project.name.value = 'Edited while deletion was pending';
      })
    );
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2500);

    expect(autoSaveService.isDirty(context)).toBe(true);
    expect(projectRepository.save).not.toHaveBeenCalled();

    autoSaveService.start(context);
    await vi.advanceTimersByTimeAsync(2500);

    expect(projectRepository.save).toHaveBeenCalledWith(
      'paused-edit-project',
      expect.objectContaining({ name: 'Edited while deletion was pending' }),
      expect.any(Object)
    );
    expect(autoSaveService.isDirty(context)).toBe(false);
  });

  it('keeps saving until an edit made during a write is persisted', async () => {
    const context = createContext('reload-project', 'First state');
    const firstWrite = deferred<void>();
    vi.mocked(projectRepository.save)
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValueOnce();

    autoSaveService.start(context);
    const stableSave = autoSaveService.saveUntilClean(context);
    await settleSaveQueue();

    await context.history.execute(
      makeCommand(() => {
        context.project.name.value = 'Edited during save';
      })
    );
    await Promise.resolve();
    firstWrite.resolve();
    await stableSave;

    expect(projectRepository.save).toHaveBeenCalledTimes(2);
    expect(vi.mocked(projectRepository.save).mock.calls[1][1].name).toBe('Edited during save');
    expect(autoSaveService.isDirty(context)).toBe(false);
  });

  it('keeps save safety dirty when an older write completes after a newer edit', async () => {
    const context = createContext('save-safety-order-project', 'First state');
    const firstWrite = deferred<void>();
    vi.mocked(projectRepository.save)
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValueOnce();

    autoSaveService.start(context);
    const firstSave = autoSaveService.saveNow(context);
    await settleSaveQueue();
    expect(autoSaveService.getSaveSafetyState(context).status).toBe('saving');

    await context.history.execute(
      makeCommand(() => {
        context.project.name.value = 'Newer state';
      })
    );
    await Promise.resolve();
    expect(autoSaveService.getSaveSafetyState(context).status).toBe('dirty');
    const secondSave = autoSaveService.saveNow(context);
    firstWrite.resolve();
    await firstSave;

    expect(autoSaveService.getSaveSafetyState(context)).toMatchObject({
      currentRevision: 1,
      persistedRevision: 0,
      status: 'saving',
    });

    await secondSave;
    expect(autoSaveService.getSaveSafetyState(context)).toMatchObject({
      currentRevision: 1,
      persistedRevision: 1,
      status: 'saved',
    });
  });

  it('rejects a forced save queued after pause and never writes it', async () => {
    const context = createContext('deleted-project', 'Deleted project');
    autoSaveService.start(context);
    await autoSaveService.pause(context);

    await expect(autoSaveService.saveNow(context)).rejects.toThrow('paused');
    expect(projectRepository.save).not.toHaveBeenCalled();
  });

  it('turns pause into a barrier against a forced save already serializing', async () => {
    const context = createContext('concurrent-delete-project', 'Concurrent delete');
    const serializedProject = await context.project.saveProject();
    const serialization = deferred<typeof serializedProject>();
    vi.spyOn(context.project, 'saveProject').mockReturnValueOnce(serialization.promise);
    autoSaveService.start(context);

    const forcedSave = autoSaveService.saveNow(context);
    await settleSaveQueue();
    const pause = autoSaveService.pause(context);
    serialization.resolve(serializedProject);

    await expect(forcedSave).rejects.toThrow('paused');
    await pause;
    expect(projectRepository.save).not.toHaveBeenCalled();
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

  it('serializes saves for one context and writes an edit made during a save afterwards', async () => {
    const context = createContext('ordered-project', 'First state');
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();

    vi.mocked(projectRepository.save)
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementationOnce(() => secondWrite.promise);

    autoSaveService.start(context);
    await context.history.execute(makeCommand());
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2000);
    await settleSaveQueue();

    expect(projectRepository.save).toHaveBeenCalledTimes(1);

    await context.history.execute(
      makeCommand(() => {
        context.project.name.value = 'Second state';
      })
    );
    await Promise.resolve();
    const forcedSave = autoSaveService.saveNow(context);
    await settleSaveQueue();

    expect(projectRepository.save).toHaveBeenCalledTimes(1);

    firstWrite.resolve();
    await settleSaveQueue();

    expect(projectRepository.save).toHaveBeenCalledTimes(2);
    expect(vi.mocked(projectRepository.save).mock.calls[1][1].name).toBe('Second state');
    expect(autoSaveService.isDirty(context)).toBe(true);

    secondWrite.resolve();
    await forcedSave;
    expect(autoSaveService.isDirty(context)).toBe(false);
  });

  it('captures the project identity before asynchronous serialization', async () => {
    const context = createContext('original-project', 'Original project');
    const serializedProject = await context.project.saveProject();
    const serialization = deferred<typeof serializedProject>();
    vi.spyOn(context.project, 'saveProject').mockReturnValueOnce(serialization.promise);

    const save = autoSaveService.saveNow(context);
    await settleSaveQueue();
    context.project.id.value = 'replacement-project';
    serialization.resolve(serializedProject);
    await save;

    expect(projectRepository.save).toHaveBeenCalledWith(
      'original-project',
      serializedProject,
      expect.any(Object)
    );
  });

  it('keeps a failed forced save dirty and allows a later retry', async () => {
    const context = createContext('retry-project', 'Retry project');
    vi.mocked(projectRepository.save)
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce();

    await expect(autoSaveService.saveNow(context)).rejects.toThrow('write failed');
    expect(autoSaveService.isDirty(context)).toBe(true);

    await autoSaveService.saveNow(context);

    expect(projectRepository.save).toHaveBeenCalledTimes(2);
    expect(autoSaveService.isDirty(context)).toBe(false);
  });

  it('lets a newer queued save clear dirty state after an older save fails', async () => {
    const context = createContext('failure-order-project', 'Older state');
    const firstWrite = deferred<void>();
    vi.mocked(projectRepository.save)
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValueOnce();

    const olderSave = autoSaveService.saveNow(context);
    await settleSaveQueue();

    await context.history.execute(
      makeCommand(() => {
        context.project.name.value = 'Newer state';
      })
    );
    const newerSave = autoSaveService.saveNow(context);
    firstWrite.reject(new Error('older write failed'));

    await expect(olderSave).rejects.toBeInstanceOf(ProjectSaveError);
    await expect(olderSave).rejects.toMatchObject({ category: 'write_failed' });
    await newerSave;

    expect(projectRepository.save).toHaveBeenCalledTimes(2);
    expect(vi.mocked(projectRepository.save).mock.calls[1][1].name).toBe('Newer state');
    expect(autoSaveService.isDirty(context)).toBe(false);
    expect(autoSaveService.getSaveSafetyObservation(context)).toEqual({
      type: 'project.save-safety',
      target: { projectId: 'failure-order-project' },
      currentRevision: 1,
      persistedRevision: 1,
      status: 'saved',
    });
  });

  it('allows separate contexts to save independently', async () => {
    const contextA = createContext('parallel-a', 'Parallel A');
    const contextB = createContext('parallel-b', 'Parallel B');
    const writeA = deferred<void>();

    vi.mocked(projectRepository.save).mockImplementation((id) => {
      return id === 'parallel-a' ? writeA.promise : Promise.resolve();
    });

    const saveA = autoSaveService.saveNow(contextA);
    const saveB = autoSaveService.saveNow(contextB);
    await saveB;

    expect(projectRepository.save).toHaveBeenCalledTimes(2);

    writeA.resolve();
    await saveA;
  });

  it('publishes one revision-aware save safety state through dirty, saving, and saved', async () => {
    const context = createContext('save-safety-project', 'Save safety');
    const write = deferred<void>();
    vi.mocked(projectRepository.save).mockImplementationOnce(() => write.promise);

    autoSaveService.start(context);
    await context.history.execute(makeCommand());
    await Promise.resolve();

    expect(autoSaveService.getSaveSafetyObservation(context)).toMatchObject({
      type: 'project.save-safety',
      target: { projectId: 'save-safety-project' },
      currentRevision: 1,
      persistedRevision: 0,
      status: 'dirty',
    });

    const saving = autoSaveService.saveNow(context);
    await settleSaveQueue();
    expect(autoSaveService.getSaveSafetyState(context).status).toBe('saving');

    write.resolve();
    await saving;
    expect(autoSaveService.getSaveSafetyState(context)).toMatchObject({
      currentRevision: 1,
      persistedRevision: 1,
      status: 'saved',
    });
  });

  it('keeps a failed write bounded and retries the newest dirty revision', async () => {
    const context = createContext('retry-latest-project', 'First state');
    vi.mocked(projectRepository.save)
      .mockRejectedValueOnce(Object.assign(new Error('disk full'), { name: 'QuotaExceededError' }))
      .mockResolvedValueOnce();

    await expect(autoSaveService.saveNow(context)).rejects.toMatchObject({
      category: 'quota_exceeded',
      action: 'retry_latest',
    });
    expect(autoSaveService.getSaveSafetyState(context)).toMatchObject({
      status: 'failed',
      failure: { category: 'quota_exceeded', action: 'retry_latest' },
    });

    await context.history.execute(
      makeCommand(() => {
        context.project.name.value = 'Newest state';
      })
    );
    await Promise.resolve();

    await autoSaveService.retryLatest(context);
    expect(vi.mocked(projectRepository.save).mock.calls[1][1].name).toBe('Newest state');
    expect(autoSaveService.getSaveSafetyState(context).status).toBe('saved');
  });

  it('treats thumbnail generation as derived and preserves the previous thumbnail', async () => {
    const context = createContext('thumbnail-failure-project', 'Thumbnail failure');
    vi.mocked(createProjectThumbnail).mockRejectedValueOnce(new Error('canvas failed'));

    await autoSaveService.saveNow(context);

    expect(projectRepository.save).toHaveBeenCalledWith(
      'thumbnail-failure-project',
      expect.any(Object),
      { thumbnail: undefined }
    );
    expect(autoSaveService.getSaveSafetyState(context).status).toBe('saved');
  });

  it('maps serialization failure without exposing the original exception', async () => {
    const context = createContext('serialization-failure-project', 'Serialization failure');
    vi.spyOn(context.project, 'saveProject').mockRejectedValueOnce(
      new Error('private project bytes should not escape')
    );

    await expect(autoSaveService.saveNow(context)).rejects.toMatchObject({
      category: 'serialization_failed',
      action: 'retry_latest',
    });
    const state = autoSaveService.getSaveSafetyState(context);
    expect(state.status).toBe('failed');
    expect(JSON.stringify(state)).not.toContain('private project bytes');
  });

  it('post-review regression: invalidates an in-flight save when a same-context replacement succeeds', async () => {
    const context = createContext('replacement-project', 'Before replacement');
    const oldSnapshot = await context.project.saveProject();
    const serialization = deferred<typeof oldSnapshot>();
    vi.spyOn(context.project, 'saveProject').mockReturnValueOnce(serialization.promise);

    autoSaveService.start(context);
    const save = autoSaveService.saveNow(context);
    await settleSaveQueue();

    const loadedSnapshot = structuredClone(oldSnapshot);
    loadedSnapshot.name = 'Loaded replacement';
    await autoSaveService.runWithoutSaving(
      () => context.project.loadProject(loadedSnapshot),
      context
    );
    expect(context.project.name.value).toBe('Loaded replacement');

    serialization.resolve(oldSnapshot);
    await save;

    expect(projectRepository.save).not.toHaveBeenCalled();
    expect(autoSaveService.getSaveSafetyState(context)).toMatchObject({
      target: { projectId: 'replacement-project' },
      status: 'saved',
    });
  });

  it('post-review regression: does not republish save state after a context is stopped', async () => {
    const context = createContext('stopped-project', 'Stopped project');
    const write = deferred<void>();
    vi.mocked(projectRepository.save).mockImplementationOnce(() => write.promise);

    autoSaveService.start(context);
    const save = autoSaveService.saveNow(context);
    await settleSaveQueue();
    expect(autoSaveService.getSaveSafetyState(context).status).toBe('saving');

    autoSaveService.stop(context);
    write.resolve();
    await save;

    expect(autoSaveService.saveSafetyStates.value.has(context)).toBe(false);
    expect(autoSaveService.dirtyContexts.value.has(context)).toBe(false);
  });

  it('post-review regression: preserves dirty state when a load operation fails', async () => {
    const context = createContext('failed-load-project', 'Failed load project');
    autoSaveService.start(context);
    await context.history.execute(makeCommand());
    await settleSaveQueue();
    expect(autoSaveService.getSaveSafetyState(context).status).toBe('dirty');

    await expect(
      autoSaveService.runWithoutSaving(async () => {
        throw new Error('load failed');
      }, context)
    ).rejects.toThrow('load failed');

    expect(autoSaveService.getSaveSafetyState(context)).toMatchObject({
      status: 'dirty',
    });
    expect(autoSaveService.isDirty(context)).toBe(true);
  });

  it('post-review regression: keeps an active autosave context saved after a successful load', async () => {
    const context = createContext('loaded-project', 'Before load');
    const loadedSnapshot = await context.project.saveProject();
    loadedSnapshot.name = 'Loaded project';
    vi.mocked(projectRepository.load).mockResolvedValueOnce(loadedSnapshot);

    autoSaveService.start(context);
    await projectLibrary.openProject('loaded-project', {
      context,
      saveCurrent: false,
    });
    await settleSaveQueue();

    expect(autoSaveService.getSaveSafetyState(context)).toMatchObject({
      target: { projectId: 'loaded-project' },
      status: 'saved',
    });
    expect(autoSaveService.isDirty(context)).toBe(false);
    expect(projectRepository.save).not.toHaveBeenCalled();
  });
});
