/**
 * Tile Brush Tool
 *
 * A brush tool for placing tiles on the tilemap canvas.
 * Supports:
 * - Single tile placement on click
 * - Continuous painting during drag
 * - Shift+click line drawing from last position
 * - Ghost preview rendering
 *
 * This is the first tile painting tool and establishes patterns
 * for subsequent tile tools (eraser, fill).
 *
 * Story: 3-2-tile-brush-tool
 */

import { BaseTool, type ModifierKeys } from './base-tool';
import { tilemapStore } from '../stores/tilemap';
import { tilesetStore } from '../stores/tileset';
import { dirtyRectStore } from '../stores/dirty-rect';

export class TileBrushTool extends BaseTool {
  name = 'tile-brush';
  cursor = 'crosshair';

  // Drawing state
  private isDrawing = false;
  private isRightClickErasing = false; // Track right-click erase mode (button only valid in mousedown)
  private lastTileX: number | null = null;
  private lastTileY: number | null = null;

  // For Shift+click line drawing
  private lastPlacedX: number | null = null;
  private lastPlacedY: number | null = null;

  // For ghost preview
  private previewX: number | null = null;
  private previewY: number | null = null;

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
   * Used for right-click quick erase functionality
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
   * Place a tile at the given tile coordinates
   * Validates selection, layer lock, and bounds before placing
   */
  private placeTile(tileX: number, tileY: number): void {
    const selectedTile = tilesetStore.selectedTileIndex.value;
    if (selectedTile === null) return; // No tile selected

    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!activeLayerId) return; // No active layer

    const layer = tilemapStore.getLayerById(activeLayerId);
    if (!layer || layer.locked) return; // Layer locked or doesn't exist

    // Bounds check
    if (!this.isInBounds(tileX, tileY)) return;

    // tileId is 1-based in storage (0 = empty), selectedTileIndex is 0-based
    const tileId = selectedTile + 1;

    try {
      tilemapStore.setTile(activeLayerId, tileX, tileY, tileId);
    } catch (e) {
      // Log but don't crash - validation should have caught this
      console.warn('Tile placement failed:', e);
    }
  }

  /**
   * Get all tile positions along a line using Bresenham's algorithm
   * Used for continuous painting and Shift+click lines
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
   * Places tile and initiates drawing state
   * Right-click = quick erase (AC: #4 from Story 3-3)
   */
  onDown(x: number, y: number, modifiers?: ModifierKeys): void {
    const { tileX, tileY } = this.pixelToTile(x, y);

    this.isDrawing = true;

    // Right-click = quick erase (capture button state here - it's only valid in mousedown)
    this.isRightClickErasing = modifiers?.button === 2;
    if (this.isRightClickErasing) {
      this.eraseTile(tileX, tileY);
      this.lastTileX = tileX;
      this.lastTileY = tileY;
      return;
    }

    // Check for Shift+click line drawing
    if (modifiers?.shift && this.lastPlacedX !== null && this.lastPlacedY !== null) {
      // Draw line from last placed position to current
      const positions = this.getLinePositions(this.lastPlacedX, this.lastPlacedY, tileX, tileY);
      for (const pos of positions) {
        this.placeTile(pos.x, pos.y);
      }
    } else {
      // Single tile placement
      this.placeTile(tileX, tileY);
    }

    // Update tracking state
    this.lastTileX = tileX;
    this.lastTileY = tileY;
  }

  /**
   * Handle mouse/pen drag
   * Paints tiles continuously along the drag path
   * Right-click drag = continuous erase (AC: #4 from Story 3-3)
   */
  onDrag(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (!this.isDrawing) return;

    const { tileX, tileY } = this.pixelToTile(x, y);

    // Skip if same tile as last (avoid duplicate placements)
    if (tileX === this.lastTileX && tileY === this.lastTileY) return;

    // Use tracked state from onDown (event.button is always 0 in mousemove events)
    const action = this.isRightClickErasing
      ? (tx: number, ty: number) => this.eraseTile(tx, ty)
      : (tx: number, ty: number) => this.placeTile(tx, ty);

    // Get line from last tile to current tile (handles fast movement)
    if (this.lastTileX !== null && this.lastTileY !== null) {
      const positions = this.getLinePositions(this.lastTileX, this.lastTileY, tileX, tileY);
      // Skip first position (already placed/erased in previous call)
      for (let i = 1; i < positions.length; i++) {
        action(positions[i].x, positions[i].y);
      }
    } else {
      action(tileX, tileY);
    }

    this.lastTileX = tileX;
    this.lastTileY = tileY;
  }

  /**
   * Handle mouse/pen up
   * Ends drawing and records position for Shift+click
   */
  onUp(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = this.pixelToTile(x, y);

    this.isDrawing = false;
    this.isRightClickErasing = false; // Reset right-click erase state

    // Record last placed position for Shift+click line
    this.lastPlacedX = tileX;
    this.lastPlacedY = tileY;

    // Clear drawing tracking
    this.lastTileX = null;
    this.lastTileY = null;
  }

  /**
   * Handle mouse move (hover)
   * Updates preview position for ghost rendering
   */
  onMove(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = this.pixelToTile(x, y);

    const prevX = this.previewX;
    const prevY = this.previewY;

    // Check if layer is available and unlocked before showing preview
    const activeLayerId = tilemapStore.activeLayerId.value;
    const layer = activeLayerId ? tilemapStore.getLayerById(activeLayerId) : null;
    const canPlace = layer && !layer.locked;

    // Update preview position (only show if in bounds AND can place)
    if (this.isInBounds(tileX, tileY) && canPlace) {
      this.previewX = tileX;
      this.previewY = tileY;
    } else {
      // Clear preview when outside bounds or layer is locked
      this.previewX = null;
      this.previewY = null;
    }

    // Request redraw if preview position changed
    if (this.previewX !== prevX || this.previewY !== prevY) {
      dirtyRectStore.requestFullRedraw();
    }
  }

  /**
   * Get the current preview tile for rendering
   * Returns preview position and selected tile index for ghost display
   */
  getPreviewTile(): { x: number; y: number; tileIndex: number } | null {
    // No preview if no position
    if (this.previewX === null || this.previewY === null) {
      return null;
    }

    // No preview if no tile selected
    const selectedTile = tilesetStore.selectedTileIndex.value;
    if (selectedTile === null) {
      return null;
    }

    return {
      x: this.previewX,
      y: this.previewY,
      tileIndex: selectedTile
    };
  }
}
