import type { ProjectFileInput } from '../types/project';
import { projectLibrary, type ProjectLibraryService } from './project-library';
import { workspaceStore, type WorkspaceStore } from '../stores/workspace';
import { createProjectContext } from '../stores/project-context';

type ImportProjectLibrary = Pick<ProjectLibraryService, 'importProjectFile'>;
type ImportWorkspace = Pick<WorkspaceStore, 'openProject'>;

export interface ProjectFileImportResult {
  projectId: string;
  opened: boolean;
  message?: string;
}

export interface ProjectFileImportDependencies {
  projectLibrary: ImportProjectLibrary;
  workspace: ImportWorkspace;
}

export class ProjectFileImportService {
  private readonly projectLibrary: ImportProjectLibrary;
  private readonly workspace: ImportWorkspace;

  constructor(dependencies: ProjectFileImportDependencies) {
    this.projectLibrary = dependencies.projectLibrary;
    this.workspace = dependencies.workspace;
  }

  async importFile(file: File): Promise<ProjectFileImportResult> {
    const project = await this.decodeProjectFile(file);
    const projectId = await this.projectLibrary.importProjectFile(project);
    const openResult = await this.workspace.openProject(projectId, {
      activate: true,
      saveActiveContext: true,
    });

    if (openResult.ok) {
      return { projectId, opened: true };
    }

    return {
      projectId,
      opened: false,
      message: `Imported ${project.name || file.name} into Project Library. ${openResult.message}`,
    };
  }

  private async decodeProjectFile(file: File): Promise<ProjectFileInput> {
    const extension = getFileExtension(file.name);

    if (extension === 'ase' || extension === 'aseprite') {
      return await decodeAsepriteProjectFile(file);
    }

    return await decodePixelForgeProjectFile(file, extension);
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
