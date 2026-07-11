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
import { defaultProjectContext, type ProjectContext } from '../stores/project-context';
import { DB32_COLORS, PALETTE_BY_ID } from '../stores/palette/types';
import { PROJECT_VERSION, type ProjectFile, type ProjectFileInput } from '../types/project';
import { normalizeProjectFileImageData } from '../serialization/project-data';
import { migrateProjectFileForLoad } from '../serialization/project-load';
import { GUIDED_DRAWING_VERSION } from '../types/guided-drawing';

export type CreateProjectOptions = {
  name?: string;
  width?: number;
  height?: number;
};

export type CreateProjectSettings = {
  saveCurrent?: boolean;
  context?: ProjectContext;
};

export type OpenProjectSettings = {
  saveCurrent?: boolean;
  context?: ProjectContext;
};

export type DeleteProjectSettings = {
  context?: ProjectContext;
};

export class ProjectLibraryService {
  private readonly repository: ProjectRepository;

  constructor(repository: ProjectRepository) {
    this.repository = repository;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    return await this.repository.list();
  }

  async openProject(id: string, settings: OpenProjectSettings = {}): Promise<ProjectFile> {
    const context = settings.context ?? defaultProjectContext;
    if (settings.saveCurrent ?? true) {
      await autoSaveService.saveNow(context);
    }
    return await this.loadStoredProject(id, context);
  }

  async createProject(
    options: CreateProjectOptions,
    settings: CreateProjectSettings = {}
  ): Promise<string> {
    const context = settings.context ?? defaultProjectContext;
    if (settings.saveCurrent ?? true) {
      await autoSaveService.saveNow(context);
    }

    const id = uuidv4();
    const project = createBlankProjectFile(options);
    await this.repository.save(id, project);
    await this.loadStoredProject(id, context);

    return id;
  }

  async createProjectFromFile(
    project: ProjectFile,
    settings: CreateProjectSettings = {}
  ): Promise<string> {
    const context = settings.context ?? defaultProjectContext;
    if (settings.saveCurrent ?? true) {
      await autoSaveService.saveNow(context);
    }

    const id = uuidv4();
    await this.repository.save(id, structuredClone(project));
    await this.loadStoredProject(id, context);
    return id;
  }

  /** Persist an imported project under a fresh identity without opening it. */
  async importProjectFile(project: ProjectFileInput): Promise<string> {
    const id = uuidv4();
    const canonicalProject = migrateProjectFileForLoad(
      normalizeProjectFileImageData(structuredClone(project))
    );
    assertImportableProject(canonicalProject);

    await this.repository.save(id, {
      ...canonicalProject,
      version: PROJECT_VERSION,
    });
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

  async deleteProject(id: string, settings: DeleteProjectSettings = {}): Promise<void> {
    const context = settings.context ?? defaultProjectContext;
    if (id === context.project.id.value) {
      autoSaveService.clearPendingSave(context);
    }

    await this.repository.delete(id);
  }

  private async loadStoredProject(id: string, context: ProjectContext): Promise<ProjectFile> {
    const project = await this.getProjectOrThrow(id);

    await autoSaveService.runWithoutSaving(async () => {
      context.project.id.value = id;
      await context.project.loadProject(project);
      context.project.lastSaved.value = Date.now();
      context.viewport.resetView();
    }, context);

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

function assertImportableProject(project: ProjectFile): void {
  assertImport(isPositiveInteger(project.width), 'width must be a positive integer');
  assertImport(isPositiveInteger(project.height), 'height must be a positive integer');
  assertImport(Array.isArray(project.layers) && project.layers.length > 0, 'a layer is required');
  assertImport(Array.isArray(project.frames) && project.frames.length > 0, 'a frame is required');
  assertImport(Boolean(project.animation), 'animation state is missing');
  assertImport(isPositiveNumber(project.animation.fps), 'animation fps must be positive');
  assertImport(
    isFrameIndex(project.animation.currentFrameIndex, project.frames.length),
    'animation frame is out of range'
  );

  const layerIds = getImportLayerIds(project.layers);
  assertImportFrames(project.frames, layerIds);
  assertImportGuide(project.guidedDrawing);
}

function getImportLayerIds(layers: ProjectFile['layers']): Set<string> {
  const ids = layers.map((layer) => layer.id);
  assertImport(
    ids.every((id) => typeof id === 'string' && id.length > 0),
    'layer ids must be strings'
  );
  assertImport(new Set(ids).size === ids.length, 'layer ids must be unique');
  return new Set(ids);
}

function assertImportFrames(frames: ProjectFile['frames'], layerIds: Set<string>): void {
  const validFrames = frames.every(
    (frame) => typeof frame.id === 'string' && frame.id.length > 0 && Array.isArray(frame.cels)
  );
  assertImport(validFrames, 'frame data is incomplete');

  const frameIds = frames.map((frame) => frame.id);
  assertImport(new Set(frameIds).size === frameIds.length, 'frame ids must be unique');
  assertImport(
    frames.flatMap((frame) => frame.cels).every((cel) => layerIds.has(cel.layerId)),
    'a cel references an unknown layer'
  );
}

function assertImportGuide(guide: ProjectFile['guidedDrawing']): void {
  if (!guide) return;

  assertImport(guide.version === GUIDED_DRAWING_VERSION, 'guided drawing version is unsupported');
  assertImport(isPositiveInteger(guide.width), 'guided drawing width is invalid');
  assertImport(isPositiveInteger(guide.height), 'guided drawing height is invalid');
  assertImport(Array.isArray(guide.target), 'guided drawing target is missing');
  assertImport(
    guide.target.length === guide.width * guide.height,
    'guided drawing target size is invalid'
  );
  assertImport(Boolean(guide.settings), 'guided drawing settings are missing');
  assertImport(isOptionalPositiveInteger(guide.guideColorCount), 'guided color count is invalid');
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isOptionalPositiveInteger(value: number | undefined): boolean {
  return value === undefined || isPositiveInteger(value);
}

function isPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isFrameIndex(value: number, frameCount: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < frameCount;
}

function assertImport(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`Invalid project file: ${detail}`);
}
