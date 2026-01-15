import { describe, it, expect, beforeEach } from 'vitest';
import { tilemapStore } from '../../src/stores/tilemap';

/**
 * Tilemap Store Tests
 *
 * Tests for Story 1.3 Task 4:
 * - 4.1 tilemapStore exists as singleton
 * - 4.2 width and height signals (in tiles) - default 20x15
 * - 4.3 tileWidth and tileHeight signals (in pixels) - default 16x16
 * - 4.4 getPixelWidth() and getPixelHeight() computed values
 * - 4.5 Export singleton tilemapStore
 */

describe('TilemapStore', () => {
  // Reset store state before each test since it's a singleton
  beforeEach(() => {
    tilemapStore.resizeTilemap(20, 15);
    tilemapStore.setTileSize(16, 16);
  });

  describe('Default State (Task 4.2, 4.3)', () => {
    it('should have default width of 20 tiles', () => {
      expect(tilemapStore.width.value).toBe(20);
    });

    it('should have default height of 15 tiles', () => {
      expect(tilemapStore.height.value).toBe(15);
    });

    it('should have default tileWidth of 16 pixels', () => {
      expect(tilemapStore.tileWidth.value).toBe(16);
    });

    it('should have default tileHeight of 16 pixels', () => {
      expect(tilemapStore.tileHeight.value).toBe(16);
    });
  });

  describe('Pixel Dimension Calculations (Task 4.4)', () => {
    it('should calculate pixelWidth correctly (20 * 16 = 320)', () => {
      expect(tilemapStore.pixelWidth).toBe(320);
    });

    it('should calculate pixelHeight correctly (15 * 16 = 240)', () => {
      expect(tilemapStore.pixelHeight).toBe(240);
    });

    it('should update pixelWidth when width changes', () => {
      tilemapStore.resizeTilemap(10, 15);
      expect(tilemapStore.pixelWidth).toBe(160); // 10 * 16
    });

    it('should update pixelHeight when height changes', () => {
      tilemapStore.resizeTilemap(20, 10);
      expect(tilemapStore.pixelHeight).toBe(160); // 10 * 16
    });

    it('should update pixelWidth when tileWidth changes', () => {
      tilemapStore.setTileSize(32, 16);
      expect(tilemapStore.pixelWidth).toBe(640); // 20 * 32
    });

    it('should update pixelHeight when tileHeight changes', () => {
      tilemapStore.setTileSize(16, 32);
      expect(tilemapStore.pixelHeight).toBe(480); // 15 * 32
    });
  });

  describe('resizeTilemap() method', () => {
    it('should update width and height', () => {
      tilemapStore.resizeTilemap(30, 25);
      expect(tilemapStore.width.value).toBe(30);
      expect(tilemapStore.height.value).toBe(25);
    });

    it('should reflect in pixel calculations', () => {
      tilemapStore.resizeTilemap(50, 40);
      expect(tilemapStore.pixelWidth).toBe(800); // 50 * 16
      expect(tilemapStore.pixelHeight).toBe(640); // 40 * 16
    });
  });

  describe('setTileSize() method', () => {
    it('should update tileWidth and tileHeight', () => {
      tilemapStore.setTileSize(32, 32);
      expect(tilemapStore.tileWidth.value).toBe(32);
      expect(tilemapStore.tileHeight.value).toBe(32);
    });

    it('should reflect in pixel calculations', () => {
      tilemapStore.setTileSize(8, 8);
      expect(tilemapStore.pixelWidth).toBe(160); // 20 * 8
      expect(tilemapStore.pixelHeight).toBe(120); // 15 * 8
    });
  });

  describe('Signal Reactivity', () => {
    it('should allow reactive subscription to width changes', () => {
      const initialWidth = tilemapStore.width.value;
      expect(initialWidth).toBe(20);

      tilemapStore.resizeTilemap(100, 15);
      expect(tilemapStore.width.value).toBe(100);
    });

    it('should allow reactive subscription to height changes', () => {
      const initialHeight = tilemapStore.height.value;
      expect(initialHeight).toBe(15);

      tilemapStore.resizeTilemap(20, 100);
      expect(tilemapStore.height.value).toBe(100);
    });
  });

  describe('Singleton Export (Task 4.5)', () => {
    it('should be the same instance when imported', () => {
      // This test validates that the singleton pattern is working
      const store1 = tilemapStore;
      store1.resizeTilemap(99, 88);

      // Same reference should have the updated values
      expect(tilemapStore.width.value).toBe(99);
      expect(tilemapStore.height.value).toBe(88);
    });
  });

  describe('Input Validation (Code Review Fix)', () => {
    describe('resizeTilemap() validation', () => {
      it('should throw error for non-integer width', () => {
        expect(() => tilemapStore.resizeTilemap(10.5, 15)).toThrow('Tilemap dimensions must be integers');
      });

      it('should throw error for non-integer height', () => {
        expect(() => tilemapStore.resizeTilemap(10, 15.5)).toThrow('Tilemap dimensions must be integers');
      });

      it('should throw error for zero width', () => {
        expect(() => tilemapStore.resizeTilemap(0, 15)).toThrow('Tilemap dimensions must be at least 1');
      });

      it('should throw error for negative height', () => {
        expect(() => tilemapStore.resizeTilemap(10, -5)).toThrow('Tilemap dimensions must be at least 1');
      });

      it('should throw error for width exceeding 500', () => {
        expect(() => tilemapStore.resizeTilemap(501, 15)).toThrow('Tilemap dimensions cannot exceed 500');
      });

      it('should throw error for height exceeding 500', () => {
        expect(() => tilemapStore.resizeTilemap(10, 501)).toThrow('Tilemap dimensions cannot exceed 500');
      });

      it('should accept valid boundary values (1 and 500)', () => {
        expect(() => tilemapStore.resizeTilemap(1, 1)).not.toThrow();
        expect(() => tilemapStore.resizeTilemap(500, 500)).not.toThrow();
      });
    });

    describe('setTileSize() validation', () => {
      it('should throw error for non-integer tileWidth', () => {
        expect(() => tilemapStore.setTileSize(16.5, 16)).toThrow('Tile size must be integers');
      });

      it('should throw error for non-integer tileHeight', () => {
        expect(() => tilemapStore.setTileSize(16, 16.5)).toThrow('Tile size must be integers');
      });

      it('should throw error for zero tileWidth', () => {
        expect(() => tilemapStore.setTileSize(0, 16)).toThrow('Tile size must be at least 1 pixel');
      });

      it('should throw error for negative tileHeight', () => {
        expect(() => tilemapStore.setTileSize(16, -8)).toThrow('Tile size must be at least 1 pixel');
      });

      it('should throw error for tileWidth exceeding 256', () => {
        expect(() => tilemapStore.setTileSize(257, 16)).toThrow('Tile size cannot exceed 256 pixels');
      });

      it('should throw error for tileHeight exceeding 256', () => {
        expect(() => tilemapStore.setTileSize(16, 257)).toThrow('Tile size cannot exceed 256 pixels');
      });

      it('should accept valid boundary values (1 and 256)', () => {
        expect(() => tilemapStore.setTileSize(1, 1)).not.toThrow();
        expect(() => tilemapStore.setTileSize(256, 256)).not.toThrow();
      });
    });
  });

  describe('Grid Visibility (Story 1-4)', () => {
    beforeEach(() => {
      // Reset grid visibility to default for each test
      tilemapStore.setGridVisible(true);
    });

    describe('gridVisible signal (Task 2.1)', () => {
      it('should have gridVisible signal defaulting to true', () => {
        expect(tilemapStore.gridVisible.value).toBe(true);
      });

      it('should allow setting gridVisible to false', () => {
        tilemapStore.setGridVisible(false);
        expect(tilemapStore.gridVisible.value).toBe(false);
      });
    });

    describe('toggleGrid() method (Task 2.2)', () => {
      it('should toggle grid from true to false', () => {
        tilemapStore.setGridVisible(true);
        tilemapStore.toggleGrid();
        expect(tilemapStore.gridVisible.value).toBe(false);
      });

      it('should toggle grid from false to true', () => {
        tilemapStore.setGridVisible(false);
        tilemapStore.toggleGrid();
        expect(tilemapStore.gridVisible.value).toBe(true);
      });
    });

    describe('setGridVisible() method (Task 2.3)', () => {
      it('should set grid visibility to true', () => {
        tilemapStore.setGridVisible(false);
        tilemapStore.setGridVisible(true);
        expect(tilemapStore.gridVisible.value).toBe(true);
      });

      it('should set grid visibility to false', () => {
        tilemapStore.setGridVisible(true);
        tilemapStore.setGridVisible(false);
        expect(tilemapStore.gridVisible.value).toBe(false);
      });
    });
  });
});
