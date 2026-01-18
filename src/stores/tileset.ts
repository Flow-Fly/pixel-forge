import { signal } from '../core/signal';
import type { Tileset, LoadStatus } from '../types/tilemap';
import { InvalidTilesetError, TileOutOfBoundsError } from '../errors/tilemap-errors';

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

  /**
   * Create a new tileset from ImageData (single tile)
   * Used by "Send to Tileset" feature to create tileset from pixel art
   * @param imageData - The image data for the first tile
   * @param name - Optional name for the tileset
   * @returns The ID of the newly created tileset
   */
  async createTilesetFromImageData(
    imageData: ImageData,
    name: string = 'New Tileset'
  ): Promise<string> {
    if (!imageData || imageData.width < 1 || imageData.height < 1) {
      throw new InvalidTilesetError('Invalid image data provided');
    }

    const tileWidth = imageData.width;
    const tileHeight = imageData.height;

    // Create a canvas with the single tile
    const canvas = new OffscreenCanvas(tileWidth, tileHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new InvalidTilesetError('Failed to create canvas context');
    }

    ctx.putImageData(imageData, 0, 0);

    // Create ImageBitmap from canvas
    const imageBitmap = await createImageBitmap(canvas);

    const tileset: Tileset = {
      id: crypto.randomUUID(),
      name,
      image: imageBitmap,
      imagePath: '', // Created from art, no file path
      tileWidth,
      tileHeight,
      columns: 1,
      rows: 1,
      tileCount: 1,
      spacing: 0,
      margin: 0,
    };

    this.addTileset(tileset);

    this.dispatchEvent(new CustomEvent('tileset-created', {
      detail: { tileset }
    }));

    return tileset.id;
  }

  /**
   * Add a tile to an existing tileset
   * Used by "Send to Tileset" feature to append tiles
   * @param tilesetId - The tileset ID to add to
   * @param imageData - The image data for the new tile
   * @returns The index of the newly added tile (0-based)
   */
  async addTileToTileset(
    tilesetId: string,
    imageData: ImageData
  ): Promise<number> {
    const tileset = this.getTileset(tilesetId);
    if (!tileset) {
      throw new InvalidTilesetError(`Tileset ${tilesetId} not found`);
    }

    // Validate tile size matches tileset
    if (imageData.width !== tileset.tileWidth || imageData.height !== tileset.tileHeight) {
      throw new InvalidTilesetError(
        `Tile size ${imageData.width}×${imageData.height} doesn't match tileset ${tileset.tileWidth}×${tileset.tileHeight}`
      );
    }

    // Calculate new tileset dimensions (keep roughly square)
    const newTileCount = tileset.tileCount + 1;
    const newColumns = Math.ceil(Math.sqrt(newTileCount));
    const newRows = Math.ceil(newTileCount / newColumns);

    // Create new canvas with space for all tiles
    const newCanvas = new OffscreenCanvas(
      newColumns * tileset.tileWidth,
      newRows * tileset.tileHeight
    );
    const ctx = newCanvas.getContext('2d');
    if (!ctx) {
      throw new InvalidTilesetError('Failed to create canvas context');
    }

    // Copy existing tiles
    ctx.drawImage(tileset.image, 0, 0);

    // Add new tile at next position
    const newTileIndex = tileset.tileCount;
    const tileX = (newTileIndex % newColumns) * tileset.tileWidth;
    const tileY = Math.floor(newTileIndex / newColumns) * tileset.tileHeight;
    ctx.putImageData(imageData, tileX, tileY);

    // Create new ImageBitmap
    const newImageBitmap = await createImageBitmap(newCanvas);

    // Release old ImageBitmap
    tileset.image.close();

    // Update tileset
    tileset.image = newImageBitmap;
    tileset.columns = newColumns;
    tileset.rows = newRows;
    tileset.tileCount = newTileCount;

    // Trigger signal update
    this.tilesets.value = [...this.tilesets.value];

    this.dispatchEvent(new CustomEvent('tile-added', {
      detail: { tilesetId, tileIndex: newTileIndex }
    }));

    return newTileIndex;
  }

  /**
   * Replace an existing tile in a tileset
   * Used by "Send to Tileset" feature for tile replacement
   * @param tilesetId - The tileset ID
   * @param tileIndex - The 0-based tile index to replace
   * @param imageData - The new image data for the tile
   */
  async replaceTile(
    tilesetId: string,
    tileIndex: number,
    imageData: ImageData
  ): Promise<void> {
    const tileset = this.getTileset(tilesetId);
    if (!tileset) {
      throw new InvalidTilesetError(`Tileset ${tilesetId} not found`);
    }

    if (tileIndex < 0 || tileIndex >= tileset.tileCount) {
      throw new TileOutOfBoundsError(
        `Tile index ${tileIndex} out of bounds (0-${tileset.tileCount - 1})`
      );
    }

    // Validate tile size matches tileset
    if (imageData.width !== tileset.tileWidth || imageData.height !== tileset.tileHeight) {
      throw new InvalidTilesetError(
        `Tile size ${imageData.width}×${imageData.height} doesn't match tileset ${tileset.tileWidth}×${tileset.tileHeight}`
      );
    }

    // Create new canvas from existing tileset
    const canvas = new OffscreenCanvas(
      tileset.columns * tileset.tileWidth,
      tileset.rows * tileset.tileHeight
    );
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new InvalidTilesetError('Failed to create canvas context');
    }

    // Copy existing tileset
    ctx.drawImage(tileset.image, 0, 0);

    // Replace the specific tile
    const tileX = (tileIndex % tileset.columns) * tileset.tileWidth;
    const tileY = Math.floor(tileIndex / tileset.columns) * tileset.tileHeight;

    // Clear the tile area first
    ctx.clearRect(tileX, tileY, tileset.tileWidth, tileset.tileHeight);

    // Draw new tile data
    ctx.putImageData(imageData, tileX, tileY);

    // Create new ImageBitmap
    const newImageBitmap = await createImageBitmap(canvas);

    // Release old ImageBitmap
    tileset.image.close();

    // Update tileset
    tileset.image = newImageBitmap;

    // Trigger signal update - this will re-render all tile instances
    this.tilesets.value = [...this.tilesets.value];

    this.dispatchEvent(new CustomEvent('tile-replaced', {
      detail: { tilesetId, tileIndex }
    }));
  }
}

export const tilesetStore = new TilesetStore();
