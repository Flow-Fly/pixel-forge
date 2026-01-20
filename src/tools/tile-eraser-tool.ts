/**
 * Tile Eraser Tool
 *
 * Erases tiles from the tilemap canvas. Supports single tile erasure,
 * continuous erasing during drag, Shift+click line erasing, and undo/redo.
 */

import { BaseTool, type ModifierKeys } from './base-tool';
import { tilemapStore } from '../stores/tilemap';
import { historyStore } from '../stores/history';
import { dirtyRectStore } from '../stores/dirty-rect';
import { TilePlaceCommand } from '../commands/tile-place-command';
import { TileBatchCommand, type TileChange } from '../commands/tile-batch-command';
import { pixelToTile, isInBounds, getLinePositions, canModifyLayer, canModifyLayerWithFeedback, getTileCursor } from './tile-tool-utils';

export class TileEraserTool extends BaseTool {
  name = 'tile-eraser';
  get cursor() { return getTileCursor(); }

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

  // Accumulate changes during stroke for undo/redo
  private pendingChanges: TileChange[] = [];
  private strokeLayerId: string | null = null;

  private eraseTile(tileX: number, tileY: number): void {
    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!activeLayerId || !canModifyLayer(activeLayerId) || !isInBounds(tileX, tileY)) {
      return;
    }

    if (this.pendingChanges.some(c => c.x === tileX && c.y === tileY)) return;

    const previousTileId = tilemapStore.getTile(activeLayerId, tileX, tileY);
    if (previousTileId === 0) return;

    try {
      tilemapStore.setTile(activeLayerId, tileX, tileY, 0);
      this.pendingChanges.push({ x: tileX, y: tileY, previousTileId, newTileId: 0 });
    } catch {
      // Ignore failures
    }
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys): void {
    const { tileX, tileY } = pixelToTile(x, y);

    // Early exit with feedback if layer is locked (Story 4-2 Task 4.4)
    if (!canModifyLayerWithFeedback(tilemapStore.activeLayerId.value)) {
      return;
    }

    this.isErasing = true;
    this.pendingChanges = [];
    this.strokeLayerId = tilemapStore.activeLayerId.value;

    if (modifiers?.shift && this.lastErasedX !== null && this.lastErasedY !== null) {
      for (const pos of getLinePositions(this.lastErasedX, this.lastErasedY, tileX, tileY)) {
        this.eraseTile(pos.x, pos.y);
      }
    } else {
      this.eraseTile(tileX, tileY);
    }

    this.lastTileX = tileX;
    this.lastTileY = tileY;
  }

  onDrag(x: number, y: number, _modifiers?: ModifierKeys): void {
    if (!this.isErasing) return;

    const { tileX, tileY } = pixelToTile(x, y);
    if (tileX === this.lastTileX && tileY === this.lastTileY) return;

    if (this.lastTileX !== null && this.lastTileY !== null) {
      const positions = getLinePositions(this.lastTileX, this.lastTileY, tileX, tileY);
      for (let i = 1; i < positions.length; i++) {
        this.eraseTile(positions[i].x, positions[i].y);
      }
    } else {
      this.eraseTile(tileX, tileY);
    }

    this.lastTileX = tileX;
    this.lastTileY = tileY;
  }

  onUp(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = pixelToTile(x, y);

    this.commitChangesToHistory();

    this.isErasing = false;
    this.lastErasedX = tileX;
    this.lastErasedY = tileY;
    this.lastTileX = null;
    this.lastTileY = null;
  }

  private commitChangesToHistory(): void {
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
      const command = new TileBatchCommand(this.strokeLayerId, [...this.pendingChanges], 'Erase Stroke');
      historyStore.addWithoutExecuting(command);
    }

    this.pendingChanges = [];
    this.strokeLayerId = null;
  }

  onMove(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = pixelToTile(x, y);
    const prevX = this.hoverX;
    const prevY = this.hoverY;

    const canErase = canModifyLayer(tilemapStore.activeLayerId.value) && isInBounds(tileX, tileY);
    this.hoverX = canErase ? tileX : null;
    this.hoverY = canErase ? tileY : null;

    if (this.hoverX !== prevX || this.hoverY !== prevY) {
      dirtyRectStore.requestFullRedraw();
    }
  }

  getEraserPosition(): { x: number; y: number } | null {
    if (this.hoverX === null || this.hoverY === null) return null;
    return { x: this.hoverX, y: this.hoverY };
  }
}
