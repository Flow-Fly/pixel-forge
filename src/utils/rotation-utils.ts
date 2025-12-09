import { type Rect } from '../types/geometry';

/**
 * Rotation utilities for selection transforms.
 */

// ============================================
// Angle Helpers
// ============================================

/**
 * Convert degrees to radians.
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convert radians to degrees.
 */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Normalize angle to 0-360 range.
 */
export function normalizeAngle(degrees: number): number {
  let normalized = degrees % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

/**
 * Snap angle to nearest increment (e.g., 15 degrees).
 */
export function snapAngle(degrees: number, increment: number): number {
  return Math.round(degrees / increment) * increment;
}

/**
 * Calculate angle in degrees from center to point.
 */
export function angleFromCenter(
  cx: number,
  cy: number,
  px: number,
  py: number
): number {
  const radians = Math.atan2(py - cy, px - cx);
  return normalizeAngle(radiansToDegrees(radians));
}

// ============================================
// Bounds Calculation
// ============================================

/**
 * Calculate the bounding box of a rotated rectangle.
 * Returns the new bounds that fully contain the rotated content.
 */
export function getRotatedBounds(
  width: number,
  height: number,
  angleDegrees: number
): { width: number; height: number } {
  const radians = degreesToRadians(angleDegrees);
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  // New dimensions after rotation
  const newWidth = Math.ceil(width * cos + height * sin);
  const newHeight = Math.ceil(width * sin + height * cos);

  return { width: newWidth, height: newHeight };
}

/**
 * Calculate full rotated bounds including position offset.
 */
export function calculateRotatedBounds(
  bounds: Rect,
  angleDegrees: number
): Rect {
  const { width: newWidth, height: newHeight } = getRotatedBounds(
    bounds.width,
    bounds.height,
    angleDegrees
  );

  // Center of original bounds
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;

  // New bounds centered on same point
  return {
    x: Math.floor(cx - newWidth / 2),
    y: Math.floor(cy - newHeight / 2),
    width: newWidth,
    height: newHeight,
  };
}

// ============================================
// Nearest-Neighbor Rotation
// ============================================

/**
 * Rotate ImageData using nearest-neighbor interpolation.
 * This is fast and preserves hard pixel edges.
 */
export function rotateNearestNeighbor(
  imageData: ImageData,
  angleDegrees: number
): ImageData {
  const { width: srcWidth, height: srcHeight, data: srcData } = imageData;

  // Handle special cases (no rotation or 0 degrees)
  if (angleDegrees === 0 || angleDegrees === 360) {
    // Return a copy
    const copy = new ImageData(srcWidth, srcHeight);
    copy.data.set(srcData);
    return copy;
  }

  // Calculate new dimensions
  const { width: dstWidth, height: dstHeight } = getRotatedBounds(
    srcWidth,
    srcHeight,
    angleDegrees
  );

  const result = new ImageData(dstWidth, dstHeight);
  const dstData = result.data;

  // Centers
  const srcCx = srcWidth / 2;
  const srcCy = srcHeight / 2;
  const dstCx = dstWidth / 2;
  const dstCy = dstHeight / 2;

  // Inverse rotation (we map destination to source)
  const radians = degreesToRadians(-angleDegrees);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  // For each pixel in destination, find corresponding source pixel
  for (let dstY = 0; dstY < dstHeight; dstY++) {
    for (let dstX = 0; dstX < dstWidth; dstX++) {
      // Offset from destination center
      const dx = dstX - dstCx;
      const dy = dstY - dstCy;

      // Rotate back to source coordinates
      const srcX = Math.round(dx * cos - dy * sin + srcCx);
      const srcY = Math.round(dx * sin + dy * cos + srcCy);

      // Check bounds
      if (srcX >= 0 && srcX < srcWidth && srcY >= 0 && srcY < srcHeight) {
        const srcIdx = (srcY * srcWidth + srcX) * 4;
        const dstIdx = (dstY * dstWidth + dstX) * 4;

        dstData[dstIdx] = srcData[srcIdx];
        dstData[dstIdx + 1] = srcData[srcIdx + 1];
        dstData[dstIdx + 2] = srcData[srcIdx + 2];
        dstData[dstIdx + 3] = srcData[srcIdx + 3];
      }
      // Pixels outside source bounds remain transparent (default 0,0,0,0)
    }
  }

  return result;
}

// ============================================
// Mask Rotation
// ============================================

/**
 * Rotate a selection mask using nearest-neighbor.
 * Masks are Uint8Array where 255 = selected, 0 = not selected.
 */
export function rotateMask(
  mask: Uint8Array,
  bounds: Rect,
  angleDegrees: number
): { mask: Uint8Array; bounds: Rect } {
  // Handle no rotation
  if (angleDegrees === 0 || angleDegrees === 360) {
    return {
      mask: new Uint8Array(mask),
      bounds: { ...bounds },
    };
  }

  // Convert mask to ImageData (store in alpha channel)
  const srcImageData = new ImageData(bounds.width, bounds.height);
  for (let i = 0; i < mask.length; i++) {
    // Set alpha channel to mask value
    srcImageData.data[i * 4 + 3] = mask[i];
  }

  // Rotate using nearest-neighbor
  const rotatedImageData = rotateNearestNeighbor(srcImageData, angleDegrees);

  // Extract mask from rotated alpha channel
  const newMask = new Uint8Array(rotatedImageData.width * rotatedImageData.height);
  for (let i = 0; i < newMask.length; i++) {
    // Threshold at 127 to handle any interpolation artifacts
    newMask[i] = rotatedImageData.data[i * 4 + 3] > 127 ? 255 : 0;
  }

  // Calculate new bounds
  const newBounds = calculateRotatedBounds(bounds, angleDegrees);
  newBounds.width = rotatedImageData.width;
  newBounds.height = rotatedImageData.height;

  return { mask: newMask, bounds: newBounds };
}

// ============================================
// Special Rotations (90 degree increments)
// ============================================

/**
 * Check if angle is a 90-degree increment (0, 90, 180, 270).
 * These can be done without interpolation artifacts.
 */
export function is90DegreeRotation(angleDegrees: number): boolean {
  const normalized = normalizeAngle(angleDegrees);
  return normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270;
}

/**
 * Rotate ImageData by exactly 90 degrees clockwise.
 * No interpolation needed - pixel perfect.
 */
export function rotate90CW(imageData: ImageData): ImageData {
  const { width: srcWidth, height: srcHeight, data: srcData } = imageData;
  const result = new ImageData(srcHeight, srcWidth); // Swapped dimensions
  const dstData = result.data;

  for (let srcY = 0; srcY < srcHeight; srcY++) {
    for (let srcX = 0; srcX < srcWidth; srcX++) {
      const dstX = srcHeight - 1 - srcY;
      const dstY = srcX;

      const srcIdx = (srcY * srcWidth + srcX) * 4;
      const dstIdx = (dstY * srcHeight + dstX) * 4;

      dstData[dstIdx] = srcData[srcIdx];
      dstData[dstIdx + 1] = srcData[srcIdx + 1];
      dstData[dstIdx + 2] = srcData[srcIdx + 2];
      dstData[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }

  return result;
}

/**
 * Rotate ImageData by exactly 180 degrees.
 */
export function rotate180(imageData: ImageData): ImageData {
  const { width, height, data: srcData } = imageData;
  const result = new ImageData(width, height);
  const dstData = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = ((height - 1 - y) * width + (width - 1 - x)) * 4;

      dstData[dstIdx] = srcData[srcIdx];
      dstData[dstIdx + 1] = srcData[srcIdx + 1];
      dstData[dstIdx + 2] = srcData[srcIdx + 2];
      dstData[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }

  return result;
}

/**
 * Rotate ImageData by exactly 90 degrees counter-clockwise (270 CW).
 */
export function rotate90CCW(imageData: ImageData): ImageData {
  const { width: srcWidth, height: srcHeight, data: srcData } = imageData;
  const result = new ImageData(srcHeight, srcWidth); // Swapped dimensions
  const dstData = result.data;

  for (let srcY = 0; srcY < srcHeight; srcY++) {
    for (let srcX = 0; srcX < srcWidth; srcX++) {
      const dstX = srcY;
      const dstY = srcWidth - 1 - srcX;

      const srcIdx = (srcY * srcWidth + srcX) * 4;
      const dstIdx = (dstY * srcHeight + dstX) * 4;

      dstData[dstIdx] = srcData[srcIdx];
      dstData[dstIdx + 1] = srcData[srcIdx + 1];
      dstData[dstIdx + 2] = srcData[srcIdx + 2];
      dstData[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }

  return result;
}

/**
 * Rotate by a 90-degree increment. Returns null if not a 90-degree angle.
 */
export function rotateBy90Increment(
  imageData: ImageData,
  angleDegrees: number
): ImageData | null {
  const normalized = normalizeAngle(angleDegrees);

  switch (normalized) {
    case 0:
    case 360: {
      const copy = new ImageData(imageData.width, imageData.height);
      copy.data.set(imageData.data);
      return copy;
    }
    case 90:
      return rotate90CW(imageData);
    case 180:
      return rotate180(imageData);
    case 270:
      return rotate90CCW(imageData);
    default:
      return null;
  }
}

// ============================================
// CleanEdge Algorithm (by torcado, MIT license)
// ============================================

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };
const NO_SLICE: RGBA = { r: -1, g: -1, b: -1, a: -1 };

// Configuration
const SIMILAR_THRESHOLD = 0.0;
const LINE_WIDTH = 1.0;
const HIGHEST_COLOR = { r: 1, g: 1, b: 1 };

function colorDistance(c1: RGBA, c2: RGBA): number {
  const dr = (c1.r - c2.r) / 255;
  const dg = (c1.g - c2.g) / 255;
  const db = (c1.b - c2.b) / 255;
  const da = (c1.a - c2.a) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
}

function similar(c1: RGBA, c2: RGBA): boolean {
  if (c1.a === 0 && c2.a === 0) return true;
  return colorDistance(c1, c2) <= SIMILAR_THRESHOLD;
}

function similar3(c1: RGBA, c2: RGBA, c3: RGBA): boolean {
  return similar(c1, c2) && similar(c2, c3);
}

function similar4(c1: RGBA, c2: RGBA, c3: RGBA, c4: RGBA): boolean {
  return similar(c1, c2) && similar(c2, c3) && similar(c3, c4);
}

function higher(thisCol: RGBA, otherCol: RGBA): boolean {
  if (similar(thisCol, otherCol)) return false;
  if (thisCol.a === otherCol.a) {
    const distThis = Math.sqrt(
      Math.pow((thisCol.r / 255) - HIGHEST_COLOR.r, 2) +
      Math.pow((thisCol.g / 255) - HIGHEST_COLOR.g, 2) +
      Math.pow((thisCol.b / 255) - HIGHEST_COLOR.b, 2)
    );
    const distOther = Math.sqrt(
      Math.pow((otherCol.r / 255) - HIGHEST_COLOR.r, 2) +
      Math.pow((otherCol.g / 255) - HIGHEST_COLOR.g, 2) +
      Math.pow((otherCol.b / 255) - HIGHEST_COLOR.b, 2)
    );
    return distThis < distOther;
  }
  return thisCol.a > otherCol.a;
}

function distToLine(
  testPt: { x: number; y: number },
  pt1: { x: number; y: number },
  pt2: { x: number; y: number },
  dir: { x: number; y: number }
): number {
  const lineDirX = pt2.x - pt1.x;
  const lineDirY = pt2.y - pt1.y;
  const perpDirX = lineDirY;
  const perpDirY = -lineDirX;
  const dirToPt1X = pt1.x - testPt.x;
  const dirToPt1Y = pt1.y - testPt.y;

  const dotPerpDir = perpDirX * dir.x + perpDirY * dir.y;
  const sign = dotPerpDir > 0 ? 1 : -1;

  const perpLen = Math.sqrt(perpDirX * perpDirX + perpDirY * perpDirY);
  if (perpLen === 0) return 0;

  const normalizedPerpX = perpDirX / perpLen;
  const normalizedPerpY = perpDirY / perpLen;
  const dotResult = normalizedPerpX * dirToPt1X + normalizedPerpY * dirToPt1Y;

  return sign * dotResult;
}

function sliceDist(
  point: { x: number; y: number },
  mainDir: { x: number; y: number },
  pointDir: { x: number; y: number },
  ub: RGBA, u: RGBA, uf: RGBA, uff: RGBA,
  b: RGBA, c: RGBA, f: RGBA, ff: RGBA,
  db: RGBA, d: RGBA, df: RGBA, dff: RGBA,
  ddb: RGBA, dd: RGBA, ddf: RGBA,
  cleanup: boolean = false
): RGBA {
  const minWidth = 0.45;
  const maxWidth = 1.142;
  const _lineWidth = Math.max(minWidth, Math.min(maxWidth, LINE_WIDTH));

  const flippedPoint = {
    x: mainDir.x * (point.x - 0.5) + 0.5,
    y: mainDir.y * (point.y - 0.5) + 0.5,
  };

  const distAgainst =
    4.0 * colorDistance(f, d) +
    colorDistance(uf, c) +
    colorDistance(c, db) +
    colorDistance(ff, df) +
    colorDistance(df, dd);

  const distTowards =
    4.0 * colorDistance(c, df) +
    colorDistance(u, f) +
    colorDistance(f, dff) +
    colorDistance(b, d) +
    colorDistance(d, ddf);

  let shouldSlice = distAgainst < distTowards ||
    (distAgainst < distTowards + 0.001 && !higher(c, f));

  if (similar4(f, d, b, u) && similar4(uf, df, db, ub) && !similar(c, f)) {
    shouldSlice = false;
  }

  if (!shouldSlice) return NO_SLICE;

  let dist = 1.0;
  let flip = false;
  const center = { x: 0.5, y: 0.5 };

  // Lower shallow 2:1 slant
  if (similar3(f, d, db) && !similar3(f, d, b) && !similar(uf, db)) {
    if (!(similar(c, df) && higher(c, f))) {
      if (higher(c, f)) flip = true;
      if (similar(u, f) && !similar(c, df) && !higher(c, u)) flip = true;
    }

    if (flip) {
      dist = _lineWidth - distToLine(
        flippedPoint,
        { x: center.x + 1.5 * pointDir.x, y: center.y - 1.0 * pointDir.y },
        { x: center.x - 0.5 * pointDir.x, y: center.y + 0.0 * pointDir.y },
        { x: -pointDir.x, y: -pointDir.y }
      );
    } else {
      dist = distToLine(
        flippedPoint,
        { x: center.x + 1.5 * pointDir.x, y: center.y + 0.0 * pointDir.y },
        { x: center.x - 0.5 * pointDir.x, y: center.y + 1.0 * pointDir.y },
        pointDir
      );
    }

    // Cleanup slant transitions (shallow)
    if (cleanup && !flip && similar(c, uf) &&
        !(similar3(c, uf, uff) && !similar3(c, uf, ff) && !similar(d, uff))) {
      const dist2 = distToLine(
        flippedPoint,
        { x: center.x + 2.0 * pointDir.x, y: center.y - 1.0 * pointDir.y },
        { x: center.x + 0.0 * pointDir.x, y: center.y + 1.0 * pointDir.y },
        pointDir
      );
      dist = Math.min(dist, dist2);
    }

    dist -= _lineWidth / 2.0;
    if (dist <= 0) {
      return colorDistance(c, f) <= colorDistance(c, d) ? f : d;
    }
    return NO_SLICE;
  }

  // Forward steep 2:1 slant
  if (similar3(uf, f, d) && !similar3(u, f, d) && !similar(uf, db)) {
    if (!(similar(c, df) && higher(c, d))) {
      if (higher(c, d)) flip = true;
      if (similar(b, d) && !similar(c, df) && !higher(c, d)) flip = true;
    }

    if (flip) {
      dist = _lineWidth - distToLine(
        flippedPoint,
        { x: center.x + 0.0 * pointDir.x, y: center.y - 0.5 * pointDir.y },
        { x: center.x - 1.0 * pointDir.x, y: center.y + 1.5 * pointDir.y },
        { x: -pointDir.x, y: -pointDir.y }
      );
    } else {
      dist = distToLine(
        flippedPoint,
        { x: center.x + 1.0 * pointDir.x, y: center.y - 0.5 * pointDir.y },
        { x: center.x + 0.0 * pointDir.x, y: center.y + 1.5 * pointDir.y },
        pointDir
      );
    }

    // Cleanup slant transitions (steep)
    if (cleanup && !flip && similar(c, db) &&
        !(similar3(c, db, ddb) && !similar3(c, db, dd) && !similar(f, ddb))) {
      const dist2 = distToLine(
        flippedPoint,
        { x: center.x + 1.0 * pointDir.x, y: center.y + 0.0 * pointDir.y },
        { x: center.x - 1.0 * pointDir.x, y: center.y + 2.0 * pointDir.y },
        pointDir
      );
      dist = Math.min(dist, dist2);
    }

    dist -= _lineWidth / 2.0;
    if (dist <= 0) {
      return colorDistance(c, f) <= colorDistance(c, d) ? f : d;
    }
    return NO_SLICE;
  }

  // 45-degree diagonal
  if (similar(f, d)) {
    if (similar(c, df) && higher(c, f)) {
      if (!similar(c, dd) && !similar(c, ff)) {
        flip = true;
      }
    } else {
      if (higher(c, f)) flip = true;
      if (!similar(c, b) && similar4(b, f, d, u)) flip = true;
    }

    if (((similar(f, db) && similar3(u, f, df)) ||
         (similar(uf, d) && similar3(b, d, df))) && !similar(c, df)) {
      flip = true;
    }

    if (flip) {
      dist = _lineWidth - distToLine(
        flippedPoint,
        { x: center.x + 1.0 * pointDir.x, y: center.y - 1.0 * pointDir.y },
        { x: center.x - 1.0 * pointDir.x, y: center.y + 1.0 * pointDir.y },
        { x: -pointDir.x, y: -pointDir.y }
      );
    } else {
      dist = distToLine(
        flippedPoint,
        { x: center.x + 1.0 * pointDir.x, y: center.y + 0.0 * pointDir.y },
        { x: center.x + 0.0 * pointDir.x, y: center.y + 1.0 * pointDir.y },
        pointDir
      );
    }

    // Cleanup slant transitions for 45-degree diagonal
    if (cleanup) {
      // Shallow cleanup
      if (!flip && similar3(c, uf, uff) && !similar3(c, uf, ff) && !similar(d, uff)) {
        const dist2 = distToLine(
          flippedPoint,
          { x: center.x + 1.5 * pointDir.x, y: center.y + 0.0 * pointDir.y },
          { x: center.x - 0.5 * pointDir.x, y: center.y + 1.0 * pointDir.y },
          pointDir
        );
        dist = Math.max(dist, dist2);
      }

      // Steep cleanup
      if (!flip && similar3(ddb, db, c) && !similar3(dd, db, c) && !similar(ddb, f)) {
        const dist2 = distToLine(
          flippedPoint,
          { x: center.x + 1.0 * pointDir.x, y: center.y - 0.5 * pointDir.y },
          { x: center.x + 0.0 * pointDir.x, y: center.y + 1.5 * pointDir.y },
          pointDir
        );
        dist = Math.max(dist, dist2);
      }
    }

    dist -= _lineWidth / 2.0;
    if (dist <= 0) {
      return colorDistance(c, f) <= colorDistance(c, d) ? f : d;
    }
    return NO_SLICE;
  }

  // Far corner of shallow slant
  if (similar3(ff, df, d) && !similar3(ff, df, c) && !similar(uff, d)) {
    if (!(similar(f, dff) && higher(f, ff))) {
      if (higher(f, ff)) flip = true;
      if (similar(uf, ff) && !similar(f, dff) && !higher(f, uf)) flip = true;
    }

    if (flip) {
      dist = _lineWidth - distToLine(
        flippedPoint,
        { x: center.x + 2.5 * pointDir.x, y: center.y - 1.0 * pointDir.y },
        { x: center.x + 0.5 * pointDir.x, y: center.y + 0.0 * pointDir.y },
        { x: -pointDir.x, y: -pointDir.y }
      );
    } else {
      dist = distToLine(
        flippedPoint,
        { x: center.x + 2.5 * pointDir.x, y: center.y + 0.0 * pointDir.y },
        { x: center.x + 0.5 * pointDir.x, y: center.y + 1.0 * pointDir.y },
        pointDir
      );
    }

    dist -= _lineWidth / 2.0;
    if (dist <= 0) {
      return colorDistance(f, ff) <= colorDistance(f, df) ? ff : df;
    }
    return NO_SLICE;
  }

  // Far corner of steep slant
  if (similar3(f, df, dd) && !similar3(c, df, dd) && !similar(f, ddb)) {
    if (!(similar(d, ddf) && higher(d, dd))) {
      if (higher(d, dd)) flip = true;
      if (similar(db, dd) && !similar(d, ddf) && !higher(d, dd)) flip = true;
    }

    if (flip) {
      dist = _lineWidth - distToLine(
        flippedPoint,
        { x: center.x + 0.0 * pointDir.x, y: center.y + 0.5 * pointDir.y },
        { x: center.x - 1.0 * pointDir.x, y: center.y + 2.5 * pointDir.y },
        { x: -pointDir.x, y: -pointDir.y }
      );
    } else {
      dist = distToLine(
        flippedPoint,
        { x: center.x + 1.0 * pointDir.x, y: center.y + 0.5 * pointDir.y },
        { x: center.x + 0.0 * pointDir.x, y: center.y + 2.5 * pointDir.y },
        pointDir
      );
    }

    dist -= _lineWidth / 2.0;
    if (dist <= 0) {
      return colorDistance(d, df) <= colorDistance(d, dd) ? df : dd;
    }
    return NO_SLICE;
  }

  return NO_SLICE;
}

function getPixel(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): RGBA {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return TRANSPARENT;
  }
  const idx = (y * width + x) * 4;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
    a: data[idx + 3],
  };
}

function applyCleanEdge(imageData: ImageData, scale: number, cleanup: boolean = false): ImageData {
  const { width: srcWidth, height: srcHeight, data: srcData } = imageData;
  const dstWidth = srcWidth * scale;
  const dstHeight = srcHeight * scale;
  const result = new ImageData(dstWidth, dstHeight);
  const dstData = result.data;

  for (let dstY = 0; dstY < dstHeight; dstY++) {
    for (let dstX = 0; dstX < dstWidth; dstX++) {
      const srcX = Math.floor(dstX / scale);
      const srcY = Math.floor(dstY / scale);

      const localX = (dstX % scale + 0.5) / scale;
      const localY = (dstY % scale + 0.5) / scale;

      const pointDirX = Math.round(localX) * 2 - 1;
      const pointDirY = Math.round(localY) * 2 - 1;
      const pointDir = { x: pointDirX, y: pointDirY };

      const uub = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(-1 * pointDirX), srcY + Math.round(-2 * pointDirY));
      const uu = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(0 * pointDirX), srcY + Math.round(-2 * pointDirY));
      const uuf = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(1 * pointDirX), srcY + Math.round(-2 * pointDirY));

      const ubb = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(-2 * pointDirX), srcY + Math.round(-2 * pointDirY));
      const ub = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(-1 * pointDirX), srcY + Math.round(-1 * pointDirY));
      const u = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(0 * pointDirX), srcY + Math.round(-1 * pointDirY));
      const uf = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(1 * pointDirX), srcY + Math.round(-1 * pointDirY));
      const uff = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(2 * pointDirX), srcY + Math.round(-1 * pointDirY));

      const bb = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(-2 * pointDirX), srcY + Math.round(0 * pointDirY));
      const b = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(-1 * pointDirX), srcY + Math.round(0 * pointDirY));
      const c = getPixel(srcData, srcWidth, srcHeight, srcX, srcY);
      const f = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(1 * pointDirX), srcY + Math.round(0 * pointDirY));
      const ff = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(2 * pointDirX), srcY + Math.round(0 * pointDirY));

      const dbb = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(-2 * pointDirX), srcY + Math.round(1 * pointDirY));
      const db = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(-1 * pointDirX), srcY + Math.round(1 * pointDirY));
      const d = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(0 * pointDirX), srcY + Math.round(1 * pointDirY));
      const df = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(1 * pointDirX), srcY + Math.round(1 * pointDirY));
      const dff = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(2 * pointDirX), srcY + Math.round(1 * pointDirY));

      const ddb = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(-1 * pointDirX), srcY + Math.round(2 * pointDirY));
      const dd = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(0 * pointDirX), srcY + Math.round(2 * pointDirY));
      const ddf = getPixel(srcData, srcWidth, srcHeight, srcX + Math.round(1 * pointDirX), srcY + Math.round(2 * pointDirY));

      let col = c;

      const local = { x: localX, y: localY };

      const c_col = sliceDist(
        local, { x: 1, y: 1 }, pointDir,
        ub, u, uf, uff, b, c, f, ff, db, d, df, dff, ddb, dd, ddf,
        cleanup
      );

      const b_col = sliceDist(
        local, { x: -1, y: 1 }, pointDir,
        uf, u, ub, ubb, f, c, b, bb, df, d, db, dbb, ddf, dd, ddb,
        cleanup
      );

      const u_col = sliceDist(
        local, { x: 1, y: -1 }, pointDir,
        db, d, df, dff, b, c, f, ff, ub, u, uf, uff, uub, uu, uuf,
        cleanup
      );

      if (c_col.r >= 0) col = c_col;
      if (b_col.r >= 0) col = b_col;
      if (u_col.r >= 0) col = u_col;

      const dstIdx = (dstY * dstWidth + dstX) * 4;
      dstData[dstIdx] = col.r;
      dstData[dstIdx + 1] = col.g;
      dstData[dstIdx + 2] = col.b;
      dstData[dstIdx + 3] = col.a;
    }
  }

  return result;
}

