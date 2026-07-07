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

type PixelColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type PixelMatcher = (x: number, y: number) => boolean;

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

  const targetColor = getPixelColor(data, width, startX, startY);
  const matchesTarget = createPixelMatcher(data, width, targetColor, tolerance);
  const selected = new Uint8Array(width * height);

  if (contiguous) {
    selectContiguousPixels(selected, width, height, startX, startY, diagonal, matchesTarget);
  } else {
    selectMatchingPixels(selected, width, height, matchesTarget);
  }

  // Trim the full-canvas mask to the tight bounds of the selection
  return trimMaskToTightBounds(selected, { x: 0, y: 0, width, height });
}

function getPixelColor(data: Uint8ClampedArray, width: number, x: number, y: number): PixelColor {
  const idx = getPixelIndex(width, x, y);
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
    a: data[idx + 3],
  };
}

function createPixelMatcher(
  data: Uint8ClampedArray,
  width: number,
  targetColor: PixelColor,
  tolerance: number
): PixelMatcher {
  if (tolerance === 0) {
    return (x, y) => matchesPixelExactly(data, width, x, y, targetColor);
  }

  return (x, y) => isPixelWithinTolerance(data, width, x, y, targetColor, tolerance);
}

function matchesPixelExactly(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  targetColor: PixelColor
): boolean {
  const idx = getPixelIndex(width, x, y);
  return (
    data[idx] === targetColor.r &&
    data[idx + 1] === targetColor.g &&
    data[idx + 2] === targetColor.b &&
    data[idx + 3] === targetColor.a
  );
}

function isPixelWithinTolerance(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  targetColor: PixelColor,
  tolerance: number
): boolean {
  const idx = getPixelIndex(width, x, y);
  const dr = data[idx] - targetColor.r;
  const dg = data[idx + 1] - targetColor.g;
  const db = data[idx + 2] - targetColor.b;
  const da = data[idx + 3] - targetColor.a;
  const distance = Math.sqrt(dr * dr + dg * dg + db * db + da * da);
  return distance <= tolerance * 2;
}

function selectContiguousPixels(
  selected: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  diagonal: boolean,
  matchesTarget: PixelMatcher
) {
  const stack: [number, number][] = [[startX, startY]];

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (shouldSkipFloodFillPixel(selected, width, height, x, y, matchesTarget)) {
      continue;
    }

    selected[y * width + x] = 255;
    addFloodFillNeighbors(stack, x, y, diagonal);
  }
}

function shouldSkipFloodFillPixel(
  selected: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  matchesTarget: PixelMatcher
): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return true;
  }

  const idx = y * width + x;
  return selected[idx] === 255 || !matchesTarget(x, y);
}

function addFloodFillNeighbors(stack: [number, number][], x: number, y: number, diagonal: boolean) {
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);

  if (diagonal) {
    stack.push([x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]);
  }
}

function selectMatchingPixels(selected: Uint8Array, width: number, height: number, matchesTarget: PixelMatcher) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (matchesTarget(x, y)) {
        selected[y * width + x] = 255;
      }
    }
  }
}

function getPixelIndex(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
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

  const segmentsByPoint = buildSegmentAdjacency(segments);
  const used = new Set<LineSegment>();
  const paths: Point[][] = [];

  for (const startSeg of segments) {
    if (used.has(startSeg)) continue;

    const path: Point[] = [{ x: startSeg.x1, y: startSeg.y1 }, { x: startSeg.x2, y: startSeg.y2 }];
    used.add(startSeg);

    // Extend path in both directions
    let extended = true;
    while (extended) {
      const fromEnd = extendPath(path, segmentsByPoint, used, 'end');
      const fromStart = extendPath(path, segmentsByPoint, used, 'start');
      extended = fromEnd || fromStart;
    }

    paths.push(path);
  }

  return paths;
}

const pointKey = (x: number, y: number) => `${x},${y}`;

/** Build adjacency map: point -> segments that touch it. */
function buildSegmentAdjacency(segments: LineSegment[]): Map<string, LineSegment[]> {
  const segmentsByPoint = new Map<string, LineSegment[]>();
  for (const seg of segments) {
    const k1 = pointKey(seg.x1, seg.y1);
    const k2 = pointKey(seg.x2, seg.y2);
    if (!segmentsByPoint.has(k1)) segmentsByPoint.set(k1, []);
    if (!segmentsByPoint.has(k2)) segmentsByPoint.set(k2, []);
    segmentsByPoint.get(k1)!.push(seg);
    segmentsByPoint.get(k2)!.push(seg);
  }
  return segmentsByPoint;
}

/**
 * Extend the path by one unused segment touching its start or end.
 * Marks the consumed segment used. Returns true when the path grew.
 */
