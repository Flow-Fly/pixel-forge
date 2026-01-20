/**
 * Tile Layer Commands - Layer operations with undo/redo support
 * Story 4-3 Task 5: TileLayerReorderCommand
 * Story 4-4 Task 5: TileLayerDeleteCommand
 */

import type { Command } from '../stores/history';
import { tilemapStore } from '../stores/tilemap';
import type { TileLayer } from '../types/tilemap';

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

/**
 * Calculate memory size for delete command based on layer data
 * Story 4-4 Task 5.7
 * - Layer metadata: ~200 bytes (id, name, etc.)
 * - Layer data: width * height * 4 bytes (Uint32Array)
 */
export const calculateDeleteCommandMemorySize = (layer: TileLayer): number =>
  200 + layer.data.length * 4;

/**
 * TileLayerDeleteCommand - Layer deletion command for undo/redo
 * Story 4-4 Task 5
 */
export class TileLayerDeleteCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  memorySize: number;

  private layerData: TileLayer;
  private layerIndex: number;
  private wasActive: boolean;
  private previousActiveId: string | null;

  constructor(layer: TileLayer, index: number) {
    this.id = crypto.randomUUID();
    this.name = 'Delete Layer';
    this.timestamp = Date.now();

    // Deep copy the layer data for undo
    this.layerData = {
      ...layer,
      data: new Uint32Array(layer.data) // Copy the Uint32Array
    };
    this.layerIndex = index;
    this.wasActive = tilemapStore.activeLayerId.value === layer.id;
    this.previousActiveId = this.wasActive ? layer.id : null;
    this.memorySize = calculateDeleteCommandMemorySize(layer);
  }

  execute(): void {
    tilemapStore.deleteLayer(this.layerData.id);
  }

  undo(): void {
    tilemapStore.restoreLayer(this.layerData, this.layerIndex);

    // Restore active layer state
    if (this.wasActive) {
      tilemapStore.setActiveLayer(this.layerData.id);
    }
  }
}
