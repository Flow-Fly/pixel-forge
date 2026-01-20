/**
 * TileBatchCommand - Multi-tile placement command for undo/redo
 *
 * Handles placing multiple tiles at once (brush strokes, fill, paste, cut/delete).
 * All tiles in a batch are undone/redone in a single step.
 */

import type { Command } from '../stores/history';
import { tilemapStore } from '../stores/tilemap';

export interface TileChange {
  x: number;
  y: number;
  previousTileId: number;
  newTileId: number;
}

export class TileBatchCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  memorySize: number;

  constructor(
    private layerId: string,
    private changes: TileChange[],
    commandName: string = 'Tile Batch'
  ) {
    this.id = crypto.randomUUID();
    this.name = commandName;
    this.timestamp = Date.now();
    // Memory: ~32 bytes per change (4 numbers) + overhead
    this.memorySize = 100 + changes.length * 32;
  }

  execute(): void {
    for (const change of this.changes) {
      tilemapStore.setTile(this.layerId, change.x, change.y, change.newTileId);
    }
  }

  undo(): void {
    // Reverse order for proper undo semantics
    // Important when same tile is modified multiple times in batch
    for (let i = this.changes.length - 1; i >= 0; i--) {
      const change = this.changes[i];
      tilemapStore.setTile(this.layerId, change.x, change.y, change.previousTileId);
    }
  }
}
