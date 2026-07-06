import type { ProjectFile } from '../../types/project';

/** Lightweight listing info — everything a project browser needs without loading pixels. */
export interface ProjectMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  lastModified: number;
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

  /** Load a full project. Returns null when the id is unknown. */
  load(id: string): Promise<ProjectFile | null>;

  /** Create or overwrite a project under the given id. */
  save(id: string, project: ProjectFile): Promise<void>;

  /** Remove a project. Unknown ids are a no-op. */
  delete(id: string): Promise<void>;

  /** The project to reopen on startup, if any. */
  getLastOpenedProjectId(): Promise<string | null>;

  /** Remember which project to reopen on startup. */
  setLastOpenedProjectId(id: string): Promise<void>;
}
