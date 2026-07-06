/**
 * Indexed color management for palette-based pixel art.
 *
 * Manages the mapping between hex colors and palette indices.
 * Index 0 is reserved for transparent, palette colors start at index 1.
 */

import { normalizeHex, hexToRgb, rgbToHsl, hslDistance } from './color-utils';
import { MAX_PALETTE_SIZE } from './types';

/**
 * Build the color-to-index lookup map for the palette.
 */
export function buildColorMaps(mainColors: string[]): {
  colorToIndex: Map<string, number>;
} {
  const colorToIndex = new Map<string, number>();

  // Index 0 is reserved for transparent, so palette colors start at index 1
  mainColors.forEach((color, i) => {
    colorToIndex.set(normalizeHex(color), i + 1);
  });

  return { colorToIndex };
}

/**
 * Get the palette index for a color.
 * Returns 0 (transparent) if not found.
 */
export function getColorIndex(
  color: string,
  colorToIndex: Map<string, number>
): number {
  return colorToIndex.get(normalizeHex(color)) ?? 0;
}

/**
 * Check if a color is in the palette.
 */
export function isMainPaletteColor(
  color: string,
  colorToIndex: Map<string, number>
): boolean {
  return colorToIndex.has(normalizeHex(color));
}

/**
 * Find the best insertion index for a new color based on hue proximity.
 * Creates natural lightness gradients within hue groups.
 */
export function findInsertionIndex(hex: string, colors: string[]): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return colors.length; // Append at end

  const newHsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  let bestIndex = colors.length;
  let bestDistance = Infinity;

  for (let i = 0; i < colors.length; i++) {
    const existingRgb = hexToRgb(colors[i]);
    if (!existingRgb) continue;

    const existingHsl = rgbToHsl(existingRgb.r, existingRgb.g, existingRgb.b);
    const distance = hslDistance(newHsl, existingHsl);

    if (distance < bestDistance) {
      bestDistance = distance;
      // Insert after colors that are darker, before colors that are lighter
      // This creates natural lightness gradients within hue groups
      bestIndex = existingHsl.l < newHsl.l ? i + 1 : i;
    }
  }

  return bestIndex;
}

/**
 * Find the closest existing color index for a given hex color.
 * Used when palette is full.
 */
export function findClosestColorIndex(hex: string, colors: string[]): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1; // Return first color if parse fails

  const targetHsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  let bestIndex = 1;
  let bestDistance = Infinity;

  for (let i = 0; i < colors.length; i++) {
    const existingRgb = hexToRgb(colors[i]);
    if (!existingRgb) continue;

    const existingHsl = rgbToHsl(existingRgb.r, existingRgb.g, existingRgb.b);
    const distance = hslDistance(targetHsl, existingHsl);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i + 1; // 1-based index
    }
  }

  return bestIndex;
}

/**
 * Get a color for a palette index (1-based).
 * Returns null for transparent (0) or invalid index.
 */
export function getColorByIndex(
  index: number,
  mainColors: string[]
): string | null {
  if (index === 0) return null; // Transparent

  const mainLength = mainColors.length;

  if (index >= 1 && index <= mainLength) {
    return mainColors[index - 1];
  }

  return null;
}

/**
 * Check if adding a new color would exceed the palette limit.
 */
export function wouldExceedPaletteLimit(mainCount: number): boolean {
  return mainCount >= MAX_PALETTE_SIZE;
}
