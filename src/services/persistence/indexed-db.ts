import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface PixelForgeDB extends DBSchema {
  sprites: {
    key: string;
    value: any; // Will be typed properly later
  };
  settings: {
    key: string;
    value: any;
  };
}

class PersistenceService {
  private dbPromise: Promise<IDBPDatabase<PixelForgeDB>>;

  constructor() {
    this.dbPromise = openDB<PixelForgeDB>('pixel-forge-db', 1, {
      upgrade(db) {
        db.createObjectStore('sprites', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }

  async getSprite(id: string) {
    return (await this.dbPromise).get('sprites', id);
  }

  async saveSprite(sprite: any) {
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
