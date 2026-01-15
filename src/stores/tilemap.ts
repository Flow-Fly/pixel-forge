import { signal } from '../core/signal';

/**
 * Tilemap Store - Manages tilemap dimensions, tile size, and grid visibility
 *
 * This is the foundation store for tilemap mode. It provides:
 * - Map dimensions in tiles (width x height)
 * - Tile size in pixels (tileWidth x tileHeight)
 * - Computed pixel dimensions for canvas sizing
 * - Grid visibility state (Story 1-4)
 * - Map configuration dialog integration (Story 1-5)
 *
 * Additional tilemap features (layers, tile data) will be added in Epic 3.
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
   * Resize the tilemap to new dimensions
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
    this.width.value = width;
    this.height.value = height;

    // Fire resize event (Story 1-5 Task 4.4)
    if (width !== oldWidth || height !== oldHeight) {
      this.dispatchEvent(new CustomEvent('tilemap-resized', {
        detail: { width, height, oldWidth, oldHeight }
      }));
    }
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
}

export const tilemapStore = new TilemapStore();
