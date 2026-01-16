import { describe, it, expect, beforeEach, vi } from 'vitest';
import { paletteStore } from '../../src/stores/palette';

/**
 * Palette Store Tests
 *
 * Tests for paletteStore DnD-related functionality:
 * - swapColors()
 * - duplicateColor()
 * - moveColor()
 */

describe('PaletteStore', () => {
  beforeEach(() => {
    // Reset to known state with 5 colors
    paletteStore.colors.value = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
    paletteStore.ephemeralColors.value = [];
  });

  describe('swapColors()', () => {
    it('should swap two colors at different positions', () => {
      paletteStore.swapColors(0, 2);
      expect(paletteStore.colors.value).toEqual([
        '#0000ff', '#00ff00', '#ff0000', '#ffff00', '#ff00ff'
      ]);
    });

    it('should swap adjacent colors', () => {
      paletteStore.swapColors(1, 2);
      expect(paletteStore.colors.value).toEqual([
        '#ff0000', '#0000ff', '#00ff00', '#ffff00', '#ff00ff'
      ]);
    });

    it('should swap first and last colors', () => {
      paletteStore.swapColors(0, 4);
      expect(paletteStore.colors.value).toEqual([
        '#ff00ff', '#00ff00', '#0000ff', '#ffff00', '#ff0000'
      ]);
    });

    it('should not change array when swapping same index', () => {
      const original = [...paletteStore.colors.value];
      paletteStore.swapColors(2, 2);
      expect(paletteStore.colors.value).toEqual(original);
    });

    it('should not change array when indexA is out of bounds (negative)', () => {
      const original = [...paletteStore.colors.value];
      paletteStore.swapColors(-1, 2);
      expect(paletteStore.colors.value).toEqual(original);
    });

    it('should not change array when indexB is out of bounds (too large)', () => {
      const original = [...paletteStore.colors.value];
      paletteStore.swapColors(2, 10);
      expect(paletteStore.colors.value).toEqual(original);
    });

    it('should dispatch palette-colors-swapped event with 1-based indices', () => {
      const handler = vi.fn();
      window.addEventListener('palette-colors-swapped', handler);

      paletteStore.swapColors(1, 3);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({ indexA: 2, indexB: 4 }); // 1-based

      window.removeEventListener('palette-colors-swapped', handler);
    });

    it('should not dispatch event when indices are same', () => {
      const handler = vi.fn();
      window.addEventListener('palette-colors-swapped', handler);

      paletteStore.swapColors(2, 2);

      expect(handler).not.toHaveBeenCalled();

      window.removeEventListener('palette-colors-swapped', handler);
    });
  });

  describe('duplicateColor()', () => {
    it('should duplicate color at target position', () => {
      paletteStore.duplicateColor(0, 2);
      expect(paletteStore.colors.value).toEqual([
        '#ff0000', '#00ff00', '#ff0000', '#0000ff', '#ffff00', '#ff00ff'
      ]);
    });

    it('should duplicate at beginning', () => {
      paletteStore.duplicateColor(2, 0);
      expect(paletteStore.colors.value).toEqual([
        '#0000ff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'
      ]);
    });

    it('should duplicate at end', () => {
      paletteStore.duplicateColor(1, 5);
      expect(paletteStore.colors.value).toEqual([
        '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ff00'
      ]);
    });

    it('should allow duplicating at same position (creates adjacent duplicate)', () => {
      paletteStore.duplicateColor(2, 2);
      expect(paletteStore.colors.value).toEqual([
        '#ff0000', '#00ff00', '#0000ff', '#0000ff', '#ffff00', '#ff00ff'
      ]);
    });

    it('should not change array when source index is out of bounds (negative)', () => {
      const original = [...paletteStore.colors.value];
      paletteStore.duplicateColor(-1, 2);
      expect(paletteStore.colors.value).toEqual(original);
    });

    it('should not change array when source index is out of bounds (too large)', () => {
      const original = [...paletteStore.colors.value];
      paletteStore.duplicateColor(10, 2);
      expect(paletteStore.colors.value).toEqual(original);
    });

    it('should not change array when target index is out of bounds (negative)', () => {
      const original = [...paletteStore.colors.value];
      paletteStore.duplicateColor(2, -1);
      expect(paletteStore.colors.value).toEqual(original);
    });

    it('should dispatch palette-color-inserted event with 1-based index', () => {
      const handler = vi.fn();
      window.addEventListener('palette-color-inserted', handler);

      paletteStore.duplicateColor(1, 3);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({ insertedIndex: 4 }); // 1-based

      window.removeEventListener('palette-color-inserted', handler);
    });
  });

  describe('moveColor()', () => {
    it('should move color forward', () => {
      paletteStore.moveColor(0, 3);
      expect(paletteStore.colors.value).toEqual([
        '#00ff00', '#0000ff', '#ffff00', '#ff0000', '#ff00ff'
      ]);
    });

    it('should move color backward', () => {
      paletteStore.moveColor(3, 1);
      expect(paletteStore.colors.value).toEqual([
        '#ff0000', '#ffff00', '#00ff00', '#0000ff', '#ff00ff'
      ]);
    });

    it('should not change array when moving to same position', () => {
      const original = [...paletteStore.colors.value];
      paletteStore.moveColor(2, 2);
      expect(paletteStore.colors.value).toEqual(original);
    });

    it('should dispatch palette-colors-reordered event with 1-based indices', () => {
      const handler = vi.fn();
      window.addEventListener('palette-colors-reordered', handler);

      paletteStore.moveColor(1, 3);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({ fromIndex: 2, toIndex: 4 }); // 1-based

      window.removeEventListener('palette-colors-reordered', handler);
    });
  });
});
