import { signal } from '../core/signal';

/**
 * Tilemap Store - Manages tilemap dimensions, tile size, and grid visibility
 *
 * This is the foundation store for tilemap mode. It provides:
 * - Map dimensions in tiles (width x height)
 * - Tile size in pixels (tileWidth x tileHeight)
 * - Computed pixel dimensions for canvas sizing
 * - Grid visibility state (Story 1-4)
 *
 * Additional tilemap features (layers, tile data) will be added in Epic 3.
 */
class TilemapStore {
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
   * Set the tilemap dimensions in tiles
   * @param width - Number of tiles wide (1-10000)
   * @param height - Number of tiles tall (1-10000)
   * @throws Error if dimensions are invalid
   */
  setDimensions(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error('Tilemap dimensions must be integers');
    }
    if (width < 1 || height < 1) {
      throw new Error('Tilemap dimensions must be at least 1');
    }
    if (width > 10000 || height > 10000) {
      throw new Error('Tilemap dimensions cannot exceed 10000');
    }
    this.width.value = width;
    this.height.value = height;
  }

  /**
   * Set the tile size in pixels
   * @param tileWidth - Width of each tile in pixels (1-512)
   * @param tileHeight - Height of each tile in pixels (1-512)
   * @throws Error if tile size is invalid
   */
  setTileSize(tileWidth: number, tileHeight: number) {
    if (!Number.isInteger(tileWidth) || !Number.isInteger(tileHeight)) {
      throw new Error('Tile size must be integers');
    }
    if (tileWidth < 1 || tileHeight < 1) {
      throw new Error('Tile size must be at least 1 pixel');
    }
    if (tileWidth > 512 || tileHeight > 512) {
      throw new Error('Tile size cannot exceed 512 pixels');
    }
    this.tileWidth.value = tileWidth;
    this.tileHeight.value = tileHeight;
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
}

export const tilemapStore = new TilemapStore();
