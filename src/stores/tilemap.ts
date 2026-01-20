import { signal } from '../core/signal';
import type { TileLayer } from '../types/tilemap';
import { TileOutOfBoundsError, InvalidLayerError, LockedLayerError, InvalidTileIdError } from '../errors/tilemap-errors';
import { tilesetStore } from './tileset';

/**
 * Tilemap Store - Manages tilemap dimensions, tile size, grid visibility,
 * layer management, and tile data operations
 *
 * This is the foundation store for tilemap mode. It provides:
 * - Map dimensions in tiles (width x height)
 * - Tile size in pixels (tileWidth x tileHeight)
 * - Computed pixel dimensions for canvas sizing
 * - Grid visibility state (Story 1-4)
 * - Map configuration dialog integration (Story 1-5)
 * - Layer management with Uint32Array data (Story 3-1)
 * - Tile placement operations with bounds checking (Story 3-1)
 * - Dirty rect tracking for efficient rendering (Story 3-1)
 */
class TilemapStore extends EventTarget {
  /**
   * Map width in tiles (default 20)
   */
  width = signal<number>(20);

  /**
   * Map height in tiles (default 15)
   */
  height = signal<number>(15);

  /**
   * Tile width in pixels (default 16)
   */
  tileWidth = signal<number>(16);

  /**
   * Tile height in pixels (default 16)
   */
  tileHeight = signal<number>(16);

  /**
   * Grid visibility state (default true in Map mode)
   * Story 1-4 Task 2.1
   */
  gridVisible = signal<boolean>(true);

  /**
   * Get the total width of the tilemap in pixels
   */
  get pixelWidth(): number {
    return this.width.value * this.tileWidth.value;
  }

  /**
   * Get the total height of the tilemap in pixels
   */
  get pixelHeight(): number {
    return this.height.value * this.tileHeight.value;
  }

  /**
   * Set the tile size in pixels
   * @param tileWidth - Width of each tile in pixels (1-256)
   * @param tileHeight - Height of each tile in pixels (1-256)
   * @throws Error if tile size is invalid
   */
  setTileSize(tileWidth: number, tileHeight: number) {
    if (!Number.isInteger(tileWidth) || !Number.isInteger(tileHeight)) {
      throw new Error('Tile size must be integers');
    }
    if (tileWidth < 1 || tileHeight < 1) {
      throw new Error('Tile size must be at least 1 pixel');
    }
    if (tileWidth > 256 || tileHeight > 256) {
      throw new Error('Tile size cannot exceed 256 pixels');
    }
    const oldTileWidth = this.tileWidth.value;
    const oldTileHeight = this.tileHeight.value;
    this.tileWidth.value = tileWidth;
    this.tileHeight.value = tileHeight;

    // Fire tile size changed event (Story 1-5 Task 4.3)
    if (tileWidth !== oldTileWidth || tileHeight !== oldTileHeight) {
      this.dispatchEvent(new CustomEvent('tile-size-changed', {
        detail: { tileWidth, tileHeight, oldTileWidth, oldTileHeight }
      }));
    }
  }

  /**
   * Toggle grid visibility
   * Story 1-4 Task 2.2
   */
  toggleGrid() {
    this.gridVisible.value = !this.gridVisible.value;
  }

  /**
   * Set grid visibility directly
   * Story 1-4 Task 2.3
   */
  setGridVisible(visible: boolean) {
    this.gridVisible.value = visible;
  }

  // ========================================
  // Story 3-1: Layer Management (Task 1)
  // ========================================

  /**
   * Collection of tile layers
   * Story 3-1 Task 1.1
   */
  private _layers = signal<TileLayer[]>([]);
  get layers() {
    return this._layers;
  }

  /**
   * Currently active layer ID for editing
   * Story 3-1 Task 1.2
   */
  private _activeLayerId = signal<string | null>(null);
  get activeLayerId() {
    return this._activeLayerId;
  }

  /**
   * Active tileset ID for tile rendering
   * Story 3-1 Task 6.1
   */
  private _activeTilesetId = signal<string | null>(null);
  get activeTilesetId() {
    return this._activeTilesetId;
  }

  /**
   * Dirty tile coordinates for efficient re-rendering
   * Story 3-1 Task 4.1
   */
  private _dirtyTiles = signal<Set<string>>(new Set());

