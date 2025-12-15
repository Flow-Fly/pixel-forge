/**
 * Angle conversion and manipulation utilities.
 */

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
