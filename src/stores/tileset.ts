import { signal } from '../core/signal';
import type { Tileset, LoadStatus } from '../types/tilemap';
import { InvalidTilesetError } from '../errors/tilemap-errors';

/**
 * Tileset Store - Manages tileset data with reactive signals
 *
 * This store provides:
 * - Tileset collection management (add/remove)
 * - Active tileset selection
 * - Tile image extraction from tilesets
 * - Tile selection state for the tileset panel
 *
 * Pattern: Follows tilemapStore pattern exactly with verb-first naming.
 * Events use past-tense kebab-case per project conventions.
 */
class TilesetStore extends EventTarget {
  /**
   * Collection of loaded tilesets
   */
  tilesets = signal<Tileset[]>([]);

  /**
   * Currently active tileset ID (null if none selected)
   */
  activeTilesetId = signal<string | null>(null);

  /**
   * Currently selected tile index in the tileset panel (null if none)
   */
  selectedTileIndex = signal<number | null>(null);

  /**
   * Loading status for async operations
   */
  loadStatus = signal<LoadStatus>('idle');

  /**
   * Add a tileset to the store
   * @param tileset - The tileset to add
   * @throws InvalidTilesetError if tileset is invalid or already exists
   */
  addTileset(tileset: Tileset): void {
    // Validate required fields
    if (!tileset.id || typeof tileset.id !== 'string') {
      throw new InvalidTilesetError('Tileset must have a valid string id');
    }
    if (!tileset.name || typeof tileset.name !== 'string') {
      throw new InvalidTilesetError('Tileset must have a valid string name');
    }
    if (!(tileset.image instanceof ImageBitmap)) {
      throw new InvalidTilesetError('Tileset image must be an ImageBitmap');
    }
    if (!Number.isInteger(tileset.tileWidth) || tileset.tileWidth < 1) {
      throw new InvalidTilesetError('Tileset tileWidth must be a positive integer');
    }
    if (!Number.isInteger(tileset.tileHeight) || tileset.tileHeight < 1) {
      throw new InvalidTilesetError('Tileset tileHeight must be a positive integer');
    }
    if (this.hasTileset(tileset.id)) {
      throw new InvalidTilesetError(`Tileset with id '${tileset.id}' already exists`);
    }

    // Add to array (immutable update for signal reactivity)
    this.tilesets.value = [...this.tilesets.value, tileset];

    this.dispatchEvent(new CustomEvent('tileset-added', { detail: { tileset } }));
  }

  /**
   * Remove a tileset from the store
   * @param id - The tileset ID to remove
   * @returns true if tileset was found and removed, false otherwise
   */
  removeTileset(id: string): boolean {
    const index = this.tilesets.value.findIndex(t => t.id === id);
    if (index === -1) {
      return false;
    }

    const wasActive = this.activeTilesetId.value === id;

    // Remove from array (immutable update)
    this.tilesets.value = this.tilesets.value.filter(t => t.id !== id);

    // Clear active tileset if it was removed
    if (wasActive) {
      this.activeTilesetId.value = null;
      this.selectedTileIndex.value = null;
    }

    this.dispatchEvent(new CustomEvent('tileset-removed', {
      detail: { id, wasActive }
    }));

    return true;
  }

  /**
   * Set the active tileset
   * @param id - The tileset ID to activate, or null to deactivate
   * @throws InvalidTilesetError if id is not null and tileset doesn't exist
   */
  setActiveTileset(id: string | null): void {
    // Validate id exists if not null
    if (id !== null && !this.hasTileset(id)) {
      throw new InvalidTilesetError(`Cannot set active tileset: tileset with id '${id}' does not exist`);
    }

    this.activeTilesetId.value = id;

    // Clear tile selection when changing active tileset
    this.selectedTileIndex.value = null;

    this.dispatchEvent(new CustomEvent('active-tileset-changed', {
      detail: { id, tileset: this.getActiveTileset() }
    }));
  }

