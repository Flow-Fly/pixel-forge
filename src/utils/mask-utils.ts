import { type Point, type Rect } from '../types/geometry';

/**
 * Mask utilities for selection tools.
 * Masks are Uint8Array with 255 = selected, 0 = not selected.
 * Indexed relative to bounds: index = (y - bounds.y) * bounds.width + (x - bounds.x)
 */

// ============================================
// Flood Fill (for Magic Wand)
// ============================================

export interface FloodFillOptions {
  tolerance: number; // 0-255, 0 = exact match
  contiguous: boolean; // true = connected pixels only
  diagonal?: boolean; // true = 8-way connectivity (includes diagonals), false = 4-way (default)
}

/**
 * Flood fill to find matching pixels from a starting point.
 * Returns mask and bounds of the selected region.
 */
export function floodFillSelect(
  imageData: ImageData,
  startX: number,
  startY: number,
  options: FloodFillOptions
): { mask: Uint8Array; bounds: Rect } | null {
  const { width, height, data } = imageData;
  const { tolerance, contiguous, diagonal = false } = options;

  // Bounds check
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return null;
  }

  // Get target color at start point
  const targetIdx = (startY * width + startX) * 4;
  const targetR = data[targetIdx];
  const targetG = data[targetIdx + 1];
  const targetB = data[targetIdx + 2];
  const targetA = data[targetIdx + 3];

  // Color matching function
  const matchesTarget = (x: number, y: number): boolean => {
    const idx = (y * width + x) * 4;
    if (tolerance === 0) {
      // Exact match
      return (
        data[idx] === targetR &&
        data[idx + 1] === targetG &&
        data[idx + 2] === targetB &&
        data[idx + 3] === targetA
      );
    }
    // Tolerance-based match (Euclidean distance in RGBA space)
    const dr = data[idx] - targetR;
    const dg = data[idx + 1] - targetG;
    const db = data[idx + 2] - targetB;
    const da = data[idx + 3] - targetA;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db + da * da);
    return distance <= tolerance * 2;
  };

  // Track which pixels are selected (full canvas size for easy indexing)
  const selected = new Uint8Array(width * height);

  // Track bounds
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;

  if (contiguous) {
    // Flood fill using stack
    const stack: [number, number][] = [[startX, startY]];

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;

      // Bounds check
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const idx = y * width + x;

      // Already visited
      if (selected[idx]) continue;

      // Check if matches
      if (!matchesTarget(x, y)) continue;

      // Mark as selected
      selected[idx] = 255;

      // Update bounds
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      // Add neighbors (4-way or 8-way)
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      if (diagonal) {
        stack.push([x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]);
      }
    }
  } else {
    // Non-contiguous: scan all pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (matchesTarget(x, y)) {
          selected[y * width + x] = 255;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
  }

  // No pixels selected
  if (maxX < 0) return null;

  // Create bounds-relative mask
  const bounds: Rect = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };

  const mask = new Uint8Array(bounds.width * bounds.height);
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const srcIdx = y * width + x;
      const dstIdx = (y - bounds.y) * bounds.width + (x - bounds.x);
      mask[dstIdx] = selected[srcIdx];
    }
  }

  return { mask, bounds };
}

// ============================================
// Polygon Fill (for Lasso)
// ============================================

/**
 * Generate a mask from a polygon defined by points.
 * Uses canvas path fill for accuracy.
 */
export function polygonToMask(
  points: Point[],
  canvasWidth: number,
  canvasHeight: number
): { mask: Uint8Array; bounds: Rect } | null {
  if (points.length < 3) return null;

  // Calculate bounds
  let minX = canvasWidth,
    minY = canvasHeight,
    maxX = -1,
    maxY = -1;

  for (const p of points) {
    minX = Math.min(minX, Math.floor(p.x));
    minY = Math.min(minY, Math.floor(p.y));
    maxX = Math.max(maxX, Math.ceil(p.x));
    maxY = Math.max(maxY, Math.ceil(p.y));
  }

  // Clamp to canvas
  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(canvasWidth - 1, maxX);
  maxY = Math.min(canvasHeight - 1, maxY);

  if (maxX < minX || maxY < minY) return null;

  const bounds: Rect = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };

  // Create temp canvas at bounds size
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = bounds.width;
  tempCanvas.height = bounds.height;
  const ctx = tempCanvas.getContext('2d')!;

  // Fill polygon (offset by bounds origin)
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(points[0].x - bounds.x, points[0].y - bounds.y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x - bounds.x, points[i].y - bounds.y);
  }

  ctx.closePath();
  ctx.fill();

  // Extract mask from alpha channel
  const imageData = ctx.getImageData(0, 0, bounds.width, bounds.height);
  const mask = new Uint8Array(bounds.width * bounds.height);

  for (let i = 0; i < mask.length; i++) {
    // Use red channel (filled with white = 255)
    mask[i] = imageData.data[i * 4] > 127 ? 255 : 0;
  }

  return { mask, bounds };
}

/**
 * Simplify a path by removing points that are too close together.
 */