  /**
   * Add a new tile layer
   * Story 3-1 Task 1.3
   * @param name - Optional layer name (defaults to "Layer N")
   * @returns The created TileLayer
   */
  addLayer(name?: string): TileLayer {
    const layerCount = this._layers.value.length;
    const layerName = name ?? `Layer ${layerCount + 1}`;
    const w = this.width.value;
    const h = this.height.value;

    const layer: TileLayer = {
      id: crypto.randomUUID(),
      name: layerName,
      width: w,
      height: h,
      data: new Uint32Array(w * h), // Auto-initialized to 0
      visible: true,
      opacity: 1,
      locked: false,
    };

    // Immutable update for signal reactivity
    this._layers.value = [...this._layers.value, layer];

    // Set as active if first layer
    if (this._layers.value.length === 1) {
      this._activeLayerId.value = layer.id;
    }

    this.dispatchEvent(new CustomEvent('layer-created', {
      detail: { layer }
    }));

    return layer;
  }

  /**
   * Remove a tile layer
   * Story 3-1 Task 1.4
   * @param layerId - The layer ID to remove
   * @throws InvalidLayerError if layer doesn't exist
   */
  removeLayer(layerId: string): void {
    const layerIndex = this._layers.value.findIndex(l => l.id === layerId);
    if (layerIndex === -1) {
      throw new InvalidLayerError(layerId);
    }

    const removedLayer = this._layers.value[layerIndex];
    const wasActive = this._activeLayerId.value === layerId;

    // Immutable update
    this._layers.value = this._layers.value.filter(l => l.id !== layerId);

    // Update active layer if removed
    if (wasActive) {
      const remaining = this._layers.value;
      this._activeLayerId.value = remaining.length > 0 ? remaining[0].id : null;
    }

    this.dispatchEvent(new CustomEvent('layer-removed', {
      detail: { layerId, layer: removedLayer, wasActive }
    }));
  }

  /**
   * Get a layer by ID
   * Story 3-1 Task 1.5
   * @param layerId - The layer ID
   * @returns The TileLayer or undefined if not found
   */
  getLayerById(layerId: string): TileLayer | undefined {
    return this._layers.value.find(l => l.id === layerId);
  }

  /**
   * Initialize default layer on first Map mode entry
   * Story 3-1 Task 1.6
   */
  initializeDefaultLayer(): void {
    if (this._layers.value.length === 0) {
      this.addLayer('Layer 1');
    }
  }

  /**
   * Set the active layer for editing
   * @param layerId - The layer ID to make active
   * @throws InvalidLayerError if layer doesn't exist
   */
  setActiveLayer(layerId: string): void {
    if (!this.getLayerById(layerId)) {
      throw new InvalidLayerError(layerId);
    }
    this._activeLayerId.value = layerId;
  }

  /**
   * Set the locked state of a layer
   * @param layerId - The layer ID
   * @param locked - Whether the layer should be locked
   * @throws InvalidLayerError if layer doesn't exist
   */
  setLayerLocked(layerId: string, locked: boolean): void {
    const layer = this.getLayerById(layerId);
    if (!layer) {
      throw new InvalidLayerError(layerId);
    }

    // Update layer locked state immutably
    this._layers.value = this._layers.value.map(l =>
      l.id === layerId ? { ...l, locked } : l
    );
  }

  /**
   * Rename a layer
   * Story 4-1 Task 5
   * @param layerId - The layer ID
   * @param newName - The new name for the layer
   * @throws InvalidLayerError if layer doesn't exist
   */
  renameLayer(layerId: string, newName: string): void {
    const layer = this.getLayerById(layerId);
    if (!layer) {
      throw new InvalidLayerError(layerId);
    }

    // Trim whitespace and validate
    const trimmedName = newName.trim();
    if (!trimmedName) {
      // Reject empty names - caller should handle revert
      return;
    }

    const oldName = layer.name;

    // Update layer name immutably
    this._layers.value = this._layers.value.map(l =>
      l.id === layerId ? { ...l, name: trimmedName } : l
    );

    // Fire event
    this.dispatchEvent(new CustomEvent('layer-renamed', {
      detail: { layerId, oldName, newName: trimmedName }
    }));
  }

  // ========================================
  // Story 3-1: Tile Data Operations (Task 2)
  // ========================================

  /**
   * Validate that a tile ID is a non-negative integer
   * @param tileId - The tile ID to validate
   * @throws InvalidTileIdError if tileId is invalid
   */
  private validateTileId(tileId: number): void {
    if (!Number.isInteger(tileId) || tileId < 0) {
      throw new InvalidTileIdError(tileId);
    }
  }