  /**
   * Get the currently active tileset
   * @returns The active tileset or null if none selected
   */
  getActiveTileset(): Tileset | null {
    const id = this.activeTilesetId.value;
    if (id === null) {
      return null;
    }
    return this.getTileset(id);
  }

  /**
   * Set the selected tile index in the tileset panel
   * @param index - The tile index to select, or null to deselect
   * @throws InvalidTilesetError if no active tileset when setting non-null index
   * @throws InvalidTilesetError if index is out of bounds for active tileset
   */
  setSelectedTile(index: number | null): void {
    if (index !== null) {
      const activeTileset = this.getActiveTileset();
      if (!activeTileset) {
        throw new InvalidTilesetError('Cannot select tile: no active tileset');
      }
      if (index < 0 || index >= activeTileset.tileCount) {
        throw new InvalidTilesetError(
          `Cannot select tile: index ${index} is out of bounds (0-${activeTileset.tileCount - 1})`
        );
      }
    }
    this.selectedTileIndex.value = index;
  }

  /**
   * Get the currently selected tile index
   * @returns The selected tile index or null if none
   */
  getSelectedTile(): number | null {
    return this.selectedTileIndex.value;
  }

  /**
   * Get a tileset by ID
   * @param id - The tileset ID
   * @returns The tileset or null if not found
   */
  getTileset(id: string): Tileset | null {
    return this.tilesets.value.find(t => t.id === id) ?? null;
  }

  /**
   * Check if a tileset exists
   * @param id - The tileset ID
   * @returns true if tileset exists
   */
  hasTileset(id: string): boolean {
    return this.tilesets.value.some(t => t.id === id);
  }

  /**
   * Get the number of tilesets in the store
   * @returns The tileset count
   */
  getTilesetCount(): number {
    return this.tilesets.value.length;
  }

  /**
   * Calculate the source rectangle for a tile in a tileset
   * @param tilesetId - The tileset ID
   * @param tileIndex - The 0-based tile index
   * @returns The tile rectangle or null if invalid
   */
  getTileRect(tilesetId: string, tileIndex: number): { x: number; y: number; width: number; height: number } | null {
    const tileset = this.getTileset(tilesetId);
    if (!tileset) {
      return null;
    }
    if (tileIndex < 0 || tileIndex >= tileset.tileCount) {
      return null;
    }

    const col = tileIndex % tileset.columns;
    const row = Math.floor(tileIndex / tileset.columns);

    return {
      x: tileset.margin + col * (tileset.tileWidth + tileset.spacing),
      y: tileset.margin + row * (tileset.tileHeight + tileset.spacing),
      width: tileset.tileWidth,
      height: tileset.tileHeight
    };
  }

  /**
   * Extract tile image data from a tileset
   * @param tilesetId - The tileset ID
   * @param tileIndex - The 0-based tile index
   * @returns ImageData for the tile or null if invalid
   */
  getTileImage(tilesetId: string, tileIndex: number): ImageData | null {
    const tileset = this.getTileset(tilesetId);
    const rect = this.getTileRect(tilesetId, tileIndex);
    if (!tileset || !rect) {
      return null;
    }

    // Create offscreen canvas at tile dimensions
    const canvas = new OffscreenCanvas(rect.width, rect.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    // Draw tile region from ImageBitmap
    ctx.drawImage(
      tileset.image,
      rect.x, rect.y, rect.width, rect.height,  // Source rect
      0, 0, rect.width, rect.height              // Dest rect
    );

    return ctx.getImageData(0, 0, rect.width, rect.height);
  }

  /**
   * Clear all tilesets from the store
   * Used for testing and reset operations
   */
  clearAllTilesets(): void {
    const hadTilesets = this.tilesets.value.length > 0;
    this.tilesets.value = [];
    this.activeTilesetId.value = null;
    this.selectedTileIndex.value = null;
    this.loadStatus.value = 'idle';

    if (hadTilesets) {
      this.dispatchEvent(new CustomEvent('tilesets-cleared'));
    }
  }
}

export const tilesetStore = new TilesetStore();
