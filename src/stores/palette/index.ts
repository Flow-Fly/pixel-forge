/**
 * Palette Store - Main Entry Point
 *
 * Re-exports the palette store and related types for backward compatibility.
 */

import { defaultProjectContext } from '../project-context';

// Main store
export const paletteStore = defaultProjectContext.palette;

// Types and constants
export { PRESET_PALETTES } from './types';
export type { PresetPalette, CustomPalette } from './types';
