/**
 * Index buffer management for animation cels.
 *
 * Index buffers map each pixel to a palette index, enabling:
 * - Palette color changes to update all pixels using that color
 * - Efficient storage (1 byte per pixel vs 4 for RGBA)
 * - Color remapping when palette order changes
 */

import type { Cel } from '../../types/animation';
import {
  createIndexBuffer,
  rebuildCanvasFromIndices,
  buildIndexBufferFromCanvas,
  rgbToHex
} from '../../utils/indexed-color';
import { paletteStore } from '../palette';
import { getCanvasSize } from '../store-refs';
import { getCelKey } from './types';

export interface PaletteIndexUsage {
  paletteIndex: number;
  pixelCount: number;
  celCount: number;
  frameIds: string[];
  celKeys: string[];
}

/**
 * Get the index buffer for a cel. Returns undefined if cel doesn't exist.
 */
export function getCelIndexBuffer(
  cels: Map<string, Cel>,
  layerId: string,
  frameId: string
): Uint8Array | undefined {
  const key = getCelKey(layerId, frameId);
  return cels.get(key)?.indexBuffer;
}

/**
 * Ensure a cel has an index buffer. Creates one if missing.
 * Returns the updated cels map and the index buffer.
 */
export function ensureCelIndexBuffer(
  cels: Map<string, Cel>,
  layerId: string,
  frameId: string,
  syncLayerCanvases: () => void
): { cels: Map<string, Cel>; indexBuffer: Uint8Array } {
  const key = getCelKey(layerId, frameId);
  const cel = cels.get(key);

  if (!cel) {
    // Create the cel first via sync, then recurse
    syncLayerCanvases();
    // Return empty result - caller should retry after sync
    const { width, height } = getCanvasSize();
    return { cels, indexBuffer: createIndexBuffer(width, height) };
  }

  // If cel already has an index buffer, return it
  if (cel.indexBuffer) {
    return { cels, indexBuffer: cel.indexBuffer };
  }

  // Create index buffer - either empty or built from existing canvas content
  const width = cel.canvas.width;
  const height = cel.canvas.height;
  const indexBuffer = hasOpaquePixel(cel.canvas, width, height)
    ? buildIndexBufferFromCanvas(cel.canvas, true)
    : createIndexBuffer(width, height);

  // Update cel with the new index buffer
  const newCels = new Map(cels);
  newCels.set(key, { ...cel, indexBuffer });

  return { cels: newCels, indexBuffer };
}

function hasOpaquePixel(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const data = ctx.getImageData(0, 0, width, height).data;
  for (let alphaOffset = 3; alphaOffset < data.length; alphaOffset += 4) {
    if (data[alphaOffset] > 0) return true;
  }

  return false;
}

/**
 * Update a cel's index buffer and rebuild its canvas.
 */
export function updateCelIndexBuffer(
  cels: Map<string, Cel>,
  layerId: string,
  frameId: string,
  indexBuffer: Uint8Array
): Map<string, Cel> {
  const key = getCelKey(layerId, frameId);
  const cel = cels.get(key);
  if (!cel) return cels;

  const newCels = new Map(cels);
  newCels.set(key, { ...cel, indexBuffer });

  // Rebuild canvas from index buffer
  const palette = paletteStore.colors.value;
  rebuildCanvasFromIndices(cel.canvas, indexBuffer, palette);

  return newCels;
}

/**
 * Rebuild all cel canvases from their index buffers.
 * Called when palette colors change.
 */
export function rebuildAllCelCanvases(cels: Map<string, Cel>): void {
  const palette = paletteStore.colors.value;

  for (const [_key, cel] of cels) {
    // Skip cels without index buffers (empty/linked cels sharing transparent canvas)
    if (!cel.indexBuffer) continue;
    // Skip text cels (they don't use indexed colors)
    if (cel.textCelData) continue;
    // Rebuild canvas from index buffer
    rebuildCanvasFromIndices(cel.canvas, cel.indexBuffer, palette);
  }
}

/**
 * Rebuild all cel index buffers from their canvas content.
 * Called after loading with a different palette.
 */
