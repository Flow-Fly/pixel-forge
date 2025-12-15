/**
 * Basic rotation algorithms.
 *
 * Includes nearest-neighbor interpolation, 90-degree increments,
 * and mask rotation utilities.
 */

import type { Rect } from './types';
import { degreesToRadians, normalizeAngle } from './angle';
import { getRotatedBounds, calculateRotatedBounds } from './bounds';

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
  const newMask = new Uint8Array(
    rotatedImageData.width * rotatedImageData.height
  );
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
  return (
    normalized === 0 ||
    normalized === 90 ||
    normalized === 180 ||
    normalized === 270
  );
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
