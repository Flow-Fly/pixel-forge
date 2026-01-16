/**
 * Hue Grouping Module
 *
 * Provides hue family detection and color grouping utilities for
 * auto-sorting palette colors by hue (HSL or CIE Lab color space).
 */

import { hexToRgb, rgbToHsl, rgbToLab, labHue, labChroma, normalizeHex } from './color-utils';

/**
 * Color sorting mode.
 */
export enum SortMode {
  /** No sorting - original order */
  None = 'none',
  /** HSL-based hue grouping */
  HSL = 'hsl',
  /** CIE Lab-based hue grouping (perceptually uniform) */
  Lab = 'lab',
}

/**
 * Hue family classification based on color wheel degrees.
 */
export enum HueFamily {
  Red = 'red',
  Orange = 'orange',
  Yellow = 'yellow',
  Green = 'green',
  Cyan = 'cyan',
  Blue = 'blue',
  Purple = 'purple',
  Magenta = 'magenta',
  Neutral = 'neutral',
}

/**
 * Display color with full context for grid rendering.
 */
export interface DisplayColor {
  /** Hex color value */
  color: string;
  /** Whether this is an ephemeral (uncommitted) color */
  isEphemeral: boolean;
  /** Index in the source array (mainColors or ephemeralColors) */
  originalIndex: number;
  /** True if this is the first color in a hue group (for dividers) */
  groupStart?: boolean;
  /** Hue family for applying group-specific CSS (HSL mode) */
  hueFamily?: HueFamily;
  /** Lab lightness for sorting (Lab mode) */
  labL?: number;
  /** Lab hue angle for grouping (Lab mode) */
  labHue?: number;
  /** Lab chroma for neutral detection (Lab mode) */
  labChroma?: number;
}

/**
 * Neutral saturation threshold (0-1 scale).
 * Colors with saturation below this are considered neutral/gray.
 */
const NEUTRAL_THRESHOLD = 0.1;

/**
 * Order of hue families for display (warm to cool, neutrals last).
 */
const HUE_FAMILY_ORDER: HueFamily[] = [
  HueFamily.Red,
  HueFamily.Orange,
  HueFamily.Yellow,
  HueFamily.Green,
  HueFamily.Cyan,
  HueFamily.Blue,
  HueFamily.Purple,
  HueFamily.Magenta,
  HueFamily.Neutral,
];

/**
 * Get the hue family for a given hex color.
 * Handles red wrap-around (330-360 and 0-30 both map to Red).
 */
export function getHueFamily(hex: string): HueFamily {
  // Normalize 3-digit hex to 6-digit
  const normalizedHex = normalizeHex(hex);
  const rgb = hexToRgb(normalizedHex);
  if (!rgb) return HueFamily.Neutral;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Neutral detection: low saturation or extreme lightness
  if (hsl.s < NEUTRAL_THRESHOLD || hsl.l < 0.05 || hsl.l > 0.95) {
    return HueFamily.Neutral;
  }

  // Convert hue from 0-1 to degrees (0-360)
  const hueDegrees = hsl.h * 360;

  // Hue ranges (handling red wrap-around)
  if (hueDegrees >= 330 || hueDegrees < 30) return HueFamily.Red;
  if (hueDegrees >= 30 && hueDegrees < 60) return HueFamily.Orange;
  if (hueDegrees >= 60 && hueDegrees < 90) return HueFamily.Yellow;
  if (hueDegrees >= 90 && hueDegrees < 150) return HueFamily.Green;
  if (hueDegrees >= 150 && hueDegrees < 210) return HueFamily.Cyan;
  if (hueDegrees >= 210 && hueDegrees < 270) return HueFamily.Blue;
  if (hueDegrees >= 270 && hueDegrees < 300) return HueFamily.Purple;
  if (hueDegrees >= 300 && hueDegrees < 330) return HueFamily.Magenta;

  return HueFamily.Neutral;
}

/**
 * Get a subtle background tint color for a hue family.
 * Returns rgba with very low opacity for neighborhood effect.
 */
