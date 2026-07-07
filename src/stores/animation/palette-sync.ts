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

/**
 * Handle palette color reorder - update index buffers to use new indices.
 */
function handlePaletteReorder(
  cels: Map<string, Cel>,
  fromIndex: number,
  toIndex: number
): Map<string, Cel> {
  for (const [_key, cel] of cels) {
    if (!cel.indexBuffer) continue;

    const buffer = cel.indexBuffer;
    for (let i = 0; i < buffer.length; i++) {
      const oldIndex = buffer[i];
      if (oldIndex === 0) continue; // Skip transparent

      if (fromIndex < toIndex) {
        // Moving forward: indices between from+1 and to shift down by 1
        if (oldIndex === fromIndex) {
          buffer[i] = toIndex;
        } else if (oldIndex > fromIndex && oldIndex <= toIndex) {
          buffer[i] = oldIndex - 1;
        }
      } else {
        // Moving backward: indices between to and from-1 shift up by 1
        if (oldIndex === fromIndex) {
          buffer[i] = toIndex;
        } else if (oldIndex >= toIndex && oldIndex < fromIndex) {
          buffer[i] = oldIndex + 1;
        }
      }
    }
  }

  // Force new Map to trigger reactivity
  const newCels = new Map(cels);
  rebuildAllCelCanvases(newCels);
  return newCels;
}

/**
 * Handle palette color removal - remap affected pixels.
 */
function handlePaletteColorRemoved(
  cels: Map<string, Cel>,
  removedIndex: number
): Map<string, Cel> {
  for (const [_key, cel] of cels) {
    if (!cel.indexBuffer) continue;

    const buffer = cel.indexBuffer;
    for (let i = 0; i < buffer.length; i++) {
      const oldIndex = buffer[i];
      if (oldIndex === 0) continue;

      if (oldIndex === removedIndex) {
        // Remap to first color (fallback)
        buffer[i] = 1;
      } else if (oldIndex > removedIndex) {
        // Indices after removed one shift down
        buffer[i] = oldIndex - 1;
      }
    }
  }

  const newCels = new Map(cels);
  rebuildAllCelCanvases(newCels);
  return newCels;
}

/**
 * Handle palette color insertion - shift indices up.
 */
function handlePaletteColorInserted(
  cels: Map<string, Cel>,
  insertedIndex: number
): Map<string, Cel> {
  for (const [_key, cel] of cels) {
    if (!cel.indexBuffer) continue;

    const buffer = cel.indexBuffer;
    for (let i = 0; i < buffer.length; i++) {
      const oldIndex = buffer[i];
      if (oldIndex === 0) continue;

      if (oldIndex >= insertedIndex) {
        buffer[i] = oldIndex + 1;
      }
    }
  }

  const newCels = new Map(cels);
  rebuildAllCelCanvases(newCels);
  return newCels;
}

/**
 * Handle palette replacement with color-based index remapping.
 */
function handlePaletteReplacedWithRemap(
  cels: Map<string, Cel>,
  oldMainColors: string[]
): Map<string, Cel> {
  // Build lookup: old 1-based index -> hex color (normalized for consistent comparison)
  const oldIndexToColor = new Map<number, string>();

  oldMainColors.forEach((color, i) => {
    oldIndexToColor.set(i + 1, normalizeHex(color));
  });

  // Remap each pixel by color
  for (const [_key, cel] of cels) {
    if (!cel.indexBuffer) continue;
    if (cel.textCelData) continue;

    const buffer = cel.indexBuffer;
    for (let i = 0; i < buffer.length; i++) {
      const oldIndex = buffer[i];
      if (oldIndex === 0) continue;

      const color = oldIndexToColor.get(oldIndex);
      if (!color) continue;

      let newIndex = paletteStore.getColorIndex(color);
      if (newIndex === 0) {
        // Color not in new palette - find closest match
        newIndex = paletteStore.findClosestColorIndex(color);
      }
      if (newIndex !== 0) {
        buffer[i] = newIndex;
      }
    }
  }

  const newCels = new Map(cels);
  rebuildAllCelCanvases(newCels);
  return newCels;
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
