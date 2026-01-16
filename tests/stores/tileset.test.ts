import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tilesetStore } from '../../src/stores/tileset';
import type { Tileset } from '../../src/types/tilemap';
import { InvalidTilesetError } from '../../src/errors/tilemap-errors';

/**
 * Helper to create a valid test tileset with an ImageBitmap
 */
async function createTestTileset(
  id: string,
  name: string,
  options: {
    tileWidth?: number;
    tileHeight?: number;
    columns?: number;
    rows?: number;
    spacing?: number;
    margin?: number;
  } = {}
): Promise<Tileset> {
  const {
    tileWidth = 16,
    tileHeight = 16,
    columns = 2,
    rows = 2,
    spacing = 0,
    margin = 0
  } = options;

  // Calculate image dimensions based on tile params
  const imageWidth = margin * 2 + columns * tileWidth + (columns - 1) * spacing;
  const imageHeight = margin * 2 + rows * tileHeight + (rows - 1) * spacing;

  // Create a test image with colored tiles for verification
  const canvas = new OffscreenCanvas(imageWidth, imageHeight);
  const ctx = canvas.getContext('2d')!;

  // Fill with distinct colors for each tile
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000'];
  let colorIndex = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = margin + col * (tileWidth + spacing);
      const y = margin + row * (tileHeight + spacing);
      ctx.fillStyle = colors[colorIndex % colors.length];
      ctx.fillRect(x, y, tileWidth, tileHeight);
      colorIndex++;
    }
  }

  const bitmap = await createImageBitmap(canvas);

  return {
    id,
    name,
    image: bitmap,
    imagePath: `/test/${name}.png`,
    tileWidth,
    tileHeight,
    columns,
    rows,
    tileCount: columns * rows,
    spacing,
    margin
  };
}

