import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TileBrushTool } from '../../src/tools/tile-brush-tool';
import { tilemapStore } from '../../src/stores/tilemap';
import { tilesetStore } from '../../src/stores/tileset';
import { modeStore } from '../../src/stores/mode';
import type { Tileset } from '../../src/types/tilemap';

describe('TileBrushTool', () => {
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

  describe('basic properties', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('tile-brush');
    });

    it('has correct cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });
  });

  describe('tile placement', () => {
    it('places tile at correct grid position', async () => {
      // Setup: Create tileset and select a tile
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // Act: Click at pixel position (32, 32) with 16px tiles = tile (2, 2)
      tool.onDown(32, 32);

      // Assert: Tile placed at (2, 2) with tileId 1 (0-based index + 1)
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(1);
    });

    it('places tile at origin correctly', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      tool.onDown(0, 0);

      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(1);
    });

    it('does not place tile when no tile selected', () => {
      const layerId = tilemapStore.layers.value[0].id;

      tool.onDown(32, 32);

      // Tile should still be 0 (empty)
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(0);
    });

    it('does not place tile on locked layer', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.setLayerLocked(layerId, true);

      tool.onDown(32, 32);

      // Tile should still be 0 (empty)
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(0);
    });

    it('does not place tile outside bounds', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      // Try to place outside bounds - should not throw
      expect(() => tool.onDown(-16, -16)).not.toThrow();
      expect(() => tool.onDown(10000, 10000)).not.toThrow();
    });

    it('does not place tile when no active layer', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      // Remove all layers
      tilemapStore.reset();

      // Should not throw
      expect(() => tool.onDown(32, 32)).not.toThrow();
    });
  });

  describe('continuous painting', () => {
    it('paints tiles along drag path', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // Drag from (0,0) to (48,0) - should paint tiles at (0,0), (1,0), (2,0), (3,0)
      tool.onDown(0, 0);
      tool.onDrag(16, 0);
      tool.onDrag(32, 0);
      tool.onDrag(48, 0);
      tool.onUp(48, 0);

      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(1);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(1);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(1);
      expect(tilemapStore.getTile(layerId, 3, 0)).toBe(1);
    });

    it('does not double-paint same tile during drag', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const setTileSpy = vi.spyOn(tilemapStore, 'setTile');

      // Drag within same tile
      tool.onDown(0, 0);
      tool.onDrag(8, 8); // Still in tile (0, 0)
      tool.onUp(8, 8);

      // Should only have called setTile once (from onDown)
      expect(setTileSpy).toHaveBeenCalledTimes(1);
    });

    it('paints diagonal line correctly using Bresenham', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // Drag diagonally from (0,0) to (48,48)
      tool.onDown(0, 0);
      tool.onDrag(48, 48);
      tool.onUp(48, 48);

      // All tiles along diagonal should be painted
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(1);
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(1);
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(1);
      expect(tilemapStore.getTile(layerId, 3, 3)).toBe(1);
    });
  });

  describe('shift+click line', () => {
    it('draws line from last position when shift held', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // First click at (0, 0)
      tool.onDown(0, 0);
      tool.onUp(0, 0);

      // Shift+click at (48, 0) - should draw line
      tool.onDown(48, 0, { shift: true, ctrl: false, alt: false, button: 0 });
      tool.onUp(48, 0);

      // All tiles along line should be filled
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(1);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(1);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(1);
      expect(tilemapStore.getTile(layerId, 3, 0)).toBe(1);
    });

    it('works without shift if no previous position', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // Shift+click without prior position should just place single tile
      tool.onDown(32, 32, { shift: true, ctrl: false, alt: false, button: 0 });
      tool.onUp(32, 32);

      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(1);
    });

    it('draws diagonal line with shift+click', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // First click at (0, 0)
      tool.onDown(0, 0);
      tool.onUp(0, 0);

      // Shift+click at (48, 48)
      tool.onDown(48, 48, { shift: true, ctrl: false, alt: false, button: 0 });
      tool.onUp(48, 48);

      // Diagonal line should be filled
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(1);
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(1);
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(1);
      expect(tilemapStore.getTile(layerId, 3, 3)).toBe(1);
    });
  });

  describe('coordinate conversion', () => {
    it('converts pixel coordinates to tile coordinates correctly', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // Test edge cases
      tool.onDown(15, 15); // Should be tile (0, 0)
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(1);

      tool.onDown(16, 16); // Should be tile (1, 1)
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(1);

      tool.onDown(31, 31); // Should be tile (1, 1)
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(1);
    });
  });

  describe('preview position tracking', () => {
    it('tracks preview position on move', () => {
      tool.onMove(32, 48);

      const preview = tool.getPreviewTile();
      // Preview exists but no tile index if no tile selected
      expect(preview).toBeNull();
    });

    it('returns preview with tile index when tile selected', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      tool.onMove(32, 48);

      const preview = tool.getPreviewTile();
      expect(preview).toEqual({ x: 2, y: 3, tileIndex: 0 });
    });

    it('returns null preview when outside bounds', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      tool.onMove(-16, -16);

      const preview = tool.getPreviewTile();
      expect(preview).toBeNull();
    });
  });

  describe('Bresenham line algorithm', () => {
    it('generates correct positions for horizontal line', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // First position
      tool.onDown(0, 0);
      tool.onUp(0, 0);

      // Shift+click to draw horizontal line
      tool.onDown(64, 0, { shift: true, ctrl: false, alt: false, button: 0 });
      tool.onUp(64, 0);

      // Verify all tiles in line
      for (let x = 0; x <= 4; x++) {
        expect(tilemapStore.getTile(layerId, x, 0)).toBe(1);
      }
    });

    it('generates correct positions for vertical line', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const layerId = tilemapStore.layers.value[0].id;

      // First position
      tool.onDown(0, 0);
      tool.onUp(0, 0);

      // Shift+click to draw vertical line
      tool.onDown(0, 64, { shift: true, ctrl: false, alt: false, button: 0 });
      tool.onUp(0, 64);

      // Verify all tiles in line
      for (let y = 0; y <= 4; y++) {
        expect(tilemapStore.getTile(layerId, 0, y)).toBe(1);
      }
    });
  });

  describe('performance', () => {
    it('places tile within 16ms (NFR2) - batch test', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      const start = performance.now();

      // Place 100 tiles
      for (let i = 0; i < 100; i++) {
        tool.onDown((i % 20) * 16, Math.floor(i / 20) * 16);
        tool.onUp((i % 20) * 16, Math.floor(i / 20) * 16);
      }

      const elapsed = performance.now() - start;

      // Total for 100 tiles should be well under 1600ms (16ms average)
      // Actual placement should be sub-ms each
      expect(elapsed).toBeLessThan(1600);
    });

    it('individual tile placement completes within 16ms (NFR2)', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);

      // Test 10 individual placements and verify EACH is under 16ms
      const timings: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        tool.onDown(i * 16, 0);
        tool.onUp(i * 16, 0);
        const elapsed = performance.now() - start;
        timings.push(elapsed);
      }

      // Every single placement must be under 16ms
      timings.forEach((time, index) => {
        expect(time, `Tile placement ${index} took ${time}ms`).toBeLessThan(16);
      });

      // Also verify the max timing for clarity
      const maxTime = Math.max(...timings);
      expect(maxTime).toBeLessThan(16);
    });
  });
});
