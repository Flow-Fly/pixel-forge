import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { StoredCustomPalette } from "../../types/palette";
import { log } from "../../utils/log";

interface PaletteDB extends DBSchema {
  palettes: {
    key: string;
    value: StoredCustomPalette;
    indexes: { "by-updated": number };
  };
}

class PalettePersistenceService {
  private dbPromise: Promise<IDBPDatabase<PaletteDB>>;

  constructor() {
    this.dbPromise = openDB<PaletteDB>("pixel-forge-palettes", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("palettes")) {
          const store = db.createObjectStore("palettes", { keyPath: "id" });
          store.createIndex("by-updated", "updatedAt");
        }
      },
    });
  }

  /**
   * Get all custom palettes, sorted by most recently updated
   */
  async getAllPalettes(): Promise<StoredCustomPalette[]> {
    try {
      return await this.getAllPalettesOrThrow();
    } catch (error) {
      log.error("Failed to load palettes from IndexedDB:", error);
      return [];
    }
  }

  /**
   * Get all custom palettes and expose storage failures to the caller.
   */
  async getAllPalettesOrThrow(): Promise<StoredCustomPalette[]> {
    const db = await this.dbPromise;
    const palettes = await db.getAllFromIndex("palettes", "by-updated");
    return palettes.reverse(); // Most recent first
  }

  /**
   * Save a new palette or update existing
   */
  async savePalette(palette: StoredCustomPalette): Promise<boolean> {
    try {
      const db = await this.dbPromise;
      await db.put("palettes", palette);
      return true;
    } catch (error) {
      log.error("Failed to save palette to IndexedDB:", error);
      return false;
    }
  }

  /**
   * Delete a palette by ID
   */
  async deletePalette(id: string): Promise<void> {
    try {
      const db = await this.dbPromise;
      await db.delete("palettes", id);
    } catch (error) {
      log.error("Failed to delete palette from IndexedDB:", error);
    }
  }

  /**
   * Update palette properties
   */
  async updatePalette(id: string, updates: Partial<StoredCustomPalette>): Promise<boolean> {
    try {
      const db = await this.dbPromise;
      const existing = await db.get("palettes", id);
      if (existing) {
        await db.put("palettes", {
          ...existing,
          ...updates,
          updatedAt: Date.now(),
        });
        return true;
      }
      return false;
    } catch (error) {
      log.error("Failed to update palette in IndexedDB:", error);
      return false;
    }
  }

  /**
   * Get a single palette by ID
   */
  async getPalette(id: string): Promise<StoredCustomPalette | undefined> {
    try {
      const db = await this.dbPromise;
      return await db.get("palettes", id);
    } catch (error) {
      log.error("Failed to get palette from IndexedDB:", error);
      return undefined;
    }
  }
}

export const palettePersistence = new PalettePersistenceService();