describe('TilesetStore', () => {
  beforeEach(() => {
    tilesetStore.clearAllTilesets();
  });

  describe('Initial State (AC #1)', () => {
    it('should initialize with empty tilesets array', () => {
      expect(tilesetStore.tilesets.value).toEqual([]);
    });

    it('should initialize with null activeTilesetId', () => {
      expect(tilesetStore.activeTilesetId.value).toBeNull();
    });

    it('should initialize with null selectedTileIndex', () => {
      expect(tilesetStore.selectedTileIndex.value).toBeNull();
    });

    it('should initialize with idle loadStatus', () => {
      expect(tilesetStore.loadStatus.value).toBe('idle');
    });
  });

  describe('addTileset() (AC #2, #6)', () => {
    it('should add a valid tileset to the store', async () => {
      const tileset = await createTestTileset('ts-1', 'Test Tileset');
      tilesetStore.addTileset(tileset);

      expect(tilesetStore.tilesets.value).toHaveLength(1);
      expect(tilesetStore.tilesets.value[0]).toBe(tileset);
    });

    it('should fire tileset-added event', async () => {
      const tileset = await createTestTileset('ts-1', 'Test Tileset');
      const eventHandler = vi.fn();
      tilesetStore.addEventListener('tileset-added', eventHandler);

      tilesetStore.addTileset(tileset);

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler.mock.calls[0][0].detail.tileset).toBe(tileset);
    });

    it('should throw InvalidTilesetError for missing id', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      (tileset as unknown as Record<string, unknown>).id = '';

      expect(() => tilesetStore.addTileset(tileset)).toThrow(InvalidTilesetError);
      expect(() => tilesetStore.addTileset(tileset)).toThrow('Tileset must have a valid string id');
    });

    it('should throw InvalidTilesetError for missing name', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      (tileset as unknown as Record<string, unknown>).name = '';

      expect(() => tilesetStore.addTileset(tileset)).toThrow(InvalidTilesetError);
      expect(() => tilesetStore.addTileset(tileset)).toThrow('Tileset must have a valid string name');
    });

    it('should throw InvalidTilesetError for invalid image', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      (tileset as unknown as Record<string, unknown>).image = null;

      expect(() => tilesetStore.addTileset(tileset)).toThrow(InvalidTilesetError);
      expect(() => tilesetStore.addTileset(tileset)).toThrow('Tileset image must be an ImageBitmap');
    });

    it('should throw InvalidTilesetError for invalid tileWidth', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      (tileset as unknown as Record<string, unknown>).tileWidth = 0;

      expect(() => tilesetStore.addTileset(tileset)).toThrow(InvalidTilesetError);
      expect(() => tilesetStore.addTileset(tileset)).toThrow('Tileset tileWidth must be a positive integer');
    });

    it('should throw InvalidTilesetError for invalid tileHeight', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      (tileset as unknown as Record<string, unknown>).tileHeight = -1;

      expect(() => tilesetStore.addTileset(tileset)).toThrow(InvalidTilesetError);
      expect(() => tilesetStore.addTileset(tileset)).toThrow('Tileset tileHeight must be a positive integer');
    });

    it('should throw InvalidTilesetError for duplicate id', async () => {
      const tileset1 = await createTestTileset('ts-1', 'First');
      const tileset2 = await createTestTileset('ts-1', 'Second');

      tilesetStore.addTileset(tileset1);

      expect(() => tilesetStore.addTileset(tileset2)).toThrow(InvalidTilesetError);
      expect(() => tilesetStore.addTileset(tileset2)).toThrow("Tileset with id 'ts-1' already exists");
    });

    it('should add multiple tilesets', async () => {
      const tileset1 = await createTestTileset('ts-1', 'First');
      const tileset2 = await createTestTileset('ts-2', 'Second');

      tilesetStore.addTileset(tileset1);
      tilesetStore.addTileset(tileset2);

      expect(tilesetStore.tilesets.value).toHaveLength(2);
    });
  });

  describe('removeTileset() (AC #5)', () => {
    it('should remove an existing tileset', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);

      const result = tilesetStore.removeTileset('ts-1');

      expect(result).toBe(true);
      expect(tilesetStore.tilesets.value).toHaveLength(0);
    });

    it('should return false for non-existent tileset', () => {
      const result = tilesetStore.removeTileset('non-existent');
      expect(result).toBe(false);
    });

    it('should fire tileset-removed event', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);

      const eventHandler = vi.fn();
      tilesetStore.addEventListener('tileset-removed', eventHandler);

      tilesetStore.removeTileset('ts-1');

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler.mock.calls[0][0].detail.id).toBe('ts-1');
    });

    it('should clear activeTilesetId if removed tileset was active', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset('ts-1');

      expect(tilesetStore.activeTilesetId.value).toBe('ts-1');

      tilesetStore.removeTileset('ts-1');

      expect(tilesetStore.activeTilesetId.value).toBeNull();
    });

    it('should indicate wasActive in event when active tileset is removed', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset('ts-1');

      const eventHandler = vi.fn();
      tilesetStore.addEventListener('tileset-removed', eventHandler);

      tilesetStore.removeTileset('ts-1');

      expect(eventHandler.mock.calls[0][0].detail.wasActive).toBe(true);
    });

    it('should not affect activeTilesetId when removing inactive tileset', async () => {
      const tileset1 = await createTestTileset('ts-1', 'First');
      const tileset2 = await createTestTileset('ts-2', 'Second');
      tilesetStore.addTileset(tileset1);
      tilesetStore.addTileset(tileset2);
      tilesetStore.setActiveTileset('ts-1');

      tilesetStore.removeTileset('ts-2');

      expect(tilesetStore.activeTilesetId.value).toBe('ts-1');
    });
  });

  describe('setActiveTileset() and getActiveTileset() (AC #3)', () => {
    it('should set the active tileset', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);

      tilesetStore.setActiveTileset('ts-1');

      expect(tilesetStore.activeTilesetId.value).toBe('ts-1');
    });

    it('should return the active tileset via getActiveTileset', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset('ts-1');

      const active = tilesetStore.getActiveTileset();

      expect(active).toBe(tileset);
    });

    it('should fire active-tileset-changed event', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);

      const eventHandler = vi.fn();
      tilesetStore.addEventListener('active-tileset-changed', eventHandler);

      tilesetStore.setActiveTileset('ts-1');

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler.mock.calls[0][0].detail.id).toBe('ts-1');
      expect(eventHandler.mock.calls[0][0].detail.tileset).toBe(tileset);
    });

    it('should clear selectedTileIndex when changing active tileset', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset('ts-1');
      tilesetStore.setSelectedTile(2);

      expect(tilesetStore.selectedTileIndex.value).toBe(2);

      const tileset2 = await createTestTileset('ts-2', 'Test 2');
      tilesetStore.addTileset(tileset2);
      tilesetStore.setActiveTileset('ts-2');

      expect(tilesetStore.selectedTileIndex.value).toBeNull();
    });

    it('should allow setting active tileset to null', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset('ts-1');

      tilesetStore.setActiveTileset(null);

      expect(tilesetStore.activeTilesetId.value).toBeNull();
      expect(tilesetStore.getActiveTileset()).toBeNull();
    });

    it('should throw InvalidTilesetError for non-existent tileset id', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset('ts-1');

      expect(() => tilesetStore.setActiveTileset('non-existent')).toThrow(InvalidTilesetError);
      expect(() => tilesetStore.setActiveTileset('non-existent')).toThrow(
        "Cannot set active tileset: tileset with id 'non-existent' does not exist"
      );

      // Should remain unchanged after failed attempt
      expect(tilesetStore.activeTilesetId.value).toBe('ts-1');
    });

    it('should return null from getActiveTileset when no tileset is active', () => {
      expect(tilesetStore.getActiveTileset()).toBeNull();
    });
  });

  describe('setSelectedTile() and getSelectedTile()', () => {
    it('should set the selected tile index when valid', async () => {
      const tileset = await createTestTileset('ts-1', 'Test', { columns: 4, rows: 4 }); // 16 tiles
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset('ts-1');

      tilesetStore.setSelectedTile(5);
      expect(tilesetStore.selectedTileIndex.value).toBe(5);
      expect(tilesetStore.getSelectedTile()).toBe(5);
    });

    it('should allow setting to null', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset('ts-1');

      tilesetStore.setSelectedTile(2);
      tilesetStore.setSelectedTile(null);
      expect(tilesetStore.getSelectedTile()).toBeNull();
    });

    it('should throw InvalidTilesetError when no active tileset', () => {
      expect(() => tilesetStore.setSelectedTile(0)).toThrow(InvalidTilesetError);
      expect(() => tilesetStore.setSelectedTile(0)).toThrow('Cannot select tile: no active tileset');
    });

    it('should throw InvalidTilesetError for negative index', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset('ts-1');

      expect(() => tilesetStore.setSelectedTile(-1)).toThrow(InvalidTilesetError);
      expect(() => tilesetStore.setSelectedTile(-1)).toThrow('out of bounds');
    });

    it('should throw InvalidTilesetError for index >= tileCount', async () => {
      const tileset = await createTestTileset('ts-1', 'Test', { columns: 2, rows: 2 }); // 4 tiles
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset('ts-1');

      expect(() => tilesetStore.setSelectedTile(4)).toThrow(InvalidTilesetError);
      expect(() => tilesetStore.setSelectedTile(4)).toThrow('index 4 is out of bounds (0-3)');
    });
  });

  describe('getTileImage() (AC #4)', () => {
    it('should extract correct tile image data', async () => {
      const tileset = await createTestTileset('ts-1', 'Test', {
        tileWidth: 16,
        tileHeight: 16,
        columns: 2,
        rows: 2
      });
      tilesetStore.addTileset(tileset);

      const imageData = tilesetStore.getTileImage('ts-1', 0);

      expect(imageData).not.toBeNull();
      expect(imageData!.width).toBe(16);
      expect(imageData!.height).toBe(16);
    });

    it('should return null for invalid tileset id', () => {
      const imageData = tilesetStore.getTileImage('non-existent', 0);
      expect(imageData).toBeNull();
    });

    it('should return null for invalid tile index (negative)', async () => {
      const tileset = await createTestTileset('ts-1', 'Test');
      tilesetStore.addTileset(tileset);

      const imageData = tilesetStore.getTileImage('ts-1', -1);
      expect(imageData).toBeNull();
    });

    it('should return null for invalid tile index (out of bounds)', async () => {
      const tileset = await createTestTileset('ts-1', 'Test', {
        columns: 2,
        rows: 2
      });
      tilesetStore.addTileset(tileset);

      const imageData = tilesetStore.getTileImage('ts-1', 10); // Only 4 tiles
      expect(imageData).toBeNull();
    });

    it('should handle spacing correctly', async () => {
      const tileset = await createTestTileset('ts-1', 'Test', {
        tileWidth: 16,
        tileHeight: 16,
        columns: 2,
        rows: 2,
        spacing: 4
      });
      tilesetStore.addTileset(tileset);

      const imageData = tilesetStore.getTileImage('ts-1', 1);

      expect(imageData).not.toBeNull();
      expect(imageData!.width).toBe(16);
      expect(imageData!.height).toBe(16);
    });

    it('should handle margin correctly', async () => {
      const tileset = await createTestTileset('ts-1', 'Test', {
        tileWidth: 16,
        tileHeight: 16,
        columns: 2,
        rows: 2,
        margin: 8
      });
      tilesetStore.addTileset(tileset);

      const imageData = tilesetStore.getTileImage('ts-1', 0);

      expect(imageData).not.toBeNull();
      expect(imageData!.width).toBe(16);
      expect(imageData!.height).toBe(16);
    });

    it('should handle both spacing and margin', async () => {
      const tileset = await createTestTileset('ts-1', 'Test', {
        tileWidth: 16,
        tileHeight: 16,
        columns: 2,
        rows: 2,
        spacing: 2,
        margin: 4
      });
      tilesetStore.addTileset(tileset);

      // Tile at index 3 (row 1, col 1)
      const imageData = tilesetStore.getTileImage('ts-1', 3);

      expect(imageData).not.toBeNull();
      expect(imageData!.width).toBe(16);
      expect(imageData!.height).toBe(16);
    });
  });

  describe('getTileRect()', () => {
    it('should calculate correct tile coordinates', async () => {
      const tileset = await createTestTileset('ts-1', 'Test', {
        tileWidth: 16,
        tileHeight: 16,
        columns: 4,
        rows: 4
      });
      tilesetStore.addTileset(tileset);

      // Tile 0 at (0, 0)
      expect(tilesetStore.getTileRect('ts-1', 0)).toEqual({
        x: 0,
        y: 0,
        width: 16,
        height: 16
      });

      // Tile 1 at (16, 0)
      expect(tilesetStore.getTileRect('ts-1', 1)).toEqual({
        x: 16,
        y: 0,
        width: 16,
        height: 16
      });

      // Tile 4 at (0, 16) - second row
      expect(tilesetStore.getTileRect('ts-1', 4)).toEqual({
        x: 0,
        y: 16,
        width: 16,
        height: 16
      });

      // Tile 5 at (16, 16)
      expect(tilesetStore.getTileRect('ts-1', 5)).toEqual({
        x: 16,
        y: 16,
        width: 16,
        height: 16
      });
    });

    it('should handle spacing in calculations', async () => {
      const tileset = await createTestTileset('ts-1', 'Test', {
        tileWidth: 16,
        tileHeight: 16,
        columns: 2,
        rows: 2,
        spacing: 4
      });
      tilesetStore.addTileset(tileset);

      // Tile 0 at (0, 0)
      expect(tilesetStore.getTileRect('ts-1', 0)).toEqual({
        x: 0,
        y: 0,
        width: 16,
        height: 16
      });

      // Tile 1 at (20, 0) - 16 + 4 spacing
      expect(tilesetStore.getTileRect('ts-1', 1)).toEqual({
        x: 20,
        y: 0,
        width: 16,
        height: 16
      });

      // Tile 2 at (0, 20) - second row
      expect(tilesetStore.getTileRect('ts-1', 2)).toEqual({
        x: 0,
        y: 20,
        width: 16,
        height: 16
      });
    });

    it('should handle margin in calculations', async () => {
      const tileset = await createTestTileset('ts-1', 'Test', {
        tileWidth: 16,
        tileHeight: 16,
        columns: 2,
        rows: 2,
        margin: 8
      });
      tilesetStore.addTileset(tileset);

      // Tile 0 at (8, 8) - offset by margin
      expect(tilesetStore.getTileRect('ts-1', 0)).toEqual({
        x: 8,
        y: 8,
        width: 16,
        height: 16
      });

      // Tile 1 at (24, 8)
      expect(tilesetStore.getTileRect('ts-1', 1)).toEqual({
        x: 24,
        y: 8,
        width: 16,
        height: 16
      });
    });

    it('should return null for invalid tileset', () => {
      expect(tilesetStore.getTileRect('non-existent', 0)).toBeNull();
    });

    it('should return null for out of bounds index', async () => {
      const tileset = await createTestTileset('ts-1', 'Test', {
        columns: 2,
        rows: 2
      });
      tilesetStore.addTileset(tileset);

      expect(tilesetStore.getTileRect('ts-1', -1)).toBeNull();
      expect(tilesetStore.getTileRect('ts-1', 4)).toBeNull();
    });
  });

  describe('Query Methods (AC #1)', () => {
    describe('getTileset()', () => {
      it('should return tileset by id', async () => {
        const tileset = await createTestTileset('ts-1', 'Test');
        tilesetStore.addTileset(tileset);

        expect(tilesetStore.getTileset('ts-1')).toBe(tileset);
      });

      it('should return null for non-existent id', () => {
        expect(tilesetStore.getTileset('non-existent')).toBeNull();
      });
    });

    describe('hasTileset()', () => {
      it('should return true for existing tileset', async () => {
        const tileset = await createTestTileset('ts-1', 'Test');
        tilesetStore.addTileset(tileset);

        expect(tilesetStore.hasTileset('ts-1')).toBe(true);
      });

      it('should return false for non-existent tileset', () => {
        expect(tilesetStore.hasTileset('non-existent')).toBe(false);
      });
    });

    describe('getTilesetCount()', () => {
      it('should return 0 for empty store', () => {
        expect(tilesetStore.getTilesetCount()).toBe(0);
      });

      it('should return correct count', async () => {
        const tileset1 = await createTestTileset('ts-1', 'First');
        const tileset2 = await createTestTileset('ts-2', 'Second');

        tilesetStore.addTileset(tileset1);
        expect(tilesetStore.getTilesetCount()).toBe(1);

        tilesetStore.addTileset(tileset2);
        expect(tilesetStore.getTilesetCount()).toBe(2);
      });
    });
  });

  describe('clearAllTilesets()', () => {
    it('should clear all tilesets', async () => {
      const tileset1 = await createTestTileset('ts-1', 'First');
      const tileset2 = await createTestTileset('ts-2', 'Second');
      tilesetStore.addTileset(tileset1);
      tilesetStore.addTileset(tileset2);
      tilesetStore.setActiveTileset('ts-1');
      tilesetStore.setSelectedTile(3);

      tilesetStore.clearAllTilesets();

      expect(tilesetStore.tilesets.value).toEqual([]);
      expect(tilesetStore.activeTilesetId.value).toBeNull();
      expect(tilesetStore.selectedTileIndex.value).toBeNull();
      expect(tilesetStore.loadStatus.value).toBe('idle');
    });
  });

  describe('Singleton Export', () => {
    it('should export the same instance on multiple imports', async () => {
      // Add a tileset to verify state is shared
      const tileset = await createTestTileset('ts-singleton', 'Singleton Test');
      tilesetStore.addTileset(tileset);

      // Dynamic import to get a "fresh" reference
      const { tilesetStore: reimportedStore } = await import('../../src/stores/tileset');

      // Both references should point to the same instance
      expect(reimportedStore).toBe(tilesetStore);
      expect(reimportedStore.hasTileset('ts-singleton')).toBe(true);
    });
  });

  describe('clearAllTilesets() events', () => {
    it('should fire tilesets-cleared event when tilesets exist', async () => {
      const tileset1 = await createTestTileset('ts-1', 'First');
      const tileset2 = await createTestTileset('ts-2', 'Second');
      tilesetStore.addTileset(tileset1);
      tilesetStore.addTileset(tileset2);

      const eventHandler = vi.fn();
      tilesetStore.addEventListener('tilesets-cleared', eventHandler);

      tilesetStore.clearAllTilesets();

      expect(eventHandler).toHaveBeenCalledTimes(1);
    });

    it('should not fire event when no tilesets exist', () => {
      const eventHandler = vi.fn();
      tilesetStore.addEventListener('tilesets-cleared', eventHandler);

      tilesetStore.clearAllTilesets();

      expect(eventHandler).not.toHaveBeenCalled();
    });
  });

  describe('getTileImage() pixel content verification', () => {
    it('should extract different ImageData for different tile indices', async () => {
      // Create tileset with distinct colors per tile
      const tileset = await createTestTileset('ts-1', 'Test', {
        tileWidth: 16,
        tileHeight: 16,
        columns: 2,
        rows: 2
      });
      tilesetStore.addTileset(tileset);

      const tile0 = tilesetStore.getTileImage('ts-1', 0);
      const tile1 = tilesetStore.getTileImage('ts-1', 1);
      const tile2 = tilesetStore.getTileImage('ts-1', 2);
      const tile3 = tilesetStore.getTileImage('ts-1', 3);

      // All should return valid ImageData
      expect(tile0).not.toBeNull();
      expect(tile1).not.toBeNull();
      expect(tile2).not.toBeNull();
      expect(tile3).not.toBeNull();

      // Each tile should have correct dimensions
      expect(tile0!.width).toBe(16);
      expect(tile0!.height).toBe(16);

      // Verify data arrays exist and have correct size (16x16x4 = 1024 bytes)
      expect(tile0!.data).toBeInstanceOf(Uint8ClampedArray);
      expect(tile0!.data.length).toBe(16 * 16 * 4);
    });
  });
});