export function simplifyPath(points: Point[], minDistance: number = 1): Point[] {
  if (points.length < 2) return points;

  const result: Point[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const last = result[result.length - 1];
    const dx = points[i].x - last.x;
    const dy = points[i].y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= minDistance) {
      result.push(points[i]);
    }
  }

  return result;
}

// ============================================
// Outline Tracing (for Marching Ants)
// ============================================

export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Trace the outline of a mask to generate line segments for marching ants.
 * Returns segments in canvas coordinates (not screen coordinates).
 */
export function traceMaskOutline(mask: Uint8Array, bounds: Rect): LineSegment[] {
  const { x: bx, y: by, width, height } = bounds;
  const segments: LineSegment[] = [];

  // Helper to check if a pixel is selected
  const isSelected = (x: number, y: number): boolean => {
    // Outside bounds = not selected
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return mask[y * width + x] === 255;
  };

  // Scan each pixel and check its 4 edges
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isSelected(x, y)) continue;

      // Convert to canvas coordinates
      const cx = bx + x;
      const cy = by + y;

      // Top edge: if pixel above is not selected
      if (!isSelected(x, y - 1)) {
        segments.push({ x1: cx, y1: cy, x2: cx + 1, y2: cy });
      }

      // Bottom edge: if pixel below is not selected
      if (!isSelected(x, y + 1)) {
        segments.push({ x1: cx, y1: cy + 1, x2: cx + 1, y2: cy + 1 });
      }

      // Left edge: if pixel to left is not selected
      if (!isSelected(x - 1, y)) {
        segments.push({ x1: cx, y1: cy, x2: cx, y2: cy + 1 });
      }

      // Right edge: if pixel to right is not selected
      if (!isSelected(x + 1, y)) {
        segments.push({ x1: cx + 1, y1: cy, x2: cx + 1, y2: cy + 1 });
      }
    }
  }

  return segments;
}

/**
 * Connect line segments into continuous paths for smoother rendering.
 * Returns arrays of points that can be drawn with lineTo().
 */
export function connectSegments(segments: LineSegment[]): Point[][] {
  if (segments.length === 0) return [];

  // Build adjacency map: point -> segments that touch it
  const pointKey = (x: number, y: number) => `${x},${y}`;
  const segmentsByPoint = new Map<string, LineSegment[]>();

  for (const seg of segments) {
    const k1 = pointKey(seg.x1, seg.y1);
    const k2 = pointKey(seg.x2, seg.y2);

    if (!segmentsByPoint.has(k1)) segmentsByPoint.set(k1, []);
    if (!segmentsByPoint.has(k2)) segmentsByPoint.set(k2, []);

    segmentsByPoint.get(k1)!.push(seg);
    segmentsByPoint.get(k2)!.push(seg);
  }

  const used = new Set<LineSegment>();
  const paths: Point[][] = [];

  for (const startSeg of segments) {
    if (used.has(startSeg)) continue;

    const path: Point[] = [{ x: startSeg.x1, y: startSeg.y1 }, { x: startSeg.x2, y: startSeg.y2 }];
    used.add(startSeg);

    // Extend path in both directions
    let extended = true;
    while (extended) {
      extended = false;

      // Try to extend from end
      const endKey = pointKey(path[path.length - 1].x, path[path.length - 1].y);
      const endSegs = segmentsByPoint.get(endKey) || [];

      for (const seg of endSegs) {
        if (used.has(seg)) continue;

        used.add(seg);
        extended = true;

        // Add the other endpoint
        if (seg.x1 === path[path.length - 1].x && seg.y1 === path[path.length - 1].y) {
          path.push({ x: seg.x2, y: seg.y2 });
        } else {
          path.push({ x: seg.x1, y: seg.y1 });
        }
        break;
      }

      // Try to extend from start
      const startKey = pointKey(path[0].x, path[0].y);
      const startSegs = segmentsByPoint.get(startKey) || [];

      for (const seg of startSegs) {
        if (used.has(seg)) continue;

        used.add(seg);
        extended = true;

        // Add the other endpoint at start
        if (seg.x1 === path[0].x && seg.y1 === path[0].y) {
          path.unshift({ x: seg.x2, y: seg.y2 });
        } else {
          path.unshift({ x: seg.x1, y: seg.y1 });
        }
        break;
      }
    }

    paths.push(path);
  }

  return paths;
}

// ============================================
// Mask Operations
// ============================================

/**
 * Check if a point is inside the mask.
 */
export function isPointInMask(x: number, y: number, mask: Uint8Array, bounds: Rect): boolean {
  const { x: bx, y: by, width, height } = bounds;

  // Outside bounds
  if (x < bx || x >= bx + width || y < by || y >= by + height) {
    return false;
  }

  const idx = (y - by) * width + (x - bx);
  return mask[idx] === 255;
}


// ============================================
// Mask Combination (add / subtract / intersect)
// ============================================

export type MaskCombineOperation = 'add' | 'subtract' | 'replace' | 'intersect';

export interface MaskSelectionState {
  bounds: Rect;
  shape: string;
  mask?: Uint8Array;
}

