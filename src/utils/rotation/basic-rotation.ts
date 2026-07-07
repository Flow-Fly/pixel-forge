/**
 * Basic rotation algorithms.
 *
 * Includes nearest-neighbor interpolation, 90-degree increments,
 * and mask rotation utilities.
 */


import { degreesToRadians } from './angle';
import { getRotatedBounds } from './bounds';

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

// ============================================
// Special Rotations (90 degree increments)
// ============================================

