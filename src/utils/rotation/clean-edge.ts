/**
 * CleanEdge Algorithm - Main Entry Point
 *
 * High-quality pixel art rotation using the CleanEdge algorithm
 * by torcado (MIT license). Preserves clean edges during rotation.
 */

import type { RGBA, EdgePriority, CleanEdgeOptions } from './types';
import { NO_SLICE_PACKED } from './types';
import { normalizeAngle } from './angle';
import { rotateNearestNeighbor } from './basic-rotation';
import {
  getPixel,
  getPixelPacked,
  sliceDist,
  sliceDistPacked,
} from './clean-edge-core';

// ============================================
// Legacy RGBA applyCleanEdge
// ============================================

export function applyCleanEdge(
  imageData: ImageData,
  scale: number,
  cleanup: boolean = false
): ImageData {
  const { width: srcWidth, height: srcHeight, data: srcData } = imageData;
  const dstWidth = srcWidth * scale;
  const dstHeight = srcHeight * scale;
  const result = new ImageData(dstWidth, dstHeight);
  const dstData = result.data;

  for (let dstY = 0; dstY < dstHeight; dstY++) {
    for (let dstX = 0; dstX < dstWidth; dstX++) {
      const srcX = Math.floor(dstX / scale);
      const srcY = Math.floor(dstY / scale);

      const localX = ((dstX % scale) + 0.5) / scale;
      const localY = ((dstY % scale) + 0.5) / scale;

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

      let col: RGBA = c;

      const local = { x: localX, y: localY };

      const c_col = sliceDist(
        local, { x: 1, y: 1 }, pointDir,
        ub, u, uf, uff,
        b, c, f, ff,
        db, d, df, dff,
        ddb, dd, ddf,
        cleanup
      );

      const b_col = sliceDist(
        local, { x: -1, y: 1 }, pointDir,
        uf, u, ub, ubb,
        f, c, b, bb,
        df, d, db, dbb,
        ddf, dd, ddb,
        cleanup
      );

      const u_col = sliceDist(
        local, { x: 1, y: -1 }, pointDir,
        db, d, df, dff,
        b, c, f, ff,
        ub, u, uf, uff,
        uub, uu, uuf,
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

// ============================================
// Packed Pixel applyCleanEdge (Performance Optimized)
// ============================================

export function applyCleanEdgePacked(
  imageData: ImageData,
  scale: number,
  cleanup: boolean,
  edgePriority: EdgePriority
): ImageData {
  const { width: srcWidth, height: srcHeight, data: srcData } = imageData;
  const dstWidth = srcWidth * scale;
  const dstHeight = srcHeight * scale;
  const result = new ImageData(dstWidth, dstHeight);
  const dstData = result.data;

  // Create Uint32Array view of source data for packed pixel access
  const srcData32 = new Uint32Array(srcData.buffer);
  // Create Uint32Array view of destination data for packed pixel writing
  const dstData32 = new Uint32Array(dstData.buffer);

  for (let dstY = 0; dstY < dstHeight; dstY++) {
    for (let dstX = 0; dstX < dstWidth; dstX++) {
      const srcX = Math.floor(dstX / scale);
      const srcY = Math.floor(dstY / scale);

      const localX = ((dstX % scale) + 0.5) / scale;
      const localY = ((dstY % scale) + 0.5) / scale;

      // Optimized: use comparison instead of Math.round for -1 or 1 result
      const pointDirX = localX < 0.5 ? -1 : 1;
      const pointDirY = localY < 0.5 ? -1 : 1;
      const pointDir = { x: pointDirX, y: pointDirY };

      // Sample neighborhood using packed pixels (eliminates object allocations)
      const uub = getPixelPacked(srcData32, srcWidth, srcHeight, srcX - pointDirX, srcY - 2 * pointDirY);
      const uu = getPixelPacked(srcData32, srcWidth, srcHeight, srcX, srcY - 2 * pointDirY);
      const uuf = getPixelPacked(srcData32, srcWidth, srcHeight, srcX + pointDirX, srcY - 2 * pointDirY);

      const ubb = getPixelPacked(srcData32, srcWidth, srcHeight, srcX - 2 * pointDirX, srcY - 2 * pointDirY);
      const ub = getPixelPacked(srcData32, srcWidth, srcHeight, srcX - pointDirX, srcY - pointDirY);
      const u = getPixelPacked(srcData32, srcWidth, srcHeight, srcX, srcY - pointDirY);
      const uf = getPixelPacked(srcData32, srcWidth, srcHeight, srcX + pointDirX, srcY - pointDirY);
      const uff = getPixelPacked(srcData32, srcWidth, srcHeight, srcX + 2 * pointDirX, srcY - pointDirY);

      const bb = getPixelPacked(srcData32, srcWidth, srcHeight, srcX - 2 * pointDirX, srcY);
      const b = getPixelPacked(srcData32, srcWidth, srcHeight, srcX - pointDirX, srcY);
      const c = getPixelPacked(srcData32, srcWidth, srcHeight, srcX, srcY);
      const f = getPixelPacked(srcData32, srcWidth, srcHeight, srcX + pointDirX, srcY);
      const ff = getPixelPacked(srcData32, srcWidth, srcHeight, srcX + 2 * pointDirX, srcY);

      const dbb = getPixelPacked(srcData32, srcWidth, srcHeight, srcX - 2 * pointDirX, srcY + pointDirY);
      const db = getPixelPacked(srcData32, srcWidth, srcHeight, srcX - pointDirX, srcY + pointDirY);
      const d = getPixelPacked(srcData32, srcWidth, srcHeight, srcX, srcY + pointDirY);
      const df = getPixelPacked(srcData32, srcWidth, srcHeight, srcX + pointDirX, srcY + pointDirY);
      const dff = getPixelPacked(srcData32, srcWidth, srcHeight, srcX + 2 * pointDirX, srcY + pointDirY);

      const ddb = getPixelPacked(srcData32, srcWidth, srcHeight, srcX - pointDirX, srcY + 2 * pointDirY);
      const dd = getPixelPacked(srcData32, srcWidth, srcHeight, srcX, srcY + 2 * pointDirY);
      const ddf = getPixelPacked(srcData32, srcWidth, srcHeight, srcX + pointDirX, srcY + 2 * pointDirY);

      let col = c;

      const local = { x: localX, y: localY };

      const c_col = sliceDistPacked(
        local, { x: 1, y: 1 }, pointDir,
        ub, u, uf, uff,
        b, c, f, ff,
        db, d, df, dff,
        ddb, dd, ddf,
        cleanup, edgePriority
      );

      const b_col = sliceDistPacked(
        local, { x: -1, y: 1 }, pointDir,
        uf, u, ub, ubb,
        f, c, b, bb,
        df, d, db, dbb,
        ddf, dd, ddb,
        cleanup, edgePriority
      );

      const u_col = sliceDistPacked(
        local, { x: 1, y: -1 }, pointDir,
        db, d, df, dff,
        b, c, f, ff,
        ub, u, uf, uff,
        uub, uu, uuf,
        cleanup, edgePriority
      );

      // Check if any sliceDist returned a valid color (not NO_SLICE_PACKED)
      if (c_col !== NO_SLICE_PACKED) col = c_col;
      if (b_col !== NO_SLICE_PACKED) col = b_col;
      if (u_col !== NO_SLICE_PACKED) col = u_col;

      // Write packed pixel directly to destination
      dstData32[dstY * dstWidth + dstX] = col;
    }
  }

  return result;
}

// ============================================
// Downscaling
// ============================================

export function downscaleAreaAverage(imageData: ImageData, factor: number): ImageData {
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

// ============================================
// Main Entry Point
// ============================================

/**
 * Rotate using CleanEdge algorithm (high quality for pixel art).
 * Uses packed pixel representation for performance optimization.
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
  const {
    cleanup = false,
    quality = 'final',
    edgePriority = 'darker',
  } = options;

  const normalized = normalizeAngle(angleDegrees);
  if (normalized === 0) {
    const copy = new ImageData(imageData.width, imageData.height);
    copy.data.set(imageData.data);
    return copy;
  }

  // Use 2x scale for draft (live preview), 4x for final (commit)
  const scale = quality === 'draft' ? 2 : 4;

  // Step 1: Apply CleanEdge upscaling using packed pixels (preserves edges)
  const upscaled = applyCleanEdgePacked(imageData, scale, cleanup, edgePriority);

  // Step 2: Rotate the upscaled image with nearest-neighbor
  const rotated = rotateNearestNeighbor(upscaled, angleDegrees);

  // Step 3: Downscale with area averaging back to original scale
  const result = downscaleAreaAverage(rotated, scale);

  return result;
}
