/**
 * Tests for tilemapStore.renameLayer method
 *
 * Story 4-1 Task 5:
 * - renameLayer updates layer name
 * - renameLayer throws on invalid layerId
 * - renameLayer fires layer-renamed event
 * - renameLayer rejects empty names
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tilemapStore } from '../../src/stores/tilemap';
import { InvalidLayerError } from '../../src/errors/tilemap-errors';

describe('tilemapStore.renameLayer', () => {
  beforeEach(() => {
    tilemapStore.reset();
    tilemapStore.initializeDefaultLayer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task 5.1-5.4: Basic rename functionality', () => {
    it('should update layer name', () => {
      const layer = tilemapStore.layers.value[0];
      tilemapStore.renameLayer(layer.id, 'Ground');

      const updatedLayer = tilemapStore.getLayerById(layer.id);
      expect(updatedLayer?.name).toBe('Ground');
    });

    it('should trim whitespace from name', () => {
      const layer = tilemapStore.layers.value[0];
      tilemapStore.renameLayer(layer.id, '  Background  ');

      const updatedLayer = tilemapStore.getLayerById(layer.id);
      expect(updatedLayer?.name).toBe('Background');
    });

    it('should reject empty names (no change)', () => {
      const layer = tilemapStore.layers.value[0];
      const originalName = layer.name;

      tilemapStore.renameLayer(layer.id, '');

      const updatedLayer = tilemapStore.getLayerById(layer.id);
      expect(updatedLayer?.name).toBe(originalName);
    });

    it('should reject whitespace-only names (no change)', () => {
      const layer = tilemapStore.layers.value[0];
      const originalName = layer.name;

      tilemapStore.renameLayer(layer.id, '   ');

      const updatedLayer = tilemapStore.getLayerById(layer.id);
      expect(updatedLayer?.name).toBe(originalName);
    });
  });

  describe('Task 5.2: Error handling', () => {
    it('should throw InvalidLayerError for non-existent layerId', () => {
      expect(() => {
        tilemapStore.renameLayer('non-existent-id', 'New Name');
      }).toThrow(InvalidLayerError);
    });

    it('should include layerId in error', () => {
      try {
        tilemapStore.renameLayer('invalid-id', 'New Name');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidLayerError);
        expect((error as InvalidLayerError).layerId).toBe('invalid-id');
      }
    });
  });

  describe('Task 5.5: Event firing', () => {
    it('should fire layer-renamed event with details', () => {
      const listener = vi.fn();
      tilemapStore.addEventListener('layer-renamed', listener);

      const layer = tilemapStore.layers.value[0];
      const oldName = layer.name;
      tilemapStore.renameLayer(layer.id, 'Objects');

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({
        layerId: layer.id,
        oldName: oldName,
        newName: 'Objects'
      });

      tilemapStore.removeEventListener('layer-renamed', listener);
    });

    it('should not fire event for empty name (no change)', () => {
      const listener = vi.fn();
      tilemapStore.addEventListener('layer-renamed', listener);

      const layer = tilemapStore.layers.value[0];
      tilemapStore.renameLayer(layer.id, '');

      expect(listener).not.toHaveBeenCalled();

      tilemapStore.removeEventListener('layer-renamed', listener);
    });

    it('should not fire event when name is unchanged', () => {
      const listener = vi.fn();
      tilemapStore.addEventListener('layer-renamed', listener);

      const layer = tilemapStore.layers.value[0];
      const originalName = layer.name;

      // Rename to the same name
      tilemapStore.renameLayer(layer.id, originalName);

      expect(listener).not.toHaveBeenCalled();

      tilemapStore.removeEventListener('layer-renamed', listener);
    });

    it('should not fire event when trimmed name equals current name', () => {
      const listener = vi.fn();
      tilemapStore.addEventListener('layer-renamed', listener);

      const layer = tilemapStore.layers.value[0];
      const originalName = layer.name;

      // Rename with extra whitespace that trims to same name
      tilemapStore.renameLayer(layer.id, `  ${originalName}  `);

      expect(listener).not.toHaveBeenCalled();

      tilemapStore.removeEventListener('layer-renamed', listener);
    });
  });

  describe('Integration tests', () => {
    it('should update layer in signal immutably', () => {
      const originalLayers = tilemapStore.layers.value;
      const layer = originalLayers[0];

      tilemapStore.renameLayer(layer.id, 'Renamed');

      const newLayers = tilemapStore.layers.value;
      // Should be different array reference
      expect(newLayers).not.toBe(originalLayers);
      // But layer ids should match
      expect(newLayers[0].id).toBe(layer.id);
      expect(newLayers[0].name).toBe('Renamed');
    });

    it('should rename multiple layers correctly', () => {
      tilemapStore.addLayer('Layer 2');
      tilemapStore.addLayer('Layer 3');

      const layers = tilemapStore.layers.value;
      tilemapStore.renameLayer(layers[0].id, 'Ground');
      tilemapStore.renameLayer(layers[1].id, 'Objects');
      tilemapStore.renameLayer(layers[2].id, 'Decorations');

      const updatedLayers = tilemapStore.layers.value;
      expect(updatedLayers[0].name).toBe('Ground');
      expect(updatedLayers[1].name).toBe('Objects');
      expect(updatedLayers[2].name).toBe('Decorations');
    });
  });
});
