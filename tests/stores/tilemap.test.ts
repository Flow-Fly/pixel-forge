import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tilemapStore } from '../../src/stores/tilemap';
import { TileOutOfBoundsError, InvalidLayerError, LockedLayerError, InvalidTileIdError } from '../../src/errors/tilemap-errors';

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

  // ========================================
  // Story 3-1: Layer Management Tests (Task 7.2, 7.6)
  // ========================================
  describe('Layer Management (Story 3-1)', () => {
    beforeEach(() => {
      tilemapStore.reset();
    });

    describe('initializeDefaultLayer() (Task 1.6)', () => {
      it('should create default layer with Uint32Array data', () => {
        tilemapStore.initializeDefaultLayer();

        const layers = tilemapStore.layers.value;
        expect(layers.length).toBe(1);
        expect(layers[0].name).toBe('Layer 1');
        expect(layers[0].data).toBeInstanceOf(Uint32Array);
        expect(layers[0].data.length).toBe(tilemapStore.width.value * tilemapStore.height.value);
      });

      it('should not create duplicate layers when called multiple times', () => {
        tilemapStore.initializeDefaultLayer();
        tilemapStore.initializeDefaultLayer();

        expect(tilemapStore.layers.value.length).toBe(1);
      });

      it('should initialize all cells to 0 (empty)', () => {
        tilemapStore.initializeDefaultLayer();

        const layer = tilemapStore.layers.value[0];
        for (let i = 0; i < layer.data.length; i++) {
          expect(layer.data[i]).toBe(0);
        }
      });
    });

    describe('addLayer() (Task 1.3)', () => {
      it('should add a new layer with auto-generated name', () => {
        const layer = tilemapStore.addLayer();

        expect(layer.name).toBe('Layer 1');
        expect(tilemapStore.layers.value.length).toBe(1);
      });

      it('should add a new layer with custom name', () => {
        const layer = tilemapStore.addLayer('Background');

        expect(layer.name).toBe('Background');
      });

      it('should set first layer as active', () => {
        const layer = tilemapStore.addLayer();

        expect(tilemapStore.activeLayerId.value).toBe(layer.id);
      });

      it('should increment layer numbers', () => {
        tilemapStore.addLayer();
        const layer2 = tilemapStore.addLayer();

        expect(layer2.name).toBe('Layer 2');
      });

      it('should create layer with correct dimensions', () => {
        tilemapStore.resizeTilemap(10, 8);
        const layer = tilemapStore.addLayer();

        expect(layer.width).toBe(10);
        expect(layer.height).toBe(8);
        expect(layer.data.length).toBe(80);
      });

      it('should fire layer-created event (Task 1.7)', () => {
        const handler = vi.fn();
        tilemapStore.addEventListener('layer-created', handler);

        const layer = tilemapStore.addLayer('Test');

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.layer).toEqual(layer);

        tilemapStore.removeEventListener('layer-created', handler);
      });
    });

    describe('removeLayer() (Task 1.4)', () => {
      it('should remove existing layer', () => {
        const layer = tilemapStore.addLayer();
        tilemapStore.removeLayer(layer.id);

        expect(tilemapStore.layers.value.length).toBe(0);
      });

      it('should throw InvalidLayerError for non-existent layer', () => {
        expect(() => {
          tilemapStore.removeLayer('non-existent');
        }).toThrow(InvalidLayerError);
      });

      it('should update active layer when active layer is removed', () => {
        const layer1 = tilemapStore.addLayer('Layer 1');
        const layer2 = tilemapStore.addLayer('Layer 2');

        tilemapStore.setActiveLayer(layer1.id);
        tilemapStore.removeLayer(layer1.id);

        expect(tilemapStore.activeLayerId.value).toBe(layer2.id);
      });

      it('should fire layer-removed event (Task 1.7)', () => {
        const handler = vi.fn();
        tilemapStore.addEventListener('layer-removed', handler);

        const layer = tilemapStore.addLayer();
        tilemapStore.removeLayer(layer.id);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.layerId).toBe(layer.id);

        tilemapStore.removeEventListener('layer-removed', handler);
      });
    });

    describe('getLayerById() (Task 1.5)', () => {
      it('should return layer when it exists', () => {
        const layer = tilemapStore.addLayer('Test');
        const found = tilemapStore.getLayerById(layer.id);

        expect(found).toEqual(layer);
      });

      it('should return undefined when layer does not exist', () => {
        const found = tilemapStore.getLayerById('non-existent');

        expect(found).toBeUndefined();
      });
    });
  });

  // ========================================
  // Story 3-1: Tile Data Operations Tests (Task 7.3, 7.4)
  // ========================================
  describe('Tile Data Operations (Story 3-1)', () => {
    beforeEach(() => {
      tilemapStore.reset();
      tilemapStore.initializeDefaultLayer();
    });

    describe('setTile() and getTile() (Task 2.1, 2.2)', () => {
      it('should set and get tile at valid coordinates', () => {
        const layerId = tilemapStore.layers.value[0].id;

        tilemapStore.setTile(layerId, 5, 3, 42);
        const tile = tilemapStore.getTile(layerId, 5, 3);

        expect(tile).toBe(42);
      });

      it('should return 0 for empty tiles', () => {
        const layerId = tilemapStore.layers.value[0].id;
        const tile = tilemapStore.getTile(layerId, 0, 0);

        expect(tile).toBe(0);
      });

      it('should throw TileOutOfBoundsError for negative x coordinate', () => {
        const layerId = tilemapStore.layers.value[0].id;

        expect(() => {
          tilemapStore.setTile(layerId, -1, 0, 1);
        }).toThrow(TileOutOfBoundsError);
      });

      it('should throw TileOutOfBoundsError for x >= width', () => {
        const layerId = tilemapStore.layers.value[0].id;

        expect(() => {
          tilemapStore.setTile(layerId, 100, 0, 1);
        }).toThrow(TileOutOfBoundsError);
      });

      it('should throw TileOutOfBoundsError for negative y coordinate', () => {
        const layerId = tilemapStore.layers.value[0].id;

        expect(() => {
          tilemapStore.setTile(layerId, 0, -1, 1);
        }).toThrow(TileOutOfBoundsError);
      });

      it('should throw TileOutOfBoundsError for y >= height', () => {
        const layerId = tilemapStore.layers.value[0].id;

        expect(() => {
          tilemapStore.setTile(layerId, 0, 100, 1);
        }).toThrow(TileOutOfBoundsError);
      });

      it('should throw InvalidLayerError for non-existent layer', () => {
        expect(() => {
          tilemapStore.setTile('non-existent', 0, 0, 1);
        }).toThrow(InvalidLayerError);

        expect(() => {
          tilemapStore.getTile('non-existent', 0, 0);
        }).toThrow(InvalidLayerError);
      });

      it('should fire tile-placed event with correct detail (Task 2.6)', () => {
        const handler = vi.fn();
        tilemapStore.addEventListener('tile-placed', handler);

        const layerId = tilemapStore.layers.value[0].id;
        tilemapStore.setTile(layerId, 2, 3, 5);

        expect(handler).toHaveBeenCalledTimes(1);
        const detail = handler.mock.calls[0][0].detail;
        expect(detail.layerId).toBe(layerId);
        expect(detail.x).toBe(2);
        expect(detail.y).toBe(3);
        expect(detail.tileId).toBe(5);
        expect(detail.previousTileId).toBe(0);

        tilemapStore.removeEventListener('tile-placed', handler);
      });
    });

    describe('setTileAt() (Task 2.4)', () => {
      it('should set tile at direct array index', () => {
        const layerId = tilemapStore.layers.value[0].id;
        const layer = tilemapStore.layers.value[0];
        const index = 3 * layer.width + 5; // y=3, x=5

        tilemapStore.setTileAt(layerId, index, 99);

        expect(tilemapStore.getTile(layerId, 5, 3)).toBe(99);
      });

      it('should throw TileOutOfBoundsError for invalid index', () => {
        const layerId = tilemapStore.layers.value[0].id;

        expect(() => {
          tilemapStore.setTileAt(layerId, -1, 1);
        }).toThrow(TileOutOfBoundsError);

        expect(() => {
          tilemapStore.setTileAt(layerId, 10000, 1);
        }).toThrow(TileOutOfBoundsError);
      });
    });

    describe('clearTile() (Task 2.5)', () => {
      it('should clear tile to 0', () => {
        const layerId = tilemapStore.layers.value[0].id;

        tilemapStore.setTile(layerId, 1, 1, 50);
        tilemapStore.clearTile(layerId, 1, 1);

        expect(tilemapStore.getTile(layerId, 1, 1)).toBe(0);
      });
    });
  });

  // ========================================
  // Story 3-1: Uint32Array Tests (Task 7.5)
  // ========================================
  describe('Uint32Array Layer Data (Story 3-1)', () => {
    beforeEach(() => {
      tilemapStore.reset();
    });

    it('should use Uint32Array for layer data', () => {
      const layer = tilemapStore.addLayer();

      expect(layer.data).toBeInstanceOf(Uint32Array);
    });

    it('should initialize with correct size (width * height)', () => {
      tilemapStore.resizeTilemap(10, 5);
      const layer = tilemapStore.addLayer();

      expect(layer.data.length).toBe(50);
    });

    it('should use row-major indexing (index = y * width + x) (Task 3.2)', () => {
      tilemapStore.resizeTilemap(10, 5);
      const layer = tilemapStore.addLayer();

      // Set tile at (3, 2) - expected index = 2 * 10 + 3 = 23
      tilemapStore.setTile(layer.id, 3, 2, 99);

      expect(layer.data[23]).toBe(99);
    });

    it('should auto-initialize to 0 (Task 3.1)', () => {
      const layer = tilemapStore.addLayer();

      // All values should be 0
      expect(layer.data.every(v => v === 0)).toBe(true);
    });
  });

  // ========================================
  // Story 3-1: Tilemap Resize Tests (Task 7.8)
  // ========================================
  describe('Tilemap Resize with Data Preservation (Story 3-1)', () => {
    beforeEach(() => {
      tilemapStore.reset();
    });

    it('should preserve existing tile data when growing', () => {
      tilemapStore.resizeTilemap(5, 5);
      const layer = tilemapStore.addLayer();

      // Set some tiles
      tilemapStore.setTile(layer.id, 2, 2, 42);
      tilemapStore.setTile(layer.id, 4, 4, 99);

      // Grow the tilemap
      tilemapStore.resizeTilemap(10, 10);

      // Check tiles are preserved
      expect(tilemapStore.getTile(layer.id, 2, 2)).toBe(42);
      expect(tilemapStore.getTile(layer.id, 4, 4)).toBe(99);
    });

    it('should preserve existing tile data when shrinking', () => {
      tilemapStore.resizeTilemap(10, 10);
      const layer = tilemapStore.addLayer();

      // Set tile in area that will remain
      tilemapStore.setTile(layer.id, 2, 2, 42);

      // Shrink the tilemap
      tilemapStore.resizeTilemap(5, 5);

      // Check tile is preserved
      expect(tilemapStore.getTile(layer.id, 2, 2)).toBe(42);
    });

    it('should update layer dimensions on resize', () => {
      const layer = tilemapStore.addLayer();

      tilemapStore.resizeTilemap(30, 25);

      expect(tilemapStore.layers.value[0].width).toBe(30);
      expect(tilemapStore.layers.value[0].height).toBe(25);
      expect(tilemapStore.layers.value[0].data.length).toBe(750);
    });

    it('should fire tilemap-resized event', () => {
      const handler = vi.fn();
      tilemapStore.addEventListener('tilemap-resized', handler);

      tilemapStore.addLayer();
      tilemapStore.resizeTilemap(30, 25);

      expect(handler).toHaveBeenCalledTimes(1);

      tilemapStore.removeEventListener('tilemap-resized', handler);
    });
  });

  // ========================================
  // Story 3-1: Event Dispatching Tests (Task 7.9)
  // ========================================
  describe('Event Dispatching (Story 3-1)', () => {
    beforeEach(() => {
      tilemapStore.reset();
    });

    it('should dispatch layer-created event', () => {
      const handler = vi.fn();
      tilemapStore.addEventListener('layer-created', handler);

      tilemapStore.addLayer('Test Layer');

      expect(handler).toHaveBeenCalledTimes(1);
      tilemapStore.removeEventListener('layer-created', handler);
    });

    it('should dispatch layer-removed event', () => {
      const handler = vi.fn();
      tilemapStore.addEventListener('layer-removed', handler);

      const layer = tilemapStore.addLayer();
      tilemapStore.removeLayer(layer.id);

      expect(handler).toHaveBeenCalledTimes(1);
      tilemapStore.removeEventListener('layer-removed', handler);
    });

    it('should dispatch tile-placed event', () => {
      const handler = vi.fn();
      tilemapStore.addEventListener('tile-placed', handler);

      tilemapStore.initializeDefaultLayer();
      const layerId = tilemapStore.layers.value[0].id;
      tilemapStore.setTile(layerId, 0, 0, 1);

      expect(handler).toHaveBeenCalledTimes(1);
      tilemapStore.removeEventListener('tile-placed', handler);
    });

    it('should dispatch tilemap-resized event', () => {
      const handler = vi.fn();
      tilemapStore.addEventListener('tilemap-resized', handler);

      tilemapStore.resizeTilemap(30, 30);

      expect(handler).toHaveBeenCalledTimes(1);
      tilemapStore.removeEventListener('tilemap-resized', handler);
    });
  });

  // ========================================
  // Code Review Fix: Locked Layer Tests (H1, H3)
  // ========================================
  describe('Locked Layer Protection (Code Review Fix)', () => {
    beforeEach(() => {
      tilemapStore.reset();
      tilemapStore.initializeDefaultLayer();
    });

    it('should throw LockedLayerError when setting tile on locked layer', () => {
      const layerId = tilemapStore.layers.value[0].id;

      tilemapStore.setLayerLocked(layerId, true);

      expect(() => {
        tilemapStore.setTile(layerId, 0, 0, 1);
      }).toThrow(LockedLayerError);
    });

    it('should throw LockedLayerError when using setTileAt on locked layer', () => {
      const layerId = tilemapStore.layers.value[0].id;

      tilemapStore.setLayerLocked(layerId, true);

      expect(() => {
        tilemapStore.setTileAt(layerId, 0, 1);
      }).toThrow(LockedLayerError);
    });

    it('should throw LockedLayerError when clearing tile on locked layer', () => {
      const layerId = tilemapStore.layers.value[0].id;

      // Set a tile first
      tilemapStore.setTile(layerId, 0, 0, 5);

      // Lock the layer
      tilemapStore.setLayerLocked(layerId, true);

      expect(() => {
        tilemapStore.clearTile(layerId, 0, 0);
      }).toThrow(LockedLayerError);
    });

    it('should allow tile operations after unlocking layer', () => {
      const layerId = tilemapStore.layers.value[0].id;

      tilemapStore.setLayerLocked(layerId, true);
      tilemapStore.setLayerLocked(layerId, false);

      expect(() => {
        tilemapStore.setTile(layerId, 0, 0, 1);
      }).not.toThrow();
    });

    it('should throw InvalidLayerError when locking non-existent layer', () => {
      expect(() => {
        tilemapStore.setLayerLocked('non-existent', true);
      }).toThrow(InvalidLayerError);
    });

    it('should update layer locked state immutably', () => {
      const layerId = tilemapStore.layers.value[0].id;
      const originalLayers = tilemapStore.layers.value;

      tilemapStore.setLayerLocked(layerId, true);

      expect(tilemapStore.layers.value).not.toBe(originalLayers);
      expect(tilemapStore.layers.value[0].locked).toBe(true);
    });
  });

  // ========================================
  // Code Review Fix: Tile ID Validation Tests (H2)
  // ========================================
  describe('Tile ID Validation (Code Review Fix)', () => {
    beforeEach(() => {
      tilemapStore.reset();
      tilemapStore.initializeDefaultLayer();
    });

    it('should throw InvalidTileIdError for negative tile ID', () => {
      const layerId = tilemapStore.layers.value[0].id;

      expect(() => {
        tilemapStore.setTile(layerId, 0, 0, -1);
      }).toThrow(InvalidTileIdError);
    });

    it('should throw InvalidTileIdError for floating point tile ID', () => {
      const layerId = tilemapStore.layers.value[0].id;

      expect(() => {
        tilemapStore.setTile(layerId, 0, 0, 5.5);
      }).toThrow(InvalidTileIdError);
    });

    it('should throw InvalidTileIdError for NaN tile ID', () => {
      const layerId = tilemapStore.layers.value[0].id;

      expect(() => {
        tilemapStore.setTile(layerId, 0, 0, NaN);
      }).toThrow(InvalidTileIdError);
    });

    it('should throw InvalidTileIdError for Infinity tile ID', () => {
      const layerId = tilemapStore.layers.value[0].id;

      expect(() => {
        tilemapStore.setTile(layerId, 0, 0, Infinity);
      }).toThrow(InvalidTileIdError);
    });

    it('should accept valid tile ID of 0 (empty)', () => {
      const layerId = tilemapStore.layers.value[0].id;

      expect(() => {
        tilemapStore.setTile(layerId, 0, 0, 0);
      }).not.toThrow();
    });

    it('should accept valid positive integer tile ID', () => {
      const layerId = tilemapStore.layers.value[0].id;

      expect(() => {
        tilemapStore.setTile(layerId, 0, 0, 42);
      }).not.toThrow();

      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(42);
    });

    it('should validate tile ID in setTileAt', () => {
      const layerId = tilemapStore.layers.value[0].id;

      expect(() => {
        tilemapStore.setTileAt(layerId, 0, -1);
      }).toThrow(InvalidTileIdError);

      expect(() => {
        tilemapStore.setTileAt(layerId, 0, 3.14);
      }).toThrow(InvalidTileIdError);
    });
  });

  // ========================================
  // Story 4-2: Layer Visibility Toggle Tests
  // ========================================
  describe('Layer Visibility Toggle (Story 4-2)', () => {
    beforeEach(() => {
      tilemapStore.reset();
      tilemapStore.initializeDefaultLayer();
    });

    describe('toggleLayerVisibility() (Task 1.2)', () => {
      it('should toggle layer visibility from true to false', () => {
        const layerId = tilemapStore.layers.value[0].id;
        expect(tilemapStore.layers.value[0].visible).toBe(true);

        tilemapStore.toggleLayerVisibility(layerId);

        expect(tilemapStore.layers.value[0].visible).toBe(false);
      });

      it('should toggle layer visibility from false to true', () => {
        const layerId = tilemapStore.layers.value[0].id;
        // First toggle to false
        tilemapStore.toggleLayerVisibility(layerId);
        expect(tilemapStore.layers.value[0].visible).toBe(false);

        // Toggle back to true
        tilemapStore.toggleLayerVisibility(layerId);

        expect(tilemapStore.layers.value[0].visible).toBe(true);
      });

      it('should throw InvalidLayerError for non-existent layer', () => {
        expect(() => {
          tilemapStore.toggleLayerVisibility('non-existent');
        }).toThrow(InvalidLayerError);
      });

      it('should fire layer-visibility-changed event with correct detail (Task 1.3)', () => {
        const handler = vi.fn();
        tilemapStore.addEventListener('layer-visibility-changed', handler);

        const layerId = tilemapStore.layers.value[0].id;
        tilemapStore.toggleLayerVisibility(layerId);

        expect(handler).toHaveBeenCalledTimes(1);
        const detail = handler.mock.calls[0][0].detail;
        expect(detail.layerId).toBe(layerId);
        expect(detail.visible).toBe(false);

        tilemapStore.removeEventListener('layer-visibility-changed', handler);
      });

      it('should update layer immutably', () => {
        const layerId = tilemapStore.layers.value[0].id;
        const originalLayers = tilemapStore.layers.value;

        tilemapStore.toggleLayerVisibility(layerId);

        expect(tilemapStore.layers.value).not.toBe(originalLayers);
      });
    });
  });

  // ========================================
  // Story 4-2: Layer Locked Toggle Tests
  // ========================================
  describe('Layer Locked Toggle (Story 4-2)', () => {
    beforeEach(() => {
      tilemapStore.reset();
      tilemapStore.initializeDefaultLayer();
    });

    describe('toggleLayerLocked() (Task 2.2)', () => {
      it('should toggle layer locked from false to true', () => {
        const layerId = tilemapStore.layers.value[0].id;
        expect(tilemapStore.layers.value[0].locked).toBe(false);

        tilemapStore.toggleLayerLocked(layerId);

        expect(tilemapStore.layers.value[0].locked).toBe(true);
      });

      it('should toggle layer locked from true to false', () => {
        const layerId = tilemapStore.layers.value[0].id;
        // First toggle to true
        tilemapStore.toggleLayerLocked(layerId);
        expect(tilemapStore.layers.value[0].locked).toBe(true);

        // Toggle back to false
        tilemapStore.toggleLayerLocked(layerId);

        expect(tilemapStore.layers.value[0].locked).toBe(false);
      });

      it('should throw InvalidLayerError for non-existent layer', () => {
        expect(() => {
          tilemapStore.toggleLayerLocked('non-existent');
        }).toThrow(InvalidLayerError);
      });

      it('should fire layer-locked-changed event with correct detail (Task 2.3)', () => {
        const handler = vi.fn();
        tilemapStore.addEventListener('layer-locked-changed', handler);

        const layerId = tilemapStore.layers.value[0].id;
        tilemapStore.toggleLayerLocked(layerId);

        expect(handler).toHaveBeenCalledTimes(1);
        const detail = handler.mock.calls[0][0].detail;
        expect(detail.layerId).toBe(layerId);
        expect(detail.locked).toBe(true);

        tilemapStore.removeEventListener('layer-locked-changed', handler);
      });

      it('should update layer immutably', () => {
        const layerId = tilemapStore.layers.value[0].id;
        const originalLayers = tilemapStore.layers.value;

        tilemapStore.toggleLayerLocked(layerId);

        expect(tilemapStore.layers.value).not.toBe(originalLayers);
      });
    });
  });

  // ========================================
  // Code Review Fix: getTile Bounds Error Tests (M2)
  // ========================================
  describe('getTile Bounds Validation (Code Review Fix)', () => {
    beforeEach(() => {
      tilemapStore.reset();
      tilemapStore.initializeDefaultLayer();
    });

    it('should throw TileOutOfBoundsError for negative x coordinate in getTile', () => {
      const layerId = tilemapStore.layers.value[0].id;

      expect(() => {
        tilemapStore.getTile(layerId, -1, 0);
      }).toThrow(TileOutOfBoundsError);
    });

    it('should throw TileOutOfBoundsError for negative y coordinate in getTile', () => {
      const layerId = tilemapStore.layers.value[0].id;

      expect(() => {
        tilemapStore.getTile(layerId, 0, -1);
      }).toThrow(TileOutOfBoundsError);
    });

    it('should throw TileOutOfBoundsError for x >= width in getTile', () => {
      const layerId = tilemapStore.layers.value[0].id;
      const width = tilemapStore.width.value;

      expect(() => {
        tilemapStore.getTile(layerId, width, 0);
      }).toThrow(TileOutOfBoundsError);
    });

    it('should throw TileOutOfBoundsError for y >= height in getTile', () => {
      const layerId = tilemapStore.layers.value[0].id;
      const height = tilemapStore.height.value;

      expect(() => {
        tilemapStore.getTile(layerId, 0, height);
      }).toThrow(TileOutOfBoundsError);
    });
  });
});
