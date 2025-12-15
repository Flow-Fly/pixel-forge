/**
 * Palette Store - Main Entry Point
 *
 * Re-exports the palette store and related types for backward compatibility.
 */

// Main store
export { paletteStore } from './store';

// Types and constants
export {
  PRESET_PALETTES,
  PALETTE_BY_ID,
  MAX_PALETTE_SIZE,
  DB32_COLORS,
} from './types';
export type { PresetPalette, CustomPalette } from './types';

// Color utilities
export {
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  hslDistance,
} from './color-utils';
export type { RGB, HSL } from './color-utils';

// Indexed color operations
export {
  buildColorMaps,
  getColorIndex,
  isMainPaletteColor,
  isEphemeralColor,
  findInsertionIndex,
  findClosestColorIndex,
  getColorByIndex,
  wouldExceedPaletteLimit,
} from './indexed-color';

// Extraction
export {
  extractColorsFromDrawing,
  clusterColors,
  filterExistingColors,
} from './extraction';

// Variations
export { getLightnessVariations } from './variations';

// Persistence
export {
  loadFromStorage,
  saveToStorage,
  loadCustomPalettes,
  saveAsNewPalette,
  updatePalette,
  deletePalette,
  renamePalette,
  getPaletteName,
} from './persistence';

// Module re-exports for direct access
export * as colorUtils from './color-utils';
export * as indexedColor from './indexed-color';
export * as extraction from './extraction';
export * as variations from './variations';
export * as persistence from './persistence';
