// fallow-ignore-file code-duplication -- faithful port of torcado's CleanEdge
// algorithm; the per-slant-case blocks are intentionally kept structurally
// aligned with the upstream reference implementation.
/**
 * CleanEdge Algorithm Core (by torcado, MIT license)
 *
 * This module contains the core sliceDist algorithm for edge-preserving
 * pixel art scaling. Includes both packed pixel (optimized) and legacy
 * RGBA object implementations.
 */

import type { EdgePriority } from './types';
import {
  TRANSPARENT_PACKED,
  NO_SLICE_PACKED,
  LINE_WIDTH,
} from './types';

// ============================================
// Packed Pixel Utilities
// ============================================

/**
 * Get a packed pixel from a Uint32Array view of image data.
 * Returns TRANSPARENT_PACKED for out-of-bounds coordinates.
 */
export function getPixelPacked(
  data: Uint32Array,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return TRANSPARENT_PACKED;
  }
  return data[y * width + x];
}

/**
 * Extract red component from packed pixel (bits 0-7).
 */
function unpackR(packed: number): number {
  return packed & 0xff;
}

/**
 * Extract green component from packed pixel (bits 8-15).
 */
function unpackG(packed: number): number {
  return (packed >> 8) & 0xff;
}

/**
 * Extract blue component from packed pixel (bits 16-23).
 */
function unpackB(packed: number): number {
  return (packed >> 16) & 0xff;
}

/**
 * Extract alpha component from packed pixel (bits 24-31).
 */
function unpackA(packed: number): number {
  return (packed >> 24) & 0xff;
}

// ============================================
// Color Comparison (Packed)
// ============================================

/**
 * Calculate color distance between two packed pixels.
 * Returns normalized distance (0-2 range for RGBA).
 */
function colorDistancePacked(p1: number, p2: number): number {
  const r1 = unpackR(p1), r2 = unpackR(p2);
  const g1 = unpackG(p1), g2 = unpackG(p2);
  const b1 = unpackB(p1), b2 = unpackB(p2);
  const a1 = unpackA(p1), a2 = unpackA(p2);
  const dr = (r1 - r2) / 255;
  const dg = (g1 - g2) / 255;
  const db = (b1 - b2) / 255;
  const da = (a1 - a2) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
}

/**
 * Check if two packed pixels are similar.
 * Since SIMILAR_THRESHOLD=0, this means exact match.
 * Two transparent pixels are always similar.
 */
function similarPacked(p1: number, p2: number): boolean {
  const a1 = unpackA(p1), a2 = unpackA(p2);
  if (a1 === 0 && a2 === 0) return true;
  return p1 === p2; // Exact match since threshold is 0
}

/**
 * Check if three packed pixels are all similar to each other.
 */
function similar3Packed(p1: number, p2: number, p3: number): boolean {
  return similarPacked(p1, p2) && similarPacked(p2, p3);
}

/**
 * Check if four packed pixels are all similar to each other.
 */
function similar4Packed(p1: number, p2: number, p3: number, p4: number): boolean {
  return similarPacked(p1, p2) && similarPacked(p2, p3) && similarPacked(p3, p4);
}

/**
 * Determine which color has higher priority at an edge.
 * Uses luminance-based comparison: darker colors win by default
 * (preserves outlines which are typically darker than fills).
 */
function higherPacked(
  thisCol: number,
  otherCol: number,
  priority: EdgePriority
): boolean {
  if (similarPacked(thisCol, otherCol)) return false;

  const a1 = unpackA(thisCol), a2 = unpackA(otherCol);
  // More opaque always wins over less opaque
  if (a1 !== a2) return a1 > a2;

  // Compare luminance: 0.299*R + 0.587*G + 0.114*B
  const r1 = unpackR(thisCol), g1 = unpackG(thisCol), b1 = unpackB(thisCol);
  const r2 = unpackR(otherCol), g2 = unpackG(otherCol), b2 = unpackB(otherCol);
  const lum1 = r1 * 0.299 + g1 * 0.587 + b1 * 0.114;
  const lum2 = r2 * 0.299 + g2 * 0.587 + b2 * 0.114;

  // Darker wins by default (outlines dominate fills)
  return priority === 'darker' ? lum1 < lum2 : lum1 > lum2;
}

// ============================================
// Color Comparison (Legacy RGBA)
// ============================================

// ============================================
// Geometry Helpers
// ============================================

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


// ============================================
// Packed Pixel SliceDist
// ============================================