export function getHueFamilyColor(family: HueFamily): string {
  switch (family) {
    case HueFamily.Red:
      return 'rgba(255, 100, 100, 0.05)';
    case HueFamily.Orange:
      return 'rgba(255, 165, 0, 0.05)';
    case HueFamily.Yellow:
      return 'rgba(255, 255, 100, 0.05)';
    case HueFamily.Green:
      return 'rgba(100, 200, 100, 0.05)';
    case HueFamily.Cyan:
      return 'rgba(100, 200, 200, 0.05)';
    case HueFamily.Blue:
      return 'rgba(100, 100, 255, 0.05)';
    case HueFamily.Purple:
      return 'rgba(150, 100, 200, 0.05)';
    case HueFamily.Magenta:
      return 'rgba(200, 100, 200, 0.05)';
    case HueFamily.Neutral:
      return 'rgba(128, 128, 128, 0.03)';
  }
}

/**
 * Group colors by hue family.
 */
export function groupColorsByHue(colors: string[]): Map<HueFamily, string[]> {
  const groups = new Map<HueFamily, string[]>();

  for (const color of colors) {
    const family = getHueFamily(color);
    const group = groups.get(family) || [];
    group.push(color);
    groups.set(family, group);
  }

  return groups;
}

/**
 * Sort colors within a group by lightness (dark to light).
 */
export function sortWithinGroup(colors: string[]): string[] {
  return [...colors].sort((a, b) => {
    const rgbA = hexToRgb(a);
    const rgbB = hexToRgb(b);
    if (!rgbA || !rgbB) return 0;

    const hslA = rgbToHsl(rgbA.r, rgbA.g, rgbA.b);
    const hslB = rgbToHsl(rgbB.r, rgbB.g, rgbB.b);

    return hslA.l - hslB.l;
  });
}

/** Chroma threshold below which colors are considered neutral in Lab space */
const LAB_NEUTRAL_CHROMA = 10;

/** Number of hue bins for Lab grouping (divides 360 degrees) */
const LAB_HUE_BINS = 8;

/**
 * Get merged display colors from main and ephemeral colors.
 *
 * When sortMode is 'none':
 * - Main colors appear first in their original order
 * - Ephemeral colors appear after, in their original order
 *
 * When sortMode is 'hsl':
 * - All colors are grouped by HSL hue family
 * - Within each group, colors are sorted by lightness
 * - Groups appear in HUE_FAMILY_ORDER
 *
 * When sortMode is 'lab':
 * - All colors are grouped by CIE Lab hue angle (perceptually uniform)
 * - Within each group, colors are sorted by Lab lightness
 * - Provides more perceptually even distribution
 */
export function getMergedDisplayColors(
  mainColors: string[],
  ephemeralColors: string[],
  sortMode: SortMode | boolean
): DisplayColor[] {
  // Handle legacy boolean parameter
  const mode = typeof sortMode === 'boolean'
    ? (sortMode ? SortMode.HSL : SortMode.None)
    : sortMode;

  if (mode === SortMode.None) {
    // Simple merge: main first, then ephemeral
    const result: DisplayColor[] = [];

    for (let i = 0; i < mainColors.length; i++) {
      result.push({
        color: mainColors[i],
        isEphemeral: false,
        originalIndex: i,
      });
    }

    for (let i = 0; i < ephemeralColors.length; i++) {
      result.push({
        color: ephemeralColors[i],
        isEphemeral: true,
        originalIndex: i,
      });
    }

    return result;
  }

  if (mode === SortMode.Lab) {
    return getMergedDisplayColorsLab(mainColors, ephemeralColors);
  }

  // HSL mode: group by hue family, sort by lightness within groups
  return getMergedDisplayColorsHSL(mainColors, ephemeralColors);
}

/**
 * HSL-based color sorting (original implementation).
 */
