import type { Rect } from '../types/geometry';
import type { SelectionShape } from '../types/selection';
import { extractIndexRegion } from '../utils/buffer-region';

export interface ClipboardIndexPasteRegionOptions {
  sourceIndexData: Uint8Array;
  targetIndexBuffer: Uint8Array;
  targetWidth: number;
  destinationBounds: Rect;
  shape?: SelectionShape;
  mask?: Uint8Array;
}

export interface ClipboardIndexPasteRegionPlan {
  previousIndexData: Uint8Array;
  nextIndexData: Uint8Array;
}

function isInsideEllipse(x: number, y: number, width: number, height: number): boolean {
  const rx = width / 2;
  const ry = height / 2;
  const dx = (x + 0.5 - rx) / rx;
  const dy = (y + 0.5 - ry) / ry;

  return dx * dx + dy * dy <= 1;
}

function isVisiblePixel(
  x: number,
  y: number,
  width: number,
  height: number,
  shape: SelectionShape,
  mask: Uint8Array | undefined,
  pixelIndex: number
): boolean {
  if (mask && mask[pixelIndex] === 0) return false;
  if (shape === 'ellipse') return isInsideEllipse(x, y, width, height);

  return true;
}

export function createClipboardIndexPasteRegionPlan({
  sourceIndexData,
  targetIndexBuffer,
  targetWidth,
  destinationBounds,
  shape = 'rectangle',
  mask,
}: ClipboardIndexPasteRegionOptions): ClipboardIndexPasteRegionPlan {
  const previousIndexData = extractIndexRegion(targetIndexBuffer, targetWidth, destinationBounds);
  const nextIndexData = new Uint8Array(previousIndexData);

  for (let y = 0; y < destinationBounds.height; y++) {
    for (let x = 0; x < destinationBounds.width; x++) {
      const pixelIndex = y * destinationBounds.width + x;
      const sourceIndex = sourceIndexData[pixelIndex] ?? 0;

      if (sourceIndex === 0) continue;
      if (
        !isVisiblePixel(
          x,
          y,
          destinationBounds.width,
          destinationBounds.height,
          shape,
          mask,
          pixelIndex
        )
      ) {
        continue;
      }

      nextIndexData[pixelIndex] = sourceIndex;
    }
  }

  return { previousIndexData, nextIndexData };
}
