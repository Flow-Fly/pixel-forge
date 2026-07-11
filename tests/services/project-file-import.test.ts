import { describe, expect, it, vi } from 'vitest';
import pako from 'pako';
import { ProjectFileImportService } from '../../src/services/project-file-import';
import { WorkspaceStore } from '../../src/stores/workspace';
import {
  createProjectContext,
  restoreDefaultProjectContext,
} from '../../src/stores/project-context';
import { PROJECT_VERSION, type ProjectFile } from '../../src/types/project';

function project(name = 'Imported project'): ProjectFile {
  const layerId = 'layer-1';
  return {
    version: PROJECT_VERSION,
    name,
    width: 2,
    height: 2,
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
        id: 'frame-1',
        duration: 100,
        cels: [{ layerId, data: new Uint8Array(0) }],
      },
    ],
    animation: { fps: 12, currentFrameIndex: 0 },
    tags: [],
  };
}

function dependencies(opened = true) {
  const projectLibrary = {
    importProjectFile: vi.fn(async () => 'imported-id'),
    deleteProject: vi.fn(async () => undefined),
  };
  const workspace = {
    openProject: vi.fn(async () =>
      opened
        ? {
            ok: true as const,
            projectId: 'imported-id',
            item: {} as never,
          }
        : {
            ok: false as const,
            reason: 'tab-limit-reached' as const,
            message: 'The workspace can keep up to 8 projects open at once.',
          }
    ),
  };

  return { projectLibrary, workspace };
}

describe('ProjectFileImportService', () => {
  it('stores a compressed Pixel Forge project and opens its new identity', async () => {
    const source = project('Portrait');
    const file = new File([pako.deflate(JSON.stringify(source))], 'portrait.pf');
    const deps = dependencies();
    const service = new ProjectFileImportService(deps);

    const result = await service.importFile(file);

    expect(result).toEqual({ projectId: 'imported-id', opened: true });
    expect(deps.projectLibrary.importProjectFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Portrait' })
    );
    expect(deps.workspace.openProject).toHaveBeenCalledWith('imported-id', {
      activate: true,
      saveActiveContext: true,
    });
  });

  it('keeps a valid import in the library when the workspace is full', async () => {
    const file = new File([JSON.stringify(project())], 'drawing.json');
    const deps = dependencies(false);
    const service = new ProjectFileImportService(deps);

    const result = await service.importFile(file);

    expect(result).toMatchObject({
      projectId: 'imported-id',
      opened: false,
    });
    expect(deps.projectLibrary.importProjectFile).toHaveBeenCalledOnce();
  });

  it('keeps the active drawing untouched when a real workspace is full', async () => {
    const activeContext = createProjectContext();
    activeContext.project.id.value = 'active-project';
    activeContext.project.name.value = 'Current drawing';
    const activeLayers = activeContext.layers.layers.value;
    const activeFrames = activeContext.animation.frames.value;
    const activeCels = activeContext.animation.cels.value;
    const openProject = vi.fn(async () => {
      throw new Error('The cap should prevent project hydration');
    });
    const workspace = new WorkspaceStore({
      initialContext: activeContext,
      initialItemId: 'active-project',
      itemLimit: 1,
      projectLibrary: {
        openProject,
        createProject: vi.fn(async () => 'unused-project'),
        createProjectFromFile: vi.fn(async () => 'unused-project'),
      },
      autoSave: {
        saveNow: vi.fn(async () => undefined),
        start: vi.fn(),
        stop: vi.fn(),
      },
    });
    const importedProjects = new Map<string, ProjectFile>();
    const service = new ProjectFileImportService({
      projectLibrary: {
        importProjectFile: vi.fn(async (input) => {
          importedProjects.set('imported-project', structuredClone(input) as ProjectFile);
          return 'imported-project';
        }),
        deleteProject: vi.fn(async () => undefined),
      },
      workspace,
    });

    try {
      const result = await service.importFile(
        new File([JSON.stringify(project('Imported drawing'))], 'drawing.json')
      );

      expect(result).toEqual({ projectId: 'imported-project', opened: false });
      expect(importedProjects.get('imported-project')?.name).toBe('Imported drawing');
      expect(openProject).not.toHaveBeenCalled();
      expect(workspace.activeItem.context).toBe(activeContext);
      expect(activeContext.project.id.value).toBe('active-project');
      expect(activeContext.project.name.value).toBe('Current drawing');
      expect(activeContext.layers.layers.value).toBe(activeLayers);
      expect(activeContext.animation.frames.value).toBe(activeFrames);
      expect(activeContext.animation.cels.value).toBe(activeCels);
    } finally {
      restoreDefaultProjectContext();
      activeContext.dispose();
    }
  });

  it('does not persist invalid or unsupported input', async () => {
    const deps = dependencies();
    const service = new ProjectFileImportService(deps);

    await expect(service.importFile(new File(['not zlib'], 'broken.pf'))).rejects.toThrow();
    await expect(service.importFile(new File(['{}'], 'notes.txt'))).rejects.toThrow(
      'Unsupported project file'
    );

    expect(deps.projectLibrary.importProjectFile).not.toHaveBeenCalled();
    expect(deps.workspace.openProject).not.toHaveBeenCalled();
  });

  it('serializes batches and keeps importing after one file fails', async () => {
    let releaseFirstImport: (() => void) | undefined;
    const firstImportPaused = new Promise<void>((resolve) => {
      releaseFirstImport = resolve;
    });
    const projectLibrary = {
      importProjectFile: vi.fn(async (input: ProjectFile) => {
        if (input.name === 'First') await firstImportPaused;
        return input.name ?? 'imported';
      }),
      deleteProject: vi.fn(async () => undefined),
    };
    const workspace = {
      openProject: vi.fn(async (projectId: string) => ({
        ok: true as const,
        projectId,
        item: {} as never,
      })),
    };
    const service = new ProjectFileImportService({ projectLibrary, workspace });
    const firstBatch = service.importFiles([
      new File([JSON.stringify(project('First'))], 'first.json'),
      new File(['broken'], 'broken.pf'),
    ]);
    const secondBatch = service.importFiles([
      new File([JSON.stringify(project('Second'))], 'second.json'),
    ]);

    await vi.waitFor(() => {
      expect(projectLibrary.importProjectFile).toHaveBeenCalledOnce();
    });
    expect(projectLibrary.importProjectFile.mock.calls[0][0].name).toBe('First');

    releaseFirstImport?.();
    const [firstOutcomes, secondOutcomes] = await Promise.all([firstBatch, secondBatch]);

    expect(firstOutcomes.map((outcome) => outcome.ok)).toEqual([true, false]);
    expect(secondOutcomes.map((outcome) => outcome.ok)).toEqual([true]);
    expect(projectLibrary.importProjectFile.mock.calls.map(([input]) => input.name)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('rolls back a library record when opening the imported project fails', async () => {
    const deps = dependencies();
    deps.workspace.openProject.mockRejectedValueOnce(new Error('Could not hydrate project'));
    const service = new ProjectFileImportService(deps);
    const file = new File([JSON.stringify(project())], 'broken-images.json');

    await expect(service.importFile(file)).rejects.toThrow('Could not hydrate project');

    expect(deps.projectLibrary.deleteProject).toHaveBeenCalledWith('imported-id');
  });
});
