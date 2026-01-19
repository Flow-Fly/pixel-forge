/**
 * Tile Select Tool
 *
 * A selection tool for selecting rectangular regions of tiles in Map mode.
 * Supports:
 * - Rectangular selection by drag
 * - Selection preview during drag
 * - Click outside to clear selection
 * - Modifier keys (Shift/Alt) to preserve selection
 * - Paste preview position updates
 *
 * Story: 3-5-tile-selection-and-clipboard
 */

import { BaseTool, type ModifierKeys } from './base-tool';
import { tilemapStore } from '../stores/tilemap';
import { tileSelectionStore } from '../stores/tile-selection';
import { dirtyRectStore } from '../stores/dirty-rect';

export class TileSelectTool extends BaseTool {
  name = 'tile-select';
  cursor = 'crosshair';

  // Selection state
  private isSelecting = false;
  private startTileX: number | null = null;
  private startTileY: number | null = null;
  private currentTileX: number | null = null;
  private currentTileY: number | null = null;

  /**
   * Convert pixel coordinates to tile coordinates
   * Story 3-5 Task 2.3
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
   * Story 3-5 Task 2.3
   */
  private isInBounds(tileX: number, tileY: number): boolean {
    const width = tilemapStore.width.value;
    const height = tilemapStore.height.value;
    return tileX >= 0 && tileX < width && tileY >= 0 && tileY < height;
  }

  /**
   * Check if a point is inside the current selection
   * Story 3-5 Task 2.5
   */
  private isInsideSelection(tileX: number, tileY: number): boolean {
    const sel = tileSelectionStore.selection.value;
    if (!sel) return false;

    return (
      tileX >= sel.x &&
      tileX < sel.x + sel.width &&
      tileY >= sel.y &&
      tileY < sel.y + sel.height
    );
  }

  /**
   * Handle mouse/pen down
   * Starts selection at grid position OR clears if clicking outside
   * Story 3-5 Task 2.5
   */
  onDown(x: number, y: number, modifiers?: ModifierKeys): void {
    const { tileX, tileY } = this.pixelToTile(x, y);

    // If clicking outside current selection without modifiers, clear it
    if (tileSelectionStore.hasSelection && !this.isInsideSelection(tileX, tileY)) {
      if (!modifiers?.shift && !modifiers?.alt) {
        tileSelectionStore.clearSelection();
      }
    }

    // Start new selection
    this.isSelecting = true;
    this.startTileX = tileX;
    this.startTileY = tileY;
    this.currentTileX = tileX;
    this.currentTileY = tileY;

    dirtyRectStore.requestFullRedraw();
  }

  /**
   * Handle mouse/pen drag
   * Updates selection rectangle preview
   * Story 3-5 Task 2.6
   */
  onDrag(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (!this.isSelecting) return;

    const { tileX, tileY } = this.pixelToTile(x, y);

    // Update current position
    if (tileX !== this.currentTileX || tileY !== this.currentTileY) {
      this.currentTileX = tileX;
      this.currentTileY = tileY;
      dirtyRectStore.requestFullRedraw();
    }
  }

  /**
   * Handle mouse/pen up
   * Finalizes selection, updates tileSelectionStore
   * Story 3-5 Task 2.7
   */
  onUp(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (!this.isSelecting) return;

    const { tileX, tileY } = this.pixelToTile(x, y);

    // Calculate selection rectangle
    if (this.startTileX !== null && this.startTileY !== null) {
      const selX = Math.min(this.startTileX, tileX);
      const selY = Math.min(this.startTileY, tileY);
      const selW = Math.abs(tileX - this.startTileX) + 1;
      const selH = Math.abs(tileY - this.startTileY) + 1;

      tileSelectionStore.setSelection(selX, selY, selW, selH);
    }

    // Reset state
    this.isSelecting = false;
    this.startTileX = null;
    this.startTileY = null;
    this.currentTileX = null;
    this.currentTileY = null;

    dirtyRectStore.requestFullRedraw();
  }

  /**
   * Handle mouse move (hover)
   * Tracks hover position for cursor feedback and paste preview
   * Story 3-5 Task 2.8
   */
  onMove(x: number, y: number, _modifiers?: ModifierKeys): void {
    // If in paste mode, update paste preview position
    if (tileSelectionStore.isPasteMode) {
      const { tileX, tileY } = this.pixelToTile(x, y);
      tileSelectionStore.updatePastePreview(tileX, tileY);
      dirtyRectStore.requestFullRedraw();
    }
  }

  /**
   * Get the current selection preview rectangle during drag
   * Story 3-5 Task 2.9
   *
   * @returns Preview rectangle in tile coordinates or null if not selecting
   */
  getSelectionPreview(): { x: number; y: number; width: number; height: number } | null {
    if (!this.isSelecting) return null;
    if (this.startTileX === null || this.startTileY === null) return null;
    if (this.currentTileX === null || this.currentTileY === null) return null;

    const x = Math.min(this.startTileX, this.currentTileX);
    const y = Math.min(this.startTileY, this.currentTileY);
    const width = Math.abs(this.currentTileX - this.startTileX) + 1;
    const height = Math.abs(this.currentTileY - this.startTileY) + 1;

    return { x, y, width, height };
  }
}
