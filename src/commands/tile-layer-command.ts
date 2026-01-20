/**
 * TileLayerReorderCommand - Layer reordering command for undo/redo
 * Story 4-3 Task 5
 */

import type { Command } from '../stores/history';
import { tilemapStore } from '../stores/tilemap';

/**
 * Estimated memory footprint for reorder command:
 * - layerId string reference: ~50 bytes
 * - oldIndex number: 8 bytes
 * - newIndex number: 8 bytes
 * - id (UUID string): ~40 bytes
 * - name string: ~24 bytes
 * Total: ~130 bytes
 */
const REORDER_COMMAND_MEMORY_SIZE = 130;

export class TileLayerReorderCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  memorySize: number;

  constructor(
    private layerId: string,
    private oldIndex: number,
    private newIndex: number
  ) {
    this.id = crypto.randomUUID();
    this.name = 'Reorder Layer';
    this.timestamp = Date.now();
    this.memorySize = REORDER_COMMAND_MEMORY_SIZE;
  }

  execute(): void {
    tilemapStore.reorderLayer(this.layerId, this.newIndex);
  }

  undo(): void {
    tilemapStore.reorderLayer(this.layerId, this.oldIndex);
  }
}
