import { describe, it, expect } from 'vitest';
import { bresenhamLine, constrainTo45Degrees, constrainWithStickyAngles, isLShape } from '../../../src/services/drawing/algorithms';

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

describe('constrainWithStickyAngles', () => {
  // Helper to get angle in degrees from result
  const getAngle = (result: { x: number; y: number }, originX = 0, originY = 0): number => {
    const angle = Math.atan2(result.y - originY, result.x - originX) * 180 / Math.PI;
    return Math.round((angle + 360) % 360);
  };

  it('should return origin for zero distance', () => {
    const result = constrainWithStickyAngles(5, 5, 5, 5);
    expect(result).toEqual({ x: 5, y: 5 });
  });

  // Cardinal directions (sticky)
  it('should snap to 0° (right) for small deviations', () => {
    const result = constrainWithStickyAngles(0, 0, 100, 10);
    expect(result.y).toBe(0); // Should snap to horizontal
    expect(result.x).toBeGreaterThan(0);
  });

  it('should snap to 90° (down) for small deviations', () => {
    const result = constrainWithStickyAngles(0, 0, 10, 100);
    expect(result.x).toBe(0); // Should snap to vertical
    expect(result.y).toBeGreaterThan(0);
  });

  it('should snap to 180° (left)', () => {
    const result = constrainWithStickyAngles(100, 0, 0, 10);
    expect(result.y).toBe(0); // Should snap to horizontal
    expect(result.x).toBeLessThan(100);
  });

  it('should snap to 270° (up)', () => {
    const result = constrainWithStickyAngles(0, 100, 10, 0);
    expect(Math.abs(result.x)).toBe(0); // Should snap to vertical (handles -0)
    expect(result.y).toBeLessThan(100);
  });

  // Diagonal directions (sticky)
  it('should snap to 45° (down-right)', () => {
    const result = constrainWithStickyAngles(0, 0, 100, 100);
    expect(result.x).toBe(result.y);
  });

  it('should snap to 135° (down-left)', () => {
    const result = constrainWithStickyAngles(100, 0, 0, 100);
    expect(100 - result.x).toBe(result.y);
  });

  it('should snap to 225° (up-left)', () => {
    const result = constrainWithStickyAngles(100, 100, 0, 0);
    // Both should be equal (on diagonal), handling -0 case
    expect(Math.abs(result.x - result.y)).toBeLessThan(1);
  });

  it('should snap to 315° (up-right)', () => {
    const result = constrainWithStickyAngles(0, 100, 100, 0);
    expect(result.x).toBe(100 - result.y);
  });

  // 15-degree angles (non-sticky)
  it('should snap to 15° when clearly closer', () => {
    // tan(15°) ≈ 0.268, so for x=100, y≈27
    const result = constrainWithStickyAngles(0, 0, 100, 27);
    const angle = getAngle(result);
    expect(angle).toBe(15);
  });

  it('should snap to 30° when clearly closer', () => {
    // tan(30°) ≈ 0.577, so for x=100, y≈58
    const result = constrainWithStickyAngles(0, 0, 100, 58);
    const angle = getAngle(result);
    expect(angle).toBe(30);
  });

  it('should snap to 60° when clearly closer', () => {
    // tan(60°) ≈ 1.732, so for x=58, y≈100
    const result = constrainWithStickyAngles(0, 0, 58, 100);
    const angle = getAngle(result);
    expect(angle).toBe(60);
  });

  it('should snap to 75° when clearly closer', () => {
    // tan(75°) ≈ 3.732, so for x=27, y≈100
    const result = constrainWithStickyAngles(0, 0, 27, 100);
    const angle = getAngle(result);
    expect(angle).toBe(75);
  });

  // Sticky zone tests - sticky angles should "win" at boundaries
  it('should prefer 0° over 15° at boundary due to sticky (8° from horizontal)', () => {
    // At 8°, without sticky: closer to 15° (7° away) than 0° (8° away)
    // With sticky (0.7): 0° effective dist = 8*0.7=5.6, 15° dist = 7
    // So 0° wins
    // tan(8°) ≈ 0.14, for x=100, y≈14
    const result = constrainWithStickyAngles(0, 0, 100, 14);
    expect(result.y).toBe(0); // Snapped to 0°
  });

  it('should prefer 15° over 0° when clearly closer to 15° (13° from horizontal)', () => {
    // At 13°, dist to 0° = 13, dist to 15° = 2
    // With sticky: 0° effective = 13*0.7=9.1, 15° = 2
    // 15° wins
    // tan(13°) ≈ 0.23, for x=100, y≈23
    const result = constrainWithStickyAngles(0, 0, 100, 23);
    const angle = getAngle(result);
    expect(angle).toBe(15);
  });

  it('should prefer 45° over 30° at boundary due to sticky (38° from horizontal)', () => {
    // At 38°: dist to 30° = 8, dist to 45° = 7
    // With sticky: 30° = 8, 45° effective = 7*0.7=4.9
    // 45° wins
    // tan(38°) ≈ 0.78, for x=100, y≈78
    const result = constrainWithStickyAngles(0, 0, 100, 78);
    const angle = getAngle(result);
    expect(angle).toBe(45);
  });

  // Distance preservation
  it('should approximately preserve distance', () => {
    const result = constrainWithStickyAngles(0, 0, 100, 50);
    const originalDist = Math.sqrt(100 * 100 + 50 * 50);
    const newDist = Math.sqrt(result.x * result.x + result.y * result.y);
    expect(Math.abs(originalDist - newDist)).toBeLessThan(2);
  });

  // Custom sticky strength
  it('should respect custom stickyStrength', () => {
    // With stickyStrength = 0.5 (stronger), 0° should win at larger angles
    // At 7°: dist to 0° = 7*0.5=3.5, dist to 15° = 8
    // tan(7°) ≈ 0.123, for x=100, y≈12
    const result = constrainWithStickyAngles(0, 0, 100, 12, 0.5);
    expect(result.y).toBe(0); // 0° wins
  });

  // Negative coordinates
  it('should work with negative coordinates', () => {
    const result = constrainWithStickyAngles(-50, -50, -150, -50);
    expect(result.y).toBe(-50); // Horizontal left
  });

  // All 24 angles should be reachable
  it('should be able to reach all 24 angles', () => {
    const reachedAngles = new Set<number>();

    for (let deg = 0; deg < 360; deg += 1) {
      const rad = deg * Math.PI / 180;
      const x = Math.cos(rad) * 100;
      const y = Math.sin(rad) * 100;
      const result = constrainWithStickyAngles(0, 0, x, y);
      const resultAngle = getAngle(result);
      reachedAngles.add(resultAngle);
    }

    expect(reachedAngles.size).toBe(24);
  });

  // Wraparound at 360/0 boundary
  it('should handle wraparound at 360°/0° boundary', () => {
    // At 355°, should snap to 0° (closer: 5° vs 10° to 345°)
    // 355° = -5° = atan2(-sin5°, cos5°)
    const rad = -5 * Math.PI / 180;
    const result = constrainWithStickyAngles(0, 0, Math.cos(rad) * 100, Math.sin(rad) * 100);
    const angle = getAngle(result);
    expect(angle).toBe(0);
  });

  it('should handle wraparound at 345°', () => {
    // At 350°, should snap to 345° (5° away) not 0° (10° away)
    // But 0° is sticky: effective dist = 10*0.7=7, 345° = 5
    // 345° wins
    const rad = -10 * Math.PI / 180;
    const result = constrainWithStickyAngles(0, 0, Math.cos(rad) * 100, Math.sin(rad) * 100);
    const angle = getAngle(result);
    expect(angle).toBe(345);
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
