/**
 * Scaling Utilities for Pixel Art
 *
 * Provides both nearest-neighbor (fast) and CleanEdge (high-quality) scaling.
 * CleanEdge preserves pixel art edges while producing smoother results.
 */

import type { Rect } from '../types/geometry';
import { applyCleanEdgePacked, downscaleAreaAverage } from './rotation/clean-edge';

/**
 * Scale ImageData using nearest-neighbor interpolation.
 * Preserves hard pixel edges - ideal for pixel art.
 *
 * @param imageData - Source image data to scale
 * @param scaleX - Horizontal scale factor (1.0 = original, 2.0 = double width)
 * @param scaleY - Vertical scale factor (1.0 = original, 2.0 = double height)
 * @returns New ImageData with scaled pixels
 */
export function scaleNearestNeighbor(
  imageData: ImageData,
  scaleX: number,
  scaleY: number
): ImageData {
  const { width: srcWidth, height: srcHeight, data: srcData } = imageData;

  // Ensure minimum size of 1x1
  const dstWidth = Math.max(1, Math.round(srcWidth * scaleX));
  const dstHeight = Math.max(1, Math.round(srcHeight * scaleY));

  // If no change, return copy
  if (dstWidth === srcWidth && dstHeight === srcHeight) {
    const result = new ImageData(srcWidth, srcHeight);
    result.data.set(srcData);
    return result;
  }

  const result = new ImageData(dstWidth, dstHeight);
  const dstData = result.data;

  // Inverse scale factors for mapping destination to source
  const invScaleX = srcWidth / dstWidth;
  const invScaleY = srcHeight / dstHeight;

  for (let dstY = 0; dstY < dstHeight; dstY++) {
    // Map destination Y to source Y (nearest neighbor)
    const srcY = Math.min(Math.floor(dstY * invScaleY), srcHeight - 1);

    for (let dstX = 0; dstX < dstWidth; dstX++) {
      // Map destination X to source X (nearest neighbor)
      const srcX = Math.min(Math.floor(dstX * invScaleX), srcWidth - 1);

      const srcIdx = (srcY * srcWidth + srcX) * 4;
      const dstIdx = (dstY * dstWidth + dstX) * 4;

      // Copy RGBA values
      dstData[dstIdx] = srcData[srcIdx];
      dstData[dstIdx + 1] = srcData[srcIdx + 1];
      dstData[dstIdx + 2] = srcData[srcIdx + 2];
      dstData[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }

  return result;
}

/**
 * Scale ImageData using the CleanEdge algorithm for high-quality pixel art scaling.
 *
 * This produces smoother results than nearest-neighbor while preserving
 * the pixel art aesthetic. Best used for final output, not live preview.
 *
 * @param imageData - Source image data to scale
 * @param scaleX - Horizontal scale factor (1.0 = original)
 * @param scaleY - Vertical scale factor (1.0 = original)
 * @returns New ImageData with scaled pixels using CleanEdge algorithm
 */
export function scaleCleanEdge(
  imageData: ImageData,
  scaleX: number,
  scaleY: number
): ImageData {
  const { width: srcWidth, height: srcHeight, data: srcData } = imageData;

  // Ensure minimum size of 1x1
  const dstWidth = Math.max(1, Math.round(srcWidth * scaleX));
  const dstHeight = Math.max(1, Math.round(srcHeight * scaleY));

  // If no change, return copy
  if (dstWidth === srcWidth && dstHeight === srcHeight) {
    const result = new ImageData(srcWidth, srcHeight);
    result.data.set(srcData);
    return result;
  }

  // For uniform scaling (or close to uniform), use CleanEdge
  const isUniformScale = Math.abs(scaleX - scaleY) < 0.01;
  const avgScale = (scaleX + scaleY) / 2;

  // Determine if we're upscaling or downscaling
  const isUpscaling = avgScale > 1;

  if (isUpscaling) {
    // For upscaling, use CleanEdge algorithm
    // CleanEdge works with integer scales, so we upscale to a larger integer
    // then downscale to the exact target size

    if (isUniformScale) {
      // Uniform scaling - use CleanEdge directly
      const intScale = Math.ceil(avgScale);

      // Step 1: Upscale with CleanEdge to integer scale
      const upscaled = applyCleanEdgePacked(imageData, intScale, false, 'darker');

      // Step 2: If we need to adjust to non-integer scale, downscale
      if (intScale === Math.round(avgScale)) {
        // Integer scale - return directly
        return upscaled;
      } else {
        // Non-integer scale - downscale to exact target
        return downscaleToSize(upscaled, dstWidth, dstHeight);
      }
    } else {
      // Non-uniform scaling - handle X and Y separately
      // Use CleanEdge for the larger dimension, nearest-neighbor adjustment for the other
      const maxScale = Math.max(scaleX, scaleY);
      const intScale = Math.ceil(maxScale);

      // Upscale uniformly with CleanEdge
      const upscaled = applyCleanEdgePacked(imageData, intScale, false, 'darker');

      // Then resize to exact target dimensions
      return downscaleToSize(upscaled, dstWidth, dstHeight);
    }
  } else {
    // For downscaling, use area averaging (produces better results than nearest-neighbor)
    // First check if it's a clean integer downscale
    const downFactor = 1 / avgScale;
    const intDownFactor = Math.round(downFactor);

    if (isUniformScale && Math.abs(downFactor - intDownFactor) < 0.01 && intDownFactor >= 2) {
      // Clean integer downscale - use area averaging directly
      return downscaleAreaAverage(imageData, intDownFactor);
    } else {
      // Non-integer or non-uniform downscale
      // Use area-based downscaling to target size
      return downscaleToSize(imageData, dstWidth, dstHeight);
    }
  }
}

/**
 * Downscale image to exact target dimensions using area averaging.
 * Handles non-integer scale factors.
 */
function downscaleToSize(
  imageData: ImageData,
  targetWidth: number,
  targetHeight: number
): ImageData {
  const { width: srcWidth, height: srcHeight, data: srcData } = imageData;

  // If target is larger, use nearest-neighbor upscale instead
  if (targetWidth >= srcWidth && targetHeight >= srcHeight) {
    return scaleNearestNeighbor(imageData, targetWidth / srcWidth, targetHeight / srcHeight);
  }

  const result = new ImageData(targetWidth, targetHeight);
  const dstData = result.data;

  // Scale factors
  const scaleX = srcWidth / targetWidth;
  const scaleY = srcHeight / targetHeight;

  for (let dstY = 0; dstY < targetHeight; dstY++) {
    const srcY1 = dstY * scaleY;
    const srcY2 = (dstY + 1) * scaleY;

    for (let dstX = 0; dstX < targetWidth; dstX++) {
      const srcX1 = dstX * scaleX;
      const srcX2 = (dstX + 1) * scaleX;

      // Accumulate weighted colors from source region
      let r = 0, g = 0, b = 0, a = 0;
      let totalWeight = 0;

      // Iterate over source pixels that contribute to this destination pixel
      const startY = Math.floor(srcY1);
      const endY = Math.min(Math.ceil(srcY2), srcHeight);
      const startX = Math.floor(srcX1);
      const endX = Math.min(Math.ceil(srcX2), srcWidth);

      for (let sy = startY; sy < endY; sy++) {
        // Calculate Y overlap
        const yOverlap = Math.min(sy + 1, srcY2) - Math.max(sy, srcY1);

        for (let sx = startX; sx < endX; sx++) {
          // Calculate X overlap
          const xOverlap = Math.min(sx + 1, srcX2) - Math.max(sx, srcX1);
          const weight = xOverlap * yOverlap;

          const srcIdx = (sy * srcWidth + sx) * 4;
          const srcAlpha = srcData[srcIdx + 3];

          if (srcAlpha > 0) {
            r += srcData[srcIdx] * weight;
            g += srcData[srcIdx + 1] * weight;
            b += srcData[srcIdx + 2] * weight;
            a += srcAlpha * weight;
            totalWeight += weight;
          }
        }
      }

      const dstIdx = (dstY * targetWidth + dstX) * 4;

      if (totalWeight > 0) {
        dstData[dstIdx] = Math.round(r / totalWeight);
        dstData[dstIdx + 1] = Math.round(g / totalWeight);
        dstData[dstIdx + 2] = Math.round(b / totalWeight);
        // For alpha, use threshold to keep hard edges
        dstData[dstIdx + 3] = (a / totalWeight) > 127 ? 255 : 0;
      } else {
        dstData[dstIdx] = 0;
        dstData[dstIdx + 1] = 0;
        dstData[dstIdx + 2] = 0;
        dstData[dstIdx + 3] = 0;
      }
    }
  }

  return result;
}

/**
 * Scale a selection mask using nearest-neighbor interpolation.
 *
 * @param mask - Source mask (Uint8Array, 0 = not selected, 255 = selected)
 * @param width - Original mask width
 * @param height - Original mask height
 * @param scaleX - Horizontal scale factor
 * @param scaleY - Vertical scale factor
 * @returns Object with scaled mask and new dimensions
 */
export function scaleMask(
  mask: Uint8Array,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number
): { mask: Uint8Array; width: number; height: number } {
  const dstWidth = Math.max(1, Math.round(width * scaleX));
  const dstHeight = Math.max(1, Math.round(height * scaleY));

  // If no change, return copy
  if (dstWidth === width && dstHeight === height) {
    return {
      mask: new Uint8Array(mask),
      width,
      height,
    };
  }

  const result = new Uint8Array(dstWidth * dstHeight);

  const invScaleX = width / dstWidth;
  const invScaleY = height / dstHeight;

  for (let dstY = 0; dstY < dstHeight; dstY++) {
    const srcY = Math.min(Math.floor(dstY * invScaleY), height - 1);

    for (let dstX = 0; dstX < dstWidth; dstX++) {
      const srcX = Math.min(Math.floor(dstX * invScaleX), width - 1);

      result[dstY * dstWidth + dstX] = mask[srcY * width + srcX];
    }
  }

  return {
    mask: result,
    width: dstWidth,
    height: dstHeight,
  };
}

/**
 * Calculate scaled bounds, keeping the center position fixed.
 *
 * @param originalBounds - Original selection bounds
 * @param scaleX - Horizontal scale factor
 * @param scaleY - Vertical scale factor
 * @returns New bounds with updated width/height, centered on original
 */
export function calculateScaledBounds(
  originalBounds: Rect,
  scaleX: number,
  scaleY: number
): Rect {
  const newWidth = Math.max(1, Math.round(originalBounds.width * scaleX));
  const newHeight = Math.max(1, Math.round(originalBounds.height * scaleY));

  // Keep center fixed
  const centerX = originalBounds.x + originalBounds.width / 2;
  const centerY = originalBounds.y + originalBounds.height / 2;

  return {
    x: Math.round(centerX - newWidth / 2),
    y: Math.round(centerY - newHeight / 2),
    width: newWidth,
    height: newHeight,
  };
}

/**
 * Calculate scale factors from original and target dimensions.
 *
 * @param originalWidth - Original width
 * @param originalHeight - Original height
 * @param targetWidth - Desired width
 * @param targetHeight - Desired height
 * @returns Scale factors { x, y }
 */
export function calculateScaleFactors(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number
): { x: number; y: number } {
  return {
    x: targetWidth / originalWidth,
    y: targetHeight / originalHeight,
  };
}

/**
 * Calculate uniform scale factor to maintain aspect ratio.
 * Returns the scale factor that fits both dimensions.
 *
 * @param scaleX - Desired X scale
 * @param scaleY - Desired Y scale
 * @param mode - 'max' uses larger scale, 'min' uses smaller scale
 * @returns Uniform scale factor
 */
export function uniformScale(
  scaleX: number,
  scaleY: number,
  mode: 'max' | 'min' = 'max'
): number {
  return mode === 'max'
    ? Math.max(scaleX, scaleY)
    : Math.min(scaleX, scaleY);
}