/**
 * Combine an existing selection with a new mask using add, subtract, or
 * intersect. Returns the combined mask trimmed to tight bounds, or null
 * when the result is empty.
 */
export function combineMasks(
  currentState: MaskSelectionState,
  newBounds: Rect,
  newMask: Uint8Array,
  operation: MaskCombineOperation
): { mask: Uint8Array; bounds: Rect } | null {
  if (operation === 'replace') {
    return { mask: newMask, bounds: newBounds };
  }

  const oldBounds = currentState.bounds;

  // Calculate combined bounds based on operation
  let minX: number, minY: number, maxX: number, maxY: number;

  if (operation === 'add') {
    // Union of bounds
    minX = Math.min(oldBounds.x, newBounds.x);
    minY = Math.min(oldBounds.y, newBounds.y);
    maxX = Math.max(oldBounds.x + oldBounds.width, newBounds.x + newBounds.width);
    maxY = Math.max(oldBounds.y + oldBounds.height, newBounds.y + newBounds.height);
  } else if (operation === 'intersect') {
    // Intersection of bounds
    minX = Math.max(oldBounds.x, newBounds.x);
    minY = Math.max(oldBounds.y, newBounds.y);
    maxX = Math.min(oldBounds.x + oldBounds.width, newBounds.x + newBounds.width);
    maxY = Math.min(oldBounds.y + oldBounds.height, newBounds.y + newBounds.height);

    // If no overlap, return null
    if (minX >= maxX || minY >= maxY) {
      return null;
    }
  } else {
    // Subtract - use old bounds
    minX = oldBounds.x;
    minY = oldBounds.y;
    maxX = oldBounds.x + oldBounds.width;
    maxY = oldBounds.y + oldBounds.height;
  }

  const combinedBounds = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };

  const combinedMask = new Uint8Array(combinedBounds.width * combinedBounds.height);

  // Helper to get value from a mask
  const getMaskValue = (
    mask: Uint8Array | undefined,
    bounds: Rect,
    x: number,
    y: number,
    shape: string
  ): boolean => {
    if (x < bounds.x || x >= bounds.x + bounds.width || y < bounds.y || y >= bounds.y + bounds.height) {
      return false;
    }

    if (shape === 'rectangle') {
      return true;
    }

    if (shape === 'ellipse') {
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      const rx = bounds.width / 2;
      const ry = bounds.height / 2;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      return dx * dx + dy * dy <= 1;
    }

    if (mask) {
      const idx = (y - bounds.y) * bounds.width + (x - bounds.x);
      return mask[idx] === 255;
    }

    return false;
  };

  // Fill combined mask
  let hasAnyPixel = false;
  for (let y = combinedBounds.y; y < combinedBounds.y + combinedBounds.height; y++) {
    for (let x = combinedBounds.x; x < combinedBounds.x + combinedBounds.width; x++) {
      const oldValue = getMaskValue(
        currentState.shape === 'freeform' ? currentState.mask : undefined,
        oldBounds,
        x,
        y,
        currentState.shape
      );
      const newValue = getMaskValue(newMask, newBounds, x, y, 'freeform');

      let finalValue: boolean;
      if (operation === 'add') {
        finalValue = oldValue || newValue;
      } else if (operation === 'intersect') {
        finalValue = oldValue && newValue;
      } else {
        // subtract
        finalValue = oldValue && !newValue;
      }

      if (finalValue) {
        const idx = (y - combinedBounds.y) * combinedBounds.width + (x - combinedBounds.x);
        combinedMask[idx] = 255;
        hasAnyPixel = true;
      }
    }
  }

  if (!hasAnyPixel) return null;

  // Shrink bounds to fit actual selection
  let actualMinX = combinedBounds.width, actualMinY = combinedBounds.height;
  let actualMaxX = -1, actualMaxY = -1;

  for (let y = 0; y < combinedBounds.height; y++) {
    for (let x = 0; x < combinedBounds.width; x++) {
      if (combinedMask[y * combinedBounds.width + x] === 255) {
        actualMinX = Math.min(actualMinX, x);
        actualMinY = Math.min(actualMinY, y);
        actualMaxX = Math.max(actualMaxX, x);
        actualMaxY = Math.max(actualMaxY, y);
      }
    }
  }

  if (actualMaxX < 0) return null;

  // Create tight bounds mask
  const tightBounds = {
    x: combinedBounds.x + actualMinX,
    y: combinedBounds.y + actualMinY,
    width: actualMaxX - actualMinX + 1,
    height: actualMaxY - actualMinY + 1,
  };

  const tightMask = new Uint8Array(tightBounds.width * tightBounds.height);
  for (let y = 0; y < tightBounds.height; y++) {
    for (let x = 0; x < tightBounds.width; x++) {
      const srcIdx = (actualMinY + y) * combinedBounds.width + (actualMinX + x);
      const dstIdx = y * tightBounds.width + x;
      tightMask[dstIdx] = combinedMask[srcIdx];
    }
  }

  return { mask: tightMask, bounds: tightBounds };
}
