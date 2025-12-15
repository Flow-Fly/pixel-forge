/**
 * Lightness variations (smart shade generation).
 *
 * Generates pixel-art-style color shades with hue shifting.
 * Shadows shift toward blue/purple, highlights toward yellow/orange.
 */

import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex } from './color-utils';

/**
 * Shade parameters: [lightness%, hueShift°, saturationShift%]
 * Positive hue shift = toward blue (shadows)
 * Negative hue shift = toward yellow (highlights)
 */
const SHADE_PARAMS: [number, number, number][] = [
  [15, 8, -15],   // Dark shadow - moderate shift, significant desat
  [25, 12, -10],  // Peak shadow shift
  [35, 6, -5],    // Light shadow
  [50, 0, 0],     // Base color - no shift
  [65, -6, -5],   // Light highlight
  [75, -12, -10], // Peak highlight shift
  [85, -8, -15],  // Bright highlight - moderate shift, significant desat
];

/**
 * Generate lightness variations for a given color with pixel-art-style hue shifting.
 * Shadows shift toward blue/purple, highlights shift toward yellow/orange.
 * Peak shift occurs at mid-tones (25% and 75%), tapering at extremes.
 * Returns 7 variations from dark to light.
 */
export function getLightnessVariations(hexColor: string): string[] {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return [hexColor];

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const variations: string[] = [];

  // Check if color is grayscale (skip hue shifting)
  const isGrayscale = hsl.s < 0.05;

  // Check if hue is already in shadow/highlight direction (reduce shift)
  // Hue is 0-1, so blue is ~0.55-0.72 (200-260°) and yellow/orange is ~0.08-0.17 (30-60°)
  const hueInDegrees = hsl.h * 360;
  const isAlreadyBlue = hueInDegrees >= 200 && hueInDegrees <= 260;
  const isAlreadyYellow = hueInDegrees >= 30 && hueInDegrees <= 60;

  for (const [lightness, hueShift, satShift] of SHADE_PARAMS) {
    let newHue = hsl.h;
    let newSat = hsl.s;

    if (!isGrayscale) {
      // Apply hue shift (convert degrees to 0-1 range)
      let adjustedHueShift = hueShift / 360;

      // Reduce shift if color is already in that direction
      if (hueShift > 0 && isAlreadyBlue) {
        adjustedHueShift *= 0.5; // Reduce shadow shift for blue colors
      } else if (hueShift < 0 && isAlreadyYellow) {
        adjustedHueShift *= 0.5; // Reduce highlight shift for yellow colors
      }

      newHue = (hsl.h + adjustedHueShift + 1) % 1; // Keep in 0-1 range

      // Apply saturation shift (relative to current saturation)
      newSat = Math.max(0, Math.min(1, hsl.s * (1 + satShift / 100)));
    }

    const newRgb = hslToRgb(newHue, newSat, lightness / 100);
    variations.push(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
  }

  return variations;
}
