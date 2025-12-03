import type { Command } from '../stores/history';
import type { Rect } from '../types/geometry';
import { isDrawableCommand, type DrawableCommand } from '../commands/index';
import { layerStore } from '../stores/layers';

/**
 * Check if two pixel values are equal (RGBA comparison).
 */
function pixelsEqual(
  data1: Uint8ClampedArray,
  data2: Uint8ClampedArray,
  offset: number
): boolean {
  return (
    data1[offset] === data2[offset] &&
    data1[offset + 1] === data2[offset + 1] &&
    data1[offset + 2] === data2[offset + 2] &&
    data1[offset + 3] === data2[offset + 3]
  );
}

/**
 * Check if two rectangles overlap.
 */
function boundsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Convert local coordinates (within bounds) to global canvas coordinates.
 */
function localToGlobal(
  localX: number,
  localY: number,
  bounds: Rect,
  canvasWidth: number
): number {
  const globalX = bounds.x + localX;
  const globalY = bounds.y + localY;
  return globalY * canvasWidth + globalX;
}

/**
 * Convert global canvas coordinates to local coordinates within bounds.
 * Returns null if the global position is outside the bounds.
 */
function globalToLocal(
  globalIndex: number,
  bounds: Rect,
  canvasWidth: number
): { localX: number; localY: number } | null {
  const globalX = globalIndex % canvasWidth;
  const globalY = Math.floor(globalIndex / canvasWidth);

  const localX = globalX - bounds.x;
  const localY = globalY - bounds.y;

  if (localX < 0 || localX >= bounds.width || localY < 0 || localY >= bounds.height) {
    return null;
  }

  return { localX, localY };
}

/**
 * Compute which pixels can safely be restored without overwriting subsequent work.
 *
 * @param targetCmd - The command to patch out
 * @param subsequentCommands - Commands that came after the target
 * @param canvasWidth - Width of the canvas in pixels
 * @returns Set of global pixel indices that are safe to restore
 */
export function computeSafePixels(
  targetCmd: DrawableCommand,
  subsequentCommands: Command[],
  canvasWidth: number
): Set<number> {
  const bounds = targetCmd.drawBounds;
  const prevData = targetCmd.drawPreviousData;
  const newData = targetCmd.drawNewData;

  // Step 1: Find pixels that actually changed in target command
  const changedPixels = new Set<number>();

  for (let localY = 0; localY < bounds.height; localY++) {
    for (let localX = 0; localX < bounds.width; localX++) {
      const localIndex = localY * bounds.width + localX;
      const offset = localIndex * 4;

      // Check if this pixel actually changed
      if (!pixelsEqual(prevData, newData, offset)) {
        const globalIndex = localToGlobal(localX, localY, bounds, canvasWidth);
        changedPixels.add(globalIndex);
      }
    }
  }

  if (changedPixels.size === 0) {
    return new Set(); // Nothing changed
  }

  // Step 2: Build protection mask from subsequent commands
  const protectedPixels = new Set<number>();

  for (const cmd of subsequentCommands) {
    if (!isDrawableCommand(cmd)) continue;

    const subBounds = cmd.drawBounds;

    // Fast bounds overlap check
    if (!boundsOverlap(bounds, subBounds)) continue;

    const subPrevData = cmd.drawPreviousData;
    const subNewData = cmd.drawNewData;

    // Find pixels changed by this subsequent command
    for (let localY = 0; localY < subBounds.height; localY++) {
      for (let localX = 0; localX < subBounds.width; localX++) {
        const localIndex = localY * subBounds.width + localX;
        const offset = localIndex * 4;

        // Check if this pixel changed in the subsequent command
        if (!pixelsEqual(subPrevData, subNewData, offset)) {
          const globalIndex = localToGlobal(localX, localY, subBounds, canvasWidth);

          // Only protect if it's one of our changed pixels
          if (changedPixels.has(globalIndex)) {
            protectedPixels.add(globalIndex);
          }
        }
      }
    }
  }

  // Step 3: Return safe pixels (changed but not protected)
  const safePixels = new Set<number>();
  for (const pixel of changedPixels) {
    if (!protectedPixels.has(pixel)) {
      safePixels.add(pixel);
    }
  }

  return safePixels;
}

/**
 * Apply a selective patch, restoring only safe pixels.
 *
 * @param layerId - The layer to patch
 * @param targetCmd - The command being patched out
 * @param safePixels - Set of global pixel indices that are safe to restore
 * @param canvasWidth - Width of the canvas
 * @returns Data needed for a PatchCommand, or null if no pixels could be restored
 */
export function applyPatch(
  layerId: string,
  targetCmd: DrawableCommand,
  safePixels: Set<number>,
  canvasWidth: number
): { bounds: Rect; beforeData: Uint8ClampedArray; afterData: Uint8ClampedArray } | null {
  if (safePixels.size === 0) return null;

  // Get the layer canvas
  const layer = layerStore.layers.value.find(l => l.id === layerId);
  if (!layer?.canvas) return null;

  const ctx = layer.canvas.getContext('2d');
  if (!ctx) return null;

  const targetBounds = targetCmd.drawBounds;
  const targetPrevData = targetCmd.drawPreviousData;

  // Compute minimal bounds containing all safe pixels
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const globalIndex of safePixels) {
    const globalX = globalIndex % canvasWidth;
    const globalY = Math.floor(globalIndex / canvasWidth);
    minX = Math.min(minX, globalX);
    minY = Math.min(minY, globalY);
    maxX = Math.max(maxX, globalX);
    maxY = Math.max(maxY, globalY);
  }

  const patchBounds: Rect = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };

  // Get current canvas data for this region (before patch)
  const beforeImageData = ctx.getImageData(
    patchBounds.x,
    patchBounds.y,
    patchBounds.width,
    patchBounds.height
  );
  const beforeData = new Uint8ClampedArray(beforeImageData.data);

  // Create after data by copying before and applying restorations
  const afterData = new Uint8ClampedArray(beforeData);

  // Apply restorations for each safe pixel
  for (const globalIndex of safePixels) {
    const globalX = globalIndex % canvasWidth;
    const globalY = Math.floor(globalIndex / canvasWidth);

    // Position in patch bounds
    const patchLocalX = globalX - patchBounds.x;
    const patchLocalY = globalY - patchBounds.y;
    const patchOffset = (patchLocalY * patchBounds.width + patchLocalX) * 4;

    // Position in target command bounds
    const targetLocal = globalToLocal(globalIndex, targetBounds, canvasWidth);
    if (!targetLocal) continue;

    const targetOffset = (targetLocal.localY * targetBounds.width + targetLocal.localX) * 4;

    // Copy the "before" pixel from target command to our after data
    afterData[patchOffset] = targetPrevData[targetOffset];
    afterData[patchOffset + 1] = targetPrevData[targetOffset + 1];
    afterData[patchOffset + 2] = targetPrevData[targetOffset + 2];
    afterData[patchOffset + 3] = targetPrevData[targetOffset + 3];
  }

  // Apply the patch to the canvas
  const afterImageData = new ImageData(
    new Uint8ClampedArray(afterData),
    patchBounds.width,
    patchBounds.height
  );
  ctx.putImageData(afterImageData, patchBounds.x, patchBounds.y);

  return {
    bounds: patchBounds,
    beforeData,
    afterData
  };
}
