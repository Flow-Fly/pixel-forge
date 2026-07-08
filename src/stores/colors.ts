import { signal } from '../core/signal';
import { hexToRgb } from './palette/color-utils';
import { paletteStore } from './palette';

interface LightnessPalette {
  getLightnessVariations(color: string): string[];
}

class ColorStore {
  primaryColor = signal('#000000');
  secondaryColor = signal('#ffffff');
  lightnessIndex = signal(3); // Default to middle (50%)
  lightnessVariations = signal<string[]>([]);
  private readonly palette: LightnessPalette;

  constructor(palette: LightnessPalette = paletteStore) {
    this.palette = palette;
    // Initialize variations for the default color
    this.updateLightnessVariations(this.primaryColor.value);
  }

  setPrimaryColor(color: string) {
    this.primaryColor.value = color;
  }

  setPrimaryColorFromShade(color: string) {
    this.primaryColor.value = color;
  }

  setSecondaryColor(color: string) {
    this.secondaryColor.value = color;
  }

  swapColors() {
    const temp = this.primaryColor.value;
    this.primaryColor.value = this.secondaryColor.value;
    this.secondaryColor.value = temp;
  }

  /**
   * Update lightness variations from a new color (e.g., picked from palette).
   * Calculates the closest lightness index for the given color.
   */
  updateLightnessVariations(color: string) {
    const variations = this.palette.getLightnessVariations(color);
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
  }

  /**
   * Shift to a lighter lightness level (wraps from lightest to darkest).
   */
  shiftLightnessLighter() {
    if (this.lightnessVariations.value.length === 0) return;
    this.lightnessIndex.value = (this.lightnessIndex.value + 1) % 7;
    const color = this.lightnessVariations.value[this.lightnessIndex.value];
    this.primaryColor.value = color;
  }

  /**
   * Set color directly from a lightness index (e.g., from lightness bar click).
   */
  setLightnessIndex(index: number) {
    if (index >= 0 && index < this.lightnessVariations.value.length) {
      this.lightnessIndex.value = index;
      const color = this.lightnessVariations.value[index];
      this.primaryColor.value = color;
    }
  }

  private findClosestLightnessIndex(color: string, variations: string[]): number {
    const normalizedColor = color.toLowerCase();
    // First check for exact match
    const exactIndex = variations.findIndex(v => v.toLowerCase() === normalizedColor);
    if (exactIndex !== -1) return exactIndex;

    // Calculate lightness of the input color and find closest
    const rgb = hexToRgb(color);
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


  private rgbToLightness(r: number, g: number, b: number): number {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return (max + min) / 2;
  }
}

export function createColorStore(palette?: LightnessPalette) {
  return new ColorStore(palette);
}

export const colorStore = createColorStore();