  /**
   * Get a validated, writeable layer
   * @param layerId - The layer ID
   * @returns The validated layer
   * @throws InvalidLayerError if layer doesn't exist
   * @throws LockedLayerError if layer is locked
   */
  private getWriteableLayer(layerId: string): TileLayer {
    const layer = this.getLayerById(layerId);
    if (!layer) {
      throw new InvalidLayerError(layerId);
    }
    if (layer.locked) {
      throw new LockedLayerError(layerId);
    }
    return layer;
  }

  /**
   * Internal method to set a tile and fire events
   * @param layer - The validated layer
   * @param layerId - The layer ID
   * @param x - X coordinate in tiles
   * @param y - Y coordinate in tiles
   * @param tileId - The tile ID
   */
  private setTileInternal(layer: TileLayer, layerId: string, x: number, y: number, tileId: number): void {
    const index = y * layer.width + x;
    const previousTileId = layer.data[index];

    layer.data[index] = tileId;
    this.markDirty(x, y);
    this._layers.value = [...this._layers.value];

    this.dispatchEvent(new CustomEvent('tile-placed', {
      detail: { layerId, x, y, tileId, previousTileId }
    }));
  }

  /**
   * Set a tile at the given coordinates
   * Story 3-1 Task 2.1
   * @param layerId - The layer ID
   * @param x - X coordinate in tiles
   * @param y - Y coordinate in tiles
   * @param tileId - The tile ID (0 = empty, 1+ = tile index)
   * @throws InvalidLayerError if layer doesn't exist
   * @throws LockedLayerError if layer is locked
   * @throws TileOutOfBoundsError if coordinates are outside map bounds
   * @throws InvalidTileIdError if tileId is not a non-negative integer
   */
  setTile(layerId: string, x: number, y: number, tileId: number): void {
    const layer = this.getWriteableLayer(layerId);
    this.validateTileId(tileId);

    if (x < 0 || x >= layer.width || y < 0 || y >= layer.height) {
      throw new TileOutOfBoundsError(x, y, layer.width, layer.height);
    }

    this.setTileInternal(layer, layerId, x, y, tileId);
  }

  /**
   * Get a tile at the given coordinates
   * Story 3-1 Task 2.2
   * @param layerId - The layer ID
   * @param x - X coordinate in tiles
   * @param y - Y coordinate in tiles
   * @returns The tile ID (0 if empty)
   * @throws InvalidLayerError if layer doesn't exist
   * @throws TileOutOfBoundsError if coordinates are outside map bounds
   */
  getTile(layerId: string, x: number, y: number): number {
    const layer = this.getLayerById(layerId);
    if (!layer) {
      throw new InvalidLayerError(layerId);
    }

    if (x < 0 || x >= layer.width || y < 0 || y >= layer.height) {
      throw new TileOutOfBoundsError(x, y, layer.width, layer.height);
    }

    return layer.data[y * layer.width + x];
  }

  /**
   * Set a tile at a direct array index
   * Story 3-1 Task 2.4
   * @param layerId - The layer ID
   * @param index - The direct array index
   * @param tileId - The tile ID
   * @throws InvalidLayerError if layer doesn't exist
   * @throws LockedLayerError if layer is locked
   * @throws TileOutOfBoundsError if index is outside bounds
   * @throws InvalidTileIdError if tileId is not a non-negative integer
   */
  setTileAt(layerId: string, index: number, tileId: number): void {
    const layer = this.getWriteableLayer(layerId);
    this.validateTileId(tileId);

    if (index < 0 || index >= layer.data.length) {
      const x = index % layer.width;
      const y = Math.floor(index / layer.width);
      throw new TileOutOfBoundsError(x, y, layer.width, layer.height);
    }

    const x = index % layer.width;
    const y = Math.floor(index / layer.width);
    this.setTileInternal(layer, layerId, x, y, tileId);
  }

  /**
   * Clear a tile (set to 0)
   * Story 3-1 Task 2.5
   * @param layerId - The layer ID
   * @param x - X coordinate in tiles
   * @param y - Y coordinate in tiles
   */
  clearTile(layerId: string, x: number, y: number): void {
    this.setTile(layerId, x, y, 0);
  }

  // ========================================
  // Story 3-1: Dirty Rect Tracking (Task 4)
  // ========================================

  /**
   * Mark a tile position as dirty
   * Story 3-1 Task 4.2
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  private markDirty(x: number, y: number): void {
    const key = `${x},${y}`;
    const dirty = new Set(this._dirtyTiles.value);
    dirty.add(key);
    this._dirtyTiles.value = dirty;
  }

  /**
   * Get all dirty regions
   * Story 3-1 Task 4.3
   * @returns Array of dirty tile coordinates
   */
  getDirtyRegions(): { x: number; y: number }[] {
    return Array.from(this._dirtyTiles.value).map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
  }

