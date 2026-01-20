/**
 * Tests for TileLayerReorderCommand
 *
 * Story 4-3: Layer Reordering
 * Task 6.3: Command tests
 *
 * Tests layer reordering undo/redo functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TileLayerReorderCommand } from '../../src/commands/tile-layer-command';
import { tilemapStore } from '../../src/stores/tilemap';

describe('TileLayerReorderCommand (Story 4-3 Task 6.3)', () => {
  let layer1Id: string;
  let layer2Id: string;
  let layer3Id: string;

  beforeEach(() => {
    // Reset tilemap store and create test layers
    tilemapStore.reset();
    const layer1 = tilemapStore.addLayer('Layer 1');
    const layer2 = tilemapStore.addLayer('Layer 2');
    const layer3 = tilemapStore.addLayer('Layer 3');
    layer1Id = layer1.id;
    layer2Id = layer2.id;
    layer3Id = layer3.id;
  });

  describe('constructor', () => {
    it('should create command with proper properties', () => {
      const command = new TileLayerReorderCommand(layer1Id, 0, 2);

      expect(command.id).toBeDefined();
      expect(command.name).toBe('Reorder Layer');
      expect(command.timestamp).toBeDefined();
      expect(command.memorySize).toBeGreaterThan(0);
    });

    it('should generate unique IDs for each command', () => {
      const cmd1 = new TileLayerReorderCommand(layer1Id, 0, 1);
      const cmd2 = new TileLayerReorderCommand(layer1Id, 0, 1);

      expect(cmd1.id).not.toBe(cmd2.id);
    });
  });

  describe('execute (Task 6.3.1)', () => {
    it('should reorder layer to new position', () => {
      // Initial order: [Layer 1, Layer 2, Layer 3] at indices [0, 1, 2]
      const layers = tilemapStore.layers.value;
      expect(layers[0].id).toBe(layer1Id);
      expect(layers[2].id).toBe(layer3Id);

      // Move Layer 1 from index 0 to index 2
      const command = new TileLayerReorderCommand(layer1Id, 0, 2);
      command.execute();

      // After execute: [Layer 2, Layer 3, Layer 1]
      const updatedLayers = tilemapStore.layers.value;
      expect(updatedLayers[2].id).toBe(layer1Id);
      expect(updatedLayers[0].id).toBe(layer2Id);
      expect(updatedLayers[1].id).toBe(layer3Id);
    });

    it('should move layer up in z-order', () => {
      // Move Layer 2 from index 1 to index 2
      const command = new TileLayerReorderCommand(layer2Id, 1, 2);
      command.execute();

      const layers = tilemapStore.layers.value;
      expect(layers[2].id).toBe(layer2Id);
      expect(layers[1].id).toBe(layer3Id);
    });

    it('should move layer down in z-order', () => {
      // Move Layer 3 from index 2 to index 0
      const command = new TileLayerReorderCommand(layer3Id, 2, 0);
      command.execute();

      const layers = tilemapStore.layers.value;
      expect(layers[0].id).toBe(layer3Id);
      expect(layers[1].id).toBe(layer1Id);
      expect(layers[2].id).toBe(layer2Id);
    });
  });

  describe('undo (Task 6.3.2)', () => {
    it('should restore original order on undo', () => {
      // Capture original order
      const originalOrder = tilemapStore.layers.value.map(l => l.id);

      // Move Layer 1 to top
      const command = new TileLayerReorderCommand(layer1Id, 0, 2);
      command.execute();

      // Verify order changed
      const afterExecute = tilemapStore.layers.value.map(l => l.id);
      expect(afterExecute).not.toEqual(originalOrder);

      // Undo
      command.undo();

      // Verify original order restored
      const afterUndo = tilemapStore.layers.value.map(l => l.id);
      expect(afterUndo).toEqual(originalOrder);
    });

    it('should work correctly after multiple execute/undo cycles', () => {
      const originalOrder = tilemapStore.layers.value.map(l => l.id);

      const command = new TileLayerReorderCommand(layer2Id, 1, 0);

      // Execute
      command.execute();
      expect(tilemapStore.layers.value[0].id).toBe(layer2Id);

      // Undo
      command.undo();
      expect(tilemapStore.layers.value.map(l => l.id)).toEqual(originalOrder);

      // Redo (execute again)
      command.execute();
      expect(tilemapStore.layers.value[0].id).toBe(layer2Id);

      // Undo again
      command.undo();
      expect(tilemapStore.layers.value.map(l => l.id)).toEqual(originalOrder);
    });
  });

  describe('redo (via execute after undo)', () => {
    it('should re-apply reordering on redo', () => {
      const command = new TileLayerReorderCommand(layer3Id, 2, 0);

      // Execute
      command.execute();
      expect(tilemapStore.layers.value[0].id).toBe(layer3Id);

      // Undo
      command.undo();
      expect(tilemapStore.layers.value[2].id).toBe(layer3Id);

      // Redo (execute again)
      command.execute();
      expect(tilemapStore.layers.value[0].id).toBe(layer3Id);
    });
  });

  describe('memorySize', () => {
    it('should report reasonable memory size', () => {
      const command = new TileLayerReorderCommand(layer1Id, 0, 1);

      // Memory should be small for a reorder command
      // Expected ~130 bytes as per story Dev Notes
      expect(command.memorySize).toBeLessThan(500);
      expect(command.memorySize).toBeGreaterThan(50);
    });
  });

  describe('Command interface compliance', () => {
    it('should implement Command interface correctly', () => {
      const command = new TileLayerReorderCommand(layer1Id, 0, 1);

      expect(typeof command.id).toBe('string');
      expect(typeof command.name).toBe('string');
      expect(typeof command.execute).toBe('function');
      expect(typeof command.undo).toBe('function');
      expect(typeof command.memorySize).toBe('number');
    });
  });

  describe('edge cases', () => {
    it('should handle moving to same position gracefully', () => {
      // This is a no-op in the store, but command should still work
      const command = new TileLayerReorderCommand(layer1Id, 0, 0);
      const originalOrder = tilemapStore.layers.value.map(l => l.id);

      command.execute();

      // Order should be unchanged
      const afterExecute = tilemapStore.layers.value.map(l => l.id);
      expect(afterExecute).toEqual(originalOrder);
    });

    it('should handle boundary indices correctly', () => {
      // Move from bottom to top
      const command = new TileLayerReorderCommand(layer1Id, 0, 2);
      command.execute();
      expect(tilemapStore.layers.value[2].id).toBe(layer1Id);

      command.undo();
      expect(tilemapStore.layers.value[0].id).toBe(layer1Id);
    });
  });
});