export function sliceDistPacked(
  point: { x: number; y: number },
  mainDir: { x: number; y: number },
  pointDir: { x: number; y: number },
  ub: number, u: number, uf: number, uff: number,
  b: number, c: number, f: number, ff: number,
  db: number, d: number, df: number, dff: number,
  ddb: number, dd: number, ddf: number,
  cleanup: boolean,
  edgePriority: EdgePriority
): number {
  const minWidth = 0.45;
  const maxWidth = 1.142;
  const _lineWidth = Math.max(minWidth, Math.min(maxWidth, LINE_WIDTH));

  const flippedPoint = {
    x: mainDir.x * (point.x - 0.5) + 0.5,
    y: mainDir.y * (point.y - 0.5) + 0.5,
  };

  const distAgainst =
    4.0 * colorDistancePacked(f, d) +
    colorDistancePacked(uf, c) +
    colorDistancePacked(c, db) +
    colorDistancePacked(ff, df) +
    colorDistancePacked(df, dd);

  const distTowards =
    4.0 * colorDistancePacked(c, df) +
    colorDistancePacked(u, f) +
    colorDistancePacked(f, dff) +
    colorDistancePacked(b, d) +
    colorDistancePacked(d, ddf);

  let shouldSlice =
    distAgainst < distTowards ||
    (distAgainst < distTowards + 0.001 && !higherPacked(c, f, edgePriority));

  if (similar4Packed(f, d, b, u) && similar4Packed(uf, df, db, ub) && !similarPacked(c, f)) {
    shouldSlice = false;
  }

  if (!shouldSlice) return NO_SLICE_PACKED;

  let dist: number;
  let flip = false;
  const center = { x: 0.5, y: 0.5 };

  // Lower shallow 2:1 slant
  if (similar3Packed(f, d, db) && !similar3Packed(f, d, b) && !similarPacked(uf, db)) {
    if (!(similarPacked(c, df) && higherPacked(c, f, edgePriority))) {
      if (higherPacked(c, f, edgePriority)) flip = true;
      if (similarPacked(u, f) && !similarPacked(c, df) && !higherPacked(c, u, edgePriority)) flip = true;
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

    if (cleanup && !flip && similarPacked(c, uf) &&
        !(similar3Packed(c, uf, uff) && !similar3Packed(c, uf, ff) && !similarPacked(d, uff))) {
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
      return colorDistancePacked(c, f) <= colorDistancePacked(c, d) ? f : d;
    }
    return NO_SLICE_PACKED;
  }

  // Forward steep 2:1 slant
  if (similar3Packed(uf, f, d) && !similar3Packed(u, f, d) && !similarPacked(uf, db)) {
    if (!(similarPacked(c, df) && higherPacked(c, d, edgePriority))) {
      if (higherPacked(c, d, edgePriority)) flip = true;
      if (similarPacked(b, d) && !similarPacked(c, df) && !higherPacked(c, d, edgePriority)) flip = true;
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

    if (cleanup && !flip && similarPacked(c, db) &&
        !(similar3Packed(c, db, ddb) && !similar3Packed(c, db, dd) && !similarPacked(f, ddb))) {
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
      return colorDistancePacked(c, f) <= colorDistancePacked(c, d) ? f : d;
    }
    return NO_SLICE_PACKED;
  }

  // 45-degree diagonal
  if (similarPacked(f, d)) {
    if (similarPacked(c, df) && higherPacked(c, f, edgePriority)) {
      if (!similarPacked(c, dd) && !similarPacked(c, ff)) {
        flip = true;
      }
    } else {
      if (higherPacked(c, f, edgePriority)) flip = true;
      if (!similarPacked(c, b) && similar4Packed(b, f, d, u)) flip = true;
    }

    if (((similarPacked(f, db) && similar3Packed(u, f, df)) ||
         (similarPacked(uf, d) && similar3Packed(b, d, df))) && !similarPacked(c, df)) {
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

    if (cleanup) {
      if (!flip && similar3Packed(c, uf, uff) && !similar3Packed(c, uf, ff) && !similarPacked(d, uff)) {
        const dist2 = distToLine(
          flippedPoint,
          { x: center.x + 1.5 * pointDir.x, y: center.y + 0.0 * pointDir.y },
          { x: center.x - 0.5 * pointDir.x, y: center.y + 1.0 * pointDir.y },
          pointDir
        );
        dist = Math.max(dist, dist2);
      }
      if (!flip && similar3Packed(ddb, db, c) && !similar3Packed(dd, db, c) && !similarPacked(ddb, f)) {
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
      return colorDistancePacked(c, f) <= colorDistancePacked(c, d) ? f : d;
    }
    return NO_SLICE_PACKED;
  }

  // Far corner of shallow slant
  if (similar3Packed(ff, df, d) && !similar3Packed(ff, df, c) && !similarPacked(uff, d)) {
    if (!(similarPacked(f, dff) && higherPacked(f, ff, edgePriority))) {
      if (higherPacked(f, ff, edgePriority)) flip = true;
      if (similarPacked(uf, ff) && !similarPacked(f, dff) && !higherPacked(f, uf, edgePriority)) flip = true;
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
      return colorDistancePacked(f, ff) <= colorDistancePacked(f, df) ? ff : df;
    }
    return NO_SLICE_PACKED;
  }

  // Far corner of steep slant
  if (similar3Packed(f, df, dd) && !similar3Packed(c, df, dd) && !similarPacked(f, ddb)) {
    if (!(similarPacked(d, ddf) && higherPacked(d, dd, edgePriority))) {
      if (higherPacked(d, dd, edgePriority)) flip = true;
      if (similarPacked(db, dd) && !similarPacked(d, ddf) && !higherPacked(d, dd, edgePriority)) flip = true;
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
      return colorDistancePacked(d, df) <= colorDistancePacked(d, dd) ? df : dd;
    }
    return NO_SLICE_PACKED;
  }

  return NO_SLICE_PACKED;
}

// ============================================
// Pixel Access
// ============================================

