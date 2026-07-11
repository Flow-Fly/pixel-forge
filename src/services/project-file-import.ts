import type { ProjectFileInput } from '../types/project';
import { projectLibrary, type ProjectLibraryService } from './project-library';
import { workspaceStore, type WorkspaceStore } from '../stores/workspace';
import { createProjectContext } from '../stores/project-context';

type ImportProjectLibrary = Pick<ProjectLibraryService, 'deleteProject' | 'importProjectFile'>;
type ImportWorkspace = Pick<WorkspaceStore, 'openProject'>;

export interface ProjectFileImportResult {
  projectId: string;
  opened: boolean;
}

export type ProjectFileImportOutcome =
  | {
      file: File;
      ok: true;
      result: ProjectFileImportResult;
    }
  | {
      file: File;
      ok: false;
      error: unknown;
    };

export interface ProjectFileImportDependencies {
  projectLibrary: ImportProjectLibrary;
  workspace: ImportWorkspace;
}

export class ProjectFileImportService {
  private readonly projectLibrary: ImportProjectLibrary;
  private readonly workspace: ImportWorkspace;
  private importQueue: Promise<void> = Promise.resolve();

  constructor(dependencies: ProjectFileImportDependencies) {
    this.projectLibrary = dependencies.projectLibrary;
    this.workspace = dependencies.workspace;
  }

  async importFile(file: File): Promise<ProjectFileImportResult> {
    const project = await this.decodeProjectFile(file);
    const projectId = await this.projectLibrary.importProjectFile(project);
    let openResult: Awaited<ReturnType<ImportWorkspace['openProject']>>;

    try {
      openResult = await this.workspace.openProject(projectId, {
        activate: true,
        saveActiveContext: true,
      });
    } catch (error) {
      await this.projectLibrary.deleteProject(projectId);
      throw error;
    }

    if (openResult.ok) {
      return { projectId, opened: true };
    }

    return { projectId, opened: false };
  }

  importFiles(files: Iterable<File>): Promise<ProjectFileImportOutcome[]> {
    const batch = Array.from(files);
    const importBatch = this.importQueue.then(() => this.importBatch(batch));
    this.importQueue = importBatch.then(
      () => undefined,
      () => undefined
    );
    return importBatch;
  }

  private async decodeProjectFile(file: File): Promise<ProjectFileInput> {
    const extension = getFileExtension(file.name);

    if (extension === 'ase' || extension === 'aseprite') {
      return await decodeAsepriteProjectFile(file);
    }

    return await decodePixelForgeProjectFile(file, extension);
  }

  private async importBatch(files: File[]): Promise<ProjectFileImportOutcome[]> {
    const outcomes: ProjectFileImportOutcome[] = [];

    for (const file of files) {
      try {
        outcomes.push({ file, ok: true, result: await this.importFile(file) });
      } catch (error) {
        outcomes.push({ file, ok: false, error });
      }
    }

    return outcomes;
  }
}

export const projectFileImportService = new ProjectFileImportService({
  projectLibrary,
  workspace: workspaceStore,
});

async function decodePixelForgeProjectFile(
  file: File,
  extension: string
): Promise<ProjectFileInput> {
  if (extension === 'pf') {
    const { default: pako } = await import('pako');
    const compressed = new Uint8Array(await file.arrayBuffer());
    return JSON.parse(pako.inflate(compressed, { to: 'string' })) as ProjectFileInput;
  }

  if (extension === 'json') {
    return JSON.parse(await file.text()) as ProjectFileInput;
  }

  throw new Error(`Unsupported project file: ${file.name}`);
}

async function decodeAsepriteProjectFile(file: File): Promise<ProjectFileInput> {
  const context = createProjectContext();

  try {
    const { importAseFile } = await import('./aseprite-service');
    await importAseFile(await file.arrayBuffer(), context);
    context.project.name.value = getFileStem(file.name);
    return await context.project.saveProject();
  } finally {
    context.dispose();
  }
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function getFileStem(filename: string): string {
  const extensionStart = filename.lastIndexOf('.');
  return extensionStart > 0 ? filename.slice(0, extensionStart) : filename;
}
