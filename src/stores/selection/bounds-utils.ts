/**
 * Selection bounds utilities.
 *
 * Pure functions for trimming selection bounds to content.
 */

import type { Rect } from '../../types/geometry';
import type { SelectionShape } from '../../types/selection';

/**
 * Trim selection bounds to exclude transparent pixels.
 * Returns null if all pixels are transparent.
 */
export function trimBoundsToContent(
  canvas: HTMLCanvasElement,
  bounds: Rect,
  shape: SelectionShape
): Rect | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return bounds;

  const imageData = ctx.getImageData(
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height
  );
  const { width, height, data } = imageData;

  // For ellipse, we need to consider only pixels inside the ellipse
  const isInSelection = (px: number, py: number): boolean => {
    if (shape === 'ellipse') {
      const dx = (px + 0.5 - width / 2) / (width / 2);
      const dy = (py + 0.5 - height / 2) / (height / 2);
      return dx * dx + dy * dy <= 1;
    }
    return true; // Rectangle includes all pixels
  };

  // Find content bounds
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInSelection(x, y)) continue;

      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // All transparent
  if (maxX < 0 || maxY < 0) {
    return null;
  }

  // No trimming needed
  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) {
    return bounds;
  }

  // Return trimmed bounds
  return {
    x: bounds.x + minX,
    y: bounds.y + minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Trim freeform selection to exclude transparent pixels.
 * Returns null if all selected pixels are transparent.
 */
export function trimFreeformToContent(
  canvas: HTMLCanvasElement,
  bounds: Rect,
  mask: Uint8Array
): { bounds: Rect; mask: Uint8Array } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { bounds, mask };

  const imageData = ctx.getImageData(
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height
  );
  const { width, height, data } = imageData;

  // Find content bounds (pixels that are both in mask AND non-transparent)
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] !== 255) continue; // Not in selection

      const alpha = data[idx * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // All transparent
  if (maxX < 0 || maxY < 0) {
    return null;
  }

  // No trimming needed
  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) {
    return { bounds, mask };
  }

  // Create trimmed mask
  const newWidth = maxX - minX + 1;
  const newHeight = maxY - minY + 1;
  const newMask = new Uint8Array(newWidth * newHeight);

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcIdx = (minY + y) * width + (minX + x);
      const dstIdx = y * newWidth + x;
      newMask[dstIdx] = mask[srcIdx];
    }
  }

  return {
    bounds: {
      x: bounds.x + minX,
      y: bounds.y + minY,
      width: newWidth,
      height: newHeight,
    },
    mask: newMask,
  };
}