  /**
   * Clear all dirty regions (call after render cycle)
   * Story 3-1 Task 4.4
   */
  clearDirtyRegions(): void {
    this._dirtyTiles.value = new Set();
  }

  /**
   * Get coalesced dirty rectangles for efficient rendering
   * Story 3-1 Task 4.5
   * @returns Array of rectangular regions covering dirty tiles
   */
  getCoalescedDirtyRegions(): { x: number; y: number; width: number; height: number }[] {
    const dirty = this.getDirtyRegions();
    if (dirty.length === 0) {
      return [];
    }

    // Simple bounding box approach for MVP
    // More sophisticated region merging can be added later
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const { x, y } of dirty) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    return [{
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    }];
  }

  // ========================================
  // Story 3-1: Tileset Integration (Task 6)
  // ========================================

  /**
   * Set the active tileset for rendering
   * Story 3-1 Task 6.1
   * @param tilesetId - The tileset ID or null to clear
   */
  setActiveTileset(tilesetId: string | null): void {
    this._activeTilesetId.value = tilesetId;
  }

  /**
   * Get tile image from the active tileset
   * Story 3-1 Task 6.2
   * @param tileId - The tile ID (1-based in storage, maps to 0-based tileset index)
   * @returns ImageData for the tile or null if invalid
   */
  getTileImage(tileId: number): ImageData | null {
    if (tileId === 0) {
      return null; // Empty tile
    }

    const tilesetId = this._activeTilesetId.value;
    if (!tilesetId) {
      return null;
    }

    // Convert 1-based storage ID to 0-based tileset index
    return tilesetStore.getTileImage(tilesetId, tileId - 1);
  }

  /**
   * Validate tile ID against active tileset
   * Story 3-1 Task 6.3
   * @param tileId - The tile ID to validate
   * @returns true if valid, false otherwise
   */
  isValidTileId(tileId: number): boolean {
    if (tileId === 0) {
      return true; // Empty tile is always valid
    }

    const tilesetId = this._activeTilesetId.value;
    if (!tilesetId) {
      return false;
    }

    const tileset = tilesetStore.getTileset(tilesetId);
    if (!tileset) {
      return false;
    }

    // tileId is 1-based, so valid range is 1 to tileCount
    return tileId >= 1 && tileId <= tileset.tileCount;
  }

  // ========================================
  // Story 3-1: Tilemap Resize with Data Preservation (Task 3)
  // ========================================

  /**
   * Resize the tilemap to new dimensions
   * Overrides base resizeTilemap to preserve layer data
   * Story 3-1 Task 3.3, 3.4
   * @param width - Number of tiles wide (1-500)
   * @param height - Number of tiles tall (1-500)
   * @throws Error if dimensions are invalid
   */
  resizeTilemap(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error('Tilemap dimensions must be integers');
    }
    if (width < 1 || height < 1) {
      throw new Error('Tilemap dimensions must be at least 1');
    }
    if (width > 500 || height > 500) {
      throw new Error('Tilemap dimensions cannot exceed 500');
    }

    const oldWidth = this.width.value;
    const oldHeight = this.height.value;

    // Update dimensions
    this.width.value = width;
    this.height.value = height;

    // Resize each layer's data while preserving existing tiles
    if (this._layers.value.length > 0) {
      this._layers.value = this._layers.value.map(layer => {
        const newData = new Uint32Array(width * height);

        // Copy existing data where it fits
        const copyWidth = Math.min(oldWidth, width);
        const copyHeight = Math.min(oldHeight, height);

        for (let y = 0; y < copyHeight; y++) {
          for (let x = 0; x < copyWidth; x++) {
            const oldIndex = y * oldWidth + x;
            const newIndex = y * width + x;
            newData[newIndex] = layer.data[oldIndex];
          }
        }

        return {
          ...layer,
          width,
          height,
          data: newData
        };
      });
    }

    // Fire resize event
    if (width !== oldWidth || height !== oldHeight) {
      this.dispatchEvent(new CustomEvent('tilemap-resized', {
        detail: { width, height, oldWidth, oldHeight }
      }));
    }
  }

  /**
   * Reset the store to initial state
   * Used for testing and new project creation
   */
  reset(): void {
    this._layers.value = [];
    this._activeLayerId.value = null;
    this._activeTilesetId.value = null;
    this._dirtyTiles.value = new Set();
    this.width.value = 20;
    this.height.value = 15;
    this.tileWidth.value = 16;
    this.tileHeight.value = 16;
    this.gridVisible.value = true;
  }
}

export const tilemapStore = new TilemapStore();
