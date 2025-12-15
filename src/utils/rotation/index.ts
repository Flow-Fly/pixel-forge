/**
 * Rotation Utilities - Main Entry Point
 *
 * Re-exports all rotation utilities for backward compatibility.
 */

// Types
export type { Rect, RGBA, EdgePriority, CleanEdgeQuality, CleanEdgeOptions } from './types';
export {
  TRANSPARENT,
  NO_SLICE,
  TRANSPARENT_PACKED,
  NO_SLICE_PACKED,
  LINE_WIDTH,
  SIMILAR_THRESHOLD,
  HIGHEST_COLOR,
} from './types';

// Angle utilities
export {
  degreesToRadians,
  radiansToDegrees,
  normalizeAngle,
  snapAngle,
  angleFromCenter,
} from './angle';

// Bounds calculation
export { getRotatedBounds, calculateRotatedBounds } from './bounds';

// Basic rotation algorithms
export {
  rotateNearestNeighbor,
  rotateMask,
  is90DegreeRotation,
  rotate90CW,
  rotate180,
  rotate90CCW,
  rotateBy90Increment,
} from './basic-rotation';

// CleanEdge algorithm
export {
  rotateCleanEdge,
  applyCleanEdge,
  applyCleanEdgePacked,
  downscaleAreaAverage,
} from './clean-edge';

// CleanEdge core (for advanced usage)
export {
  getPixel,
  getPixelPacked,
  sliceDist,
  sliceDistPacked,
  colorDistance,
  colorDistancePacked,
  similar,
  similarPacked,
  similar3,
  similar3Packed,
  similar4,
  similar4Packed,
  higher,
  higherPacked,
  distToLine,
  unpackR,
  unpackG,
  unpackB,
  unpackA,
  packRGBA,
} from './clean-edge-core';

// Module re-exports for direct access
export * as angle from './angle';
export * as bounds from './bounds';
export * as basicRotation from './basic-rotation';
export * as cleanEdge from './clean-edge';
export * as cleanEdgeCore from './clean-edge-core';
