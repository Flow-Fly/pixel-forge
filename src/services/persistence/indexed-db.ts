import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProjectFile } from '../../types/project';

const CURRENT_PROJECT_KEY = 'current-project';

interface StoredProject {
  id: string;
  project: ProjectFile;
  lastModified: number;
}

interface PixelForgeDB extends DBSchema {
  sprites: {
    key: string;
    value: StoredProject;
  };
  settings: {
    key: string;
    value: unknown;
  };
}

class PersistenceService {
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
    });
  }

  /**
   * Save the current project to IndexedDB.
   */
  async saveCurrentProject(project: ProjectFile): Promise<void> {
    try {
      const db = await this.dbPromise;
      await db.put('sprites', {
        id: CURRENT_PROJECT_KEY,
        project,
        lastModified: Date.now(),
      });
    } catch (error) {
      console.error('Failed to save project to IndexedDB:', error);
    }
  }

  /**
   * Load the current project from IndexedDB.
   * Returns null if no project exists or on error.
   */
  async loadCurrentProject(): Promise<ProjectFile | null> {
    try {
      const db = await this.dbPromise;
      const stored = await db.get('sprites', CURRENT_PROJECT_KEY);
      return stored?.project ?? null;
    } catch (error) {
      console.error('Failed to load project from IndexedDB:', error);
      return null;
    }
  }

  /**
   * Clear the current project from IndexedDB (for "New Project").
   */
  async clearCurrentProject(): Promise<void> {
    try {
      const db = await this.dbPromise;
      await db.delete('sprites', CURRENT_PROJECT_KEY);
    } catch (error) {
      console.error('Failed to clear project from IndexedDB:', error);
    }
  }

  /**
   * Check if a saved project exists.
   */
  async hasCurrentProject(): Promise<boolean> {
    try {
      const db = await this.dbPromise;
      const stored = await db.get('sprites', CURRENT_PROJECT_KEY);
      return stored !== undefined;
    } catch {
      return false;
    }
  }

  // Legacy methods for backwards compatibility
  async getSprite(id: string) {
    return (await this.dbPromise).get('sprites', id);
  }

  async saveSprite(sprite: StoredProject) {
    return (await this.dbPromise).put('sprites', sprite);
  }

  async getAllSprites() {
    return (await this.dbPromise).getAll('sprites');
  }

  async deleteSprite(id: string) {
    return (await this.dbPromise).delete('sprites', id);
  }
}

export const persistenceService = new PersistenceService();
