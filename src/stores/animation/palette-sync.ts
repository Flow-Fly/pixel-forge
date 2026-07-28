/**
 * Palette synchronization for animation cels.
 *
 * When palette colors change (reorder, remove, insert, replace),
 * index buffers need to be remapped to maintain correct colors.
 */

import type { Cel } from '../../types/animation';
import { normalizeHex } from '../palette/color-utils';
import {
  rebuildAllCelCanvases,
  type PaletteColorSource,
} from './index-buffer';

type IndexMapper = (oldIndex: number) => number;

export interface PaletteIndexLookup extends PaletteColorSource {
  getColorIndex(color: string): number;
  findClosestColorIndex(color: string): number;
}

function rebuildChangedCels(
  cels: Map<string, Cel>,
  palette: PaletteIndexLookup
): Map<string, Cel> {
  const newCels = new Map(cels);
  rebuildAllCelCanvases(newCels, palette.colors.value);
  return newCels;
}

function remapCelBuffers(
  cels: Map<string, Cel>,
  mapIndex: IndexMapper,
  palette: PaletteIndexLookup,
  options: { skipTextCels?: boolean } = {}
): Map<string, Cel> {
  const remappedBuffers = new Set<Uint8Array>();

  for (const cel of cels.values()) {
    if (!cel.indexBuffer) continue;
    if (options.skipTextCels && cel.textCelData) continue;
    if (remappedBuffers.has(cel.indexBuffer)) continue;

    remapBuffer(cel.indexBuffer, mapIndex);
    remappedBuffers.add(cel.indexBuffer);
  }

  return rebuildChangedCels(cels, palette);
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
  toIndex: number,
  palette: PaletteIndexLookup
): Map<string, Cel> {
  return remapCelBuffers(
    cels,
    oldIndex => getReorderedIndex(oldIndex, fromIndex, toIndex),
    palette,
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
  removedIndex: number,
  replacementIndex = 0,
  palette: PaletteIndexLookup
): Map<string, Cel> {
  return remapCelBuffers(
    cels,
    oldIndex => getIndexAfterRemoval(oldIndex, removedIndex, replacementIndex),
    palette,
  );
}

function getIndexAfterRemoval(
  oldIndex: number,
  removedIndex: number,
  replacementIndex: number
): number {
  if (oldIndex === removedIndex) return replacementIndex;
  if (oldIndex > removedIndex) return oldIndex - 1;
  return oldIndex;
}

/**
 * Handle palette color insertion - shift indices up.
 */
function handlePaletteColorInserted(
  cels: Map<string, Cel>,
  insertedIndex: number,
  palette: PaletteIndexLookup
): Map<string, Cel> {
  return remapCelBuffers(
    cels,
    oldIndex => oldIndex >= insertedIndex ? oldIndex + 1 : oldIndex,
    palette,
  );
}

/**
 * Handle palette replacement with color-based index remapping.
 */
function handlePaletteReplacedWithRemap(
  cels: Map<string, Cel>,
  oldMainColors: string[],
  palette: PaletteIndexLookup
): Map<string, Cel> {
  const oldIndexToColor = buildOldIndexToColor(oldMainColors);

  return remapCelBuffers(
    cels,
    oldIndex => getReplacementIndex(oldIndex, oldIndexToColor, palette),
    palette,
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
  oldIndexToColor: Map<number, string>,
  palette: PaletteIndexLookup
): number {
  const color = oldIndexToColor.get(oldIndex);
  if (!color) return oldIndex;

  const exactIndex = palette.getColorIndex(color);
  if (exactIndex !== 0) return exactIndex;

  const closestIndex = palette.findClosestColorIndex(color);
  return closestIndex === 0 ? oldIndex : closestIndex;
}

/**
 * Start palette event listeners.
 * Returns a cleanup function to stop listening.
 */
export function startPaletteSync(
  events: EventTarget,
  palette: PaletteIndexLookup,
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
          detail.oldMainColors,
          palette
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
      const newCels = handlePaletteReorder(getCels(), fromIndex, toIndex, palette);
      setCels(newCels);
    },

    'palette-color-removed': (event: Event) => {
      const { removedIndex, replacementIndex } = (event as CustomEvent).detail;
      const newCels = handlePaletteColorRemoved(
        getCels(),
        removedIndex,
        replacementIndex,
        palette
      );
      setCels(newCels);
    },

    'palette-color-inserted': (event: Event) => {
      const { insertedIndex } = (event as CustomEvent).detail;
      const newCels = handlePaletteColorInserted(getCels(), insertedIndex, palette);
      setCels(newCels);
    },
  };

  // Add all listeners
  for (const [event, handler] of Object.entries(handlers)) {
    events.addEventListener(event, handler as EventListener);
  }

  // Return cleanup function
  return () => {
    for (const [event, handler] of Object.entries(handlers)) {
      events.removeEventListener(event, handler as EventListener);
    }
  };
}
