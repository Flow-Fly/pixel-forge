import { signal } from '../core/signal';
import type { TileSelection, TileClipboard } from '../types/tilemap';
import { tilemapStore } from './tilemap';
import { historyStore } from './history';
import { TileBatchCommand, type TileChange } from '../commands/tile-batch-command';

/**
 * Tile Selection Store - Manages tile selection and clipboard operations for Map mode
 *
 * Handles rectangular tile selection, clipboard operations (copy/cut/paste),
 * paste preview mode, and delete operations with undo/redo support.
 */
class TileSelectionStore extends EventTarget {
  selection = signal<TileSelection | null>(null);
  clipboard = signal<TileClipboard | null>(null);
  pastePreview = signal<{ x: number; y: number } | null>(null);

  get hasSelection(): boolean {
    return this.selection.value !== null;
  }

  get hasClipboard(): boolean {
    return this.clipboard.value !== null;
  }

  get isPasteMode(): boolean {
    return this.pastePreview.value !== null;
  }

  /**
   * Set selection rectangle, normalizing negative dimensions and clamping to bounds
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

  clearSelection(): void {
    if (this.selection.value) {
      this.selection.value = null;
      this.dispatchEvent(new CustomEvent('selection-cleared'));
    }
  }

  /**
   * Read tile data from a rectangular region
   */
  private readTileRegion(layerId: string, x: number, y: number, width: number, height: number): Uint32Array {
    const data = new Uint32Array(width * height);

    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        try {
          data[ty * width + tx] = tilemapStore.getTile(layerId, x + tx, y + ty);
        } catch {
          data[ty * width + tx] = 0;
        }
      }
    }

    return data;
  }

  /**
   * Get tile data from the selection
   */
  getSelectedTiles(layerId: string): Uint32Array | null {
    const sel = this.selection.value;
    if (!sel) return null;
    return this.readTileRegion(layerId, sel.x, sel.y, sel.width, sel.height);
  }

  /**
   * Copy selected tiles to clipboard
   */
  copySelection(layerId: string): void {
    const sel = this.selection.value;
    if (!sel) return;

    const { width, height } = sel;
    const data = this.readTileRegion(layerId, sel.x, sel.y, width, height);

    this.clipboard.value = { width, height, data };

    this.dispatchEvent(
      new CustomEvent('tiles-copied', {
        detail: { width, height },
      })
    );
  }

  /**
   * Erase tiles in a region, returning changes for undo
   */
  private eraseRegion(layerId: string, x: number, y: number, width: number, height: number): TileChange[] {
    const changes: TileChange[] = [];

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

    return changes;
  }

  /**
   * Cut selected tiles (copy then erase) with undo support
   */
  cutSelection(layerId: string): void {
    const sel = this.selection.value;
    if (!sel) return;

    this.copySelection(layerId);

    const changes = this.eraseRegion(layerId, sel.x, sel.y, sel.width, sel.height);

    if (changes.length > 0) {
      const command = new TileBatchCommand(layerId, changes, 'Cut Tiles');
      historyStore.addWithoutExecuting(command);
    }

    this.dispatchEvent(new CustomEvent('tiles-cut', { detail: { selection: sel } }));
    this.clearSelection();
  }

  /**
   * Delete (erase) selected tiles with undo support
   */
  deleteSelection(layerId: string): void {
    const sel = this.selection.value;
    if (!sel) return;

    const changes = this.eraseRegion(layerId, sel.x, sel.y, sel.width, sel.height);

    if (changes.length > 0) {
      const command = new TileBatchCommand(layerId, changes, 'Delete Tiles');
      historyStore.addWithoutExecuting(command);
    }

    this.dispatchEvent(new CustomEvent('tiles-deleted', { detail: sel }));
    this.clearSelection();
  }

  startPastePreview(): void {
    if (!this.clipboard.value) return;
    this.pastePreview.value = { x: 0, y: 0 };
  }

  updatePastePreview(x: number, y: number): void {
    if (!this.pastePreview.value) return;
    this.pastePreview.value = { x, y };
  }

  /**
   * Confirm paste at current preview position with undo support
   */
  confirmPaste(layerId: string): void {
    const clip = this.clipboard.value;
    const pos = this.pastePreview.value;
    if (!clip || !pos) return;

    const { x, y } = pos;
    const { width, height, data } = clip;
    const mapWidth = tilemapStore.width.value;
    const mapHeight = tilemapStore.height.value;
    const changes: TileChange[] = [];

    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const targetX = x + tx;
        const targetY = y + ty;

        if (targetX < 0 || targetX >= mapWidth || targetY < 0 || targetY >= mapHeight) continue;

        const tileId = data[ty * width + tx];
        try {
          const previousTileId = tilemapStore.getTile(layerId, targetX, targetY);
          if (previousTileId !== tileId) {
            changes.push({ x: targetX, y: targetY, previousTileId, newTileId: tileId });
            tilemapStore.setTile(layerId, targetX, targetY, tileId);
          }
        } catch {
          // Ignore errors
        }
      }
    }

    if (changes.length > 0) {
      const command = new TileBatchCommand(layerId, changes, 'Paste Tiles');
      historyStore.addWithoutExecuting(command);
    }

    this.pastePreview.value = null;
    this.dispatchEvent(new CustomEvent('tiles-pasted', { detail: { x, y, width, height } }));
  }

  cancelPaste(): void {
    this.pastePreview.value = null;
  }

  reset(): void {
    this.selection.value = null;
    this.clipboard.value = null;
    this.pastePreview.value = null;
  }
}

export const tileSelectionStore = new TileSelectionStore();
