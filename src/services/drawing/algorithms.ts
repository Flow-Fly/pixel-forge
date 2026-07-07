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
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
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

// All 24 angles at 15-degree increments
const ANGLE_INCREMENTS = [
  0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165,
  180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345
] as const;

// Sticky angles (cardinal + diagonal) - easier to hit
const STICKY_ANGLES = new Set([0, 45, 90, 135, 180, 225, 270, 315]);

/**
 * Constrain a point to 15-degree angle increments with sticky zones.
 * Cardinal (0°/90°/180°/270°) and diagonal (45°/135°/225°/315°) angles
 * have larger capture zones, making them easier to hit.
 *
 * @param originX - Starting X coordinate
 * @param originY - Starting Y coordinate
 * @param targetX - Target X coordinate (unconstrained)
 * @param targetY - Target Y coordinate (unconstrained)
 * @param stickyStrength - Multiplier for sticky angles (lower = stickier). Default: 0.7
 * @returns Constrained point at the nearest 15-degree angle
 */
export function constrainWithStickyAngles(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  stickyStrength = 0.7
): Point {
  const dx = targetX - originX;
  const dy = targetY - originY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) return { x: originX, y: originY };

  // Calculate raw angle, convert to degrees [0, 360)
  const rawAngleRad = Math.atan2(dy, dx);
  const angleDeg = ((rawAngleRad * 180 / Math.PI) + 360) % 360;

  // Find best angle using weighted distance
  let bestAngle = 0;
  let bestScore = Infinity;

  for (const candidate of ANGLE_INCREMENTS) {
    const diff = Math.abs(angleDeg - candidate);
    const angularDist = Math.min(diff, 360 - diff);

    // Apply sticky weight to cardinal/diagonal angles
    const effectiveDist = STICKY_ANGLES.has(candidate)
      ? angularDist * stickyStrength
      : angularDist;

    if (effectiveDist < bestScore) {
      bestScore = effectiveDist;
      bestAngle = candidate;
    }
  }

  // Calculate new position
  const snappedAngleRad = bestAngle * Math.PI / 180;
  const newX = Math.round(originX + Math.cos(snappedAngleRad) * distance);
  const newY = Math.round(originY + Math.sin(snappedAngleRad) * distance);

  return { x: newX, y: newY };
}


/** RGBA fill color plus its palette index for indexed-color mode. */
export interface FloodFillColor {
  r: number;
  g: number;
  b: number;
  a: number;
  /** Palette index written to the index buffer when one is provided. */
  paletteIndex: number;
}

/**
 * Stack-based 4-way flood fill starting at (startX, startY).
 *
 * Mutates `data` (RGBA pixels) and, when provided, `indexBuffer`
 * (palette indices) in place. Pixels match the fill region by palette
 * index when an index buffer is present, by exact RGBA otherwise.
 *
 * Returns the filled region's bounds, or null when nothing was filled
 * (out of bounds, or the target already has the fill color).
 */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fill: FloodFillColor,
  indexBuffer?: Uint8Array
): { x: number; y: number; width: number; height: number } | null {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return null;
  }

  // Target color at the start pixel
  const targetPos = (startY * width + startX) * 4;
  const targetR = data[targetPos];
  const targetG = data[targetPos + 1];
  const targetB = data[targetPos + 2];
  const targetA = data[targetPos + 3];
  const targetPaletteIndex = indexBuffer ? indexBuffer[startY * width + startX] : 0;

  // Don't fill if target is same as fill color
  if (indexBuffer) {
    // In indexed mode, compare palette indices
    if (targetPaletteIndex === fill.paletteIndex) return null;
  } else if (
    targetR === fill.r &&
    targetG === fill.g &&
    targetB === fill.b &&
    targetA === fill.a
  ) {
    return null;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const stack = [[startX, startY]];
  const visited = new Set<number>(); // Avoid revisiting pixels

  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

    const pixelIndex = cy * width + cx;
    if (visited.has(pixelIndex)) continue;
    visited.add(pixelIndex);

    // Check if matches target (use index buffer if available, otherwise RGBA)
    const pos = pixelIndex * 4;
    const matches = indexBuffer
      ? indexBuffer[pixelIndex] === targetPaletteIndex
      : data[pos] === targetR &&
        data[pos + 1] === targetG &&
        data[pos + 2] === targetB &&
        data[pos + 3] === targetA;
    if (!matches) continue;

    data[pos] = fill.r;
    data[pos + 1] = fill.g;
    data[pos + 2] = fill.b;
    data[pos + 3] = fill.a;
    if (indexBuffer) {
      indexBuffer[pixelIndex] = fill.paletteIndex;
    }

    minX = Math.min(minX, cx);
    maxX = Math.max(maxX, cx);
    minY = Math.min(minY, cy);
    maxY = Math.max(maxY, cy);

    stack.push([cx + 1, cy]);
    stack.push([cx - 1, cy]);
    stack.push([cx, cy + 1]);
    stack.push([cx, cy - 1]);
  }

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
