import { describe, it, expect } from 'vitest';
import { PixelPerfect } from '../../../src/services/drawing/pixel-perfect';
import type { Point } from '../../../src/tools/base-tool';

describe('PixelPerfect', () => {
  describe('apply', () => {
    it('should return empty array for empty input', () => {
      const result = PixelPerfect.apply([]);
      expect(result).toEqual([]);
    });

    it('should return single point unchanged', () => {
      const points: Point[] = [{ x: 5, y: 5 }];
      const result = PixelPerfect.apply(points);
      expect(result).toEqual([{ x: 5, y: 5 }]);
    });

    it('should return two points unchanged', () => {
      const points: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
      const result = PixelPerfect.apply(points);
      expect(result).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    });

    it('should remove L-shape corner (horizontal then vertical)', () => {
      // Pattern: horizontal move, then vertical = L-shape
      // (0,0) -> (1,0) -> (1,1)
      // The middle point (1,0) creates an L and should be removed
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 }, // This is the L corner
        { x: 1, y: 1 },
      ];
      const result = PixelPerfect.apply(points);
      expect(result).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]);
    });

    it('should remove L-shape corner (vertical then horizontal)', () => {
      // Pattern: vertical move, then horizontal = L-shape
      // (0,0) -> (0,1) -> (1,1)
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 0, y: 1 }, // This is the L corner
        { x: 1, y: 1 },
      ];
      const result = PixelPerfect.apply(points);
      expect(result).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]);
    });

    it('should preserve diagonal lines (no L-shape)', () => {
      // Pure diagonal: no L-shapes
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ];
      const result = PixelPerfect.apply(points);
      expect(result).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]);
    });

    it('should preserve straight horizontal lines', () => {
      const points: Point[] = [
        { x: 0, y: 5 },
        { x: 1, y: 5 },
        { x: 2, y: 5 },
      ];
      const result = PixelPerfect.apply(points);
      expect(result).toEqual([
        { x: 0, y: 5 },
        { x: 1, y: 5 },
        { x: 2, y: 5 },
      ]);
    });

    it('should preserve straight vertical lines', () => {
      const points: Point[] = [
        { x: 5, y: 0 },
        { x: 5, y: 1 },
        { x: 5, y: 2 },
      ];
      const result = PixelPerfect.apply(points);
      expect(result).toEqual([
        { x: 5, y: 0 },
        { x: 5, y: 1 },
        { x: 5, y: 2 },
      ]);
    });

    it('should remove multiple consecutive L-shapes', () => {
      // Staircase pattern with L-shapes
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 }, // L corner
        { x: 1, y: 1 },
        { x: 2, y: 1 }, // L corner
        { x: 2, y: 2 },
      ];
      const result = PixelPerfect.apply(points);
      expect(result).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]);
    });

    it('should handle complex path with mixed patterns', () => {
      // Mix of L-shapes and diagonals
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 }, // L corner - remove
        { x: 1, y: 1 },
        { x: 2, y: 2 }, // diagonal - keep
        { x: 3, y: 3 }, // diagonal - keep
      ];
      const result = PixelPerfect.apply(points);
      expect(result).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ]);
    });

    it('should not modify the original array', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ];
      const original = [...points];
      PixelPerfect.apply(points);
      expect(points).toEqual(original);
    });
  });
});
