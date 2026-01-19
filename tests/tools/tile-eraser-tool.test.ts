import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TileEraserTool } from '../../src/tools/tile-eraser-tool';
import { TileBrushTool } from '../../src/tools/tile-brush-tool';
import { tilemapStore } from '../../src/stores/tilemap';
import { tilesetStore } from '../../src/stores/tileset';
import { modeStore } from '../../src/stores/mode';
import type { Tileset } from '../../src/types/tilemap';

describe('TileEraserTool', () => {
  let tool: TileEraserTool;

  // Helper to create test tileset
  async function createTestTileset(): Promise<Tileset> {
    const canvas = new OffscreenCanvas(16, 16);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 16, 16);
    const imageBitmap = await createImageBitmap(canvas);

    return {
      id: 'test-tileset',
      name: 'Test Tileset',
      image: imageBitmap,
      imagePath: '',
      tileWidth: 16,
      tileHeight: 16,
      columns: 1,
      rows: 1,
      tileCount: 1,
      spacing: 0,
      margin: 0,
    };
  }

  beforeEach(() => {
    // Reset stores
    tilemapStore.reset();
    tilesetStore.clearAllTilesets();
    modeStore.mode.value = 'map';

    // Initialize tilemap with default layer
    tilemapStore.initializeDefaultLayer();

    // Create tool
    tool = new TileEraserTool();
  });

  describe('basic properties', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('tile-eraser');
    });

    it('has correct cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });
  });

  describe('tile erasure', () => {
    it('erases tile at correct grid position', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place a tile at (2, 2)
      tilemapStore.setTile(layerId, 2, 2, 1);
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(1);

      // Erase at pixel position (32, 32) with 16px tiles
      tool.onDown(32, 32);
      tool.onUp(32, 32);

      // Tile should now be 0 (empty)
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(0);
    });

    it('erases tile at origin correctly', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place a tile at (0, 0)
      tilemapStore.setTile(layerId, 0, 0, 1);
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(1);

      tool.onDown(0, 0);
      tool.onUp(0, 0);

      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(0);
    });

    it('does not throw when erasing empty tile', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Tile is already 0 (empty)
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(0);

      // Should not throw
      expect(() => {
        tool.onDown(32, 32);
        tool.onUp(32, 32);
      }).not.toThrow();

      // Still 0
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(0);
    });

    it('does not erase on locked layer', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Place tile and lock layer
      tilemapStore.setTile(layerId, 2, 2, 1);
      tilemapStore.setLayerLocked(layerId, true);

      tool.onDown(32, 32);
      tool.onUp(32, 32);

      // Tile should still be 1 (not erased)
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(1);
    });

    it('does not erase outside bounds', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      // Should not throw
      expect(() => tool.onDown(-16, -16)).not.toThrow();
      expect(() => tool.onDown(10000, 10000)).not.toThrow();
    });

    it('does not erase when no active layer', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      // Remove all layers
      tilemapStore.reset();

      // Should not throw
      expect(() => tool.onDown(32, 32)).not.toThrow();
    });
  });

  describe('continuous erasing', () => {
    it('erases tiles along drag path', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place tiles along a row
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 1);
      tilemapStore.setTile(layerId, 2, 0, 1);
      tilemapStore.setTile(layerId, 3, 0, 1);

      // Drag from (0,0) to (48,0)
      tool.onDown(0, 0);
      tool.onDrag(16, 0);
      tool.onDrag(32, 0);
      tool.onDrag(48, 0);
      tool.onUp(48, 0);

      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 3, 0)).toBe(0);
    });

    it('does not double-erase same tile during drag', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const setTileSpy = vi.spyOn(tilemapStore, 'setTile');

      // Pre-place tile
      tilemapStore.setTile(tilemapStore.layers.value[0].id, 0, 0, 1);
      setTileSpy.mockClear();

      // Drag within same tile
      tool.onDown(0, 0);
      tool.onDrag(8, 8); // Still in tile (0, 0)
      tool.onUp(8, 8);

      // Should only have called setTile once (from onDown)
      expect(setTileSpy).toHaveBeenCalledTimes(1);
    });

    it('erases diagonal line correctly using Bresenham', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place tiles along diagonal
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 1, 1);
      tilemapStore.setTile(layerId, 2, 2, 1);
      tilemapStore.setTile(layerId, 3, 3, 1);

      // Drag diagonally from (0,0) to (48,48)
      tool.onDown(0, 0);
      tool.onDrag(48, 48);
      tool.onUp(48, 48);

      // All tiles along diagonal should be erased
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(0);
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(0);
      expect(tilemapStore.getTile(layerId, 3, 3)).toBe(0);
    });
  });

  describe('shift+click line erasing', () => {
    it('erases line from last position when shift held', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place tiles along a row
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 1);
      tilemapStore.setTile(layerId, 2, 0, 1);
      tilemapStore.setTile(layerId, 3, 0, 1);

      // First erase at (0, 0)
      tool.onDown(0, 0);
      tool.onUp(0, 0);

      // Shift+click at (48, 0) - should erase line
      tool.onDown(48, 0, { shift: true, ctrl: false, alt: false, button: 0 });
      tool.onUp(48, 0);

      // All tiles along line should be erased
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 3, 0)).toBe(0);
    });

    it('works without shift if no previous position', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place tile
      tilemapStore.setTile(layerId, 2, 2, 1);

      // Shift+click without prior position should just erase single tile
      tool.onDown(32, 32, { shift: true, ctrl: false, alt: false, button: 0 });
      tool.onUp(32, 32);

      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(0);
    });
  });

  describe('coordinate conversion', () => {
    it('converts pixel coordinates to tile coordinates correctly', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place tiles
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 1, 1);

      // Test edge cases
      tool.onDown(15, 15); // Should be tile (0, 0)
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(0);

      tool.onDown(16, 16); // Should be tile (1, 1)
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(0);
    });
  });

  describe('eraser position tracking', () => {
    it('tracks eraser position on move', () => {
      tool.onMove(32, 48);

      const pos = tool.getEraserPosition();
      expect(pos).toEqual({ x: 2, y: 3 });
    });

    it('returns null when outside bounds', () => {
      tool.onMove(-16, -16);

      const pos = tool.getEraserPosition();
      expect(pos).toBeNull();
    });

    it('updates position when moving to new tile', () => {
      tool.onMove(0, 0);
      expect(tool.getEraserPosition()).toEqual({ x: 0, y: 0 });

      tool.onMove(32, 32);
      expect(tool.getEraserPosition()).toEqual({ x: 2, y: 2 });
    });
  });

  describe('Bresenham line algorithm', () => {
    it('generates correct positions for horizontal line', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place tiles
      for (let x = 0; x <= 4; x++) {
        tilemapStore.setTile(layerId, x, 0, 1);
      }

      // First position
      tool.onDown(0, 0);
      tool.onUp(0, 0);

      // Shift+click to erase horizontal line
      tool.onDown(64, 0, { shift: true, ctrl: false, alt: false, button: 0 });
      tool.onUp(64, 0);

      // Verify all tiles in line are erased
      for (let x = 0; x <= 4; x++) {
        expect(tilemapStore.getTile(layerId, x, 0)).toBe(0);
      }
    });

    it('generates correct positions for vertical line', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place tiles
      for (let y = 0; y <= 4; y++) {
        tilemapStore.setTile(layerId, 0, y, 1);
      }

      // First position
      tool.onDown(0, 0);
      tool.onUp(0, 0);

      // Shift+click to erase vertical line
      tool.onDown(0, 64, { shift: true, ctrl: false, alt: false, button: 0 });
      tool.onUp(0, 64);

      // Verify all tiles in line are erased
      for (let y = 0; y <= 4; y++) {
        expect(tilemapStore.getTile(layerId, 0, y)).toBe(0);
      }
    });
  });

  describe('performance', () => {
    it('erases tile within 16ms (NFR2) - batch test', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place 100 tiles
      for (let i = 0; i < 100; i++) {
        tilemapStore.setTile(layerId, i % 20, Math.floor(i / 20), 1);
      }

      const start = performance.now();

      // Erase 100 tiles
      for (let i = 0; i < 100; i++) {
        tool.onDown((i % 20) * 16, Math.floor(i / 20) * 16);
        tool.onUp((i % 20) * 16, Math.floor(i / 20) * 16);
      }

      const elapsed = performance.now() - start;

      // Total for 100 tiles should be well under 1600ms (16ms average)
      expect(elapsed).toBeLessThan(1600);
    });

    it('individual tile erasure completes within 16ms (NFR2)', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place 10 tiles
      for (let i = 0; i < 10; i++) {
        tilemapStore.setTile(layerId, i, 0, 1);
      }

      // Test 10 individual erasures and verify EACH is under 16ms
      const timings: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        tool.onDown(i * 16, 0);
        tool.onUp(i * 16, 0);
        const elapsed = performance.now() - start;
        timings.push(elapsed);
      }

      // Every single erasure must be under 16ms
      timings.forEach((time, index) => {
        expect(time, `Tile erasure ${index} took ${time}ms`).toBeLessThan(16);
      });

      // Also verify the max timing for clarity
      const maxTime = Math.max(...timings);
      expect(maxTime).toBeLessThan(16);
    });
  });
});

