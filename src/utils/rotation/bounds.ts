/**
 * Bounding box calculation for rotated rectangles.
 */

import type { Rect } from './types';
import { degreesToRadians } from './angle';

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
