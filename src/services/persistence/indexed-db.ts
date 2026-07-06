import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import type { ProjectFile } from '../../types/project';
import type { ProjectMeta, ProjectRepository } from './project-repository';

/** Key of the single-project slot used before multi-project support. */
const LEGACY_CURRENT_PROJECT_KEY = 'current-project';

const LAST_OPENED_SETTING_KEY = 'last-opened-project-id';

interface StoredProject {
  id: string;
  project: ProjectFile;
  lastModified: number;
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
    this.dbPromise = openDB<PixelForgeDB>('pixel-forge-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sprites')) {
          db.createObjectStore('sprites', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    }).then((db) => this.migrateLegacySlot(db));
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
      console.error('Failed to migrate legacy project slot:', error);
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
      }))
      .sort((a, b) => b.lastModified - a.lastModified);
  }

  async load(id: string): Promise<ProjectFile | null> {
    const db = await this.dbPromise;
    const stored = await db.get('sprites', id);
    return stored?.project ?? null;
  }

  async save(id: string, project: ProjectFile): Promise<void> {
    const db = await this.dbPromise;
    await db.put('sprites', {
      id,
      project,
      lastModified: Date.now(),
    });
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
}

export const projectRepository: ProjectRepository =
  new IndexedDbProjectRepository();
