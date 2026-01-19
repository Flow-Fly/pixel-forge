import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TileSelectTool } from '../../src/tools/tile-select-tool';
import { tileSelectionStore } from '../../src/stores/tile-selection';
import { tilemapStore } from '../../src/stores/tilemap';

describe('TileSelectTool', () => {
  let tool: TileSelectTool;

  beforeEach(() => {
    // Reset stores
    tileSelectionStore.reset();
    tilemapStore.reset();

    // Initialize tilemap with known dimensions (10x10 tiles, 16px each)
    tilemapStore.resizeTilemap(10, 10);
    tilemapStore.setTileSize(16, 16);
    tilemapStore.initializeDefaultLayer();

    // Create tool instance
    tool = new TileSelectTool();
  });

  describe('tool properties', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('tile-select');
    });

    it('has correct cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });
  });

  describe('selection creation', () => {
    it('creates selection on drag from tile (0,0) to (2,2)', () => {
      // Pixel coords: (0,0) to (32,32) = tile (0,0) to (2,2)
      tool.onDown(8, 8, { shift: false, ctrl: false, alt: false, button: 0 });
      tool.onDrag(40, 40, { shift: false, ctrl: false, alt: false, button: 0 });
      tool.onUp(40, 40, { shift: false, ctrl: false, alt: false, button: 0 });

      const sel = tileSelectionStore.selection.value;
      expect(sel).not.toBeNull();
      expect(sel?.x).toBe(0);
      expect(sel?.y).toBe(0);
      expect(sel?.width).toBe(3);  // tiles 0, 1, 2
      expect(sel?.height).toBe(3);
    });

    it('creates selection on drag from tile (3,3) to (5,4)', () => {
      // 16px tiles: (48, 48) to (80, 64)
      tool.onDown(48, 48, { shift: false, ctrl: false, alt: false, button: 0 });
      tool.onDrag(80, 64, { shift: false, ctrl: false, alt: false, button: 0 });
      tool.onUp(80, 64, { shift: false, ctrl: false, alt: false, button: 0 });

      const sel = tileSelectionStore.selection.value;
      expect(sel).not.toBeNull();
      expect(sel?.x).toBe(3);
      expect(sel?.y).toBe(3);
      expect(sel?.width).toBe(3);  // tiles 3, 4, 5
      expect(sel?.height).toBe(2);  // tiles 3, 4
    });

    it('handles reverse drag (right to left)', () => {
      // Drag from (5,5) to (2,2)
      tool.onDown(80, 80, { shift: false, ctrl: false, alt: false, button: 0 });  // tile (5,5)
      tool.onDrag(32, 32, { shift: false, ctrl: false, alt: false, button: 0 });  // tile (2,2)
      tool.onUp(32, 32, { shift: false, ctrl: false, alt: false, button: 0 });

      const sel = tileSelectionStore.selection.value;
      expect(sel).not.toBeNull();
      expect(sel?.x).toBe(2);
      expect(sel?.y).toBe(2);
      expect(sel?.width).toBe(4);  // tiles 2, 3, 4, 5
      expect(sel?.height).toBe(4);
    });

    it('creates 1x1 selection on click without drag', () => {
      // Click on tile (4, 4)
      tool.onDown(64, 64, { shift: false, ctrl: false, alt: false, button: 0 });
      tool.onUp(64, 64, { shift: false, ctrl: false, alt: false, button: 0 });

      const sel = tileSelectionStore.selection.value;
      expect(sel).not.toBeNull();
      expect(sel?.x).toBe(4);
      expect(sel?.y).toBe(4);
      expect(sel?.width).toBe(1);
      expect(sel?.height).toBe(1);
    });
  });

  describe('selection clearing', () => {
    it('clears selection when clicking outside existing selection', () => {
      // Create a selection at (2,2) to (4,4)
      tileSelectionStore.setSelection(2, 2, 3, 3);
      expect(tileSelectionStore.hasSelection).toBe(true);

      // Click outside selection at (8, 8)
      tool.onDown(128, 128, { shift: false, ctrl: false, alt: false, button: 0 });

      // Selection should be cleared
      expect(tileSelectionStore.hasSelection).toBe(false);
    });

    it('does not clear selection when clicking inside existing selection', () => {
      // Create a selection at (2,2) to (4,4)
      tileSelectionStore.setSelection(2, 2, 3, 3);
      expect(tileSelectionStore.hasSelection).toBe(true);

      // Click inside selection at (3, 3) - pixel (48, 48)
      tool.onDown(48, 48, { shift: false, ctrl: false, alt: false, button: 0 });
      tool.onUp(48, 48, { shift: false, ctrl: false, alt: false, button: 0 });

      // New selection is created (starts new selection from inside point)
      // This is correct behavior - clicking starts a new selection
      const sel = tileSelectionStore.selection.value;
      expect(sel).not.toBeNull();
    });

    it('does not clear selection when shift is held (additive selection)', () => {
      // Create a selection at (2,2) to (4,4)
      tileSelectionStore.setSelection(2, 2, 3, 3);

      // Click outside with Shift held
      tool.onDown(128, 128, { shift: true, ctrl: false, alt: false, button: 0 });

      // Selection should NOT be cleared with Shift
      expect(tileSelectionStore.hasSelection).toBe(true);
    });

    it('does not clear selection when alt is held', () => {
      // Create a selection at (2,2) to (4,4)
      tileSelectionStore.setSelection(2, 2, 3, 3);

      // Click outside with Alt held
      tool.onDown(128, 128, { shift: false, ctrl: false, alt: true, button: 0 });

      // Selection should NOT be cleared with Alt
      expect(tileSelectionStore.hasSelection).toBe(true);
    });
  });

  describe('selection preview during drag', () => {
    it('returns preview during active drag', () => {
      tool.onDown(32, 32, { shift: false, ctrl: false, alt: false, button: 0 });  // tile (2,2)
      tool.onDrag(80, 64, { shift: false, ctrl: false, alt: false, button: 0 });  // tile (5,4)

      const preview = tool.getSelectionPreview();
      expect(preview).not.toBeNull();
      expect(preview?.x).toBe(2);
      expect(preview?.y).toBe(2);
      expect(preview?.width).toBe(4);  // tiles 2, 3, 4, 5
      expect(preview?.height).toBe(3);  // tiles 2, 3, 4
    });

    it('returns null when not dragging', () => {
      expect(tool.getSelectionPreview()).toBeNull();
    });

    it('returns null after drag ends', () => {
      tool.onDown(32, 32, { shift: false, ctrl: false, alt: false, button: 0 });
      tool.onDrag(80, 64, { shift: false, ctrl: false, alt: false, button: 0 });
      tool.onUp(80, 64, { shift: false, ctrl: false, alt: false, button: 0 });

      expect(tool.getSelectionPreview()).toBeNull();
    });
  });

  describe('paste mode interaction', () => {
    beforeEach(() => {
      // Set up clipboard data
      const layerId = tilemapStore.activeLayerId.value!;
      tilemapStore.setTile(layerId, 0, 0, 1);
      tileSelectionStore.setSelection(0, 0, 1, 1);
      tileSelectionStore.copySelection(layerId);
    });

    it('updates paste preview position on onMove when in paste mode', () => {
      tileSelectionStore.startPastePreview();
      expect(tileSelectionStore.isPasteMode).toBe(true);

      // Move to tile (5, 5)
      tool.onMove(80, 80, { shift: false, ctrl: false, alt: false, button: 0 });

      expect(tileSelectionStore.pastePreview.value).toEqual({ x: 5, y: 5 });
    });

    it('does not update paste preview when not in paste mode', () => {
      expect(tileSelectionStore.isPasteMode).toBe(false);

      tool.onMove(80, 80, { shift: false, ctrl: false, alt: false, button: 0 });

      expect(tileSelectionStore.pastePreview.value).toBeNull();
    });
  });

  describe('bounds checking', () => {
    it('respects tilemap bounds when selecting near edge', () => {
      // Start at tile (8, 8), drag beyond tilemap bounds
      tool.onDown(128, 128, { shift: false, ctrl: false, alt: false, button: 0 });  // tile (8,8)
      tool.onDrag(200, 200, { shift: false, ctrl: false, alt: false, button: 0 });  // would be tile (12,12) but tilemap is 10x10
      tool.onUp(200, 200, { shift: false, ctrl: false, alt: false, button: 0 });

      const sel = tileSelectionStore.selection.value;
      expect(sel).not.toBeNull();
      // Selection should be clamped to tilemap bounds (10x10)
      expect(sel?.x).toBe(8);
      expect(sel?.y).toBe(8);
      expect(sel?.width).toBe(2);  // Only tiles 8, 9 (10 - 8 = 2)
      expect(sel?.height).toBe(2);
    });
  });
});
