/**
 * Indexed Color Utilities
 *
 * Functions for working with palette-indexed colors.
 * Index 0 is always transparent.
 * Palette indices are 1-based (index 1 = first color in palette array).
 */

import { paletteStore } from '../stores/palette';
import { hexToRgb, rgbToHex } from '../stores/palette/color-utils';
import { log } from './log';

export { rgbToHex };

/**
 * Get RGBA values for a palette index using the palette store.
 * @param index 1-based palette index (0 = transparent)
 * @returns [r, g, b, a] tuple
 */
function indexToRgbaFromStore(index: number): [number, number, number, number] {
  if (index === 0) {
    return [0, 0, 0, 0]; // Transparent
  }

  const hex = paletteStore.getColorByIndex(index);
  if (!hex) {
    return [0, 0, 0, 0]; // Invalid index = transparent
  }

  const rgb = hexToRgb(hex);
  if (!rgb) {
    return [0, 0, 0, 0];
  }

  return [rgb.r, rgb.g, rgb.b, 255];
}

/**
 * Get RGBA values for a palette index.
 * @param index 1-based palette index (0 = transparent)
 * @param palette Array of hex colors (optional - uses store if not provided)
 * @returns [r, g, b, a] tuple
 */
function indexToRgba(index: number, palette?: string[]): [number, number, number, number] {
  if (index === 0) {
    return [0, 0, 0, 0]; // Transparent
  }

  // If no palette provided, use the store.
  if (!palette) {
    return indexToRgbaFromStore(index);
  }

  const arrayIndex = index - 1;
  if (arrayIndex < 0 || arrayIndex >= palette.length) {
    // The store may have newer colors than the passed palette.
    return indexToRgbaFromStore(index);
  }

  const rgb = hexToRgb(palette[arrayIndex]);
  if (!rgb) {
    return [0, 0, 0, 0];
  }

  return [rgb.r, rgb.g, rgb.b, 255];
}

/**
 * Create a new index buffer filled with transparent (0).
 */
export function createIndexBuffer(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height);
}

/**
 * Rebuild a canvas from an index buffer using the palette.
 * This converts indexed pixel data back to RGBA for display.
 */
export function rebuildCanvasFromIndices(
  canvas: HTMLCanvasElement,
  indexBuffer: Uint8Array,
  palette: string[]
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // Verify buffer size matches canvas
  if (indexBuffer.length !== width * height) {
    log.warn('Index buffer size mismatch:', indexBuffer.length, 'vs', width * height);
    return;
  }

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let i = 0; i < indexBuffer.length; i++) {
    const paletteIndex = indexBuffer[i];
    const [r, g, b, a] = indexToRgba(paletteIndex, palette);

    const pixelOffset = i * 4;
    data[pixelOffset] = r;
    data[pixelOffset + 1] = g;
    data[pixelOffset + 2] = b;
    data[pixelOffset + 3] = a;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Build an index buffer from existing canvas RGBA data.
 * Used for migrating existing projects to indexed mode.
 * Colors not in the palette will be added automatically.
 */
export function buildIndexBufferFromCanvas(
  canvas: HTMLCanvasElement,
  addMissingColors: boolean = true
): Uint8Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return createIndexBuffer(canvas.width, canvas.height);
  }

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const indexBuffer = new Uint8Array(width * height);

  for (let i = 0; i < indexBuffer.length; i++) {
    const pixelOffset = i * 4;
    const r = data[pixelOffset];
    const g = data[pixelOffset + 1];
    const b = data[pixelOffset + 2];
    const a = data[pixelOffset + 3];

    // Transparent pixel
    if (a < 128) {
      indexBuffer[i] = 0;
      continue;
    }

    const hex = rgbToHex(r, g, b);

    if (addMissingColors) {
      // getOrAddColor will add the color if not present
      indexBuffer[i] = paletteStore.getOrAddColor(hex);
    } else {
      // Just find closest existing color
      const existingIndex = paletteStore.getColorIndex(hex);
      indexBuffer[i] = existingIndex !== 0 ? existingIndex : paletteStore.findClosestColorIndex(hex);
    }
  }

  return indexBuffer;
}

/**
 * Set a single pixel in the index buffer.
 */
export function setIndexBufferPixel(
  indexBuffer: Uint8Array,
  width: number,
  x: number,
  y: number,
  paletteIndex: number
): void {
  if (x < 0 || y < 0 || x >= width) return;
  const height = indexBuffer.length / width;
  if (y >= height) return;

  indexBuffer[y * width + x] = paletteIndex;
}

/**
 * Get a single pixel from the index buffer.
 */
export function getIndexBufferPixel(
  indexBuffer: Uint8Array,
  width: number,
  x: number,
  y: number
): number {
  if (x < 0 || y < 0 || x >= width) return 0;
  const height = indexBuffer.length / width;
  if (y >= height) return 0;

  return indexBuffer[y * width + x];
}

/**
 * Clone an index buffer.
 */
export function cloneIndexBuffer(buffer: Uint8Array): Uint8Array {
  return new Uint8Array(buffer);
}

