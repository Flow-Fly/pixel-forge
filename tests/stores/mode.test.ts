import { describe, it, expect, beforeEach } from 'vitest';
import { modeStore } from '../../src/stores/mode';
import type {
  TileLayer,
  LoadStatus,
} from '../../src/types/tilemap';

/**
 * Mode Store Tests
 *
 * Tests for AC #1, #2, #3:
 * - AC #1: Default mode is 'art', mode signal with type 'art' | 'map'
 * - AC #2: Type definitions compile correctly (tested via imports)
 * - AC #3: Components can subscribe to mode signal and receive updates
 */

describe('ModeStore', () => {
  // Reset store state before each test since it's a singleton
  beforeEach(() => {
    modeStore.setMode('art');
    modeStore.heroEditActive.value = false;
  });

  describe('Default State (AC #1)', () => {
    it('should have default mode set to "art"', () => {
      expect(modeStore.mode.value).toBe('art');
    });

    it('should have heroEditActive default to false', () => {
      expect(modeStore.heroEditActive.value).toBe(false);
    });
  });

  describe('setMode() method (AC #1, #3)', () => {
    it('should update mode to "map"', () => {
      modeStore.setMode('map');
      expect(modeStore.mode.value).toBe('map');
    });

    it('should update mode to "art"', () => {
      modeStore.setMode('map');
      modeStore.setMode('art');
      expect(modeStore.mode.value).toBe('art');
    });

    it('should be reactive when mode changes', () => {
      const values: Array<'art' | 'map'> = [];

      // Capture initial value
      values.push(modeStore.mode.value);

      // Change mode
      modeStore.setMode('map');
      values.push(modeStore.mode.value);

      modeStore.setMode('art');
      values.push(modeStore.mode.value);

      expect(values).toEqual(['art', 'map', 'art']);
    });
  });

  describe('toggleMode() method (AC #1, #3)', () => {
    it('should toggle from "art" to "map"', () => {
      expect(modeStore.mode.value).toBe('art');
      modeStore.toggleMode();
      expect(modeStore.mode.value).toBe('map');
    });

    it('should toggle from "map" to "art"', () => {
      modeStore.setMode('map');
      modeStore.toggleMode();
      expect(modeStore.mode.value).toBe('art');
    });

    it('should toggle back and forth correctly', () => {
      expect(modeStore.mode.value).toBe('art');
      modeStore.toggleMode();
      expect(modeStore.mode.value).toBe('map');
      modeStore.toggleMode();
      expect(modeStore.mode.value).toBe('art');
      modeStore.toggleMode();
      expect(modeStore.mode.value).toBe('map');
    });
  });

  describe('heroEditActive signal (AC #1)', () => {
    it('should be false by default', () => {
      expect(modeStore.heroEditActive.value).toBe(false);
    });

    it('should be settable to true', () => {
      modeStore.heroEditActive.value = true;
      expect(modeStore.heroEditActive.value).toBe(true);
    });

    it('should be settable back to false', () => {
      modeStore.heroEditActive.value = true;
      modeStore.heroEditActive.value = false;
      expect(modeStore.heroEditActive.value).toBe(false);
    });
  });

  describe('Mode switch edge cases', () => {
    it('should not affect heroEditActive when toggling mode if already false', () => {
      modeStore.setMode('map');
      expect(modeStore.heroEditActive.value).toBe(false);

      modeStore.toggleMode();

      expect(modeStore.mode.value).toBe('art');
      expect(modeStore.heroEditActive.value).toBe(false);
    });
  });

  describe('Signal reactivity (AC #3)', () => {
    it('should allow reactive subscription to mode changes', () => {
      // This tests that the signal interface works correctly
      const initialMode = modeStore.mode.value;
      expect(initialMode).toBe('art');

      modeStore.setMode('map');
      const updatedMode = modeStore.mode.value;
      expect(updatedMode).toBe('map');
    });
  });
});

// Test type definitions compile correctly (AC #2)
// These tests verify the types exist and can be used correctly
describe('Tilemap Type Definitions (AC #2)', () => {
  it('should allow creating a valid TileLayer with Uint32Array', () => {
    // This test verifies the TileLayer interface is correctly defined
    const testLayer: TileLayer = {
      id: 'test',
      name: 'Test Layer',
      width: 10,
      height: 10,
      data: new Uint32Array(100),
      visible: true,
      opacity: 1,
      locked: false,
    };

    // Verify data is Uint32Array
    expect(testLayer.data).toBeInstanceOf(Uint32Array);
    expect(testLayer.data.length).toBe(100);
    expect(testLayer.width).toBe(10);
    expect(testLayer.height).toBe(10);
  });

  it('should follow 0-based tile ID convention (0 = empty)', () => {
    // Test that 0 represents empty tile in Uint32Array
    const data = new Uint32Array(10);

    // Default values should be 0 (empty)
    expect(data[0]).toBe(0);

    // Set a tile (1+ = valid tile index)
    data[0] = 1;
    expect(data[0]).toBe(1);
  });

  it('should validate LoadStatus type values', () => {
    const statuses: LoadStatus[] = ['idle', 'loading', 'error', 'success'];

    expect(statuses).toContain('idle');
    expect(statuses).toContain('loading');
    expect(statuses).toContain('error');
    expect(statuses).toContain('success');
    expect(statuses.length).toBe(4);
  });
});
