/**
 * TileEditCommand - Command for hero edit undo/redo
 * Story 5-6 Task 3: Captures entire hero edit session as single undoable action
 *
 * This command stores before/after ImageData for all tiles edited during
 * a hero edit session. On undo, it restores all original tile images.
 * On redo, it re-applies the edited images.
 *
 * Key design decisions:
 * - Stores Map<number, ImageData> for both before and after states
 * - Single command for entire session (not per-tile)
 * - Triggers tilemap re-render on undo/redo to update ALL instances
 * - Integrates with mapHistory stack (Map mode operations)
 */

import type { Command } from '../stores/history';
import { tilesetStore } from '../stores/tileset';
import { tilemapStore } from '../stores/tilemap';

export class TileEditCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  memorySize: number;

  /**
   * Create a TileEditCommand
   * @param tilesetId - The tileset ID containing the edited tiles
   * @param beforeData - Map of tileId -> original ImageData before editing
   * @param afterData - Map of tileId -> edited ImageData after editing
   */
  constructor(
    private tilesetId: string,
    private beforeData: Map<number, ImageData>,
    private afterData: Map<number, ImageData>
  ) {
    this.id = crypto.randomUUID();
    this.name = 'Edit Tile';
    this.timestamp = Date.now();

    // Calculate memory size: ImageData size for all tiles (before + after)
    // Each ImageData = width * height * 4 bytes (RGBA)
    let totalSize = 0;
    for (const imageData of beforeData.values()) {
      totalSize += imageData.data.byteLength;
    }
    for (const imageData of afterData.values()) {
      totalSize += imageData.data.byteLength;
    }
    // Add overhead for Map structures and command metadata (~500 bytes)
    this.memorySize = totalSize + 500;
  }

  /**
   * Execute the command - apply afterData to tileset
   * Story 5-6 Task 3.5
   */
  async execute(): Promise<void> {
    await this.applyTileData(this.afterData);
  }

  /**
   * Undo the command - restore beforeData to tileset
   * Story 5-6 Task 3.6
   */
  async undo(): Promise<void> {
    await this.applyTileData(this.beforeData);
  }

  /**
   * Redo is same as execute
   * Story 5-6 Task 3.7
   */
  async redo(): Promise<void> {
    await this.execute();
  }

  /**
   * Apply tile data to the tileset
   * Story 5-6 Task 3.8: Batch update all tiles and trigger re-render
   *
   * @param data - Map of tileId -> ImageData to apply
   */
  private async applyTileData(data: Map<number, ImageData>): Promise<void> {
    // Apply each tile's ImageData to the tileset
    // tileId is 1-based storage ID, convert to 0-based tileset index
    for (const [tileId, imageData] of data) {
      await tilesetStore.replaceTile(this.tilesetId, tileId - 1, imageData);
    }

    // Fire event to trigger re-render of all affected tile instances
    // The tilemapStore listens for this and marks canvas dirty
    tilemapStore.dispatchEvent(new CustomEvent('tiles-updated', {
      detail: {
        tileIds: Array.from(data.keys()),
        tilesetId: this.tilesetId
      }
    }));
  }

  /**
   * Get the tile IDs affected by this command
   * Useful for pulse animation and debugging
   */
  getAffectedTileIds(): number[] {
    return Array.from(this.afterData.keys());
  }
}
