import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tileSelectionStore } from '../../src/stores/tile-selection';
import { tilemapStore } from '../../src/stores/tilemap';

describe('TileSelectionStore', () => {
  beforeEach(() => {
    // Reset stores before each test
    tileSelectionStore.reset();
    tilemapStore.reset();
    // Initialize tilemap with known dimensions
    tilemapStore.resizeTilemap(10, 10);
    tilemapStore.initializeDefaultLayer();
  });

  describe('selection management', () => {
    it('setSelection creates a valid selection', () => {
      tileSelectionStore.setSelection(2, 3, 4, 5);

      const sel = tileSelectionStore.selection.value;
      expect(sel).not.toBeNull();
      expect(sel?.x).toBe(2);
      expect(sel?.y).toBe(3);
      expect(sel?.width).toBe(4);
      expect(sel?.height).toBe(5);
    });

    it('setSelection normalizes negative width', () => {
      // Drag from right to left
      tileSelectionStore.setSelection(6, 3, -4, 2);

      const sel = tileSelectionStore.selection.value;
      expect(sel).not.toBeNull();
      expect(sel?.x).toBe(2);  // 6 + (-4) = 2
      expect(sel?.width).toBe(4);  // -(-4) = 4
    });

    it('setSelection normalizes negative height', () => {
      // Drag from bottom to top
      tileSelectionStore.setSelection(2, 7, 3, -5);

      const sel = tileSelectionStore.selection.value;
      expect(sel).not.toBeNull();
      expect(sel?.y).toBe(2);  // 7 + (-5) = 2
      expect(sel?.height).toBe(5);  // -(-5) = 5
    });

    it('setSelection clamps to tilemap bounds', () => {
      // Selection extends past tilemap edge (10x10 tilemap)
      tileSelectionStore.setSelection(8, 8, 5, 5);

      const sel = tileSelectionStore.selection.value;
      expect(sel).not.toBeNull();
      expect(sel?.x).toBe(8);
      expect(sel?.y).toBe(8);
      expect(sel?.width).toBe(2);  // Clamped: 10 - 8 = 2
      expect(sel?.height).toBe(2);  // Clamped: 10 - 8 = 2
    });

    it('setSelection rejects zero-size selections', () => {
      tileSelectionStore.setSelection(2, 3, 0, 5);
      expect(tileSelectionStore.selection.value).toBeNull();

      tileSelectionStore.setSelection(2, 3, 5, 0);
      expect(tileSelectionStore.selection.value).toBeNull();
    });

    it('clearSelection removes the selection', () => {
      tileSelectionStore.setSelection(2, 3, 4, 5);
      expect(tileSelectionStore.hasSelection).toBe(true);

      tileSelectionStore.clearSelection();
      expect(tileSelectionStore.selection.value).toBeNull();
      expect(tileSelectionStore.hasSelection).toBe(false);
    });

    it('hasSelection returns correct state', () => {
      expect(tileSelectionStore.hasSelection).toBe(false);

      tileSelectionStore.setSelection(1, 1, 2, 2);
      expect(tileSelectionStore.hasSelection).toBe(true);

      tileSelectionStore.clearSelection();
      expect(tileSelectionStore.hasSelection).toBe(false);
    });

    it('fires selection-changed event on setSelection', () => {
      const handler = vi.fn();
      tileSelectionStore.addEventListener('selection-changed', handler);

      tileSelectionStore.setSelection(2, 3, 4, 5);

      expect(handler).toHaveBeenCalled();
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.selection).toEqual({ x: 2, y: 3, width: 4, height: 5 });

      tileSelectionStore.removeEventListener('selection-changed', handler);
    });

    it('fires selection-cleared event on clearSelection', () => {
      tileSelectionStore.setSelection(2, 3, 4, 5);

      const handler = vi.fn();
      tileSelectionStore.addEventListener('selection-cleared', handler);

      tileSelectionStore.clearSelection();

      expect(handler).toHaveBeenCalled();

      tileSelectionStore.removeEventListener('selection-cleared', handler);
    });

    it('getSelectedTiles returns correct tile data from selection', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Set up some tiles
      tilemapStore.setTile(layerId, 2, 2, 10);
      tilemapStore.setTile(layerId, 3, 2, 20);
      tilemapStore.setTile(layerId, 2, 3, 30);
      tilemapStore.setTile(layerId, 3, 3, 40);

      // Select the 2x2 region
      tileSelectionStore.setSelection(2, 2, 2, 2);

      const tiles = tileSelectionStore.getSelectedTiles(layerId);

      expect(tiles).not.toBeNull();
      expect(tiles?.length).toBe(4);
      expect(tiles?.[0]).toBe(10);  // (2,2)
      expect(tiles?.[1]).toBe(20);  // (3,2)
      expect(tiles?.[2]).toBe(30);  // (2,3)
      expect(tiles?.[3]).toBe(40);  // (3,3)
    });

    it('getSelectedTiles returns null without selection', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      const tiles = tileSelectionStore.getSelectedTiles(layerId);

      expect(tiles).toBeNull();
    });

    it('getSelectedTiles returns 0 for empty tiles in selection', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Only set one tile, leave others empty
      tilemapStore.setTile(layerId, 0, 0, 5);

      tileSelectionStore.setSelection(0, 0, 2, 2);

      const tiles = tileSelectionStore.getSelectedTiles(layerId);

      expect(tiles).not.toBeNull();
      expect(tiles?.[0]).toBe(5);   // (0,0) has tile
      expect(tiles?.[1]).toBe(0);   // (1,0) empty
      expect(tiles?.[2]).toBe(0);   // (0,1) empty
      expect(tiles?.[3]).toBe(0);   // (1,1) empty
    });
  });

  describe('clipboard operations', () => {
    beforeEach(() => {
      // Set up a layer with some tiles
      const layerId = tilemapStore.activeLayerId.value!;
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);
      tilemapStore.setTile(layerId, 0, 1, 3);
      tilemapStore.setTile(layerId, 1, 1, 4);
    });

    it('copySelection copies correct tile data to clipboard', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      tileSelectionStore.setSelection(0, 0, 2, 2);

      tileSelectionStore.copySelection(layerId);

      const clip = tileSelectionStore.clipboard.value;
      expect(clip).not.toBeNull();
      expect(clip?.width).toBe(2);
      expect(clip?.height).toBe(2);
      expect(clip?.data[0]).toBe(1);  // Tile at (0,0)
      expect(clip?.data[1]).toBe(2);  // Tile at (1,0)
      expect(clip?.data[2]).toBe(3);  // Tile at (0,1)
      expect(clip?.data[3]).toBe(4);  // Tile at (1,1)
    });

    it('copySelection does nothing without selection', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      tileSelectionStore.copySelection(layerId);

      expect(tileSelectionStore.clipboard.value).toBeNull();
    });

    it('hasClipboard returns correct state', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      expect(tileSelectionStore.hasClipboard).toBe(false);

      tileSelectionStore.setSelection(0, 0, 2, 2);
      tileSelectionStore.copySelection(layerId);
      expect(tileSelectionStore.hasClipboard).toBe(true);
    });

    it('cutSelection copies then erases tiles', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      tileSelectionStore.setSelection(0, 0, 2, 2);

      tileSelectionStore.cutSelection(layerId);

      // Clipboard should have data
      const clip = tileSelectionStore.clipboard.value;
      expect(clip).not.toBeNull();
      expect(clip?.data[0]).toBe(1);
      expect(clip?.data[3]).toBe(4);

      // Tiles should be erased
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 0, 1)).toBe(0);
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(0);
    });

    it('fires tiles-copied event on copySelection', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      tileSelectionStore.setSelection(0, 0, 2, 2);

      const handler = vi.fn();
      tileSelectionStore.addEventListener('tiles-copied', handler);

      tileSelectionStore.copySelection(layerId);

      expect(handler).toHaveBeenCalled();
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.width).toBe(2);
      expect(event.detail.height).toBe(2);

      tileSelectionStore.removeEventListener('tiles-copied', handler);
    });

    it('fires tiles-cut event on cutSelection', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      tileSelectionStore.setSelection(0, 0, 2, 2);

      const handler = vi.fn();
      tileSelectionStore.addEventListener('tiles-cut', handler);

      tileSelectionStore.cutSelection(layerId);

      expect(handler).toHaveBeenCalled();

      tileSelectionStore.removeEventListener('tiles-cut', handler);
    });
  });

  describe('paste operations', () => {
    beforeEach(() => {
      // Set up source tiles
      const layerId = tilemapStore.activeLayerId.value!;
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);
      tilemapStore.setTile(layerId, 0, 1, 3);
      tilemapStore.setTile(layerId, 1, 1, 4);

      // Copy to clipboard
      tileSelectionStore.setSelection(0, 0, 2, 2);
      tileSelectionStore.copySelection(layerId);
    });

    it('startPastePreview enters paste mode', () => {
      expect(tileSelectionStore.isPasteMode).toBe(false);

      tileSelectionStore.startPastePreview();

      expect(tileSelectionStore.isPasteMode).toBe(true);
      expect(tileSelectionStore.pastePreview.value).toEqual({ x: 0, y: 0 });
    });

    it('startPastePreview does nothing without clipboard', () => {
      tileSelectionStore.reset();

      tileSelectionStore.startPastePreview();

      expect(tileSelectionStore.isPasteMode).toBe(false);
    });

    it('updatePastePreview updates position', () => {
      tileSelectionStore.startPastePreview();

      tileSelectionStore.updatePastePreview(5, 6);

      expect(tileSelectionStore.pastePreview.value).toEqual({ x: 5, y: 6 });
    });

    it('cancelPaste exits paste mode', () => {
      tileSelectionStore.startPastePreview();
      expect(tileSelectionStore.isPasteMode).toBe(true);

      tileSelectionStore.cancelPaste();

      expect(tileSelectionStore.isPasteMode).toBe(false);
      expect(tileSelectionStore.pastePreview.value).toBeNull();
    });

    it('confirmPaste places tiles at target position', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Clear original tiles
      tilemapStore.setTile(layerId, 0, 0, 0);
      tilemapStore.setTile(layerId, 1, 0, 0);
      tilemapStore.setTile(layerId, 0, 1, 0);
      tilemapStore.setTile(layerId, 1, 1, 0);

      tileSelectionStore.startPastePreview();
      tileSelectionStore.updatePastePreview(5, 5);
      tileSelectionStore.confirmPaste(layerId);

      // Tiles should be at new position
      expect(tilemapStore.getTile(layerId, 5, 5)).toBe(1);
      expect(tilemapStore.getTile(layerId, 6, 5)).toBe(2);
      expect(tilemapStore.getTile(layerId, 5, 6)).toBe(3);
      expect(tilemapStore.getTile(layerId, 6, 6)).toBe(4);

      // Should exit paste mode
      expect(tileSelectionStore.isPasteMode).toBe(false);
    });

    it('confirmPaste skips out-of-bounds tiles', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Paste near edge (10x10 tilemap)
      tileSelectionStore.startPastePreview();
      tileSelectionStore.updatePastePreview(9, 9);
      tileSelectionStore.confirmPaste(layerId);

      // Only (9,9) should have a tile (top-left of 2x2 clipboard)
      expect(tilemapStore.getTile(layerId, 9, 9)).toBe(1);
      // Others would be at (10,9), (9,10), (10,10) which are out of bounds
    });

    it('fires tiles-pasted event on confirmPaste', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      tileSelectionStore.startPastePreview();
      tileSelectionStore.updatePastePreview(3, 3);

      const handler = vi.fn();
      tileSelectionStore.addEventListener('tiles-pasted', handler);

      tileSelectionStore.confirmPaste(layerId);

      expect(handler).toHaveBeenCalled();
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.x).toBe(3);
      expect(event.detail.y).toBe(3);
      expect(event.detail.width).toBe(2);
      expect(event.detail.height).toBe(2);

      tileSelectionStore.removeEventListener('tiles-pasted', handler);
    });
  });

  describe('delete operation', () => {
    it('deleteSelection erases selected tiles', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Set up tiles
      tilemapStore.setTile(layerId, 2, 2, 5);
      tilemapStore.setTile(layerId, 3, 2, 6);
      tilemapStore.setTile(layerId, 2, 3, 7);
      tilemapStore.setTile(layerId, 3, 3, 8);

      tileSelectionStore.setSelection(2, 2, 2, 2);
      tileSelectionStore.deleteSelection(layerId);

      // All tiles should be erased (0)
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(0);
      expect(tilemapStore.getTile(layerId, 3, 2)).toBe(0);
      expect(tilemapStore.getTile(layerId, 2, 3)).toBe(0);
      expect(tilemapStore.getTile(layerId, 3, 3)).toBe(0);

      // Selection should be cleared after delete
      expect(tileSelectionStore.hasSelection).toBe(false);
    });

    it('deleteSelection does nothing without selection', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      tilemapStore.setTile(layerId, 0, 0, 99);

      tileSelectionStore.deleteSelection(layerId);

      // Tile should remain unchanged
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(99);
    });

    it('fires tiles-deleted event on deleteSelection', () => {
      const layerId = tilemapStore.activeLayerId.value!;
      tilemapStore.setTile(layerId, 2, 2, 5);
      tileSelectionStore.setSelection(2, 2, 2, 2);

      const handler = vi.fn();
      tileSelectionStore.addEventListener('tiles-deleted', handler);

      tileSelectionStore.deleteSelection(layerId);

      expect(handler).toHaveBeenCalled();
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.x).toBe(2);
      expect(event.detail.y).toBe(2);
      expect(event.detail.width).toBe(2);
      expect(event.detail.height).toBe(2);

      tileSelectionStore.removeEventListener('tiles-deleted', handler);
    });
  });

  describe('reset', () => {
    it('reset clears all state', () => {
      const layerId = tilemapStore.activeLayerId.value!;

      // Set up state
      tileSelectionStore.setSelection(1, 1, 2, 2);
      tileSelectionStore.copySelection(layerId);
      tileSelectionStore.startPastePreview();

      tileSelectionStore.reset();

      expect(tileSelectionStore.selection.value).toBeNull();
      expect(tileSelectionStore.clipboard.value).toBeNull();
      expect(tileSelectionStore.pastePreview.value).toBeNull();
      expect(tileSelectionStore.hasSelection).toBe(false);
      expect(tileSelectionStore.hasClipboard).toBe(false);
      expect(tileSelectionStore.isPasteMode).toBe(false);
    });
  });
});
