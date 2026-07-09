import type { ClipboardIndexedSelection } from '../stores/clipboard';
import { normalizeHex } from '../stores/palette/color-utils';
import type { Rect } from '../types/geometry';
import type { SelectionShape } from '../types/selection';

interface ClipboardIndexedSelectionOptions {
  bounds: Rect;
  shape: SelectionShape;
  mask?: Uint8Array;
  indexBuffer?: Uint8Array;
  canvasWidth: number;
  sourceColors: string[];
}

function shouldCopyIndex(mask: Uint8Array | undefined, index: number): boolean {
  return !mask || mask[index] !== 0;
}

function sourceOffset(
  bounds: Rect,
  canvasWidth: number,
  x: number,
  y: number
): number {
  return (bounds.y + y) * canvasWidth + bounds.x + x;
}

export function createClipboardIndexedSelection({
  bounds,
  shape,
  mask,
  indexBuffer,
  canvasWidth,
  sourceColors,
}: ClipboardIndexedSelectionOptions): ClipboardIndexedSelection | undefined {
  if (!indexBuffer) return undefined;
  if (bounds.width <= 0 || bounds.height <= 0 || canvasWidth <= 0) return undefined;

  const indexData = new Uint8Array(bounds.width * bounds.height);
  const used = new Set<number>();
  const usedIndices: number[] = [];

  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      const targetIndex = y * bounds.width + x;
      if (!shouldCopyIndex(mask, targetIndex)) continue;

      const offset = sourceOffset(bounds, canvasWidth, x, y);
      const paletteIndex = indexBuffer[offset] ?? 0;
      indexData[targetIndex] = paletteIndex;

      if (paletteIndex === 0 || used.has(paletteIndex)) continue;

      used.add(paletteIndex);
      usedIndices.push(paletteIndex);
    }
  }

  return {
    indexData,
    sourceColors: sourceColors.map(normalizeHex),
    usedIndices,
    shape,
    mask: mask ? new Uint8Array(mask) : undefined,
    width: bounds.width,
    height: bounds.height,
  };
}
