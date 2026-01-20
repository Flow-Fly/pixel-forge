/**
 * Tile Brush Tool
 *
 * A brush tool for placing tiles on the tilemap canvas.
 * Supports single tile placement, continuous painting, Shift+click line drawing,
 * ghost preview, right-click quick erase, and undo/redo.
 */

import { BaseTool, type ModifierKeys } from './base-tool';
import { tilemapStore } from '../stores/tilemap';
import { tilesetStore } from '../stores/tileset';
import { historyStore } from '../stores/history';
import { dirtyRectStore } from '../stores/dirty-rect';
import { TilePlaceCommand } from '../commands/tile-place-command';
import { TileBatchCommand, type TileChange } from '../commands/tile-batch-command';
import { pixelToTile, isInBounds, getLinePositions, canModifyLayer } from './tile-tool-utils';

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

  // Accumulate changes during stroke for undo/redo
  private pendingChanges: TileChange[] = [];
  private strokeLayerId: string | null = null;

  /**
   * Apply a tile change with tracking for undo/redo
   * Returns true if tile was changed
   */
  private applyTileChange(tileX: number, tileY: number, newTileId: number): boolean {
    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!activeLayerId || !canModifyLayer(activeLayerId) || !isInBounds(tileX, tileY)) {
      return false;
    }

    // Skip if already changed this tile in current stroke
    if (this.pendingChanges.some(c => c.x === tileX && c.y === tileY)) {
      return false;
    }

    const previousTileId = tilemapStore.getTile(activeLayerId, tileX, tileY);
    if (previousTileId === newTileId) return false;

    try {
      tilemapStore.setTile(activeLayerId, tileX, tileY, newTileId);
      this.pendingChanges.push({ x: tileX, y: tileY, previousTileId, newTileId });
      return true;
    } catch {
      return false;
    }
  }

  private placeTile(tileX: number, tileY: number): void {
    const selectedTile = tilesetStore.selectedTileIndex.value;
    if (selectedTile === null) return;
    this.applyTileChange(tileX, tileY, selectedTile + 1);
  }

  private eraseTile(tileX: number, tileY: number): void {
    this.applyTileChange(tileX, tileY, 0);
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys): void {
    const { tileX, tileY } = pixelToTile(x, y);

    this.isDrawing = true;
    this.pendingChanges = [];
    this.strokeLayerId = tilemapStore.activeLayerId.value;
    this.isRightClickErasing = modifiers?.button === 2;

    const action = this.isRightClickErasing
      ? (tx: number, ty: number) => this.eraseTile(tx, ty)
      : (tx: number, ty: number) => this.placeTile(tx, ty);

    // Shift+click line drawing (only for placement, not erase)
    if (!this.isRightClickErasing && modifiers?.shift && this.lastPlacedX !== null && this.lastPlacedY !== null) {
      for (const pos of getLinePositions(this.lastPlacedX, this.lastPlacedY, tileX, tileY)) {
        action(pos.x, pos.y);
      }
    } else {
      action(tileX, tileY);
    }

    this.lastTileX = tileX;
    this.lastTileY = tileY;
  }

  onDrag(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (!this.isDrawing) return;

    const { tileX, tileY } = pixelToTile(x, y);
    if (tileX === this.lastTileX && tileY === this.lastTileY) return;

    const action = this.isRightClickErasing
      ? (tx: number, ty: number) => this.eraseTile(tx, ty)
      : (tx: number, ty: number) => this.placeTile(tx, ty);

    if (this.lastTileX !== null && this.lastTileY !== null) {
      const positions = getLinePositions(this.lastTileX, this.lastTileY, tileX, tileY);
      for (let i = 1; i < positions.length; i++) {
        action(positions[i].x, positions[i].y);
      }
    } else {
      action(tileX, tileY);
    }

    this.lastTileX = tileX;
    this.lastTileY = tileY;
  }

  onUp(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = pixelToTile(x, y);

    this.commitChangesToHistory(this.isRightClickErasing ? 'Brush Erase' : 'Brush Stroke');

    this.isDrawing = false;
    this.isRightClickErasing = false;
    this.lastPlacedX = tileX;
    this.lastPlacedY = tileY;
    this.lastTileX = null;
    this.lastTileY = null;
  }

  private commitChangesToHistory(commandName: string): void {
    if (this.pendingChanges.length === 0 || !this.strokeLayerId) {
      this.pendingChanges = [];
      this.strokeLayerId = null;
      return;
    }

    if (this.pendingChanges.length === 1) {
      const change = this.pendingChanges[0];
      const command = new TilePlaceCommand(
        this.strokeLayerId,
        change.x,
        change.y,
        change.previousTileId,
        change.newTileId
      );
      historyStore.addWithoutExecuting(command);
    } else {
      const command = new TileBatchCommand(this.strokeLayerId, [...this.pendingChanges], commandName);
      historyStore.addWithoutExecuting(command);
    }

    this.pendingChanges = [];
    this.strokeLayerId = null;
  }

  onMove(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = pixelToTile(x, y);
    const prevX = this.previewX;
    const prevY = this.previewY;

    const canPlace = canModifyLayer(tilemapStore.activeLayerId.value) && isInBounds(tileX, tileY);
    this.previewX = canPlace ? tileX : null;
    this.previewY = canPlace ? tileY : null;

    if (this.previewX !== prevX || this.previewY !== prevY) {
      dirtyRectStore.requestFullRedraw();
    }
  }

  getPreviewTile(): { x: number; y: number; tileIndex: number } | null {
    if (this.previewX === null || this.previewY === null) return null;

    const selectedTile = tilesetStore.selectedTileIndex.value;
    if (selectedTile === null) return null;

    return { x: this.previewX, y: this.previewY, tileIndex: selectedTile };
  }
}
