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
  buildIndexBufferFromCanvas
} from '../../utils/indexed-color';
import { paletteStore } from '../palette';
import { projectStore } from '../project';
import { getCelKey } from './types';

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
  let cel = cels.get(key);

  if (!cel) {
    // Create the cel first via sync, then recurse
    syncLayerCanvases();
    // Return empty result - caller should retry after sync
    const width = projectStore.width.value;
    const height = projectStore.height.value;
    return { cels, indexBuffer: createIndexBuffer(width, height) };
  }

  // If cel already has an index buffer, return it
  if (cel.indexBuffer) {
    return { cels, indexBuffer: cel.indexBuffer };
  }

  // Create index buffer - either empty or built from existing canvas content
  const width = cel.canvas.width;
  const height = cel.canvas.height;
  let indexBuffer: Uint8Array;

  // Check if canvas has any content (for migration from non-indexed projects)
  const ctx = cel.canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const hasContent = imageData.data.some((v, i) => i % 4 === 3 && v > 0);

    if (hasContent) {
      indexBuffer = buildIndexBufferFromCanvas(cel.canvas, true);
    } else {
      indexBuffer = createIndexBuffer(width, height);
    }
  } else {
    indexBuffer = createIndexBuffer(width, height);
  }

  // Update cel with the new index buffer
  const newCels = new Map(cels);
  newCels.set(key, { ...cel, indexBuffer });

  return { cels: newCels, indexBuffer };
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
    if (!cel.canvas) continue;
    if (cel.textCelData) continue;

    const ctx = cel.canvas.getContext('2d');
    if (!ctx) continue;

    const imageData = ctx.getImageData(0, 0, cel.canvas.width, cel.canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const hex = '#' +
        r.toString(16).padStart(2, '0') +
        g.toString(16).padStart(2, '0') +
        b.toString(16).padStart(2, '0');

      usedColors.add(hex.toLowerCase());
    }
  }

  return usedColors;
}
