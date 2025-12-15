/**
 * Shared types for rotation utilities.
 */

import type { Rect } from '../../types/geometry';

// Re-export Rect for convenience
export type { Rect };

/**
 * RGBA color representation.
 */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Edge priority for tie-breaking when two colors compete at a sliced edge.
 * 'darker' = darker colors win (outlines dominate fills) - default for pixel art
 * 'lighter' = lighter colors win
 */
export type EdgePriority = 'darker' | 'lighter';

/**
 * Quality level for CleanEdge rotation.
 * 'draft' = 2x upscaling (faster, for live preview during drag)
 * 'final' = 4x upscaling (higher quality, for commit)
 */
export type CleanEdgeQuality = 'draft' | 'final';

/**
 * Options for CleanEdge rotation.
 */
export interface CleanEdgeOptions {
  /**
   * Enable cleanup transitions for smoother slope handling.
   * Has negligible effect for rotation but improves quality for upscaling.
   * Default: false (disabled for speed)
   */
  cleanup?: boolean;

  /**
   * Quality level for rotation.
   * 'draft' = 2x upscaling (4x faster, for live preview)
   * 'final' = 4x upscaling (higher quality, for commit)
   * Default: 'final'
   */
  quality?: CleanEdgeQuality;

  /**
   * Edge priority for tie-breaking when two colors compete at a sliced edge.
   * 'darker' = darker colors win (outlines dominate fills) - recommended for pixel art
   * 'lighter' = lighter colors win
   * Default: 'darker'
   */
  edgePriority?: EdgePriority;
}

// Sentinel values
export const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };
export const NO_SLICE: RGBA = { r: -1, g: -1, b: -1, a: -1 };
export const TRANSPARENT_PACKED = 0;
export const NO_SLICE_PACKED = 0xffffffff;

// Configuration constants
export const LINE_WIDTH = 1;
export const SIMILAR_THRESHOLD = 0.0;
export const HIGHEST_COLOR = { r: 1, g: 1, b: 1 };
