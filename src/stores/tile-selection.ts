import { signal } from '../core/signal';
import type { TileSelection, TileClipboard } from '../types/tilemap';
import { tilemapStore } from './tilemap';
import { historyStore } from './history';
import { TileBatchCommand, type TileChange } from '../commands/tile-batch-command';

/**
 * Tile Selection Store - Manages tile selection and clipboard operations for Map mode
 *
 * Story 3-5: Tile Selection & Clipboard
 * Story 3-6: Tilemap Undo/Redo Integration (Task 5)
 *
 * This store handles:
 * - Rectangular tile selection in tile coordinates
 * - Clipboard operations (copy, cut, paste)
 * - Paste preview mode for visual feedback
 * - Delete/erase operations on selections
 * - Undo/redo integration via TileBatchCommand
 *
 * Key conventions:
 * - Selection coordinates are in tile units, not pixels
 * - Tile IDs in clipboard use same convention as tilemapStore (0 = empty, 1+ = tile)
 * - Events fired for UI feedback
 */
class TileSelectionStore extends EventTarget {
  /**
   * Current selection rectangle in tile coordinates
   * Story 3-5 Task 1.2
   */
  selection = signal<TileSelection | null>(null);

  /**
   * Clipboard containing copied tile data
   * Story 3-5 Task 1.3
   */
  clipboard = signal<TileClipboard | null>(null);

  /**
   * Paste preview position (null when not in paste mode)
   * Story 3-5 Task 4.4
   */
  pastePreview = signal<{ x: number; y: number } | null>(null);

  /**
   * Check if there is an active selection
   * Story 3-5 Task 1.6
   */
  get hasSelection(): boolean {
    return this.selection.value !== null;
  }

  /**
   * Check if there is data in clipboard
   */
  get hasClipboard(): boolean {
    return this.clipboard.value !== null;
  }

  /**
   * Check if in paste preview mode
   */
  get isPasteMode(): boolean {
    return this.pastePreview.value !== null;
  }

  /**
   * Set selection rectangle
   * Normalizes negative width/height from reverse drag and clamps to tilemap bounds
   * Story 3-5 Task 1.4
   *
   * @param x - Left tile coordinate
   * @param y - Top tile coordinate
   * @param width - Width in tiles (can be negative for reverse drag)
   * @param height - Height in tiles (can be negative for reverse drag)
   */
  setSelection(x: number, y: number, width: number, height: number): void {
    // Normalize negative dimensions (reverse drag)
    let normX = x;
    let normY = y;
    let normW = width;
    let normH = height;

    if (width < 0) {
      normX = x + width;
      normW = -width;
    }
    if (height < 0) {
      normY = y + height;
      normH = -height;
    }

    // Clamp to tilemap bounds
    const mapWidth = tilemapStore.width.value;
    const mapHeight = tilemapStore.height.value;

    normX = Math.max(0, normX);
    normY = Math.max(0, normY);
    normW = Math.min(normW, mapWidth - normX);
    normH = Math.min(normH, mapHeight - normY);

    // Don't create zero-size selections
    if (normW <= 0 || normH <= 0) {
      this.selection.value = null;
      return;
    }

    this.selection.value = { x: normX, y: normY, width: normW, height: normH };

    this.dispatchEvent(
      new CustomEvent('selection-changed', {
        detail: { selection: this.selection.value },
      })
    );
  }

  /**
   * Clear the current selection
   * Story 3-5 Task 1.5
   */
  clearSelection(): void {
    if (this.selection.value) {
      this.selection.value = null;
      this.dispatchEvent(new CustomEvent('selection-cleared'));
    }
  }

