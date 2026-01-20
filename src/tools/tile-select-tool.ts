/**
 * Tile Select Tool
 *
 * A selection tool for selecting rectangular regions of tiles in Map mode.
 * Supports rectangular selection by drag, click outside to clear, and paste preview.
 */

import { BaseTool, type ModifierKeys } from './base-tool';
import { tileSelectionStore } from '../stores/tile-selection';
import { dirtyRectStore } from '../stores/dirty-rect';
import { pixelToTile } from './tile-tool-utils';

export class TileSelectTool extends BaseTool {
  name = 'tile-select';
  cursor = 'crosshair';

  // Selection state
  private isSelecting = false;
  private startTileX: number | null = null;
  private startTileY: number | null = null;
  private currentTileX: number | null = null;
  private currentTileY: number | null = null;

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

  onDown(x: number, y: number, modifiers?: ModifierKeys): void {
    const { tileX, tileY } = pixelToTile(x, y);

    if (tileSelectionStore.hasSelection && !this.isInsideSelection(tileX, tileY)) {
      if (!modifiers?.shift && !modifiers?.alt) {
        tileSelectionStore.clearSelection();
      }
    }

    this.isSelecting = true;
    this.startTileX = tileX;
    this.startTileY = tileY;
    this.currentTileX = tileX;
    this.currentTileY = tileY;

    dirtyRectStore.requestFullRedraw();
  }

  onDrag(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (!this.isSelecting) return;

    const { tileX, tileY } = pixelToTile(x, y);

    if (tileX !== this.currentTileX || tileY !== this.currentTileY) {
      this.currentTileX = tileX;
      this.currentTileY = tileY;
      dirtyRectStore.requestFullRedraw();
    }
  }

  onUp(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (!this.isSelecting) return;

    const { tileX, tileY } = pixelToTile(x, y);

    if (this.startTileX !== null && this.startTileY !== null) {
      const selX = Math.min(this.startTileX, tileX);
      const selY = Math.min(this.startTileY, tileY);
      const selW = Math.abs(tileX - this.startTileX) + 1;
      const selH = Math.abs(tileY - this.startTileY) + 1;

      tileSelectionStore.setSelection(selX, selY, selW, selH);
    }

    this.isSelecting = false;
    this.startTileX = null;
    this.startTileY = null;
    this.currentTileX = null;
    this.currentTileY = null;

    dirtyRectStore.requestFullRedraw();
  }

  onMove(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (tileSelectionStore.isPasteMode) {
      const { tileX, tileY } = pixelToTile(x, y);
      tileSelectionStore.updatePastePreview(tileX, tileY);
      dirtyRectStore.requestFullRedraw();
    }
  }

  getSelectionPreview(): { x: number; y: number; width: number; height: number } | null {
    if (!this.isSelecting) return null;
    if (this.startTileX === null || this.startTileY === null) return null;
    if (this.currentTileX === null || this.currentTileY === null) return null;

    return {
      x: Math.min(this.startTileX, this.currentTileX),
      y: Math.min(this.startTileY, this.currentTileY),
      width: Math.abs(this.currentTileX - this.startTileX) + 1,
      height: Math.abs(this.currentTileY - this.startTileY) + 1,
    };
  }
}
