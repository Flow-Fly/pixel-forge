import { describe, it, expect } from 'vitest';
import { bresenhamLine, constrainTo45Degrees, isLShape } from '../../../src/services/drawing/algorithms';

describe('bresenhamLine', () => {
  it('should return single point for same start and end', () => {
    const points = bresenhamLine(5, 5, 5, 5);
    expect(points).toEqual([{ x: 5, y: 5 }]);
  });

  it('should draw horizontal line (left to right)', () => {
    const points = bresenhamLine(0, 0, 4, 0);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
  });

  it('should draw horizontal line (right to left)', () => {
    const points = bresenhamLine(4, 0, 0, 0);
    expect(points).toEqual([
      { x: 4, y: 0 },
      { x: 3, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it('should draw vertical line (top to bottom)', () => {
    const points = bresenhamLine(0, 0, 0, 4);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
      { x: 0, y: 4 },
    ]);
  });

  it('should draw vertical line (bottom to top)', () => {
    const points = bresenhamLine(0, 4, 0, 0);
    expect(points).toEqual([
      { x: 0, y: 4 },
      { x: 0, y: 3 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ]);
  });

  it('should draw 45-degree diagonal (down-right)', () => {
    const points = bresenhamLine(0, 0, 3, 3);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
  });

  it('should draw 45-degree diagonal (up-left)', () => {
    const points = bresenhamLine(3, 3, 0, 0);
    expect(points).toEqual([
      { x: 3, y: 3 },
      { x: 2, y: 2 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ]);
  });

  it('should draw shallow slope (more horizontal)', () => {
    const points = bresenhamLine(0, 0, 4, 2);
    expect(points.length).toBe(5); // 5 points for 4 horizontal steps
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 4, y: 2 });
    // All y values should be between 0 and 2
    points.forEach((p) => {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(2);
    });
  });

  it('should draw steep slope (more vertical)', () => {
    const points = bresenhamLine(0, 0, 2, 4);
    expect(points.length).toBe(5); // 5 points for 4 vertical steps
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 2, y: 4 });
  });

  it('should have no gaps in diagonal lines', () => {
    const points = bresenhamLine(0, 0, 10, 7);
    for (let i = 1; i < points.length; i++) {
      const dx = Math.abs(points[i].x - points[i - 1].x);
      const dy = Math.abs(points[i].y - points[i - 1].y);
      // Each step should move at most 1 pixel in each direction
      expect(dx).toBeLessThanOrEqual(1);
      expect(dy).toBeLessThanOrEqual(1);
      // Should move at least in one direction
      expect(dx + dy).toBeGreaterThan(0);
    }
  });
});

describe('constrainTo45Degrees', () => {
  it('should return origin for zero distance', () => {
    const result = constrainTo45Degrees(5, 5, 5, 5);
    expect(result).toEqual({ x: 5, y: 5 });
  });

  it('should snap to 0° (right)', () => {
    // Moving mostly right with slight vertical offset
    const result = constrainTo45Degrees(0, 0, 10, 2);
    expect(result.y).toBe(0); // Should snap to horizontal
    expect(result.x).toBeGreaterThan(0);
  });

  it('should snap to 90° (down)', () => {
    // Moving mostly down with slight horizontal offset
    const result = constrainTo45Degrees(0, 0, 2, 10);
    expect(result.x).toBe(0); // Should snap to vertical
    expect(result.y).toBeGreaterThan(0);
  });

  it('should snap to 180° (left)', () => {
    const result = constrainTo45Degrees(10, 0, 0, 2);
    expect(result.y).toBe(0); // Should snap to horizontal
    expect(result.x).toBeLessThan(10);
  });

  it('should snap to 270° / -90° (up)', () => {
    const result = constrainTo45Degrees(0, 10, 2, 0);
    expect(result.x).toBe(0); // Should snap to vertical
    expect(result.y).toBeLessThan(10);
  });

  it('should snap to 45° (down-right diagonal)', () => {
    // Moving at roughly 45 degrees
    const result = constrainTo45Degrees(0, 0, 10, 10);
    expect(result.x).toBe(result.y); // Should be on diagonal
  });

  it('should snap to 135° (down-left diagonal)', () => {
    const result = constrainTo45Degrees(10, 0, 0, 10);
    // x decreases same amount y increases
    expect(10 - result.x).toBe(result.y);
  });

  it('should preserve distance approximately', () => {
    const result = constrainTo45Degrees(0, 0, 7, 3);
    const originalDist = Math.sqrt(7 * 7 + 3 * 3);
    const newDist = Math.sqrt(result.x * result.x + result.y * result.y);
    // Should be within 1 pixel of original distance (due to rounding)
    expect(Math.abs(originalDist - newDist)).toBeLessThan(2);
  });

  it('should work with negative coordinates', () => {
    const result = constrainTo45Degrees(-5, -5, -15, -5);
    expect(result.y).toBe(-5); // Should snap to horizontal
    expect(result.x).toBeLessThan(-5);
  });
});

describe('isLShape', () => {
  it('should detect horizontal then vertical L-shape', () => {
    // Moving right then down
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 1, y: 0 }; // horizontal move
    const p3 = { x: 1, y: 1 }; // vertical move
    expect(isLShape(p1, p2, p3)).toBe(true);
  });

  it('should detect vertical then horizontal L-shape', () => {
    // Moving down then right
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 0, y: 1 }; // vertical move
    const p3 = { x: 1, y: 1 }; // horizontal move
    expect(isLShape(p1, p2, p3)).toBe(true);
  });

  it('should not detect diagonal as L-shape', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 1, y: 1 };
    const p3 = { x: 2, y: 2 };
    expect(isLShape(p1, p2, p3)).toBe(false);
  });

  it('should not detect straight horizontal line as L-shape', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 1, y: 0 };
    const p3 = { x: 2, y: 0 };
    expect(isLShape(p1, p2, p3)).toBe(false);
  });

  it('should not detect straight vertical line as L-shape', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 0, y: 1 };
    const p3 = { x: 0, y: 2 };
    expect(isLShape(p1, p2, p3)).toBe(false);
  });

  it('should detect reverse L-shape (up then left)', () => {
    const p1 = { x: 2, y: 2 };
    const p2 = { x: 2, y: 1 }; // vertical move up
    const p3 = { x: 1, y: 1 }; // horizontal move left
    expect(isLShape(p1, p2, p3)).toBe(true);
  });
});
