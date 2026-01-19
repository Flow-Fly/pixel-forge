/**
 * Tile Fill Tool
 *
 * Flood fills a contiguous region with the selected tile.
 * Supports:
 * - Single click fill on empty regions
 * - Single click fill on regions with matching tile ID
 * - Early exit when fill tile matches target tile
 *
 * Uses 4-way connectivity (cardinal directions only).
 * Iterative BFS approach prevents stack overflow on large maps.
 *
 * Story: 3-4-tile-fill-tool
 */

import { BaseTool, type ModifierKeys } from './base-tool';
import { tilemapStore } from '../stores/tilemap';
import { tilesetStore } from '../stores/tileset';
import { dirtyRectStore } from '../stores/dirty-rect';

export class TileFillTool extends BaseTool {
  name = 'tile-fill';
  cursor = 'crosshair';

  // For hover preview
  private hoverX: number | null = null;
  private hoverY: number | null = null;

  /**
   * Convert pixel coordinates to tile coordinates
   * Uses tilemapStore tile dimensions
   */
  private pixelToTile(pixelX: number, pixelY: number): { tileX: number; tileY: number } {
    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;

    const tileX = Math.floor(pixelX / tileWidth);
    const tileY = Math.floor(pixelY / tileHeight);

    return { tileX, tileY };
  }

  /**
   * Check if coordinates are within tilemap bounds
   */
  private isInBounds(tileX: number, tileY: number): boolean {
    const width = tilemapStore.width.value;
    const height = tilemapStore.height.value;
    return tileX >= 0 && tileX < width && tileY >= 0 && tileY < height;
  }

  /**
   * Flood fill algorithm using 4-way connectivity
   * Uses iterative BFS to avoid stack overflow on large regions
   *
   * @param startX - Starting X tile coordinate
   * @param startY - Starting Y tile coordinate
   * @param targetTileId - The tile ID to replace (0 for empty)
   * @param fillTileId - The tile ID to fill with
   */
  private floodFill(startX: number, startY: number, targetTileId: number, fillTileId: number): void {
    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!activeLayerId) return;

    const layer = tilemapStore.getLayerById(activeLayerId);
    if (!layer || layer.locked) return;

    // Early exit: same tile, no work needed (AC #5)
    if (targetTileId === fillTileId) return;

    const width = tilemapStore.width.value;
    const height = tilemapStore.height.value;

    // Queue for BFS traversal
    const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];

    // Set to track visited tiles (use string key "x,y")
    const visited = new Set<string>();
    visited.add(`${startX},${startY}`);

    // 4-way directions: up, down, left, right
    const directions = [
      { dx: 0, dy: -1 }, // up
      { dx: 0, dy: 1 },  // down
      { dx: -1, dy: 0 }, // left
      { dx: 1, dy: 0 },  // right
    ];

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;

      // Skip if out of bounds
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      // Get current tile at this position
      const currentTileId = tilemapStore.getTile(activeLayerId, x, y);

      // Skip if not the target tile
      if (currentTileId !== targetTileId) continue;

      // Fill this tile
      try {
        tilemapStore.setTile(activeLayerId, x, y, fillTileId);
      } catch (e) {
        console.warn('Tile fill failed at', x, y, e);
        continue;
      }

      // Add neighbors to queue
      for (const { dx, dy } of directions) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;

        if (!visited.has(key)) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  /**
   * Handle mouse/pen down - trigger flood fill
   */
  onDown(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = this.pixelToTile(x, y);

    // Bounds check
    if (!this.isInBounds(tileX, tileY)) return;

    // Check for selected tile
    const selectedTile = tilesetStore.selectedTileIndex.value;
    if (selectedTile === null) return;

    // Check for active layer
    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!activeLayerId) return;

    const layer = tilemapStore.getLayerById(activeLayerId);
    if (!layer || layer.locked) return;

    // Get target tile (the tile we're replacing)
    const targetTileId = tilemapStore.getTile(activeLayerId, tileX, tileY);

    // Fill tile is 1-based in storage (selectedTileIndex is 0-based)
    const fillTileId = selectedTile + 1;

    // Flood fill
    this.floodFill(tileX, tileY, targetTileId, fillTileId);
  }

  /**
   * No-op for drag - fill is single-click operation
   */
  onDrag(_x: number, _y: number, _modifiers?: ModifierKeys): void {
    // Fill tool doesn't support drag painting
  }

  /**
   * No-op for up - fill completes on down
   */
  onUp(_x: number, _y: number, _modifiers?: ModifierKeys): void {
    // Nothing to do
  }

  /**
   * Handle mouse move (hover) for preview
   */
  onMove(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = this.pixelToTile(x, y);

    const prevX = this.hoverX;
    const prevY = this.hoverY;

    // Check if layer is available and unlocked before showing preview
    const activeLayerId = tilemapStore.activeLayerId.value;
    const layer = activeLayerId ? tilemapStore.getLayerById(activeLayerId) : null;
    const canFill = layer && !layer.locked;

    if (this.isInBounds(tileX, tileY) && canFill) {
      this.hoverX = tileX;
      this.hoverY = tileY;
    } else {
      this.hoverX = null;
      this.hoverY = null;
    }

    if (this.hoverX !== prevX || this.hoverY !== prevY) {
      dirtyRectStore.requestFullRedraw();
    }
  }

  /**
   * Get fill preview position for visual feedback
   */
  getFillPreviewPosition(): { x: number; y: number } | null {
    if (this.hoverX === null || this.hoverY === null) {
      return null;
    }
    return { x: this.hoverX, y: this.hoverY };
  }
}