function downscaleAreaAverage(imageData: ImageData, factor: number): ImageData {
  const { width, height, data } = imageData;
  const newWidth = Math.floor(width / factor);
  const newHeight = Math.floor(height / factor);
  const result = new ImageData(newWidth, newHeight);
  const resultData = result.data;

  const factorSq = factor * factor;

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      let r = 0, g = 0, b = 0;
      let opaqueCount = 0;

      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const srcX = x * factor + sx;
          const srcY = y * factor + sy;

          if (srcX < width && srcY < height) {
            const srcIdx = (srcY * width + srcX) * 4;
            const a = data[srcIdx + 3];

            if (a > 0) {
              r += data[srcIdx];
              g += data[srcIdx + 1];
              b += data[srcIdx + 2];
              opaqueCount++;
            }
          }
        }
      }

      const dstIdx = (y * newWidth + x) * 4;

      if (opaqueCount > 0) {
        resultData[dstIdx] = Math.round(r / opaqueCount);
        resultData[dstIdx + 1] = Math.round(g / opaqueCount);
        resultData[dstIdx + 2] = Math.round(b / opaqueCount);
        resultData[dstIdx + 3] = opaqueCount >= factorSq / 2 ? 255 : 0;
      } else {
        resultData[dstIdx] = 0;
        resultData[dstIdx + 1] = 0;
        resultData[dstIdx + 2] = 0;
        resultData[dstIdx + 3] = 0;
      }
    }
  }

  return result;
}

