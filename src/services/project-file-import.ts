import type { ProjectFileInput } from '../types/project';
import { projectLibrary, type ProjectLibraryService } from './project-library';
import { workspaceStore, type WorkspaceStore } from '../stores/workspace';

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
    const project = await decodeProjectFile(file);
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
}

export const projectFileImportService = new ProjectFileImportService({
  projectLibrary,
  workspace: workspaceStore,
});

async function decodeProjectFile(file: File): Promise<ProjectFileInput> {
  const extension = getFileExtension(file.name);

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

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}
