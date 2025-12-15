/**
 * Palette store types and constants.
 */

import {
  PRESET_PALETTES,
  PALETTE_BY_ID,
  type PresetPalette,
} from '../../data/preset-palettes';
import type { CustomPalette } from '../../types/palette';

// Re-export for convenience
export { PRESET_PALETTES, PALETTE_BY_ID, type PresetPalette };
export type { CustomPalette };

/** Maximum number of colors in indexed mode (standard limit) */
export const MAX_PALETTE_SIZE = 256;

/** DB32 Palette - Default colors */
export const DB32_COLORS = PALETTE_BY_ID.get('db32')!.colors;
