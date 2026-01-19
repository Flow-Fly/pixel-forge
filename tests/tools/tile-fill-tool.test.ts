import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TileFillTool } from '../../src/tools/tile-fill-tool';
import { tilemapStore } from '../../src/stores/tilemap';
import { tilesetStore } from '../../src/stores/tileset';
import { modeStore } from '../../src/stores/mode';
import type { Tileset } from '../../src/types/tilemap';

describe('TileFillTool', () => {
  let tool: TileFillTool;

  // Helper to create test tileset with multiple tiles
  async function createTestTileset(): Promise<Tileset> {
    const canvas = new OffscreenCanvas(32, 16);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = 'blue';
    ctx.fillRect(16, 0, 16, 16);
    const imageBitmap = await createImageBitmap(canvas);

    return {
      id: 'test-tileset',
      name: 'Test Tileset',
      image: imageBitmap,
      imagePath: '',
      tileWidth: 16,
      tileHeight: 16,
      columns: 2,
      rows: 1,
      tileCount: 2,
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
    tool = new TileFillTool();
  });

  describe('basic properties', () => {
    it('has correct name', () => {
      expect(tool.name).toBe('tile-fill');
    });

    it('has correct cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });
  });

  describe('flood fill on empty region', () => {
    it('fills contiguous empty tiles', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0); // Select first tile (will be stored as ID 1)
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Resize to 5x5 for easier testing
      tilemapStore.resizeTilemap(5, 5);

      // Place barrier tiles on left and right edges
      tilemapStore.setTile(layerId, 0, 2, 2); // barrier (blue tile)
      tilemapStore.setTile(layerId, 4, 2, 2); // barrier (blue tile)

      // Click on empty tile at (2, 2)
      tool.onDown(32 + 8, 32 + 8); // Center of tile (2, 2) at 16px tiles

      // Empty tiles in the row should be filled with tile ID 1
      expect(tilemapStore.getTile(layerId, 1, 2)).toBe(1);
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(1);
      expect(tilemapStore.getTile(layerId, 3, 2)).toBe(1);

      // Barrier tiles should be unchanged
      expect(tilemapStore.getTile(layerId, 0, 2)).toBe(2);
      expect(tilemapStore.getTile(layerId, 4, 2)).toBe(2);
    });

    it('fills entire empty map', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.resizeTilemap(3, 3);

      // Fill from center
      tool.onDown(16 + 8, 16 + 8);

      // All 9 tiles should be filled
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          expect(tilemapStore.getTile(layerId, x, y)).toBe(1);
        }
      }
    });
  });

  describe('flood fill on existing tile region', () => {
    it('replaces contiguous matching tiles', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(1); // Select second tile (will be stored as ID 2)
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.resizeTilemap(5, 3);

      // Fill center column with tile ID 1 (first tile)
      tilemapStore.setTile(layerId, 2, 0, 1);
      tilemapStore.setTile(layerId, 2, 1, 1);
      tilemapStore.setTile(layerId, 2, 2, 1);

      // Click on tile with ID 1 to replace with ID 2
      tool.onDown(32 + 8, 16 + 8); // Center of tile (2, 1)

      // All tiles that were ID 1 should now be ID 2
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(2);
      expect(tilemapStore.getTile(layerId, 2, 1)).toBe(2);
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(2);

      // Other tiles should remain empty
      expect(tilemapStore.getTile(layerId, 0, 1)).toBe(0);
      expect(tilemapStore.getTile(layerId, 4, 1)).toBe(0);
    });

    it('stops at boundary of different tile IDs', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(1); // Fill with ID 2
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.resizeTilemap(5, 5);

      // Create a barrier of tile ID 2 forming a box
      // Top row
      tilemapStore.setTile(layerId, 1, 1, 2);
      tilemapStore.setTile(layerId, 2, 1, 2);
      tilemapStore.setTile(layerId, 3, 1, 2);
      // Left and right sides
      tilemapStore.setTile(layerId, 1, 2, 2);
      tilemapStore.setTile(layerId, 3, 2, 2);
      // Bottom row
      tilemapStore.setTile(layerId, 1, 3, 2);
      tilemapStore.setTile(layerId, 2, 3, 2);
      tilemapStore.setTile(layerId, 3, 3, 2);
      // Inside the box is empty (tile 0)

      // Fill inside the box with tile 1 (first tile, stored as ID 1)
      tilesetStore.setSelectedTile(0);
      tool.onDown(32 + 8, 32 + 8); // Center of tile (2, 2)

      // Inside should be filled
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(1);

      // Border should be unchanged (still ID 2)
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(2);
      expect(tilemapStore.getTile(layerId, 2, 1)).toBe(2);
      expect(tilemapStore.getTile(layerId, 3, 1)).toBe(2);

      // Outside should still be empty
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(0);
    });
  });

  describe('same tile optimization (AC #5)', () => {
    it('does nothing when fill tile matches target tile', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0); // Select first tile (ID 1)
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.resizeTilemap(3, 3);

      // Fill with tile ID 1
      tilemapStore.setTile(layerId, 1, 1, 1);

      // Track setTile calls
      const setTileSpy = vi.spyOn(tilemapStore, 'setTile');

      // Click on tile with same ID as selected
      tool.onDown(16 + 8, 16 + 8);

      // setTile should not have been called (early exit)
      expect(setTileSpy).not.toHaveBeenCalled();
    });
  });

  describe('locked layer', () => {
    it('does not fill on locked layer', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.setLayerLocked(layerId, true);

      tool.onDown(16, 16);

      // Tile should still be 0 (empty)
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(0);
    });
  });

  describe('no tile selected', () => {
    it('does not fill when no tile is selected', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      // Don't select a tile
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      tool.onDown(16, 16);

      // Tile should still be 0 (empty)
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(0);
    });
  });

  describe('bounds checking', () => {
    it('fill respects tilemap bounds', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.resizeTilemap(3, 3);

      // Fill from (0, 0)
      tool.onDown(8, 8); // Center of (0, 0)

      // Should fill entire 3x3 empty map without errors
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          expect(tilemapStore.getTile(layerId, x, y)).toBe(1);
        }
      }
    });

    it('does not throw when clicking outside bounds', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);
      tilemapStore.setActiveTileset(tileset.id);

      tilemapStore.resizeTilemap(3, 3);

      // Try to fill outside bounds - should not throw
      expect(() => tool.onDown(-16, -16)).not.toThrow();
      expect(() => tool.onDown(10000, 10000)).not.toThrow();
    });
  });

  describe('coordinate conversion', () => {
    it('converts pixel coordinates to tile coordinates correctly', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.resizeTilemap(5, 5);

      // Place barriers to create a 1-tile region
      tilemapStore.setTile(layerId, 0, 0, 2);
      tilemapStore.setTile(layerId, 2, 0, 2);
      tilemapStore.setTile(layerId, 1, 1, 2);

      // Click at pixel 24, which should be tile (1, 0) at 16px tiles
      tool.onDown(24, 8);

      // Only tile (1, 0) should be filled
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(1);

      // Adjacent tiles that are barriers should be unchanged
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(2);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(2);
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(2);
    });
  });

  describe('4-way connectivity', () => {
    it('uses 4-way connectivity (not diagonal)', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.resizeTilemap(5, 5);

      // Create a diagonal barrier pattern:
      // . X .
      // X . X
      // . X .
      // X and . are different tiles, fill should NOT leak diagonally
      tilemapStore.setTile(layerId, 1, 0, 2);
      tilemapStore.setTile(layerId, 0, 1, 2);
      tilemapStore.setTile(layerId, 2, 1, 2);
      tilemapStore.setTile(layerId, 1, 2, 2);

      // Fill center tile (1, 1) - should only fill that one tile
      tool.onDown(16 + 8, 16 + 8);

      // Center should be filled
      expect(tilemapStore.getTile(layerId, 1, 1)).toBe(1);

      // Corner tiles should NOT be filled (diagonal connection only)
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(0);
      expect(tilemapStore.getTile(layerId, 0, 2)).toBe(0);
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(0);
    });
  });

  describe('drag and up handlers', () => {
    it('drag is no-op (fill is single-click operation)', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.resizeTilemap(3, 3);

      const setTileSpy = vi.spyOn(tilemapStore, 'setTile');

      // Fill with onDown
      tool.onDown(8, 8);
      const callsAfterDown = setTileSpy.mock.calls.length;

      // Drag should not place more tiles
      tool.onDrag(24, 24);
      expect(setTileSpy.mock.calls.length).toBe(callsAfterDown);
    });

    it('up is no-op', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.resizeTilemap(3, 3);

      // Get initial state
      const tileBefore = tilemapStore.getTile(layerId, 0, 0);

      // onUp alone should do nothing (no state change)
      tool.onUp(8, 8);

      // State should be unchanged
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(tileBefore);
    });
  });

  describe('preview position tracking', () => {
    it('tracks preview position on move', () => {
      tool.onMove(32, 48);

      const preview = tool.getFillPreviewPosition();
      expect(preview).toEqual({ x: 2, y: 3 });
    });

    it('returns null preview when outside bounds', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      tool.onMove(-16, -16);

      const preview = tool.getFillPreviewPosition();
      expect(preview).toBeNull();
    });

    it('returns null preview on locked layer', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.setLayerLocked(layerId, true);

      tool.onMove(32, 48);

      const preview = tool.getFillPreviewPosition();
      expect(preview).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles no active layer gracefully', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);
      tilemapStore.setActiveTileset(tileset.id);

      // Remove all layers
      tilemapStore.reset();

      // Should not throw
      expect(() => tool.onDown(32, 32)).not.toThrow();
    });

    it('handles large fill operations without stack overflow', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);
      tilemapStore.setActiveTileset(tileset.id);

      const layerId = tilemapStore.layers.value[0].id;

      // Create a large empty map
      tilemapStore.resizeTilemap(50, 50);

      // Fill entire map from corner - should not cause stack overflow
      expect(() => tool.onDown(8, 8)).not.toThrow();

      // Verify fill completed
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(1);
      expect(tilemapStore.getTile(layerId, 49, 49)).toBe(1);
    });
  });

  describe('performance', () => {
    it('fill operation completes in reasonable time for large areas', async () => {
      const tileset = await createTestTileset();
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);
      tilesetStore.setSelectedTile(0);
      tilemapStore.setActiveTileset(tileset.id);

      // Create 100x100 map (10,000 tiles)
      tilemapStore.resizeTilemap(100, 100);

      const start = performance.now();
      tool.onDown(800, 800); // Center of map
      const elapsed = performance.now() - start;

      // Should complete within 1 second for 10,000 tiles
      // (being generous for CI environments)
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
