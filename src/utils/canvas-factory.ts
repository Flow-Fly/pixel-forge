/**
 * Canvas factory utilities.
 *
 * These functions have NO store dependencies to avoid circular imports.
 * Width and height must be provided explicitly.
 */

/**
 * Options for canvas context creation.
 */
export interface CanvasOptions {
  alpha?: boolean;
  willReadFrequently?: boolean;
  smoothing?: boolean;
}

/**
 * Create a canvas with configurable context options.
 * This is the base utility for all canvas creation in the app.
 */
export function createCanvas(
  width: number,
  height: number,
  options: CanvasOptions = {}
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const { alpha = true, willReadFrequently = false, smoothing = false } = options;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { alpha, willReadFrequently })!;
  ctx.imageSmoothingEnabled = smoothing;

  return { canvas, ctx };
}

/**
 * Create a canvas optimized for layer/cel storage (frequent pixel reads).
 */
export function createLayerCanvas(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  return createCanvas(width, height, { willReadFrequently: true });
}

/**
 * Alias for createLayerCanvas - cels have the same requirements.
 */
export const createCelCanvas = createLayerCanvas;
