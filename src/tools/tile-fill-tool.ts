/**
 * Tile Fill Tool
 *
 * Flood fills a contiguous region with the selected tile using 4-way connectivity
 * and iterative BFS. Supports undo/redo.
 */

import { BaseTool, type ModifierKeys } from './base-tool';
import { tilemapStore } from '../stores/tilemap';
import { tilesetStore } from '../stores/tileset';
import { historyStore } from '../stores/history';
import { dirtyRectStore } from '../stores/dirty-rect';
import { TileBatchCommand, type TileChange } from '../commands/tile-batch-command';
import { pixelToTile, isInBounds, canModifyLayer } from './tile-tool-utils';

export class TileFillTool extends BaseTool {
  name = 'tile-fill';
  cursor = 'crosshair';

  // For hover preview
  private hoverX: number | null = null;
  private hoverY: number | null = null;

  // 4-way directions: up, down, left, right
  private static readonly DIRECTIONS = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  private floodFill(
    activeLayerId: string,
    startX: number,
    startY: number,
    targetTileId: number,
    fillTileId: number
  ): TileChange[] {
    if (targetTileId === fillTileId) return [];

    const width = tilemapStore.width.value;
    const height = tilemapStore.height.value;
    const changes: TileChange[] = [];
    const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];
    const visited = new Set<number>();
    visited.add(startY * width + startX);

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const currentTileId = tilemapStore.getTile(activeLayerId, x, y);
      if (currentTileId !== targetTileId) continue;

      try {
        tilemapStore.setTile(activeLayerId, x, y, fillTileId);
        changes.push({ x, y, previousTileId: currentTileId, newTileId: fillTileId });
      } catch {
        continue;
      }

      for (const { dx, dy } of TileFillTool.DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        const key = ny * width + nx;

        if (!visited.has(key)) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }

    return changes;
  }

  onDown(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = pixelToTile(x, y);
    if (!isInBounds(tileX, tileY)) return;

    const selectedTile = tilesetStore.selectedTileIndex.value;
    if (selectedTile === null) return;

    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!canModifyLayer(activeLayerId)) return;

    const targetTileId = tilemapStore.getTile(activeLayerId!, tileX, tileY);
    const fillTileId = selectedTile + 1;

    const changes = this.floodFill(activeLayerId!, tileX, tileY, targetTileId, fillTileId);

    if (changes.length > 0) {
      const command = new TileBatchCommand(activeLayerId!, changes, 'Fill');
      historyStore.addWithoutExecuting(command);
    }
  }

  onDrag(_x: number, _y: number, _modifiers?: ModifierKeys): void {
    // Fill is single-click only
  }

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys): void {
    // Fill completes on down
  }

  onMove(x: number, y: number, _modifiers?: ModifierKeys): void {
    const { tileX, tileY } = pixelToTile(x, y);
    const prevX = this.hoverX;
    const prevY = this.hoverY;

    const canFill = canModifyLayer(tilemapStore.activeLayerId.value) && isInBounds(tileX, tileY);
    this.hoverX = canFill ? tileX : null;
    this.hoverY = canFill ? tileY : null;

    if (this.hoverX !== prevX || this.hoverY !== prevY) {
      dirtyRectStore.requestFullRedraw();
    }
  }

  getFillPreviewPosition(): { x: number; y: number } | null {
    if (this.hoverX === null || this.hoverY === null) return null;
    return { x: this.hoverX, y: this.hoverY };
  }
}
