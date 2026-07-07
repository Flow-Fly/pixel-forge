/**
 * Palette synchronization for animation cels.
 *
 * When palette colors change (reorder, remove, insert, replace),
 * index buffers need to be remapped to maintain correct colors.
 */

import type { Cel } from '../../types/animation';
import { paletteStore } from '../palette';
import { normalizeHex } from '../palette/color-utils';
import { rebuildAllCelCanvases } from './index-buffer';

type IndexMapper = (oldIndex: number) => number;

function rebuildChangedCels(cels: Map<string, Cel>): Map<string, Cel> {
  const newCels = new Map(cels);
  rebuildAllCelCanvases(newCels);
  return newCels;
}

function remapCelBuffers(
  cels: Map<string, Cel>,
  mapIndex: IndexMapper,
  options: { skipTextCels?: boolean } = {}
): Map<string, Cel> {
  for (const cel of cels.values()) {
    if (!cel.indexBuffer) continue;
    if (options.skipTextCels && cel.textCelData) continue;

    remapBuffer(cel.indexBuffer, mapIndex);
  }

  return rebuildChangedCels(cels);
}

function remapBuffer(buffer: Uint8Array, mapIndex: IndexMapper): void {
  for (let i = 0; i < buffer.length; i++) {
    const oldIndex = buffer[i];
    if (oldIndex === 0) continue;

    buffer[i] = mapIndex(oldIndex);
  }
}

/**
 * Handle palette color reorder - update index buffers to use new indices.
 */
function handlePaletteReorder(
  cels: Map<string, Cel>,
  fromIndex: number,
  toIndex: number
): Map<string, Cel> {
  return remapCelBuffers(cels, oldIndex =>
    getReorderedIndex(oldIndex, fromIndex, toIndex)
  );
}

function getReorderedIndex(
  oldIndex: number,
  fromIndex: number,
  toIndex: number
): number {
  if (oldIndex === fromIndex) return toIndex;

  if (fromIndex < toIndex && oldIndex > fromIndex && oldIndex <= toIndex) {
    return oldIndex - 1;
  }

  if (fromIndex > toIndex && oldIndex >= toIndex && oldIndex < fromIndex) {
    return oldIndex + 1;
  }

  return oldIndex;
}

/**
 * Handle palette color removal - remap affected pixels.
 */
function handlePaletteColorRemoved(
  cels: Map<string, Cel>,
  removedIndex: number
): Map<string, Cel> {
  return remapCelBuffers(cels, oldIndex =>
    getIndexAfterRemoval(oldIndex, removedIndex)
  );
}

function getIndexAfterRemoval(oldIndex: number, removedIndex: number): number {
  if (oldIndex === removedIndex) return 1;
  if (oldIndex > removedIndex) return oldIndex - 1;
  return oldIndex;
}

/**
 * Handle palette color insertion - shift indices up.
 */
function handlePaletteColorInserted(
  cels: Map<string, Cel>,
  insertedIndex: number
): Map<string, Cel> {
  return remapCelBuffers(cels, oldIndex =>
    oldIndex >= insertedIndex ? oldIndex + 1 : oldIndex
  );
}

/**
 * Handle palette replacement with color-based index remapping.
 */
function handlePaletteReplacedWithRemap(
  cels: Map<string, Cel>,
  oldMainColors: string[]
): Map<string, Cel> {
  const oldIndexToColor = buildOldIndexToColor(oldMainColors);

  return remapCelBuffers(
    cels,
    oldIndex => getReplacementIndex(oldIndex, oldIndexToColor),
    { skipTextCels: true }
  );
}

function buildOldIndexToColor(oldMainColors: string[]): Map<number, string> {
  const oldIndexToColor = new Map<number, string>();

  oldMainColors.forEach((color, i) => {
    oldIndexToColor.set(i + 1, normalizeHex(color));
  });

  return oldIndexToColor;
}

function getReplacementIndex(
  oldIndex: number,
  oldIndexToColor: Map<number, string>
): number {
  const color = oldIndexToColor.get(oldIndex);
  if (!color) return oldIndex;

  const exactIndex = paletteStore.getColorIndex(color);
  if (exactIndex !== 0) return exactIndex;

  const closestIndex = paletteStore.findClosestColorIndex(color);
  return closestIndex === 0 ? oldIndex : closestIndex;
}

/**
 * Set up palette event listeners.
 * Returns a cleanup function to remove listeners.
 */
export function setupPaletteListeners(
  getCels: () => Map<string, Cel>,
  setCels: (cels: Map<string, Cel>) => void,
  rebuildCanvases: () => void
): () => void {
  const handlers = {
    'palette-color-changed': () => {
      rebuildCanvases();
    },

    'palette-replaced': (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.skipRemap) {
        rebuildCanvases();
      } else if (detail?.oldMainColors) {
        const newCels = handlePaletteReplacedWithRemap(
          getCels(),
          detail.oldMainColors
        );
        setCels(newCels);
      } else {
        rebuildCanvases();
      }
    },

    'palette-reset': () => {
      rebuildCanvases();
    },

    'palette-colors-reordered': (event: Event) => {
      const { fromIndex, toIndex } = (event as CustomEvent).detail;
      const newCels = handlePaletteReorder(getCels(), fromIndex, toIndex);
      setCels(newCels);
    },

    'palette-color-removed': (event: Event) => {
      const { removedIndex } = (event as CustomEvent).detail;
      const newCels = handlePaletteColorRemoved(getCels(), removedIndex);
      setCels(newCels);
    },

    'palette-color-inserted': (event: Event) => {
      const { insertedIndex } = (event as CustomEvent).detail;
      const newCels = handlePaletteColorInserted(getCels(), insertedIndex);
      setCels(newCels);
    },
  };

  // Add all listeners
  for (const [event, handler] of Object.entries(handlers)) {
    window.addEventListener(event, handler as EventListener);
  }

  // Return cleanup function
  return () => {
    for (const [event, handler] of Object.entries(handlers)) {
      window.removeEventListener(event, handler as EventListener);
    }
  };
}
