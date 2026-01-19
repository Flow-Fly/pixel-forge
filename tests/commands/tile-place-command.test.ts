/**
 * Tests for TilePlaceCommand
 *
 * Story 3-6: Tilemap Undo/Redo Integration
 * Task 1: Create TilePlaceCommand class
 *
 * Tests single tile placement undo/redo functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TilePlaceCommand } from '../../src/commands/tile-place-command';
import { tilemapStore } from '../../src/stores/tilemap';

describe('TilePlaceCommand', () => {
  let layerId: string;

  beforeEach(() => {
    // Reset tilemap store and create a test layer
    tilemapStore.reset();
    const layer = tilemapStore.addLayer('Test Layer');
    layerId = layer.id;
  });

  describe('constructor', () => {
    it('should create command with proper properties', () => {
      const command = new TilePlaceCommand(layerId, 5, 3, 0, 7);

      expect(command.id).toBeDefined();
      expect(command.name).toBe('Place Tile');
      expect(command.timestamp).toBeDefined();
      expect(command.memorySize).toBeGreaterThan(0);
    });

    it('should generate unique IDs for each command', () => {
      const cmd1 = new TilePlaceCommand(layerId, 0, 0, 0, 1);
      const cmd2 = new TilePlaceCommand(layerId, 0, 0, 0, 1);

      expect(cmd1.id).not.toBe(cmd2.id);
    });
  });

  describe('execute', () => {
    it('should place the new tile at the specified position (AC: #1)', () => {
      // Initially the tile should be 0 (empty)
      expect(tilemapStore.getTile(layerId, 5, 3)).toBe(0);

      const command = new TilePlaceCommand(layerId, 5, 3, 0, 7);
      command.execute();

      // After execute, tile should be 7
      expect(tilemapStore.getTile(layerId, 5, 3)).toBe(7);
    });

    it('should overwrite existing tile', () => {
      // Set up: place a tile first
      tilemapStore.setTile(layerId, 2, 2, 5);
      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(5);

      const command = new TilePlaceCommand(layerId, 2, 2, 5, 10);
      command.execute();

      expect(tilemapStore.getTile(layerId, 2, 2)).toBe(10);
    });
  });

  describe('undo', () => {
    it('should restore the previous tile on undo (AC: #1)', () => {
      // Set initial state
      tilemapStore.setTile(layerId, 4, 4, 3);

      const command = new TilePlaceCommand(layerId, 4, 4, 3, 8);
      command.execute();
      expect(tilemapStore.getTile(layerId, 4, 4)).toBe(8);

      command.undo();
      expect(tilemapStore.getTile(layerId, 4, 4)).toBe(3);
    });

    it('should restore empty tile (0) on undo when original was empty', () => {
      const command = new TilePlaceCommand(layerId, 6, 6, 0, 5);
      command.execute();
      expect(tilemapStore.getTile(layerId, 6, 6)).toBe(5);

      command.undo();
      expect(tilemapStore.getTile(layerId, 6, 6)).toBe(0);
    });
  });

  describe('redo (via execute after undo)', () => {
    it('should re-apply tile placement on redo (AC: #2)', () => {
      const command = new TilePlaceCommand(layerId, 7, 7, 0, 12);

      // Execute
      command.execute();
      expect(tilemapStore.getTile(layerId, 7, 7)).toBe(12);

      // Undo
      command.undo();
      expect(tilemapStore.getTile(layerId, 7, 7)).toBe(0);

      // Redo (execute again)
      command.execute();
      expect(tilemapStore.getTile(layerId, 7, 7)).toBe(12);
    });
  });

  describe('memorySize', () => {
    it('should report reasonable memory size for single tile', () => {
      const command = new TilePlaceCommand(layerId, 0, 0, 0, 1);

      // Memory should be small for a single tile command
      // Expected ~150 bytes as per story Dev Notes
      expect(command.memorySize).toBeLessThan(500);
      expect(command.memorySize).toBeGreaterThan(50);
    });
  });

  describe('Command interface compliance', () => {
    it('should implement Command interface correctly', () => {
      const command = new TilePlaceCommand(layerId, 0, 0, 0, 1);

      expect(typeof command.id).toBe('string');
      expect(typeof command.name).toBe('string');
      expect(typeof command.execute).toBe('function');
      expect(typeof command.undo).toBe('function');
      expect(typeof command.memorySize).toBe('number');
    });
  });
});
