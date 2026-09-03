import type { ProjectFile, ProjectFileInput } from '../../types/project';

/** Lightweight listing info — everything a project browser needs without loading pixels. */
export interface ProjectMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  lastModified: number;
  thumbnail?: Uint8Array;
}

export interface SaveProjectOptions {
  thumbnail?: Uint8Array;
}

/** Raised when a fresh-only create would reuse an existing repository key. */
export class ProjectAlreadyExistsError extends Error {
  readonly projectId: string;

  constructor(projectId: string) {
    super(`Project already exists: ${projectId}`);
    this.name = 'ProjectAlreadyExistsError';
    this.projectId = projectId;
  }
}

export interface WorkspaceState {
  openProjectIds: string[];
  activeProjectId: string | null;
}

/**
 * Storage seam for projects.
 *
 * Everything that persists projects goes through this interface so that
 * storage backends are swappable: today IndexedDB, later a remote/cloud
 * implementation plus a sync coordinator composing the two (see issue #65).
 */
export interface ProjectRepository {
  /** List all stored projects (metadata only), most recently modified first. */
  list(): Promise<ProjectMeta[]>;

  /** Load a full project input. Older records may need migration before use. */
  load(id: string): Promise<ProjectFileInput | null>;

  /** Create or overwrite a project under the given id. */
  save(id: string, project: ProjectFile, options?: SaveProjectOptions): Promise<void>;

  /** Create a project only when its repository key is unused. */
  create(id: string, project: ProjectFile, options?: SaveProjectOptions): Promise<void>;

  /** Remove a project. Unknown ids are a no-op. */
  delete(id: string): Promise<void>;

  /** The project to reopen on startup, if any. */
  getLastOpenedProjectId(): Promise<string | null>;

  /** Remember which project to reopen on startup. */
  setLastOpenedProjectId(id: string): Promise<void>;

  /** The full open workspace to restore on startup, if any. */
  getWorkspaceState(): Promise<WorkspaceState | null>;

  /** Remember open tabs and the active project. */
  setWorkspaceState(state: WorkspaceState): Promise<void>;
}
