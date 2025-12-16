/**
 * Selection hit testing utilities.
 *
 * Functions for testing if points are within selections.
 */

import type { Rect } from '../../types/geometry';
import type { SelectionShape } from '../../types/selection';
import { isPointInMask } from '../../utils/mask-utils';

/**
 * Test if a point is within bounds considering the shape type.
 */
export function isPointInBounds(
  x: number,
  y: number,
  bounds: Rect,
  shape: SelectionShape,
  mask?: Uint8Array
): boolean {
  const { x: bx, y: by, width: bw, height: bh } = bounds;

  if (x < bx || x >= bx + bw || y < by || y >= by + bh) {
    return false;
  }

  if (shape === 'rectangle') {
    return true;
  }

  if (shape === 'ellipse') {
    // Point in ellipse test
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    const rx = bw / 2;
    const ry = bh / 2;
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  if (shape === 'freeform' && mask) {
    return isPointInMask(x, y, mask, bounds);
  }

  // Fallback: treat as rectangle
  return true;
}

/**
 * Test if a point is within a rotated rectangle.
 * Used for transform mode hit testing.
 */
export function isPointInRotatedBounds(
  x: number,
  y: number,
  originalBounds: Rect,
  offset: { x: number; y: number },
  rotationDegrees: number
): boolean {
  // Calculate center of selection (including movement offset)
  const cx = originalBounds.x + offset.x + originalBounds.width / 2;
  const cy = originalBounds.y + offset.y + originalBounds.height / 2;

  // Translate point relative to center
  const px = x - cx;
  const py = y - cy;

  // Rotate point backwards by -rotation to get position in original coordinate space
  const angle = (-rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotatedX = px * cos - py * sin;
  const rotatedY = px * sin + py * cos;

  // Check if rotated point is within original bounds (centered at 0,0)
  const halfW = originalBounds.width / 2;
  const halfH = originalBounds.height / 2;
  return (
    rotatedX >= -halfW &&
    rotatedX < halfW &&
    rotatedY >= -halfH &&
    rotatedY < halfH
  );
}
