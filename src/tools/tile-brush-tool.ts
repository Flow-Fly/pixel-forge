/**
 * Tile Brush Tool
 *
 * A brush tool for placing tiles on the tilemap canvas.
 * Supports:
 * - Single tile placement on click
 * - Continuous painting during drag
 * - Shift+click line drawing from last position
 * - Ghost preview rendering
 * - Undo/redo via TileBatchCommand (Story 3-6)
 *
 * This is the first tile painting tool and establishes patterns
 * for subsequent tile tools (eraser, fill).
 *
 * Story: 3-2-tile-brush-tool, 3-6-tilemap-undo-redo-integration
 */

import { BaseTool, type ModifierKeys } from './base-tool';
import { tilemapStore } from '../stores/tilemap';
import { tilesetStore } from '../stores/tileset';
import { historyStore } from '../stores/history';
import { dirtyRectStore } from '../stores/dirty-rect';
import { TilePlaceCommand } from '../commands/tile-place-command';
import { TileBatchCommand, type TileChange } from '../commands/tile-batch-command';

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

  // Story 3-6: Accumulate changes during stroke for undo/redo
  private pendingChanges: TileChange[] = [];
  private strokeLayerId: string | null = null;

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
   * Erase tile at the given tile coordinates with change tracking (Story 3-6)
   * Used for right-click quick erase functionality
   */
  private eraseTileWithTracking(tileX: number, tileY: number): void {
    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!activeLayerId) return;

    const layer = tilemapStore.getLayerById(activeLayerId);
    if (!layer || layer.locked) return;

    if (!this.isInBounds(tileX, tileY)) return;

    // Check if already changed this tile in current stroke
    const existingChange = this.pendingChanges.find(c => c.x === tileX && c.y === tileY);
    if (existingChange) return;

    const previousTileId = tilemapStore.getTile(activeLayerId, tileX, tileY);
    const newTileId = 0; // Erase = set to empty

    if (previousTileId === newTileId) return; // No change needed

    // Apply visually (immediate feedback) - only record change if successful
    try {
      tilemapStore.setTile(activeLayerId, tileX, tileY, newTileId);
      // Record the change only after successful setTile (fixes phantom history entries)
      this.pendingChanges.push({ x: tileX, y: tileY, previousTileId, newTileId });
    } catch (e) {
      console.warn('Tile erase failed:', e);
    }
  }

  /**
   * Place a tile at the given tile coordinates with change tracking (Story 3-6)
   * Validates selection, layer lock, and bounds before placing
   */
  private placeTileWithTracking(tileX: number, tileY: number): void {
    const selectedTile = tilesetStore.selectedTileIndex.value;
    if (selectedTile === null) return;

    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!activeLayerId) return;

    const layer = tilemapStore.getLayerById(activeLayerId);
    if (!layer || layer.locked) return;

    if (!this.isInBounds(tileX, tileY)) return;

    // Check if already changed this tile in current stroke
    const existingChange = this.pendingChanges.find(c => c.x === tileX && c.y === tileY);
    if (existingChange) return;

    const newTileId = selectedTile + 1; // 0-based to 1-based
    const previousTileId = tilemapStore.getTile(activeLayerId, tileX, tileY);

    if (previousTileId === newTileId) return; // No change needed

    // Apply visually (immediate feedback) - only record change if successful
    try {
      tilemapStore.setTile(activeLayerId, tileX, tileY, newTileId);
      // Record the change only after successful setTile (fixes phantom history entries)
      this.pendingChanges.push({ x: tileX, y: tileY, previousTileId, newTileId });
    } catch (e) {
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
   * Starts stroke, records changes for undo/redo (Story 3-6)
   * Right-click = quick erase (AC: #4 from Story 3-3)
   */
  onDown(x: number, y: number, modifiers?: ModifierKeys): void {
    const { tileX, tileY } = this.pixelToTile(x, y);

    this.isDrawing = true;
    this.pendingChanges = [];
    this.strokeLayerId = tilemapStore.activeLayerId.value;

    // Right-click = quick erase
    this.isRightClickErasing = modifiers?.button === 2;
    if (this.isRightClickErasing) {
      this.eraseTileWithTracking(tileX, tileY);
      this.lastTileX = tileX;
      this.lastTileY = tileY;
      return;
    }

    // Check for Shift+click line drawing
    if (modifiers?.shift && this.lastPlacedX !== null && this.lastPlacedY !== null) {
      const positions = this.getLinePositions(this.lastPlacedX, this.lastPlacedY, tileX, tileY);
      for (const pos of positions) {
        this.placeTileWithTracking(pos.x, pos.y);
      }
    } else {
      this.placeTileWithTracking(tileX, tileY);
    }

    this.lastTileX = tileX;
    this.lastTileY = tileY;
  }

  /**
   * Handle mouse/pen drag
   * Continues stroke with change tracking (Story 3-6)
   * Right-click drag = continuous erase (AC: #4 from Story 3-3)
   */
  onDrag(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (!this.isDrawing) return;

    const { tileX, tileY } = this.pixelToTile(x, y);

    // Skip if same tile as last
    if (tileX === this.lastTileX && tileY === this.lastTileY) return;

    const action = this.isRightClickErasing
      ? (tx: number, ty: number) => this.eraseTileWithTracking(tx, ty)
      : (tx: number, ty: number) => this.placeTileWithTracking(tx, ty);

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
   * Ends stroke and creates undo command (Story 3-6)
   */
  onUp(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = this.pixelToTile(x, y);

    // Create command for undo/redo (Story 3-6 Task 4.1, 4.2)
    if (this.pendingChanges.length > 0 && this.strokeLayerId) {
      const commandName = this.isRightClickErasing ? 'Brush Erase' : 'Brush Stroke';

      if (this.pendingChanges.length === 1) {
        // Single tile - use TilePlaceCommand
        const change = this.pendingChanges[0];
        const command = new TilePlaceCommand(
          this.strokeLayerId,
          change.x,
          change.y,
          change.previousTileId,
          change.newTileId
        );
        // Already executed visually, add to history without re-executing
        historyStore.addWithoutExecuting(command);
      } else {
        // Multiple tiles - use TileBatchCommand
        const command = new TileBatchCommand(this.strokeLayerId, [...this.pendingChanges], commandName);
        // Already executed visually, add to history without re-executing
        historyStore.addWithoutExecuting(command);
      }
    }

    this.isDrawing = false;
    this.isRightClickErasing = false;
    this.pendingChanges = [];
    this.strokeLayerId = null;

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
