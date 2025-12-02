import type { Point } from '../../tools/base-tool';

/**
 * Drawing algorithms for pixel art tools.
 * These are pure functions that can be easily tested.
 */

/**
 * Generate points along a line using Bresenham's algorithm.
 * This is the standard algorithm for drawing pixel-perfect lines.
 */
export function bresenhamLine(x1: number, y1: number, x2: number, y2: number): Point[] {
  const points: Point[] = [];
  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    points.push({ x: x1, y: y1 });

    if (x1 === x2 && y1 === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x1 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y1 += sy;
    }
  }

  return points;
}

/**
 * Constrain a point to 45-degree angle increments from an origin point.
 * Used for Shift+Drag to create straight lines at 0°, 45°, 90°, etc.
 */
export function constrainTo45Degrees(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number
): Point {
  const dx = targetX - originX;
  const dy = targetY - originY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) return { x: originX, y: originY };

  // Calculate angle and snap to nearest 45 degrees (π/4 radians)
  const angle = Math.atan2(dy, dx);
  const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);

  // Calculate new position
  const newX = Math.round(originX + Math.cos(snappedAngle) * distance);
  const newY = Math.round(originY + Math.sin(snappedAngle) * distance);

  return { x: newX, y: newY };
}

/**
 * Check if three points form an L-shape (used for pixel-perfect mode).
 * An L-shape is when we move horizontally then vertically, or vice versa.
 */
export function isLShape(p1: Point, p2: Point, p3: Point): boolean {
  return (p1.x === p2.x && p2.y === p3.y) || (p1.y === p2.y && p2.x === p3.x);
}