export function rebuildAllIndexBuffers(cels: Map<string, Cel>): Map<string, Cel> {
  const newCels = new Map(cels);

  for (const [key, cel] of newCels) {
    if (!cel.canvas) continue;
    if (cel.textCelData) continue;

    const newIndexBuffer = buildIndexBufferFromCanvas(cel.canvas, false);
    newCels.set(key, { ...cel, indexBuffer: newIndexBuffer });
  }

  return newCels;
}

/**
 * Report where a palette index is used in cel index buffers.
 */
export function scanPaletteIndexUsage(
  cels: Map<string, Cel>,
  paletteIndex: number
): PaletteIndexUsage {
  const frameIds = new Set<string>();
  const celKeys: string[] = [];
  let pixelCount = 0;

  for (const [key, cel] of cels) {
    if (!cel.indexBuffer) continue;
    if (cel.textCelData) continue;

    let celPixelCount = 0;
    for (const index of cel.indexBuffer) {
      if (index === paletteIndex) {
        celPixelCount++;
      }
    }

    if (celPixelCount === 0) continue;

    pixelCount += celPixelCount;
    frameIds.add(cel.frameId);
    celKeys.push(key);
  }

  return {
    paletteIndex,
    pixelCount,
    celCount: celKeys.length,
    frameIds: [...frameIds],
    celKeys,
  };
}

export function remapPaletteIndexAfterDelete(
  cels: Map<string, Cel>,
  removedIndex: number,
  replacementIndex: number,
  oldPaletteSize: number
): Map<string, Cel> {
  const newCels = new Map(cels);
  const safeReplacement = Math.max(
    0,
    Math.min(replacementIndex, oldPaletteSize - 1)
  );

  for (const [key, cel] of cels) {
    if (!cel.indexBuffer) continue;
    if (cel.textCelData) continue;

    const nextBuffer = new Uint8Array(cel.indexBuffer);
    let changed = false;

    for (let i = 0; i < nextBuffer.length; i++) {
      const currentIndex = nextBuffer[i];
      const nextIndex = getIndexAfterPaletteDelete(
        currentIndex,
        removedIndex,
        safeReplacement,
        oldPaletteSize
      );

      if (nextIndex === currentIndex) continue;

      nextBuffer[i] = nextIndex;
      changed = true;
    }

    if (changed) {
      newCels.set(key, { ...cel, indexBuffer: nextBuffer });
    }
  }

  return newCels;
}

function getIndexAfterPaletteDelete(
  currentIndex: number,
  removedIndex: number,
  replacementIndex: number,
  oldPaletteSize: number
): number {
  if (currentIndex === 0) return 0;
  if (currentIndex > oldPaletteSize) return 0;
  if (currentIndex === removedIndex) return replacementIndex;
  if (currentIndex > removedIndex) return currentIndex - 1;
  return currentIndex;
}

/**
 * Scan all index buffers and return the set of colors actually used.
 */
export function scanUsedColors(cels: Map<string, Cel>): Set<string> {
  const usedColors = new Set<string>();

  for (const [_key, cel] of cels) {
    if (!cel.indexBuffer) continue;
    if (cel.textCelData) continue;

    const buffer = cel.indexBuffer;
    for (let i = 0; i < buffer.length; i++) {
      const paletteIndex = buffer[i];
      if (paletteIndex === 0) continue; // Skip transparent

      const color = paletteStore.getColorByIndex(paletteIndex);
      if (color) {
        usedColors.add(color.toLowerCase());
      }
    }
  }

  return usedColors;
}

/**
 * Scan actual canvas pixels to get colors used.
 * Works correctly even when palette has changed since drawing was made.
 */
export function scanUsedColorsFromCanvas(cels: Map<string, Cel>): Set<string> {
  const usedColors = new Set<string>();

  for (const [_key, cel] of cels) {
    if (cel.textCelData) continue;

    const data = readCanvasPixels(cel.canvas);
    if (!data) continue;

    for (let alphaOffset = 3; alphaOffset < data.length; alphaOffset += 4) {
      if (data[alphaOffset] === 0) continue;

      usedColors.add(getPixelHex(data, alphaOffset).toLowerCase());
    }
  }

  return usedColors;
}

function readCanvasPixels(canvas: HTMLCanvasElement): Uint8ClampedArray | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function getPixelHex(data: Uint8ClampedArray, alphaOffset: number): string {
  return rgbToHex(
    data[alphaOffset - 3],
    data[alphaOffset - 2],
    data[alphaOffset - 1]
  );
}
