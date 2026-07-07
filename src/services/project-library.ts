import { v4 as uuidv4 } from 'uuid';
import { autoSaveService } from './auto-save';
import type { ProjectRepository } from './persistence/project-repository';
import { projectRepository } from './persistence/indexed-db';
import type { ProjectMeta } from './persistence/project-repository';
import {
  DEFAULT_PROJECT_HEIGHT,
  DEFAULT_PROJECT_PALETTE_ID,
  DEFAULT_PROJECT_WIDTH,
  clampProjectDimension,
  normalizeProjectName,
} from './project-defaults';
import { projectStore } from '../stores/project';
import { DB32_COLORS, PALETTE_BY_ID } from '../stores/palette/types';
import { viewportStore } from '../stores/viewport';
import { PROJECT_VERSION, type ProjectFile } from '../types/project';

export type CreateProjectOptions = {
  name?: string;
  width?: number;
  height?: number;
};

export type CreateProjectSettings = {
  saveCurrent?: boolean;
};

export class ProjectLibraryService {
  private readonly repository: ProjectRepository;

  constructor(repository: ProjectRepository) {
    this.repository = repository;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    return await this.repository.list();
  }

  async openProject(id: string): Promise<ProjectFile> {
    await autoSaveService.saveNow();
    return await this.loadStoredProject(id);
  }

  async createProject(
    options: CreateProjectOptions,
    settings: CreateProjectSettings = {}
  ): Promise<string> {
    if (settings.saveCurrent ?? true) {
      await autoSaveService.saveNow();
    }

    const id = uuidv4();
    const project = createBlankProjectFile(options);
    await this.repository.save(id, project);
    await this.loadStoredProject(id);

    return id;
  }

  async duplicateProject(id: string): Promise<string> {
    const project = await this.getProjectOrThrow(id);
    const sourceMeta = await this.findProjectMeta(id);
    const copyId = uuidv4();
    const copy = structuredClone(project);
    copy.name = `Copy of ${normalizeProjectName(project.name)}`;

    await this.repository.save(copyId, copy, {
      thumbnail: sourceMeta?.thumbnail,
    });
    return copyId;
  }

  async renameProject(id: string, name: string): Promise<void> {
    const project = await this.getProjectOrThrow(id);
    await this.repository.save(id, {
      ...project,
      name: normalizeProjectName(name),
    });
  }

  async deleteProject(id: string): Promise<void> {
    if (id === projectStore.id.value) {
      autoSaveService.clearPendingSave();
    }

    await this.repository.delete(id);
  }

  private async loadStoredProject(id: string): Promise<ProjectFile> {
    const project = await this.getProjectOrThrow(id);

    await autoSaveService.runWithoutSaving(async () => {
      projectStore.id.value = id;
      await projectStore.loadProject(project);
      projectStore.lastSaved.value = Date.now();
      viewportStore.resetView();
    });

    await this.repository.setLastOpenedProjectId(id);
    return project;
  }

  private async getProjectOrThrow(id: string): Promise<ProjectFile> {
    const project = await this.repository.load(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }
    return project;
  }

  private async findProjectMeta(id: string): Promise<ProjectMeta | undefined> {
    const projects = await this.repository.list();
    return projects.find((project) => project.id === id);
  }
}

export const projectLibrary = new ProjectLibraryService(projectRepository);

function createBlankProjectFile(options: CreateProjectOptions): ProjectFile {
  const layerId = uuidv4();
  const frameId = uuidv4();
  const width = clampProjectDimension(
    options.width ?? DEFAULT_PROJECT_WIDTH,
    DEFAULT_PROJECT_WIDTH
  );
  const height = clampProjectDimension(
    options.height ?? DEFAULT_PROJECT_HEIGHT,
    DEFAULT_PROJECT_HEIGHT
  );

  return {
    version: PROJECT_VERSION,
    name: normalizeProjectName(options.name),
    width,
    height,
    palette: getDefaultPalette(),
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

function getDefaultPalette(): string[] {
  const palette = PALETTE_BY_ID.get(DEFAULT_PROJECT_PALETTE_ID);
  return [...(palette?.colors ?? DB32_COLORS)];
}