  /**
   * Get tile data from the selection
   * Story 3-5 Task 1.7
   *
   * @param layerId - The layer to read tiles from
   * @returns Uint32Array of tile IDs or null if no selection
   */
  getSelectedTiles(layerId: string): Uint32Array | null {
    const sel = this.selection.value;
    if (!sel) return null;

    const { x, y, width, height } = sel;
    const data = new Uint32Array(width * height);

    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        try {
          const tileId = tilemapStore.getTile(layerId, x + tx, y + ty);
          data[ty * width + tx] = tileId;
        } catch {
          // Out of bounds - use 0 (empty)
          data[ty * width + tx] = 0;
        }
      }
    }

    return data;
  }

  /**
   * Copy selected tiles to clipboard
   * Story 3-5 Task 4.1
   *
   * @param layerId - The layer to copy tiles from
   */
  copySelection(layerId: string): void {
    const sel = this.selection.value;
    if (!sel) return;

    const { x, y, width, height } = sel;
    const data = new Uint32Array(width * height);

    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        try {
          const tileId = tilemapStore.getTile(layerId, x + tx, y + ty);
          data[ty * width + tx] = tileId;
        } catch {
          // Out of bounds - use 0 (empty)
          data[ty * width + tx] = 0;
        }
      }
    }

    this.clipboard.value = { width, height, data };

    this.dispatchEvent(
      new CustomEvent('tiles-copied', {
        detail: { width, height },
      })
    );
  }

  /**
   * Cut selected tiles (copy then erase) with undo support
   * Story 3-5 Task 4.2, Story 3-6 Task 5.1
   *
   * @param layerId - The layer to cut tiles from
   */
  cutSelection(layerId: string): void {
    const sel = this.selection.value;
    if (!sel) return;

    // Copy first
    this.copySelection(layerId);

    const { x, y, width, height } = sel;
    const changes: TileChange[] = [];

    // Collect changes for undo/redo (Story 3-6)
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const tileX = x + tx;
        const tileY = y + ty;
        try {
          const previousTileId = tilemapStore.getTile(layerId, tileX, tileY);
          if (previousTileId !== 0) {
            changes.push({ x: tileX, y: tileY, previousTileId, newTileId: 0 });
            tilemapStore.setTile(layerId, tileX, tileY, 0);
          }
        } catch {
          // Ignore out of bounds
        }
      }
    }

    // Create command for undo/redo if changes were made
    if (changes.length > 0) {
      const command = new TileBatchCommand(layerId, changes, 'Cut Tiles');
      historyStore.addWithoutExecuting(command);
    }

    this.dispatchEvent(
      new CustomEvent('tiles-cut', {
        detail: { selection: sel },
      })
    );

    this.clearSelection();
  }

  /**
   * Delete (erase) selected tiles with undo support
   * Story 3-5 Task 5.1, 5.2, 5.3, Story 3-6 Task 5.2
   *
   * @param layerId - The layer to delete tiles from
   */
  deleteSelection(layerId: string): void {
    const sel = this.selection.value;
    if (!sel) return;

    const { x, y, width, height } = sel;
    const changes: TileChange[] = [];

    // Collect changes for undo/redo (Story 3-6)
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const tileX = x + tx;
        const tileY = y + ty;
        try {
          const previousTileId = tilemapStore.getTile(layerId, tileX, tileY);
          if (previousTileId !== 0) {
            changes.push({ x: tileX, y: tileY, previousTileId, newTileId: 0 });
            tilemapStore.setTile(layerId, tileX, tileY, 0);
          }
        } catch {
          // Ignore out of bounds
        }
      }
    }

    // Create command for undo/redo if changes were made
    if (changes.length > 0) {
      const command = new TileBatchCommand(layerId, changes, 'Delete Tiles');
      historyStore.addWithoutExecuting(command);
    }

    this.dispatchEvent(
      new CustomEvent('tiles-deleted', {
        detail: { x, y, width, height },
      })
    );

    this.clearSelection();
  }

  /**
   * Start paste preview mode
   * Story 3-5 Task 4.5
   */
  startPastePreview(): void {
    if (!this.clipboard.value) return;
    this.pastePreview.value = { x: 0, y: 0 };
  }

  /**
   * Update paste preview position
   *
   * @param x - Target X tile coordinate
   * @param y - Target Y tile coordinate
   */
  updatePastePreview(x: number, y: number): void {
    if (!this.pastePreview.value) return;
    this.pastePreview.value = { x, y };
  }

  /**
   * Confirm paste at current preview position with undo support
   * Story 3-5 Task 4.3, Story 3-6 Task 5.3
   *
   * @param layerId - The layer to paste tiles to
   */
  confirmPaste(layerId: string): void {
    const clip = this.clipboard.value;
    const pos = this.pastePreview.value;
    if (!clip || !pos) return;

    const { x, y } = pos;
    const { width, height, data } = clip;
    const changes: TileChange[] = [];

    // Collect changes for undo/redo (Story 3-6)
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const tileId = data[ty * width + tx];
        const targetX = x + tx;
        const targetY = y + ty;

        // Skip out of bounds
        if (targetX < 0 || targetX >= tilemapStore.width.value) continue;
        if (targetY < 0 || targetY >= tilemapStore.height.value) continue;

        try {
          const previousTileId = tilemapStore.getTile(layerId, targetX, targetY);
          if (previousTileId !== tileId) {
            changes.push({ x: targetX, y: targetY, previousTileId, newTileId: tileId });
            tilemapStore.setTile(layerId, targetX, targetY, tileId);
          }
        } catch {
          // Ignore errors (locked layer, etc.)
        }
      }
    }

    // Create command for undo/redo if changes were made
    if (changes.length > 0) {
      const command = new TileBatchCommand(layerId, changes, 'Paste Tiles');
      historyStore.addWithoutExecuting(command);
    }

    this.pastePreview.value = null;

    this.dispatchEvent(
      new CustomEvent('tiles-pasted', {
        detail: { x, y, width, height },
      })
    );
  }

  /**
   * Cancel paste preview mode
   * Story 3-5 Task 4.6
   */
  cancelPaste(): void {
    this.pastePreview.value = null;
  }

  /**
   * Reset store state
   * Used for testing and mode switches
   */
  reset(): void {
    this.selection.value = null;
    this.clipboard.value = null;
    this.pastePreview.value = null;
  }
}

export const tileSelectionStore = new TileSelectionStore();
