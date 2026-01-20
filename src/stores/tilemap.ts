import { signal } from '../core/signal';
import type { TileLayer, HeroEditState } from '../types/tilemap';
import { TileOutOfBoundsError, InvalidLayerError, LockedLayerError, InvalidTileIdError, MinimumLayerError, TilemapError, InvalidTilesetError } from '../errors/tilemap-errors';
import { tilesetStore } from './tileset';

/**
 * Initial state for hero edit mode
 * Story 5-1 Task 1.2
 */
const INITIAL_HERO_EDIT_STATE: HeroEditState = {
  active: false,
  tileId: null,
  tilesetId: null,
  editingCanvas: null,
  originalData: null
};

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

  // ========================================
  // Story 5-1: Hero Edit State (Task 1)
  // ========================================

  /**
   * Hero edit state for in-place tile editing
   * Story 5-1 Task 1.2
   */
  private _heroEditState = signal<HeroEditState>({ ...INITIAL_HERO_EDIT_STATE });

  /**
   * Get the hero edit state signal for reactive subscriptions
   * Story 5-1 Task 1.3
   */
  get heroEditState() {
    return this._heroEditState;
  }

  /**
   * Convenience getter for checking if hero edit is active
   * Story 5-1 Task 1.4
   */
  get heroEditActive(): boolean {
    return this._heroEditState.value.active;
  }

  /**
   * Convenience getter for the tile ID being edited
   * Story 5-1 Task 1.5
   */
  get editingTileId(): number | null {
    return this._heroEditState.value.tileId;
  }

  /**
   * Enter hero edit mode for a specific tile
   * Story 5-1 Task 2.1-2.9
   *
   * @param tileId - The tile ID to edit (1-based storage ID, must be > 0)
   * @param tilesetId - Optional tileset ID (defaults to activeTilesetId)
   * @throws TilemapError if no active tileset
   * @throws InvalidTilesetError if tileset doesn't exist
   * @throws InvalidTileIdError if tileId is invalid (0 or not in tileset)
   */
  enterHeroEdit(tileId: number, tilesetId?: string): void {
    // Task 2.3: Resolve tilesetId from parameter or activeTilesetId
    const resolvedTilesetId = tilesetId ?? this._activeTilesetId.value;
    if (!resolvedTilesetId) {
      throw new TilemapError('No active tileset for hero edit');
    }

    // Task 2.2: Validate tileId is valid (> 0 and exists in tileset)
    if (tileId === 0) {
      throw new InvalidTileIdError(tileId);
    }

    // Get tileset to validate and get dimensions
    const tileset = tilesetStore.getTileset(resolvedTilesetId);
    if (!tileset) {
      throw new InvalidTilesetError(resolvedTilesetId);
    }

    // Validate tile ID against tileset bounds
    if (!this.isValidTileId(tileId)) {
      throw new InvalidTileIdError(tileId);
    }

    // Task 2.4: Get tile image data from tilesetStore (0-based tileset index)
    const originalData = tilesetStore.getTileImage(resolvedTilesetId, tileId - 1);
    if (!originalData) {
      throw new TilemapError(`Cannot get tile image for tile ${tileId}`);
    }

    // Task 2.5: Create OffscreenCanvas with tileset's tile dimensions
    const editingCanvas = new OffscreenCanvas(tileset.tileWidth, tileset.tileHeight);
    const ctx = editingCanvas.getContext('2d');

    // Task 2.6: Draw tile image onto editingCanvas
    if (ctx) {
      ctx.putImageData(originalData, 0, 0);
    }

    // Task 2.7: Store original ImageData for undo support (deep copy)
    const originalDataCopy = new ImageData(
      new Uint8ClampedArray(originalData.data),
      originalData.width,
      originalData.height
    );

    // Task 2.8: Update _heroEditState signal immutably
    this._heroEditState.value = {
      active: true,
      tileId,
      tilesetId: resolvedTilesetId,
      editingCanvas,
      originalData: originalDataCopy
    };

    // Task 2.9: Fire hero-edit-entered event
    this.dispatchEvent(new CustomEvent('hero-edit-entered', {
      detail: { tileId, tilesetId: resolvedTilesetId }
    }));
  }

  /**
   * Exit hero edit mode
   * Story 5-1 Task 3.1-3.5
   *
   * @param save - Whether to save changes (default true, stub for Story 5-6)
   */
  exitHeroEdit(save: boolean = true): void {
    // Task 3.2: Return early if hero edit is not active
    if (!this._heroEditState.value.active) {
      return;
    }

    const { tileId } = this._heroEditState.value;

    // Task 3.3: Stub for future TileEditCommand (actual implementation in Story 5-6)
    // if (save) {
    //   // Will create TileEditCommand here
    // }

    // Task 3.4: Reset _heroEditState to initial state
    this._heroEditState.value = { ...INITIAL_HERO_EDIT_STATE };

    // Task 3.5: Fire hero-edit-exited event
    this.dispatchEvent(new CustomEvent('hero-edit-exited', {
      detail: { tileId, saved: save }
    }));
  }

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
   * Toggle layer visibility
   * Story 4-2 Task 1.2
   * @param layerId - The layer ID
   * @throws InvalidLayerError if layer doesn't exist
   */
  toggleLayerVisibility(layerId: string): void {
    const layer = this.getLayerById(layerId);
    if (!layer) {
      throw new InvalidLayerError(layerId);
    }

    const newVisible = !layer.visible;
    this._layers.value = this._layers.value.map(l =>
      l.id === layerId ? { ...l, visible: newVisible } : l
    );

    this.dispatchEvent(new CustomEvent('layer-visibility-changed', {
      detail: { layerId, visible: newVisible }
    }));
  }

  /**
   * Toggle layer locked state
   * Story 4-2 Task 2.2
   * @param layerId - The layer ID
   * @throws InvalidLayerError if layer doesn't exist
   */
  toggleLayerLocked(layerId: string): void {
    const layer = this.getLayerById(layerId);
    if (!layer) {
      throw new InvalidLayerError(layerId);
    }

    const newLocked = !layer.locked;
    this._layers.value = this._layers.value.map(l =>
      l.id === layerId ? { ...l, locked: newLocked } : l
    );

    this.dispatchEvent(new CustomEvent('layer-locked-changed', {
      detail: { layerId, locked: newLocked }
    }));
  }

  // ========================================
  // Story 4-3: Layer Reordering
  // ========================================

  /**
   * Reorder a layer to a new position
   * Story 4-3 Task 2.1-2.6
   * @param layerId - The layer ID to move
   * @param newIndex - The target index (0 = bottom, higher = top)
   * @throws InvalidLayerError if layer doesn't exist
   */
  reorderLayer(layerId: string, newIndex: number): void {
    const layers = this._layers.value;
    const oldIndex = layers.findIndex(l => l.id === layerId);

    if (oldIndex === -1) {
      throw new InvalidLayerError(layerId);
    }

    // Clamp newIndex to valid bounds
    const clampedIndex = Math.max(0, Math.min(layers.length - 1, newIndex));

    // No-op if same position
    if (oldIndex === clampedIndex) {
      return;
    }

    // Create new array with layer moved
    const newLayers = [...layers];
    const [removed] = newLayers.splice(oldIndex, 1);
    newLayers.splice(clampedIndex, 0, removed);

    this._layers.value = newLayers;

    this.dispatchEvent(new CustomEvent('layer-reordered', {
      detail: { layerId, oldIndex, newIndex: clampedIndex }
    }));
  }

  /**
   * Move layer up in z-order (towards top)
   * In array terms: move towards higher index
   * Story 4-3 Task 3.1, 3.3, 3.4
   * @param layerId - The layer ID to move
   * @throws InvalidLayerError if layer doesn't exist
   */
  moveLayerUp(layerId: string): void {
    const layers = this._layers.value;
    const index = layers.findIndex(l => l.id === layerId);

    if (index === -1) {
      throw new InvalidLayerError(layerId);
    }

    // Already at top - no-op
    if (index >= layers.length - 1) {
      return;
    }

    this.reorderLayer(layerId, index + 1);
  }

  /**
   * Move layer down in z-order (towards bottom)
   * In array terms: move towards lower index
   * Story 4-3 Task 3.2, 3.3, 3.4
   * @param layerId - The layer ID to move
   * @throws InvalidLayerError if layer doesn't exist
   */
  moveLayerDown(layerId: string): void {
    const layers = this._layers.value;
    const index = layers.findIndex(l => l.id === layerId);

    if (index === -1) {
      throw new InvalidLayerError(layerId);
    }

    // Already at bottom - no-op
    if (index <= 0) {
      return;
    }

    this.reorderLayer(layerId, index - 1);
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

    const trimmedName = newName.trim();

    // Skip if empty or unchanged
    if (!trimmedName || trimmedName === layer.name) {
      return;
    }

    const oldName = layer.name;

    // Update layer name immutably
    this._layers.value = this._layers.value.map(l =>
      l.id === layerId ? { ...l, name: trimmedName } : l
    );

    this.dispatchEvent(new CustomEvent('layer-renamed', {
      detail: { layerId, oldName, newName: trimmedName }
    }));
  }

  // ========================================
  // Story 4-4: Layer Deletion
  // ========================================

  /**
   * Check if a layer has no tiles (all values are 0)
   * Story 4-4 Task 3
   * @param layerId - The layer ID
   * @returns true if layer is empty (all tiles are 0), false otherwise
   * @throws InvalidLayerError if layer doesn't exist
   */
  isLayerEmpty(layerId: string): boolean {
    const layer = this.getLayerById(layerId);
    if (!layer) {
      throw new InvalidLayerError(layerId);
    }

    // Optimize with early return on first non-zero value
    for (let i = 0; i < layer.data.length; i++) {
      if (layer.data[i] !== 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Delete a layer with full data capture for undo support
   * Story 4-4 Task 2
   * @param layerId - The layer ID to delete
   * @returns The deleted layer data (for undo)
   * @throws InvalidLayerError if layer doesn't exist
   * @throws MinimumLayerError if this is the only layer
   */
  deleteLayer(layerId: string): TileLayer {
    const layers = this._layers.value;
    const layerIndex = layers.findIndex(l => l.id === layerId);

    if (layerIndex === -1) {
      throw new InvalidLayerError(layerId);
    }

    if (layers.length === 1) {
      throw new MinimumLayerError();
    }

    const deletedLayer = layers[layerIndex];
    const wasActive = this._activeLayerId.value === layerId;

    // Remove layer immutably
    const newLayers = layers.filter(l => l.id !== layerId);
    this._layers.value = newLayers;

    // Update active layer if needed
    let newActiveId: string | null = null;
    if (wasActive && newLayers.length > 0) {
      // Select same index if available (which is now the layer that was above)
      // Otherwise select last layer
      const newActiveIndex = Math.min(layerIndex, newLayers.length - 1);
      newActiveId = newLayers[newActiveIndex].id;
      this._activeLayerId.value = newActiveId;
    }

    this.dispatchEvent(new CustomEvent('layer-deleted', {
      detail: { layerId, layer: deletedLayer, wasActive, newActiveId }
    }));

    return deletedLayer;
  }

  /**
   * Restore a previously deleted layer (for undo)
   * Story 4-4 Task 6
   * @param layerData - The full layer data to restore
   * @param index - The index to insert at (optional, defaults to end)
   */
  restoreLayer(layerData: TileLayer, index?: number): void {
    const layers = this._layers.value;

    // Create a fresh copy of the layer data
    const restoredLayer: TileLayer = {
      ...layerData,
      data: new Uint32Array(layerData.data) // Deep copy
    };

    // Determine insertion index
    const insertIndex = index !== undefined
      ? Math.max(0, Math.min(index, layers.length))
      : layers.length;

    // Insert at index
    const newLayers = [...layers];
    newLayers.splice(insertIndex, 0, restoredLayer);
    this._layers.value = newLayers;

    this.dispatchEvent(new CustomEvent('layer-restored', {
      detail: { layerId: restoredLayer.id, layer: restoredLayer, index: insertIndex }
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
    this._heroEditState.value = { ...INITIAL_HERO_EDIT_STATE };
    this.width.value = 20;
    this.height.value = 15;
    this.tileWidth.value = 16;
    this.tileHeight.value = 16;
    this.gridVisible.value = true;
  }
}

export const tilemapStore = new TilemapStore();
