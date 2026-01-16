import { signal } from '../core/signal';
import { paletteStore } from './palette';

class ColorStore {
  primaryColor = signal('#000000');
  secondaryColor = signal('#ffffff');
  lightnessIndex = signal(3); // Default to middle (50%)
  lightnessVariations = signal<string[]>([]);

  /**
   * True when primaryColor came from shade generation (not direct palette selection).
   * When true, drawing will use ephemeral color indexing instead of adding to main palette.
   */
  isEphemeralColor = signal(false);

  constructor() {
    // Initialize variations for the default color
    this.updateLightnessVariations(this.primaryColor.value);
  }

  /**
   * Set primary color from main palette selection.
   * This marks the color as non-ephemeral (direct palette pick).
   */
  setPrimaryColor(color: string) {
    this.primaryColor.value = color;
    // Check if this color is in the main palette
    this.isEphemeralColor.value = !paletteStore.isMainPaletteColor(color);
  }

  /**
   * Set primary color from shade/variation selection.
   * This marks the color as ephemeral (generated shade).
   */
  setPrimaryColorFromShade(color: string) {
    this.primaryColor.value = color;
    // Mark as ephemeral unless it happens to be in main palette
    this.isEphemeralColor.value = !paletteStore.isMainPaletteColor(color);
  }

  setSecondaryColor(color: string) {
    this.secondaryColor.value = color;
  }

  swapColors() {
    const temp = this.primaryColor.value;
    this.primaryColor.value = this.secondaryColor.value;
    this.secondaryColor.value = temp;
    // Update ephemeral status based on new primary color
    this.isEphemeralColor.value = !paletteStore.isMainPaletteColor(this.primaryColor.value);
    // Update lightness variations for the new primary color
    this.updateLightnessVariations(this.primaryColor.value);
  }

  /**
   * Update lightness variations from a new color (e.g., picked from palette).
   * Calculates the closest lightness index for the given color.
   */
  updateLightnessVariations(color: string) {
    const variations = paletteStore.getLightnessVariations(color);
    this.lightnessVariations.value = variations;
    this.lightnessIndex.value = this.findClosestLightnessIndex(color, variations);
  }

  /**
   * Shift to a darker lightness level (wraps from darkest to lightest).
   */
  shiftLightnessDarker() {
    if (this.lightnessVariations.value.length === 0) return;
    this.lightnessIndex.value = (this.lightnessIndex.value - 1 + 7) % 7;
    const color = this.lightnessVariations.value[this.lightnessIndex.value];
    this.primaryColor.value = color;
    // Mark as ephemeral unless this shade happens to be in main palette
    this.isEphemeralColor.value = !paletteStore.isMainPaletteColor(color);
  }

  /**
   * Shift to a lighter lightness level (wraps from lightest to darkest).
   */
  shiftLightnessLighter() {
    if (this.lightnessVariations.value.length === 0) return;
    this.lightnessIndex.value = (this.lightnessIndex.value + 1) % 7;
    const color = this.lightnessVariations.value[this.lightnessIndex.value];
    this.primaryColor.value = color;
    // Mark as ephemeral unless this shade happens to be in main palette
    this.isEphemeralColor.value = !paletteStore.isMainPaletteColor(color);
  }

  /**
   * Set color directly from a lightness index (e.g., from lightness bar click).
   */
  setLightnessIndex(index: number) {
    if (index >= 0 && index < this.lightnessVariations.value.length) {
      this.lightnessIndex.value = index;
      const color = this.lightnessVariations.value[index];
      this.primaryColor.value = color;
      // Mark as ephemeral unless this shade happens to be in main palette
      this.isEphemeralColor.value = !paletteStore.isMainPaletteColor(color);
    }
  }

  private findClosestLightnessIndex(color: string, variations: string[]): number {
    const normalizedColor = color.toLowerCase();
    // First check for exact match
    const exactIndex = variations.findIndex(v => v.toLowerCase() === normalizedColor);
    if (exactIndex !== -1) return exactIndex;

    // Calculate lightness of the input color and find closest
    const rgb = this.hexToRgb(color);
    if (!rgb) return 3; // Default to middle

    const inputLightness = this.rgbToLightness(rgb.r, rgb.g, rgb.b);
    const lightnessLevels = [0.15, 0.25, 0.35, 0.50, 0.65, 0.75, 0.85];

    let closestIndex = 3;
    let closestDiff = Math.abs(inputLightness - lightnessLevels[3]);

    for (let i = 0; i < lightnessLevels.length; i++) {
      const diff = Math.abs(inputLightness - lightnessLevels[i]);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }

    return closestIndex;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  private rgbToLightness(r: number, g: number, b: number): number {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return (max + min) / 2;
  }
}

export const colorStore = new ColorStore();
