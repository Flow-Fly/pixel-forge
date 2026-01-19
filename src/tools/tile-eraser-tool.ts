/**
 * Tile Eraser Tool
 *
 * Erases tiles from the tilemap canvas.
 * Supports:
 * - Single tile erasure on click
 * - Continuous erasing during drag
 * - Hover preview showing tile to be erased
 *
 * This tool follows the exact pattern established by TileBrushTool.
 * Erasing is implemented as setting tile value to 0 (empty).
 *
 * Story: 3-3-tile-eraser-tool
 */

import { BaseTool, type ModifierKeys } from './base-tool';
import { tilemapStore } from '../stores/tilemap';
import { dirtyRectStore } from '../stores/dirty-rect';

export class TileEraserTool extends BaseTool {
  name = 'tile-eraser';
  cursor = 'crosshair';

  // Erasing state
  private isErasing = false;
  private lastTileX: number | null = null;
  private lastTileY: number | null = null;

  // For Shift+click line erasing
  private lastErasedX: number | null = null;
  private lastErasedY: number | null = null;

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
   * Erase tile at the given tile coordinates (set to 0)
   * Validates layer lock and bounds before erasing
   */
  private eraseTile(tileX: number, tileY: number): void {
    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!activeLayerId) return; // No active layer

    const layer = tilemapStore.getLayerById(activeLayerId);
    if (!layer || layer.locked) return; // Layer locked or doesn't exist

    // Bounds check
    if (!this.isInBounds(tileX, tileY)) return;

    try {
      // 0 = empty tile (erase)
      tilemapStore.setTile(activeLayerId, tileX, tileY, 0);
    } catch (e) {
      // Log but don't crash - validation should have caught this
      console.warn('Tile erase failed:', e);
    }
  }

  /**
   * Get all tile positions along a line using Bresenham's algorithm
   * Used for continuous erasing and Shift+click lines
   */
  private getLinePositions(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
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
   * Handle mouse/pen down
   * Erases tile and initiates erasing state
   */
  onDown(x: number, y: number, modifiers?: ModifierKeys): void {
    const { tileX, tileY } = this.pixelToTile(x, y);

    this.isErasing = true;

    // Check for Shift+click line erasing
    if (modifiers?.shift && this.lastErasedX !== null && this.lastErasedY !== null) {
      // Erase line from last erased position to current
      const positions = this.getLinePositions(this.lastErasedX, this.lastErasedY, tileX, tileY);
      for (const pos of positions) {
        this.eraseTile(pos.x, pos.y);
      }
    } else {
      // Single tile erasure
      this.eraseTile(tileX, tileY);
    }

    // Update tracking state
    this.lastTileX = tileX;
    this.lastTileY = tileY;
  }

  /**
   * Handle mouse/pen drag
   * Erases tiles continuously along the drag path
   */
  onDrag(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (!this.isErasing) return;

    const { tileX, tileY } = this.pixelToTile(x, y);

    // Skip if same tile as last (avoid duplicate erasures)
    if (tileX === this.lastTileX && tileY === this.lastTileY) return;

    // Get line from last tile to current tile (handles fast movement)
    if (this.lastTileX !== null && this.lastTileY !== null) {
      const positions = this.getLinePositions(this.lastTileX, this.lastTileY, tileX, tileY);
      // Skip first position (already erased in previous call)
      for (let i = 1; i < positions.length; i++) {
        this.eraseTile(positions[i].x, positions[i].y);
      }
    } else {
      this.eraseTile(tileX, tileY);
    }

    this.lastTileX = tileX;
    this.lastTileY = tileY;
  }

  /**
   * Handle mouse/pen up
   * Ends erasing and records position for Shift+click
   */
  onUp(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = this.pixelToTile(x, y);

    this.isErasing = false;

    // Record last erased position for Shift+click line
    this.lastErasedX = tileX;
    this.lastErasedY = tileY;

    // Clear erasing tracking
    this.lastTileX = null;
    this.lastTileY = null;
  }

  /**
   * Handle mouse move (hover)
   * Updates preview position for eraser indicator rendering
   */
  onMove(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = this.pixelToTile(x, y);

    const prevX = this.hoverX;
    const prevY = this.hoverY;

    // Check if layer is available and unlocked before showing preview
    const activeLayerId = tilemapStore.activeLayerId.value;
    const layer = activeLayerId ? tilemapStore.getLayerById(activeLayerId) : null;
    const canErase = layer && !layer.locked;

    // Update hover position (only show if in bounds AND can erase)
    if (this.isInBounds(tileX, tileY) && canErase) {
      this.hoverX = tileX;
      this.hoverY = tileY;
    } else {
      // Clear hover when outside bounds or layer is locked
      this.hoverX = null;
      this.hoverY = null;
    }

    // Request redraw if hover position changed
    if (this.hoverX !== prevX || this.hoverY !== prevY) {
      dirtyRectStore.requestFullRedraw();
    }
  }

  /**
   * Get eraser hover position for visual feedback
   * Returns tile coordinates where eraser indicator should be drawn
   */
  getEraserPosition(): { x: number; y: number } | null {
    if (this.hoverX === null || this.hoverY === null) {
      return null;
    }
    return { x: this.hoverX, y: this.hoverY };
  }
}
