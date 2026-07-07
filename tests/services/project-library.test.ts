import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types/project';

const repositoryMock = vi.hoisted(() => ({
  list: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
  getLastOpenedProjectId: vi.fn(),
  setLastOpenedProjectId: vi.fn(),
}));

vi.mock('../../src/services/persistence/indexed-db', () => ({
  projectRepository: repositoryMock,
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

import { autoSaveService } from '../../src/services/auto-save';
import { ProjectLibraryService } from '../../src/services/project-library';
import { projectRepository } from '../../src/services/persistence/indexed-db';
import { historyStore, type Command } from '../../src/stores/history';
import { projectStore } from '../../src/stores/project';
import { PROJECT_VERSION } from '../../src/types/project';

const repository = vi.mocked(projectRepository);
const service = new ProjectLibraryService(projectRepository);

let projects: Map<string, ProjectFile>;
let savedProjects: Array<{ id: string; project: ProjectFile }>;

function cloneProject(project: ProjectFile): ProjectFile {
  return structuredClone(project);
}

function makeProject(name: string, width = 8, height = 8): ProjectFile {
  const layerId = `${name}-layer`;
  const frameId = `${name}-frame`;

  return {
    version: PROJECT_VERSION,
    name,
    width,
    height,
    palette: ['#000000', '#ffffff'],
    layers: [
      {
        id: layerId,
        name: 'Layer 1',
        type: 'image',
        visible: true,
        opacity: 255,
        blendMode: 'normal',
        continuous: false,
        data: new Uint8Array(0),
      },
    ],
    frames: [
      {
        id: frameId,
        duration: 100,
        cels: [
          {
            layerId,
            data: new Uint8Array(0),
          },
        ],
      },
    ],
    animation: {
      fps: 12,
      currentFrameIndex: 0,
    },
    tags: [],
  };
}

function makeCommand(run?: () => void, undo?: () => void): Command {
  return {
    id: crypto.randomUUID(),
    name: 'Test command',
    execute() {
      run?.();
    },
    undo() {
      undo?.();
    },
  };
}

async function openProjectInStore(id: string, project: ProjectFile) {
  await autoSaveService.runWithoutSaving(async () => {
    projectStore.id.value = id;
    await projectStore.loadProject(project);
  });
  historyStore.clear();
}

beforeEach(async () => {
  vi.useFakeTimers();
  projects = new Map();
  savedProjects = [];

  repository.list.mockImplementation(async () =>
    [...projects.entries()].map(([id, project]) => ({
      id,
      name: project.name || 'Untitled',
      width: project.width,
      height: project.height,
      lastModified: Date.now(),
    }))
  );
  repository.load.mockImplementation(async (id: string) => {
    const project = projects.get(id);
    return project ? cloneProject(project) : null;
  });
  repository.save.mockImplementation(async (id: string, project: ProjectFile) => {
    const saved = cloneProject(project);
    projects.set(id, saved);
    savedProjects.push({ id, project: cloneProject(saved) });
  });
  repository.delete.mockImplementation(async (id: string) => {
    projects.delete(id);
  });
  repository.getLastOpenedProjectId.mockResolvedValue(null);
  repository.setLastOpenedProjectId.mockResolvedValue(undefined);

  autoSaveService.stop();
  await openProjectInStore('current', makeProject('Current'));
  vi.clearAllMocks();
});

afterEach(async () => {
  autoSaveService.stop();
  historyStore.clear();
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

describe('ProjectLibraryService', () => {
  it('creates a project, opens it, and resets undo history on switch', async () => {
    const undo = vi.fn();
    await historyStore.execute(makeCommand(undefined, undo));
    expect(historyStore.canUndo.value).toBe(true);

    const id = await service.createProject({
      name: 'New project',
      width: 12,
      height: 10,
    });

    expect(projectStore.id.value).toBe(id);
    expect(projectStore.name.value).toBe('New project');
    expect(projectStore.width.value).toBe(12);
    expect(projectStore.height.value).toBe(10);
    expect(historyStore.canUndo.value).toBe(false);
    expect(projects.get(id)?.layers).toHaveLength(1);
    expect(projects.get(id)?.frames).toHaveLength(1);
    expect(projects.get(id)?.palette?.length).toBeGreaterThan(2);

    await historyStore.undo();
    expect(undo).not.toHaveBeenCalled();
  });

  it('saves edits to the open project before loading another project', async () => {
    projects.set('a', makeProject('Project A'));
    projects.set('b', makeProject('Project B'));
    await openProjectInStore('a', makeProject('Project A'));

    await historyStore.execute(
      makeCommand(() => {
        projectStore.name.value = 'Project A edited';
      })
    );

    await service.openProject('b');

    expect(projects.get('a')?.name).toBe('Project A edited');
    expect(projectStore.id.value).toBe('b');
    expect(projectStore.name.value).toBe('Project B');
    expect(repository.setLastOpenedProjectId).toHaveBeenCalledWith('b');
  });

  it('duplicates projects into an independent copy without opening it', async () => {
    projects.set('original', makeProject('Original'));

    const copyId = await service.duplicateProject('original');
    await service.renameProject(copyId, 'Renamed copy');

    expect(copyId).not.toBe('original');
    expect(projectStore.id.value).toBe('current');
    expect(projects.get('original')?.name).toBe('Original');
    expect(projects.get(copyId)?.name).toBe('Renamed copy');
  });

  it('deletes the open project without a pending auto-save recreating it', async () => {
    projects.set('open', makeProject('Open'));
    await openProjectInStore('open', makeProject('Open'));
    autoSaveService.start();

    await historyStore.execute(
      makeCommand(() => {
        projectStore.name.value = 'Dirty open project';
      })
    );
    await Promise.resolve();

    await service.deleteProject('open');
    await vi.advanceTimersByTimeAsync(2500);

    expect(projects.has('open')).toBe(false);
  });

  it('does not let an old auto-save timer write the previous project under the new id', async () => {
    projects.set('a', makeProject('Project A'));
    projects.set('b', makeProject('Project B'));
    await openProjectInStore('a', makeProject('Project A'));
    autoSaveService.start();

    await historyStore.execute(
      makeCommand(() => {
        projectStore.name.value = 'Project A dirty';
      })
    );
    await Promise.resolve();

    await service.openProject('b');
    await vi.advanceTimersByTimeAsync(2500);

    const savesForA = savedProjects.filter((entry) => entry.id === 'a');
    const savesForB = savedProjects.filter((entry) => entry.id === 'b');

    expect(projects.get('a')?.name).toBe('Project A dirty');
    expect(projects.get('b')?.name).toBe('Project B');
    expect(savesForA).toHaveLength(1);
    expect(savesForB).toHaveLength(0);
  });
});
