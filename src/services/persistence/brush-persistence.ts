import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { StoredCustomBrush } from "../../types/brush";

interface BrushDB extends DBSchema {
  brushes: {
    key: string;
    value: StoredCustomBrush;
    indexes: { "by-modified": number };
  };
}

class BrushPersistenceService {
  private dbPromise: Promise<IDBPDatabase<BrushDB>>;

  constructor() {
    this.dbPromise = openDB<BrushDB>("pixel-forge-brushes", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("brushes")) {
          const store = db.createObjectStore("brushes", { keyPath: "id" });
          store.createIndex("by-modified", "modifiedAt");
        }
      },
    });
  }

  /**
   * Get all custom brushes, sorted by most recently modified
   */
  async getAllBrushes(): Promise<StoredCustomBrush[]> {
    try {
      const db = await this.dbPromise;
      const brushes = await db.getAllFromIndex("brushes", "by-modified");
      return brushes.reverse(); // Most recent first
    } catch (error) {
      console.error("Failed to load brushes from IndexedDB:", error);
      return [];
    }
  }

  /**
   * Save a new brush or update existing
   */
  async saveBrush(brush: StoredCustomBrush): Promise<void> {
    try {
      const db = await this.dbPromise;
      await db.put("brushes", brush);
    } catch (error) {
      console.error("Failed to save brush to IndexedDB:", error);
    }
  }

  /**
   * Delete a brush by ID
   */
  async deleteBrush(id: string): Promise<void> {
    try {
      const db = await this.dbPromise;
      await db.delete("brushes", id);
    } catch (error) {
      console.error("Failed to delete brush from IndexedDB:", error);
    }
  }

  /**
   * Update brush properties
   */
  async updateBrush(id: string, updates: Partial<StoredCustomBrush>): Promise<void> {
    try {
      const db = await this.dbPromise;
      const existing = await db.get("brushes", id);
      if (existing) {
        await db.put("brushes", {
          ...existing,
          ...updates,
          modifiedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error("Failed to update brush in IndexedDB:", error);
    }
  }

  /**
   * Get a single brush by ID
   */
  async getBrush(id: string): Promise<StoredCustomBrush | undefined> {
    try {
      const db = await this.dbPromise;
      return await db.get("brushes", id);
    } catch (error) {
      console.error("Failed to get brush from IndexedDB:", error);
      return undefined;
    }
  }
}

export const brushPersistence = new BrushPersistenceService();