function extendPath(
  path: Point[],
  segmentsByPoint: Map<string, LineSegment[]>,
  used: Set<LineSegment>,
  side: 'start' | 'end'
): boolean {
  const tip = side === 'end' ? path[path.length - 1] : path[0];
  const candidates = segmentsByPoint.get(pointKey(tip.x, tip.y)) || [];

  for (const seg of candidates) {
    if (used.has(seg)) continue;

    used.add(seg);
    // Add the other endpoint
    const other =
      seg.x1 === tip.x && seg.y1 === tip.y
        ? { x: seg.x2, y: seg.y2 }
        : { x: seg.x1, y: seg.y1 };
    if (side === 'end') {
      path.push(other);
    } else {
      path.unshift(other);
    }
    return true;
  }

  return false;
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

/**
 * Test whether a canvas point falls inside a shaped selection region:
 * everything inside the bounds for rectangles, the inscribed ellipse for
 * ellipses, and the mask contents for freeform selections.
 */
export function isPointInShape(
  x: number,
  y: number,
  bounds: Rect,
  shape: string,
  mask?: Uint8Array
): boolean {
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
}

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

  const combinedBounds = combineBounds(currentState.bounds, newBounds, operation);
  if (!combinedBounds) return null;

  const combinedMask = fillCombinedMask(currentState, newBounds, newMask, operation, combinedBounds);
  if (!combinedMask) return null;

  return trimMaskToTightBounds(combinedMask, combinedBounds);
}

/**
 * Evaluate the boolean mask operation over the combined bounds.
 * Returns null when no pixel survives the operation.
 */
function fillCombinedMask(
  currentState: MaskSelectionState,
  newBounds: Rect,
  newMask: Uint8Array,
  operation: MaskCombineOperation,
  combinedBounds: Rect
): Uint8Array | null {
  const oldMask = currentState.shape === 'freeform' ? currentState.mask : undefined;
  const combinedMask = new Uint8Array(combinedBounds.width * combinedBounds.height);
  let hasAnyPixel = false;

  for (let y = combinedBounds.y; y < combinedBounds.y + combinedBounds.height; y++) {
    for (let x = combinedBounds.x; x < combinedBounds.x + combinedBounds.width; x++) {
      const oldValue = isPointInShape(x, y, currentState.bounds, currentState.shape, oldMask);
      const newValue = isPointInShape(x, y, newBounds, 'freeform', newMask);

      if (combineValues(oldValue, newValue, operation)) {
        const idx = (y - combinedBounds.y) * combinedBounds.width + (x - combinedBounds.x);
        combinedMask[idx] = 255;
        hasAnyPixel = true;
      }
    }
  }

  return hasAnyPixel ? combinedMask : null;
}

/** Boolean combination of old/new membership for one pixel. */
function combineValues(oldValue: boolean, newValue: boolean, operation: MaskCombineOperation): boolean {
  if (operation === 'add') return oldValue || newValue;
  if (operation === 'intersect') return oldValue && newValue;
  // subtract
  return oldValue && !newValue;
}

/**
 * Combined bounds for a mask operation: union for add, intersection for
 * intersect (null when disjoint), the old bounds for subtract.
 */
function combineBounds(
  oldBounds: Rect,
  newBounds: Rect,
  operation: MaskCombineOperation
): Rect | null {
  if (operation === 'add') {
    const minX = Math.min(oldBounds.x, newBounds.x);
    const minY = Math.min(oldBounds.y, newBounds.y);
    const maxX = Math.max(oldBounds.x + oldBounds.width, newBounds.x + newBounds.width);
    const maxY = Math.max(oldBounds.y + oldBounds.height, newBounds.y + newBounds.height);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  if (operation === 'intersect') {
    const minX = Math.max(oldBounds.x, newBounds.x);
    const minY = Math.max(oldBounds.y, newBounds.y);
    const maxX = Math.min(oldBounds.x + oldBounds.width, newBounds.x + newBounds.width);
    const maxY = Math.min(oldBounds.y + oldBounds.height, newBounds.y + newBounds.height);
    if (minX >= maxX || minY >= maxY) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  // Subtract - use old bounds
  return { ...oldBounds };
}

/**
 * Shrink a mask to the tight bounds of its selected pixels.
 * Returns null when the mask is empty.
 */
export function trimMaskToTightBounds(
  mask: Uint8Array,
  bounds: Rect
): { mask: Uint8Array; bounds: Rect } | null {
  let minX = bounds.width, minY = bounds.height;
  let maxX = -1, maxY = -1;

  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      if (mask[y * bounds.width + x] === 255) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0) return null;

  const tightBounds = {
    x: bounds.x + minX,
    y: bounds.y + minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };

  const tightMask = new Uint8Array(tightBounds.width * tightBounds.height);
  for (let y = 0; y < tightBounds.height; y++) {
    for (let x = 0; x < tightBounds.width; x++) {
      const srcIdx = (minY + y) * bounds.width + (minX + x);
      tightMask[y * tightBounds.width + x] = mask[srcIdx];
    }
  }

  return { mask: tightMask, bounds: tightBounds };
}
