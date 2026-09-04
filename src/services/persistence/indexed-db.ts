import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import type { ProjectFile, ProjectFileInput } from '../../types/project';
import {
  ProjectAlreadyExistsError,
  type ProjectMeta,
  type ProjectRepository,
  type SaveProjectOptions,
  type WorkspaceState,
} from './project-repository';
import { log } from '../../utils/log';
import type {
  CreativeRunRecoveryPersistence,
  CreativeRunRecoveryRecord,
} from '../../editor/creative-run-recovery';

/** Key of the single-project slot used before multi-project support. */
const LEGACY_CURRENT_PROJECT_KEY = 'current-project';

const LAST_OPENED_SETTING_KEY = 'last-opened-project-id';
const WORKSPACE_STATE_SETTING_KEY = 'workspace-state';

interface StoredProject {
  id: string;
  project: ProjectFileInput;
  lastModified: number;
  thumbnail?: Uint8Array;
}

interface StoredSetting {
  key: string;
  value: unknown;
}

interface PixelForgeDB extends DBSchema {
  sprites: {
    key: string;
    value: StoredProject;
  };
  settings: {
    key: string;
    value: StoredSetting;
  };
  creativeRunRecovery: {
    key: string;
    value: CreativeRunRecoveryRecord;
  };
}

let pixelForgeDbPromise: Promise<IDBPDatabase<PixelForgeDB>> | null = null;

function openPixelForgeDb(): Promise<IDBPDatabase<PixelForgeDB>> {
  if (!pixelForgeDbPromise) {
    pixelForgeDbPromise = openDB<PixelForgeDB>('pixel-forge-db', 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sprites')) {
          db.createObjectStore('sprites', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('creativeRunRecovery')) {
          db.createObjectStore('creativeRunRecovery', { keyPath: 'runId' });
        }
      },
    });
  }
  return pixelForgeDbPromise;
}

/**
 * IndexedDB-backed ProjectRepository.
 *
 * Projects are stored by UUID in the existing `sprites` object store
 * (which always had `keyPath: 'id'`). The pre-multi-project record stored
 * under 'current-project' is adopted on first access: re-keyed to a fresh
 * UUID and marked as the last-opened project.
 */
class IndexedDbProjectRepository implements ProjectRepository {
  private dbPromise: Promise<IDBPDatabase<PixelForgeDB>>;

  constructor() {
    this.dbPromise = openPixelForgeDb().then((db) => this.migrateLegacySlot(db));
  }

  /**
   * Adopt the legacy single-slot record ('current-project') as a normal
   * UUID-keyed project. Runs once; later opens find nothing to migrate.
   */
  private async migrateLegacySlot(
    db: IDBPDatabase<PixelForgeDB>
  ): Promise<IDBPDatabase<PixelForgeDB>> {
    try {
      const legacy = await db.get('sprites', LEGACY_CURRENT_PROJECT_KEY);
      if (legacy) {
        const id = uuidv4();
        await db.put('sprites', { ...legacy, id });
        await db.delete('sprites', LEGACY_CURRENT_PROJECT_KEY);
        await db.put('settings', { key: LAST_OPENED_SETTING_KEY, value: id });
      }
    } catch (error) {
      log.error('Failed to migrate legacy project slot:', error);
    }
    return db;
  }

  async list(): Promise<ProjectMeta[]> {
    const db = await this.dbPromise;
    const stored = await db.getAll('sprites');
    return stored
      .map((s) => ({
        id: s.id,
        name: s.project.name || 'Untitled',
        width: s.project.width,
        height: s.project.height,
        lastModified: s.lastModified,
        thumbnail: s.thumbnail,
      }))
      .sort((a, b) => b.lastModified - a.lastModified);
  }

  async load(id: string): Promise<ProjectFileInput | null> {
    const db = await this.dbPromise;
    const stored = await db.get('sprites', id);
    return stored?.project ?? null;
  }

  async save(
    id: string,
    project: ProjectFile,
    options: { thumbnail?: Uint8Array } = {}
  ): Promise<void> {
    const db = await this.dbPromise;
    const existing = await db.get('sprites', id);
    const thumbnail = options.thumbnail === undefined ? existing?.thumbnail : options.thumbnail;
    await db.put('sprites', {
      id,
      project,
      lastModified: Date.now(),
      thumbnail,
    });
  }

  async create(
    id: string,
    project: ProjectFile,
    options: SaveProjectOptions = {},
  ): Promise<void> {
    const db = await this.dbPromise;
    try {
      await db.add('sprites', {
        id,
        project,
        lastModified: Date.now(),
        thumbnail: options.thumbnail,
      });
    } catch (error) {
      if (isConstraintError(error)) {
        throw new ProjectAlreadyExistsError(id);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('sprites', id);
  }

  async getLastOpenedProjectId(): Promise<string | null> {
    const db = await this.dbPromise;
    const setting = await db.get('settings', LAST_OPENED_SETTING_KEY);
    return typeof setting?.value === 'string' ? setting.value : null;
  }

  async setLastOpenedProjectId(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.put('settings', { key: LAST_OPENED_SETTING_KEY, value: id });
  }

  async getWorkspaceState(): Promise<WorkspaceState | null> {
    const db = await this.dbPromise;
    const setting = await db.get('settings', WORKSPACE_STATE_SETTING_KEY);
    return parseWorkspaceState(setting?.value);
  }

  async setWorkspaceState(state: WorkspaceState): Promise<void> {
    const db = await this.dbPromise;
    await db.put('settings', { key: WORKSPACE_STATE_SETTING_KEY, value: state });
    if (state.activeProjectId) {
      await db.put('settings', {
        key: LAST_OPENED_SETTING_KEY,
        value: state.activeProjectId,
      });
    }
  }
}

function isConstraintError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'ConstraintError';
}

export const projectRepository: ProjectRepository = new IndexedDbProjectRepository();

/** Additive browser-local persistence for bounded Creative Run recovery records. */
export class IndexedDbCreativeRunRecoveryPersistence implements CreativeRunRecoveryPersistence {
  private readonly dbPromise: Promise<IDBPDatabase<PixelForgeDB>>;

  constructor() {
    this.dbPromise = openPixelForgeDb();
  }

  async load(runId: string): Promise<CreativeRunRecoveryRecord | null> {
    const db = await this.dbPromise;
    const record = await db.get('creativeRunRecovery', runId);
    return record ? structuredClone(record) : null;
  }

  async save(record: CreativeRunRecoveryRecord): Promise<void> {
    const db = await this.dbPromise;
    await db.put('creativeRunRecovery', structuredClone(record));
  }

}

// fallow-ignore-next-line unused-export -- The Creative Run host binds this browser-local store when recovery is enabled.
export const creativeRunRecoveryPersistence = new IndexedDbCreativeRunRecoveryPersistence();

function parseWorkspaceState(value: unknown): WorkspaceState | null {
  if (!value || typeof value !== 'object') return null;

  const data = value as Partial<WorkspaceState>;
  if (!Array.isArray(data.openProjectIds)) return null;

  const openProjectIds = data.openProjectIds.filter(
    (projectId): projectId is string => typeof projectId === 'string' && projectId.length > 0
  );
  const activeProjectId =
    typeof data.activeProjectId === 'string' && data.activeProjectId.length > 0
      ? data.activeProjectId
      : null;

  return { openProjectIds, activeProjectId };
}
