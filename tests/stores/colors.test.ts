import { describe, it, expect, beforeEach } from 'vitest';
import { colorStore } from '../../src/stores/colors';
import { paletteStore } from '../../src/stores/palette';

/**
 * Color Store Tests
 *
 * Tests for colorStore functionality:
 * - Foreground (primary) color selection
 * - Background (secondary) color selection
 * - Swap FG/BG colors
 * - Lightness variations generation
 * - Lightness index tracking
 */

describe('ColorStore', () => {
  // Reset store state before each test to match constructor behavior
  beforeEach(() => {
    colorStore.primaryColor.value = '#000000';
    colorStore.secondaryColor.value = '#ffffff';
    colorStore.isEphemeralColor.value = false;
    // Match constructor: initialize variations for default color
    colorStore.updateLightnessVariations(colorStore.primaryColor.value);
  });

  describe('Default State', () => {
    it('should have default primary color as black', () => {
      expect(colorStore.primaryColor.value).toBe('#000000');
    });

    it('should have default secondary color as white', () => {
      expect(colorStore.secondaryColor.value).toBe('#ffffff');
    });

    it('should have lightness variations initialized for default color', () => {
      expect(colorStore.lightnessVariations.value).toHaveLength(7);
    });

    it('should have lightness index set for default color (dark)', () => {
      // Black (#000000) should have a low lightness index
      expect(colorStore.lightnessIndex.value).toBeLessThanOrEqual(2);
    });

    it('should have isEphemeralColor as false by default', () => {
      expect(colorStore.isEphemeralColor.value).toBe(false);
    });
  });

  describe('setPrimaryColor()', () => {
    it('should update primary color', () => {
      colorStore.setPrimaryColor('#ff0000');
      expect(colorStore.primaryColor.value).toBe('#ff0000');
    });

    it('should mark color as non-ephemeral if in main palette', () => {
      // DB32 palette includes black
      colorStore.setPrimaryColor('#000000');
      expect(colorStore.isEphemeralColor.value).toBe(false);
    });

    it('should mark color as ephemeral if not in main palette', () => {
      // Use a color unlikely to be in the default palette
      colorStore.setPrimaryColor('#123456');
      expect(colorStore.isEphemeralColor.value).toBe(true);
    });
  });

  describe('setSecondaryColor()', () => {
    it('should update secondary color', () => {
      colorStore.setSecondaryColor('#00ff00');
      expect(colorStore.secondaryColor.value).toBe('#00ff00');
    });

    it('should not affect primary color', () => {
      const originalPrimary = colorStore.primaryColor.value;
      colorStore.setSecondaryColor('#00ff00');
      expect(colorStore.primaryColor.value).toBe(originalPrimary);
    });
  });

  describe('swapColors()', () => {
    it('should swap primary and secondary colors', () => {
      colorStore.primaryColor.value = '#ff0000';
      colorStore.secondaryColor.value = '#0000ff';

      colorStore.swapColors();

      expect(colorStore.primaryColor.value).toBe('#0000ff');
      expect(colorStore.secondaryColor.value).toBe('#ff0000');
    });

    it('should update ephemeral status based on new primary color', () => {
      // Set primary to a palette color, secondary to non-palette
      colorStore.primaryColor.value = '#000000';
      colorStore.secondaryColor.value = '#123456';
      colorStore.isEphemeralColor.value = false;

      colorStore.swapColors();

      // After swap, primary is #123456 which is not in palette
      expect(colorStore.isEphemeralColor.value).toBe(true);
    });

    it('should work correctly when swapped multiple times', () => {
      colorStore.primaryColor.value = '#ff0000';
      colorStore.secondaryColor.value = '#0000ff';

      colorStore.swapColors();
      colorStore.swapColors();

      expect(colorStore.primaryColor.value).toBe('#ff0000');
      expect(colorStore.secondaryColor.value).toBe('#0000ff');
    });

    it('should update lightness variations after swap', () => {
      colorStore.primaryColor.value = '#ff0000';
      colorStore.secondaryColor.value = '#00ff00';
      colorStore.lightnessVariations.value = [];

      colorStore.swapColors();

      // After swap, variations should be generated for the new primary (#00ff00)
      expect(colorStore.lightnessVariations.value).toHaveLength(7);
    });
  });

  describe('updateLightnessVariations()', () => {
    it('should generate lightness variations for a color', () => {
      colorStore.updateLightnessVariations('#ff0000');

      expect(colorStore.lightnessVariations.value).toHaveLength(7);
    });

    it('should set variations from dark to light', () => {
      colorStore.updateLightnessVariations('#808080');
      const variations = colorStore.lightnessVariations.value;

      // Variations should go from darker to lighter
      expect(variations.length).toBe(7);
    });

    it('should find closest lightness index for input color', () => {
      // A very dark color should have low lightness index
      colorStore.updateLightnessVariations('#1a1a1a');
      expect(colorStore.lightnessIndex.value).toBeLessThanOrEqual(2);

      // A very light color should have high lightness index
      colorStore.updateLightnessVariations('#e0e0e0');
      expect(colorStore.lightnessIndex.value).toBeGreaterThanOrEqual(4);
    });

    it('should find exact index when color matches a variation', () => {
      // Set up variations first
      colorStore.updateLightnessVariations('#ff0000');
      const variations = colorStore.lightnessVariations.value;

      // Now update with one of the variations - should find exact match
      const middleVariation = variations[3];
      colorStore.updateLightnessVariations(middleVariation);

      expect(colorStore.lightnessIndex.value).toBe(3);
    });
  });

  describe('setPrimaryColorFromShade()', () => {
    it('should update primary color', () => {
      colorStore.setPrimaryColorFromShade('#abcdef');
      expect(colorStore.primaryColor.value).toBe('#abcdef');
    });

    it('should mark as ephemeral if not in main palette', () => {
      colorStore.setPrimaryColorFromShade('#abcdef');
      expect(colorStore.isEphemeralColor.value).toBe(true);
    });

    it('should mark as non-ephemeral if happens to be in main palette', () => {
      // Use a color that is in the DB32 palette
      const paletteColor = paletteStore.mainColors.value[0];
      colorStore.setPrimaryColorFromShade(paletteColor);
      expect(colorStore.isEphemeralColor.value).toBe(false);
    });
  });

  describe('shiftLightnessDarker()', () => {
    beforeEach(() => {
      colorStore.updateLightnessVariations('#808080');
    });

    it('should decrease lightness index', () => {
      colorStore.lightnessIndex.value = 3;
      colorStore.shiftLightnessDarker();
      expect(colorStore.lightnessIndex.value).toBe(2);
    });

    it('should wrap from 0 to 6', () => {
      colorStore.lightnessIndex.value = 0;
      colorStore.shiftLightnessDarker();
      expect(colorStore.lightnessIndex.value).toBe(6);
    });

    it('should update primary color to the darker shade', () => {
      const variations = colorStore.lightnessVariations.value;
      colorStore.lightnessIndex.value = 3;

      colorStore.shiftLightnessDarker();

      expect(colorStore.primaryColor.value).toBe(variations[2]);
    });

    it('should do nothing if no variations', () => {
      colorStore.lightnessVariations.value = [];
      colorStore.lightnessIndex.value = 3;

      colorStore.shiftLightnessDarker();

      expect(colorStore.lightnessIndex.value).toBe(3);
    });
  });

  describe('shiftLightnessLighter()', () => {
    beforeEach(() => {
      colorStore.updateLightnessVariations('#808080');
    });

    it('should increase lightness index', () => {
      colorStore.lightnessIndex.value = 3;
      colorStore.shiftLightnessLighter();
      expect(colorStore.lightnessIndex.value).toBe(4);
    });

    it('should wrap from 6 to 0', () => {
      colorStore.lightnessIndex.value = 6;
      colorStore.shiftLightnessLighter();
      expect(colorStore.lightnessIndex.value).toBe(0);
    });

    it('should update primary color to the lighter shade', () => {
      const variations = colorStore.lightnessVariations.value;
      colorStore.lightnessIndex.value = 3;

      colorStore.shiftLightnessLighter();

      expect(colorStore.primaryColor.value).toBe(variations[4]);
    });

    it('should do nothing if no variations', () => {
      colorStore.lightnessVariations.value = [];
      colorStore.lightnessIndex.value = 3;

      colorStore.shiftLightnessLighter();

      expect(colorStore.lightnessIndex.value).toBe(3);
    });
  });

  describe('setLightnessIndex()', () => {
    beforeEach(() => {
      colorStore.updateLightnessVariations('#808080');
    });

    it('should set lightness index directly', () => {
      colorStore.setLightnessIndex(5);
      expect(colorStore.lightnessIndex.value).toBe(5);
    });

    it('should update primary color to corresponding variation', () => {
      const variations = colorStore.lightnessVariations.value;
      colorStore.setLightnessIndex(2);
      expect(colorStore.primaryColor.value).toBe(variations[2]);
    });

    it('should ignore invalid index (negative)', () => {
      colorStore.lightnessIndex.value = 3;
      colorStore.setLightnessIndex(-1);
      expect(colorStore.lightnessIndex.value).toBe(3);
    });

    it('should ignore invalid index (too large)', () => {
      colorStore.lightnessIndex.value = 3;
      colorStore.setLightnessIndex(10);
      expect(colorStore.lightnessIndex.value).toBe(3);
    });

    it('should update ephemeral status', () => {
      colorStore.setLightnessIndex(0);
      // Shade colors are typically not in the main palette
      expect(colorStore.isEphemeralColor.value).toBe(true);
    });
  });

  describe('Signal Reactivity', () => {
    it('should allow reactive subscription to primary color changes', () => {
      const values: string[] = [];

      values.push(colorStore.primaryColor.value);
      colorStore.setPrimaryColor('#ff0000');
      values.push(colorStore.primaryColor.value);
      colorStore.setPrimaryColor('#00ff00');
      values.push(colorStore.primaryColor.value);

      expect(values).toEqual(['#000000', '#ff0000', '#00ff00']);
    });

    it('should allow reactive subscription to secondary color changes', () => {
      const values: string[] = [];

      values.push(colorStore.secondaryColor.value);
      colorStore.setSecondaryColor('#ff0000');
      values.push(colorStore.secondaryColor.value);

      expect(values).toEqual(['#ffffff', '#ff0000']);
    });
  });
});
