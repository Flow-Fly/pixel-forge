/**
 * TilePlaceCommand - Single tile placement command for undo/redo
 */

import type { Command } from '../stores/history';
import { tilemapStore } from '../stores/tilemap';

export class TilePlaceCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  memorySize: number;

  constructor(
    private layerId: string,
    private x: number,
    private y: number,
    private previousTileId: number,
    private newTileId: number
  ) {
    this.id = crypto.randomUUID();
    this.name = 'Place Tile';
    this.timestamp = Date.now();
    // Memory: 5 numbers (8 bytes each) + string refs (~100 bytes overhead)
    this.memorySize = 150;
  }

  execute(): void {
    tilemapStore.setTile(this.layerId, this.x, this.y, this.newTileId);
  }

  undo(): void {
    tilemapStore.setTile(this.layerId, this.x, this.y, this.previousTileId);
  }
}
