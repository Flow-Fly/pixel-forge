/**
 * Tests for TileBatchCommand
 *
 * Story 3-6: Tilemap Undo/Redo Integration
 * Task 2: Create TileBatchCommand for multi-tile operations
 *
 * Tests multi-tile undo/redo functionality (fill, paste, brush strokes).
 * AC: #6 - Fill operation affecting 100 tiles reverts in single undo step.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TileBatchCommand } from '../../src/commands/tile-batch-command';
import { tilemapStore } from '../../src/stores/tilemap';

describe('TileBatchCommand', () => {
  let layerId: string;

  beforeEach(() => {
    // Reset tilemap store and create a test layer
    tilemapStore.reset();
    const layer = tilemapStore.addLayer('Test Layer');
    layerId = layer.id;
  });

  describe('constructor', () => {
    it('should create command with proper properties', () => {
      const changes = [
        { x: 0, y: 0, previousTileId: 0, newTileId: 1 },
        { x: 1, y: 0, previousTileId: 0, newTileId: 1 },
      ];
      const command = new TileBatchCommand(layerId, changes, 'Fill');

      expect(command.id).toBeDefined();
      expect(command.name).toBe('Fill');
      expect(command.timestamp).toBeDefined();
      expect(command.memorySize).toBeGreaterThan(0);
    });

    it('should default command name to "Tile Batch"', () => {
      const changes = [{ x: 0, y: 0, previousTileId: 0, newTileId: 1 }];
      const command = new TileBatchCommand(layerId, changes);

      expect(command.name).toBe('Tile Batch');
    });

    it('should generate unique IDs for each command', () => {
      const changes = [{ x: 0, y: 0, previousTileId: 0, newTileId: 1 }];
      const cmd1 = new TileBatchCommand(layerId, changes);
      const cmd2 = new TileBatchCommand(layerId, changes);

      expect(cmd1.id).not.toBe(cmd2.id);
    });
  });

  describe('execute', () => {
    it('should place all tiles in the batch', () => {
      const changes = [
        { x: 0, y: 0, previousTileId: 0, newTileId: 5 },
        { x: 1, y: 0, previousTileId: 0, newTileId: 6 },
        { x: 2, y: 0, previousTileId: 0, newTileId: 7 },
      ];

      const command = new TileBatchCommand(layerId, changes, 'Brush Stroke');
      command.execute();

      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(5);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(6);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(7);
    });

    it('should handle empty changes array', () => {
      const command = new TileBatchCommand(layerId, []);
      // Should not throw
      expect(() => command.execute()).not.toThrow();
    });
  });

  describe('undo', () => {
    it('should restore all tiles in a single undo step (AC: #6)', () => {
      // Set up initial state
      tilemapStore.setTile(layerId, 0, 0, 1);
      tilemapStore.setTile(layerId, 1, 0, 2);
      tilemapStore.setTile(layerId, 2, 0, 3);

      const changes = [
        { x: 0, y: 0, previousTileId: 1, newTileId: 10 },
        { x: 1, y: 0, previousTileId: 2, newTileId: 10 },
        { x: 2, y: 0, previousTileId: 3, newTileId: 10 },
      ];

      const command = new TileBatchCommand(layerId, changes, 'Fill');
      command.execute();

      // Verify execute worked
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(10);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(10);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(10);

      // Single undo should restore all tiles
      command.undo();

      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(1);
      expect(tilemapStore.getTile(layerId, 1, 0)).toBe(2);
      expect(tilemapStore.getTile(layerId, 2, 0)).toBe(3);
    });

    it('should undo in reverse order for proper semantics', () => {
      // This matters when same tile is modified multiple times in batch
      // The last change should be undone first
      const changes = [
        { x: 0, y: 0, previousTileId: 0, newTileId: 5 },
        { x: 0, y: 0, previousTileId: 5, newTileId: 10 }, // Same tile modified again
      ];

      const command = new TileBatchCommand(layerId, changes);
      command.execute();
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(10);

      command.undo();
      // Should be back to original 0, not 5
      expect(tilemapStore.getTile(layerId, 0, 0)).toBe(0);
    });

    it('should restore empty tiles (0)', () => {
      const changes = [
        { x: 5, y: 5, previousTileId: 0, newTileId: 8 },
      ];

      const command = new TileBatchCommand(layerId, changes);
      command.execute();
      expect(tilemapStore.getTile(layerId, 5, 5)).toBe(8);

      command.undo();
      expect(tilemapStore.getTile(layerId, 5, 5)).toBe(0);
    });
  });

  describe('large batch operations (AC: #6)', () => {
    it('should handle 100 tile fill operation as single undo', () => {
      // Simulate a 10x10 fill operation
      const changes: Array<{ x: number; y: number; previousTileId: number; newTileId: number }> = [];

      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          changes.push({ x, y, previousTileId: 0, newTileId: 42 });
        }
      }

      expect(changes.length).toBe(100);

      const command = new TileBatchCommand(layerId, changes, 'Fill');
      command.execute();

      // Verify all 100 tiles are filled
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          expect(tilemapStore.getTile(layerId, x, y)).toBe(42);
        }
      }

      // Single undo should restore all 100 tiles
      command.undo();

      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          expect(tilemapStore.getTile(layerId, x, y)).toBe(0);
        }
      }
    });
  });

  describe('memorySize', () => {
    it('should scale memory size with number of changes', () => {
      const small = new TileBatchCommand(layerId, [
        { x: 0, y: 0, previousTileId: 0, newTileId: 1 },
      ]);

      const large = new TileBatchCommand(layerId, Array(100).fill(null).map((_, i) => ({
        x: i % 10,
        y: Math.floor(i / 10),
        previousTileId: 0,
        newTileId: 1,
      })));

      expect(large.memorySize).toBeGreaterThan(small.memorySize);
    });

    it('should estimate ~32 bytes per change', () => {
      const changes = Array(100).fill(null).map((_, i) => ({
        x: i % 10,
        y: Math.floor(i / 10),
        previousTileId: 0,
        newTileId: 1,
      }));

      const command = new TileBatchCommand(layerId, changes);

      // Should be around 100 + 100*32 = 3300 bytes
      expect(command.memorySize).toBeGreaterThan(3000);
      expect(command.memorySize).toBeLessThan(4000);
    });
  });

  describe('Command interface compliance', () => {
    it('should implement Command interface correctly', () => {
      const command = new TileBatchCommand(layerId, []);

      expect(typeof command.id).toBe('string');
      expect(typeof command.name).toBe('string');
      expect(typeof command.execute).toBe('function');
      expect(typeof command.undo).toBe('function');
      expect(typeof command.memorySize).toBe('number');
    });
  });
});