describe('TileBrushTool right-click quick erase', () => {
  let tool: TileBrushTool;

  // Helper to create test tileset
  async function createTestTileset(): Promise<Tileset> {
    const canvas = new OffscreenCanvas(16, 16);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 16, 16);
    const imageBitmap = await createImageBitmap(canvas);

    return {
      id: 'test-tileset',
      name: 'Test Tileset',
      image: imageBitmap,
      imagePath: '',
      tileWidth: 16,
      tileHeight: 16,
      columns: 1,
      rows: 1,
      tileCount: 1,
      spacing: 0,
      margin: 0,
    };
  }

  beforeEach(() => {
    // Reset stores
    tilemapStore.reset();
    tilesetStore.clearAllTilesets();
    modeStore.mode.value = 'map';

    // Initialize tilemap with default layer
    tilemapStore.initializeDefaultLayer();

    // Create tool
    tool = new TileBrushTool();
  });

  describe('right-click quick erase', () => {
    it('erases tile on right-click', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place tile
      tilemapStore.setTile(layerId, 2, 2, 1);
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(1);

      // Right-click at (32, 32)
      tool.onDown(32, 32, { shift: false, ctrl: false, alt: false, button: 2 });
      tool.onUp(32, 32);

      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(0);
    });

    it('erases continuously on right-click drag', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place tiles
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 1);
      tilemapStore.setTile(layerId, 2, 0, 1);

      // Right-click drag
      tool.onDown(0, 0, { shift: false, ctrl: false, alt: false, button: 2 });
      tool.onDrag(16, 0, { shift: false, ctrl: false, alt: false, button: 2 });
      tool.onDrag(32, 0, { shift: false, ctrl: false, alt: false, button: 2 });
      tool.onUp(32, 0);

      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(0);
    });

    it('does not erase on locked layer with right-click', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // Place tile and lock layer
      tilemapStore.setTile(layerId, 2, 2, 1);
      tilemapStore.setLayerLocked(layerId, true);

      // Right-click should not erase
      tool.onDown(32, 32, { shift: false, ctrl: false, alt: false, button: 2 });
      tool.onUp(32, 32);

      // Tile should still be 1 (not erased)
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(1);
    });

    it('left-click still places tiles after right-click erase', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // Pre-place tile and erase it
      tilemapStore.setTile(layerId, 2, 2, 1);
      tool.onDown(32, 32, { shift: false, ctrl: false, alt: false, button: 2 });
      tool.onUp(32, 32);
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(0);

      // Left-click should place tile
      tool.onDown(32, 32, { shift: false, ctrl: false, alt: false, button: 0 });
      tool.onUp(32, 32);
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(1);
    });
  });
});
