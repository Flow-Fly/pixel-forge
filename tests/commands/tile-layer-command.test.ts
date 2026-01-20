/**
 * Tests for Tile Layer Commands
 *
 * Story 4-3: Layer Reordering (TileLayerReorderCommand)
 * Story 4-4: Layer Deletion (TileLayerDeleteCommand)
 *
 * Tests layer undo/redo functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TileLayerReorderCommand, TileLayerDeleteCommand, calculateDeleteCommandMemorySize } from '../../src/commands/tile-layer-command';
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

// ========================================
// Story 4-4: TileLayerDeleteCommand Tests (Task 8.3)
// ========================================
describe('TileLayerDeleteCommand (Story 4-4 Task 8.3)', () => {
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
      const layers = tilemapStore.layers.value;
      const layer = layers[0];
      const command = new TileLayerDeleteCommand(layer, 0);

      expect(command.id).toBeDefined();
      expect(command.name).toBe('Delete Layer');
      expect(command.timestamp).toBeDefined();
      expect(command.memorySize).toBeGreaterThan(0);
    });

    it('should generate unique IDs for each command', () => {
      const layers = tilemapStore.layers.value;
      const layer = layers[0];
      const cmd1 = new TileLayerDeleteCommand(layer, 0);
      const cmd2 = new TileLayerDeleteCommand(layer, 0);

      expect(cmd1.id).not.toBe(cmd2.id);
    });

    it('should deep copy layer data for undo', () => {
      const layers = tilemapStore.layers.value;
      const layer = layers[0];

      // Add some tile data
      tilemapStore.setTile(layer.id, 0, 0, 42);

      const command = new TileLayerDeleteCommand(layer, 0);

      // Modify original layer after command creation
      tilemapStore.setTile(layer.id, 0, 0, 999);

      // Command should have the original value (42)
      // We can verify this by executing and undoing
      command.execute();
      command.undo();

      // After undo, the tile should be 42 (original value at command creation)
      const restoredLayer = tilemapStore.layers.value.find(l => l.id === layer.id);
      expect(restoredLayer?.data[0]).toBe(42);
    });
  });

  describe('execute (Task 8.3.1)', () => {
    it('should remove layer', () => {
      const layers = tilemapStore.layers.value;
      const layer = layers[0];
      const command = new TileLayerDeleteCommand(layer, 0);

      expect(tilemapStore.layers.value.length).toBe(3);

      command.execute();

      expect(tilemapStore.layers.value.length).toBe(2);
      expect(tilemapStore.layers.value.find(l => l.id === layer1Id)).toBeUndefined();
    });

    it('should update active layer after deletion', () => {
      const layers = tilemapStore.layers.value;
      const layer = layers[0];

      // Ensure layer 1 is active
      tilemapStore.setActiveLayer(layer1Id);
      expect(tilemapStore.activeLayerId.value).toBe(layer1Id);

      const command = new TileLayerDeleteCommand(layer, 0);
      command.execute();

      // Active should now be layer2 or layer3
      expect(tilemapStore.activeLayerId.value).not.toBe(layer1Id);
      expect(tilemapStore.layers.value.map(l => l.id)).toContain(tilemapStore.activeLayerId.value);
    });
  });

  describe('undo (Task 8.3.2, 8.3.3, 8.3.4)', () => {
    it('should restore layer with data (Task 8.3.2)', () => {
      const layers = tilemapStore.layers.value;
      const layer = layers[0];

      // Add some tile data
      tilemapStore.setTile(layer.id, 0, 0, 42);
      tilemapStore.setTile(layer.id, 1, 0, 99);

      const command = new TileLayerDeleteCommand(layer, 0);
      command.execute();

      expect(tilemapStore.layers.value.find(l => l.id === layer.id)).toBeUndefined();

      command.undo();

      const restoredLayer = tilemapStore.layers.value.find(l => l.id === layer.id);
      expect(restoredLayer).toBeDefined();
      expect(restoredLayer?.name).toBe('Layer 1');
      expect(restoredLayer?.data[0]).toBe(42);
      expect(restoredLayer?.data[1]).toBe(99);
    });

    it('should restore at correct index (Task 8.3.3)', () => {
      const layers = tilemapStore.layers.value;
      const layer = layers[1]; // Layer 2, index 1
      const originalOrder = layers.map(l => l.id);

      const command = new TileLayerDeleteCommand(layer, 1);
      command.execute();

      expect(tilemapStore.layers.value.length).toBe(2);
      expect(tilemapStore.layers.value.find(l => l.id === layer2Id)).toBeUndefined();

      command.undo();

      // Should be back at the same index
      const restoredOrder = tilemapStore.layers.value.map(l => l.id);
      expect(restoredOrder).toEqual(originalOrder);
      expect(tilemapStore.layers.value[1].id).toBe(layer2Id);
    });

    it('should restore active layer state (Task 8.3.4)', () => {
      // Set layer 2 as active
      tilemapStore.setActiveLayer(layer2Id);
      expect(tilemapStore.activeLayerId.value).toBe(layer2Id);

      const layers = tilemapStore.layers.value;
      const layer = layers[1]; // Layer 2

      const command = new TileLayerDeleteCommand(layer, 1);
      command.execute();

      // Active should have changed
      expect(tilemapStore.activeLayerId.value).not.toBe(layer2Id);

      command.undo();

      // Active should be restored to layer 2
      expect(tilemapStore.activeLayerId.value).toBe(layer2Id);
    });

    it('should not restore active state if layer was not active', () => {
      // Layer 1 is active (first added)
      expect(tilemapStore.activeLayerId.value).toBe(layer1Id);

      const layers = tilemapStore.layers.value;
      const layer = layers[2]; // Layer 3 (not active)

      const command = new TileLayerDeleteCommand(layer, 2);
      command.execute();

      // Active should still be layer 1
      expect(tilemapStore.activeLayerId.value).toBe(layer1Id);

      command.undo();

      // Active should still be layer 1
      expect(tilemapStore.activeLayerId.value).toBe(layer1Id);
    });
  });

  describe('redo (via execute after undo)', () => {
    it('should re-delete layer on redo', () => {
      const layers = tilemapStore.layers.value;
      const layer = layers[0];
      const command = new TileLayerDeleteCommand(layer, 0);

      // Execute
      command.execute();
      expect(tilemapStore.layers.value.length).toBe(2);

      // Undo
      command.undo();
      expect(tilemapStore.layers.value.length).toBe(3);

      // Redo (execute again)
      command.execute();
      expect(tilemapStore.layers.value.length).toBe(2);
      expect(tilemapStore.layers.value.find(l => l.id === layer1Id)).toBeUndefined();
    });
  });

  describe('memorySize', () => {
    it('should calculate memory based on layer data size', () => {
      const layers = tilemapStore.layers.value;
      const layer = layers[0];
      const command = new TileLayerDeleteCommand(layer, 0);

      // Memory should be proportional to layer data size
      // 200 + width * height * 4 bytes
      const expectedSize = 200 + layer.data.length * 4;
      expect(command.memorySize).toBe(expectedSize);
    });

    it('should report larger memory for larger layers', () => {
      // Create a larger tilemap
      tilemapStore.resizeTilemap(100, 100);

      const layers = tilemapStore.layers.value;
      const layer = layers[0];
      const command = new TileLayerDeleteCommand(layer, 0);

      // 100x100 layer = 10000 tiles * 4 bytes = 40000 + 200 = 40200
      expect(command.memorySize).toBe(200 + 10000 * 4);
    });
  });

  describe('calculateDeleteCommandMemorySize', () => {
    it('should calculate memory correctly', () => {
      const layer = {
        id: 'test',
        name: 'Test',
        width: 10,
        height: 10,
        data: new Uint32Array(100),
        visible: true,
        opacity: 1,
        locked: false
      };

      const size = calculateDeleteCommandMemorySize(layer);
      expect(size).toBe(200 + 100 * 4);
    });
  });

  describe('Command interface compliance', () => {
    it('should implement Command interface correctly', () => {
      const layers = tilemapStore.layers.value;
      const layer = layers[0];
      const command = new TileLayerDeleteCommand(layer, 0);

      expect(typeof command.id).toBe('string');
      expect(typeof command.name).toBe('string');
      expect(typeof command.execute).toBe('function');
      expect(typeof command.undo).toBe('function');
      expect(typeof command.memorySize).toBe('number');
    });
  });

  describe('edge cases', () => {
    it('should handle deleting layer with all properties preserved', () => {
      const layers = tilemapStore.layers.value;
      const layer = layers[0];

      // Modify layer properties
      tilemapStore.toggleLayerVisibility(layer.id);
      tilemapStore.toggleLayerLocked(layer.id);

      // Get the modified layer
      const modifiedLayer = tilemapStore.layers.value.find(l => l.id === layer.id)!;

      const command = new TileLayerDeleteCommand(modifiedLayer, 0);
      command.execute();
      command.undo();

      const restoredLayer = tilemapStore.layers.value.find(l => l.id === layer.id);
      expect(restoredLayer?.visible).toBe(false);
      expect(restoredLayer?.locked).toBe(true);
    });

    it('should work correctly after multiple execute/undo cycles', () => {
      const layers = tilemapStore.layers.value;
      const layer = layers[0];
      const originalCount = tilemapStore.layers.value.length;
      const originalOrder = tilemapStore.layers.value.map(l => l.id);

      const command = new TileLayerDeleteCommand(layer, 0);

      for (let i = 0; i < 5; i++) {
        command.execute();
        expect(tilemapStore.layers.value.length).toBe(originalCount - 1);

        command.undo();
        expect(tilemapStore.layers.value.length).toBe(originalCount);
        expect(tilemapStore.layers.value.map(l => l.id)).toEqual(originalOrder);
      }
    });
  });
});