function getMergedDisplayColorsHSL(
  mainColors: string[],
  ephemeralColors: string[]
): DisplayColor[] {
  const allColors: DisplayColor[] = [];

  for (let i = 0; i < mainColors.length; i++) {
    allColors.push({
      color: mainColors[i],
      isEphemeral: false,
      originalIndex: i,
      hueFamily: getHueFamily(mainColors[i]),
    });
  }

  for (let i = 0; i < ephemeralColors.length; i++) {
    allColors.push({
      color: ephemeralColors[i],
      isEphemeral: true,
      originalIndex: i,
      hueFamily: getHueFamily(ephemeralColors[i]),
    });
  }

  // Group by hue family
  const groups = new Map<HueFamily, DisplayColor[]>();
  for (const displayColor of allColors) {
    const family = displayColor.hueFamily || HueFamily.Neutral;
    const group = groups.get(family) || [];
    group.push(displayColor);
    groups.set(family, group);
  }

  // Sort within each group by lightness
  for (const [, group] of groups) {
    group.sort((a, b) => {
      const rgbA = hexToRgb(normalizeHex(a.color));
      const rgbB = hexToRgb(normalizeHex(b.color));
      if (!rgbA || !rgbB) return 0;

      const hslA = rgbToHsl(rgbA.r, rgbA.g, rgbA.b);
      const hslB = rgbToHsl(rgbB.r, rgbB.g, rgbB.b);

      return hslA.l - hslB.l;
    });
  }

  // Build result in hue family order
  const result: DisplayColor[] = [];
  let isFirstGroup = true;
  for (const family of HUE_FAMILY_ORDER) {
    const group = groups.get(family);
    if (!group || group.length === 0) continue;

    // Mark first color in group with groupStart (except the very first group)
    if (!isFirstGroup) {
      group[0].groupStart = true;
    }
    isFirstGroup = false;

    for (const displayColor of group) {
      result.push(displayColor);
    }
  }

  return result;
}

/**
 * CIE Lab-based color sorting (perceptually uniform).
 */
function getMergedDisplayColorsLab(
  mainColors: string[],
  ephemeralColors: string[]
): DisplayColor[] {
  const allColors: DisplayColor[] = [];

  // Build display colors with Lab data
  const addColor = (color: string, isEphemeral: boolean, originalIndex: number) => {
    const normalizedHex = normalizeHex(color);
    const rgb = hexToRgb(normalizedHex);
    if (!rgb) {
      allColors.push({ color, isEphemeral, originalIndex });
      return;
    }

    const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
    const hue = labHue(lab);
    const chroma = labChroma(lab);

    allColors.push({
      color,
      isEphemeral,
      originalIndex,
      labL: lab.l,
      labHue: hue,
      labChroma: chroma,
    });
  };

  for (let i = 0; i < mainColors.length; i++) {
    addColor(mainColors[i], false, i);
  }

  for (let i = 0; i < ephemeralColors.length; i++) {
    addColor(ephemeralColors[i], true, i);
  }

  // Group by Lab hue bins (or neutral for low chroma)
  const hueBinSize = 360 / LAB_HUE_BINS;
  const groups = new Map<number, DisplayColor[]>();
  const neutralGroup: DisplayColor[] = [];

  for (const displayColor of allColors) {
    // Low chroma = neutral
    if (displayColor.labChroma === undefined || displayColor.labChroma < LAB_NEUTRAL_CHROMA) {
      neutralGroup.push(displayColor);
    } else {
      // Bin by hue angle
      const bin = Math.floor((displayColor.labHue || 0) / hueBinSize);
      const group = groups.get(bin) || [];
      group.push(displayColor);
      groups.set(bin, group);
    }
  }

  // Sort within each group by Lab lightness
  const sortByLabLightness = (a: DisplayColor, b: DisplayColor) => {
    return (a.labL || 0) - (b.labL || 0);
  };

  for (const [, group] of groups) {
    group.sort(sortByLabLightness);
  }
  neutralGroup.sort(sortByLabLightness);

  // Build result: hue bins in order, then neutrals
  const result: DisplayColor[] = [];
  let isFirstGroup = true;

  // Get sorted bin keys (hue order)
  const sortedBins = [...groups.keys()].sort((a, b) => a - b);

  for (const bin of sortedBins) {
    const group = groups.get(bin);
    if (!group || group.length === 0) continue;

    if (!isFirstGroup) {
      group[0].groupStart = true;
    }
    isFirstGroup = false;

    for (const displayColor of group) {
      result.push(displayColor);
    }
  }

  // Add neutrals at the end
  if (neutralGroup.length > 0) {
    if (!isFirstGroup) {
      neutralGroup[0].groupStart = true;
    }
    for (const displayColor of neutralGroup) {
      result.push(displayColor);
    }
  }

  return result;
}