/**
 * Options for CleanEdge rotation.
 */
export interface CleanEdgeOptions {
  /**
   * Enable cleanup transitions for smoother slope handling.
   * Has negligible effect for rotation but improves quality for upscaling.
   * Default: false (disabled for speed)
   */
  cleanup?: boolean;
}

/**
 * Rotate using CleanEdge algorithm (high quality for pixel art).
 * Synchronous version for live preview.
 *
 * @param imageData - Source image to rotate
 * @param angleDegrees - Rotation angle in degrees
 * @param options - Optional configuration for CleanEdge algorithm
 * @returns Rotated ImageData with clean edges
 */
export function rotateCleanEdge(
  imageData: ImageData,
  angleDegrees: number,
  options: CleanEdgeOptions = {}
): ImageData {
  const { cleanup = false } = options;

  const normalized = normalizeAngle(angleDegrees);
  if (normalized === 0) {
    const copy = new ImageData(imageData.width, imageData.height);
    copy.data.set(imageData.data);
    return copy;
  }

  const scale = 4;

  // Step 1: Rotate with nearest-neighbor
  const rotated = rotateNearestNeighbor(imageData, angleDegrees);

  // Step 2: Apply CleanEdge at 4x scale
  const smoothed = applyCleanEdge(rotated, scale, cleanup);

  // Step 3: Downscale with area averaging
  const result = downscaleAreaAverage(smoothed, scale);

  return result;
}
