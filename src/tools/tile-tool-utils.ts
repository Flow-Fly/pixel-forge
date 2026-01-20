/**
 * Shared utilities for tile tools
 *
 * Extracts common functionality used across tile-brush, tile-eraser,
 * tile-fill, and tile-select tools to reduce code duplication.
 */

import { tilemapStore } from '../stores/tilemap';

/**
 * Convert pixel coordinates to tile coordinates
 * Uses tilemapStore tile dimensions
 */
export function pixelToTile(pixelX: number, pixelY: number): { tileX: number; tileY: number } {
  const tileWidth = tilemapStore.tileWidth.value;
  const tileHeight = tilemapStore.tileHeight.value;

  const tileX = Math.floor(pixelX / tileWidth);
  const tileY = Math.floor(pixelY / tileHeight);

  return { tileX, tileY };
}

/**
 * Check if coordinates are within tilemap bounds
 */
export function isInBounds(tileX: number, tileY: number): boolean {
  const width = tilemapStore.width.value;
  const height = tilemapStore.height.value;
  return tileX >= 0 && tileX < width && tileY >= 0 && tileY < height;
}

/**
 * Get all tile positions along a line using Bresenham's algorithm
 * Used for continuous painting/erasing and Shift+click lines
 */
export function getLinePositions(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    positions.push({ x, y });

    if (x === x1 && y === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return positions;
}

/**
 * Check if a layer can be modified (exists, not locked)
 */
export function canModifyLayer(layerId: string | null): boolean {
  if (!layerId) return false;
  const layer = tilemapStore.getLayerById(layerId);
  return layer !== undefined && !layer.locked;
}

/**
 * Check if a layer can be modified, logging a warning if locked
 * Story 4-2 Task 4.4 - Visual feedback when painting is blocked
 */
export function canModifyLayerWithFeedback(layerId: string | null): boolean {
  if (!layerId) return false;
  const layer = tilemapStore.getLayerById(layerId);
  if (!layer) return false;
  if (layer.locked) {
    console.warn(`[PixelForge] Layer "${layer.name}" is locked - painting blocked`);
    return false;
  }
  return true;
}

/**
 * Get the appropriate cursor for tile tools based on layer state
 * Returns 'not-allowed' if layer is locked, 'crosshair' otherwise
 * Story 4-2 Task 4.3
 */
export function getTileCursor(): string {
  const layerId = tilemapStore.activeLayerId.value;
  if (!layerId) return 'crosshair';
  const layer = tilemapStore.getLayerById(layerId);
  if (layer?.locked) return 'not-allowed';
  return 'crosshair';
}
