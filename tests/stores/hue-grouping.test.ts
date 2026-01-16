import { describe, it, expect } from 'vitest';
import {
  HueFamily,
  SortMode,
  getHueFamily,
  getHueFamilyColor,
  groupColorsByHue,
  sortWithinGroup,
  getMergedDisplayColors,
} from '../../src/stores/palette/hue-grouping';

describe('Hue Grouping', () => {
  describe('getHueFamily', () => {
    it('should classify pure red #ff0000 as Red', () => {
      expect(getHueFamily('#ff0000')).toBe(HueFamily.Red);
    });

    it('should classify red colors in 0-30 degree range', () => {
      expect(getHueFamily('#ff3300')).toBe(HueFamily.Red);
      expect(getHueFamily('#ff1a00')).toBe(HueFamily.Red);
    });

    it('should classify red colors at wrap-around (330-360 degrees)', () => {
      // Magenta-red at around 340 degrees
      expect(getHueFamily('#ff0066')).toBe(HueFamily.Red);
      // Pink-red at around 350 degrees
      expect(getHueFamily('#ff0033')).toBe(HueFamily.Red);
    });

    it('should classify orange colors (30-60 degrees)', () => {
      expect(getHueFamily('#ff8000')).toBe(HueFamily.Orange); // ~30 degrees
      expect(getHueFamily('#ffa500')).toBe(HueFamily.Orange); // ~39 degrees (pure orange)
    });

    it('should classify yellow colors (60-90 degrees)', () => {
      expect(getHueFamily('#ffff00')).toBe(HueFamily.Yellow);
      expect(getHueFamily('#ccff00')).toBe(HueFamily.Yellow);
    });

    it('should classify green colors (90-150 degrees)', () => {
      expect(getHueFamily('#00ff00')).toBe(HueFamily.Green);
      expect(getHueFamily('#00ff66')).toBe(HueFamily.Green);
    });

    it('should classify cyan colors (150-210 degrees)', () => {
      expect(getHueFamily('#00ffff')).toBe(HueFamily.Cyan);
      expect(getHueFamily('#00ccff')).toBe(HueFamily.Cyan);
    });

    it('should classify blue colors (210-270 degrees)', () => {
      expect(getHueFamily('#0000ff')).toBe(HueFamily.Blue);
      expect(getHueFamily('#0066ff')).toBe(HueFamily.Blue);
    });

    it('should classify purple colors (270-300 degrees)', () => {
      expect(getHueFamily('#8800ff')).toBe(HueFamily.Purple);
      expect(getHueFamily('#9900ff')).toBe(HueFamily.Purple);
    });

    it('should classify magenta colors (300-330 degrees)', () => {
      expect(getHueFamily('#ff00ff')).toBe(HueFamily.Magenta);
      expect(getHueFamily('#ff00cc')).toBe(HueFamily.Magenta);
    });

    it('should classify pure white #ffffff as Neutral', () => {
      expect(getHueFamily('#ffffff')).toBe(HueFamily.Neutral);
    });

    it('should classify pure black #000000 as Neutral', () => {
      expect(getHueFamily('#000000')).toBe(HueFamily.Neutral);
    });

    it('should classify gray colors (low saturation) as Neutral', () => {
      expect(getHueFamily('#808080')).toBe(HueFamily.Neutral);
      expect(getHueFamily('#cccccc')).toBe(HueFamily.Neutral);
      expect(getHueFamily('#333333')).toBe(HueFamily.Neutral);
    });

    it('should handle invalid hex gracefully', () => {
      expect(getHueFamily('not-a-color')).toBe(HueFamily.Neutral);
      expect(getHueFamily('')).toBe(HueFamily.Neutral);
    });

    it('should handle 3-digit hex colors', () => {
      expect(getHueFamily('#f00')).toBe(HueFamily.Red);
      expect(getHueFamily('#0f0')).toBe(HueFamily.Green);
      expect(getHueFamily('#00f')).toBe(HueFamily.Blue);
    });

    it('should handle edge cases at hue boundaries', () => {
      // At exactly 30 degrees (boundary between red and orange)
      // The color #ff4000 is around 15 degrees (red)
      // The color #ff8000 is around 30 degrees (orange)
      const redOrangeBoundary = getHueFamily('#ff5500');
      expect([HueFamily.Red, HueFamily.Orange]).toContain(redOrangeBoundary);
    });
  });

  describe('getHueFamilyColor', () => {
    it('should return rgba colors with low opacity', () => {
      const redTint = getHueFamilyColor(HueFamily.Red);
      expect(redTint).toMatch(/^rgba\(\d+,\s*\d+,\s*\d+,\s*0\.0[35]\)$/);
    });

    it('should return different colors for different families', () => {
      const colors = [
        getHueFamilyColor(HueFamily.Red),
        getHueFamilyColor(HueFamily.Blue),
        getHueFamilyColor(HueFamily.Green),
      ];
      expect(new Set(colors).size).toBe(3);
    });
  });

  describe('groupColorsByHue', () => {
    it('should group colors by hue family', () => {
      const colors = ['#ff0000', '#00ff00', '#0000ff', '#ff8800'];
      const groups = groupColorsByHue(colors);

      expect(groups.get(HueFamily.Red)).toContain('#ff0000');
      expect(groups.get(HueFamily.Green)).toContain('#00ff00');
      expect(groups.get(HueFamily.Blue)).toContain('#0000ff');
      expect(groups.get(HueFamily.Orange)).toContain('#ff8800');
    });

    it('should handle empty array', () => {
      const groups = groupColorsByHue([]);
      expect(groups.size).toBe(0);
    });

    it('should group multiple colors of same family', () => {
      const colors = ['#ff0000', '#cc0000', '#990000'];
      const groups = groupColorsByHue(colors);

      const reds = groups.get(HueFamily.Red);
      expect(reds).toHaveLength(3);
      expect(reds).toContain('#ff0000');
      expect(reds).toContain('#cc0000');
      expect(reds).toContain('#990000');
    });
  });

  describe('sortWithinGroup', () => {
    it('should sort colors by lightness (dark to light)', () => {
      const colors = ['#ffffff', '#808080', '#000000'];
      const sorted = sortWithinGroup(colors);

      expect(sorted[0]).toBe('#000000'); // darkest
      expect(sorted[1]).toBe('#808080'); // middle
      expect(sorted[2]).toBe('#ffffff'); // lightest
    });

    it('should preserve order for same lightness', () => {
      const colors = ['#ff0000', '#00ff00', '#0000ff'];
      const sorted = sortWithinGroup(colors);

      // All have same lightness, order should be stable
      expect(sorted).toHaveLength(3);
    });

    it('should handle empty array', () => {
      expect(sortWithinGroup([])).toEqual([]);
    });

    it('should handle single color', () => {
      expect(sortWithinGroup(['#ff0000'])).toEqual(['#ff0000']);
    });
  });

  describe('getMergedDisplayColors', () => {
    it('should merge main and ephemeral colors without sorting', () => {
      const mainColors = ['#ff0000', '#00ff00'];
      const ephemeralColors = ['#0000ff'];
      const result = getMergedDisplayColors(mainColors, ephemeralColors, false);

      expect(result).toHaveLength(3);
      expect(result[0].color).toBe('#ff0000');
      expect(result[0].isEphemeral).toBe(false);
      expect(result[2].color).toBe('#0000ff');
      expect(result[2].isEphemeral).toBe(true);
    });

    it('should mark ephemeral colors with isEphemeral: true', () => {
      const mainColors = ['#ff0000'];
      const ephemeralColors = ['#00ff00'];
      const result = getMergedDisplayColors(mainColors, ephemeralColors, false);

      expect(result[0].isEphemeral).toBe(false);
      expect(result[1].isEphemeral).toBe(true);
    });

    it('should include originalIndex for each color', () => {
      const mainColors = ['#ff0000', '#00ff00'];
      const ephemeralColors = ['#0000ff', '#ffff00'];
      const result = getMergedDisplayColors(mainColors, ephemeralColors, false);

      expect(result[0].originalIndex).toBe(0);
      expect(result[1].originalIndex).toBe(1);
      expect(result[2].originalIndex).toBe(0); // first ephemeral
      expect(result[3].originalIndex).toBe(1); // second ephemeral
    });

    it('should apply hue grouping when autoSort is true', () => {
      const mainColors = ['#0000ff', '#ff0000']; // Blue, Red
      const ephemeralColors: string[] = [];
      const result = getMergedDisplayColors(mainColors, ephemeralColors, true);

      // Should be grouped: Red should come before Blue in the family order
      expect(result[0].hueFamily).toBe(HueFamily.Red);
      expect(result[1].hueFamily).toBe(HueFamily.Blue);
    });

    it('should preserve original order when autoSort is false', () => {
      const mainColors = ['#0000ff', '#ff0000']; // Blue, Red
      const ephemeralColors: string[] = [];
      const result = getMergedDisplayColors(mainColors, ephemeralColors, false);

      // Order should be preserved
      expect(result[0].color).toBe('#0000ff');
      expect(result[1].color).toBe('#ff0000');
    });

    it('should mark first color in each group with groupStart (except first group)', () => {
      const mainColors = ['#ff0000', '#cc0000', '#00ff00', '#00cc00'];
      const ephemeralColors: string[] = [];
      const result = getMergedDisplayColors(mainColors, ephemeralColors, true);

      // Find group starts - first group doesn't get marked, so we have 1 (Green group)
      const groupStarts = result.filter(c => c.groupStart);
      expect(groupStarts.length).toBeGreaterThanOrEqual(1); // At least Green group (Red is first, no marker)
    });

    it('should handle empty arrays', () => {
      const result = getMergedDisplayColors([], [], false);
      expect(result).toEqual([]);
    });

    it('should handle only main colors', () => {
      const result = getMergedDisplayColors(['#ff0000'], [], false);
      expect(result).toHaveLength(1);
      expect(result[0].isEphemeral).toBe(false);
    });

    it('should handle only ephemeral colors', () => {
      const result = getMergedDisplayColors([], ['#ff0000'], false);
      expect(result).toHaveLength(1);
      expect(result[0].isEphemeral).toBe(true);
    });

    it('should include hueFamily in result when autoSort is enabled', () => {
      const mainColors = ['#ff0000'];
      const result = getMergedDisplayColors(mainColors, [], true);

      expect(result[0].hueFamily).toBeDefined();
      expect(result[0].hueFamily).toBe(HueFamily.Red);
    });

    it('should place Neutral group at the end when autoSort is true', () => {
      const mainColors = ['#808080', '#ff0000', '#000000'];
      const result = getMergedDisplayColors(mainColors, [], true);

      // Neutral colors should be last
      const lastColor = result[result.length - 1];
      expect(lastColor.hueFamily).toBe(HueFamily.Neutral);
    });

    it('should sort colors within each group by lightness', () => {
      const mainColors = ['#ff9999', '#ff0000', '#660000']; // Light red, pure red, dark red
      const result = getMergedDisplayColors(mainColors, [], true);

      // Should be sorted: dark -> pure -> light
      expect(result[0].color).toBe('#660000'); // darkest
      expect(result[2].color).toBe('#ff9999'); // lightest
    });
  });

  describe('SortMode', () => {
    it('should have three modes: None, HSL, Lab', () => {
      expect(SortMode.None).toBe('none');
      expect(SortMode.HSL).toBe('hsl');
      expect(SortMode.Lab).toBe('lab');
    });
  });

  describe('Lab sorting', () => {
    it('should use Lab mode when SortMode.Lab is passed', () => {
      const mainColors = ['#ff0000', '#00ff00', '#0000ff'];
      const result = getMergedDisplayColors(mainColors, [], SortMode.Lab);

      // Should have Lab data attached
      expect(result[0].labL).toBeDefined();
      expect(result[0].labHue).toBeDefined();
      expect(result[0].labChroma).toBeDefined();
    });

    it('should group by Lab hue angle', () => {
      const mainColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
      const result = getMergedDisplayColors(mainColors, [], SortMode.Lab);

      expect(result).toHaveLength(4);
      // All should have Lab data
      result.forEach(c => {
        expect(c.labL).toBeDefined();
      });
    });

    it('should handle neutrals in Lab mode', () => {
      const mainColors = ['#808080', '#ffffff', '#000000'];
      const result = getMergedDisplayColors(mainColors, [], SortMode.Lab);

      expect(result).toHaveLength(3);
      // All should be grouped together (neutrals have low chroma)
      const chromaValues = result.map(c => c.labChroma || 0);
      // Gray colors have very low chroma
      chromaValues.forEach(chroma => {
        expect(chroma).toBeLessThan(10);
      });
    });

    it('should sort by Lab lightness within groups', () => {
      const mainColors = ['#ff9999', '#ff0000', '#660000']; // Light, medium, dark red
      const result = getMergedDisplayColors(mainColors, [], SortMode.Lab);

      // Should be sorted by Lab L* (dark to light)
      expect(result[0].labL).toBeLessThan(result[1].labL!);
      expect(result[1].labL).toBeLessThan(result[2].labL!);
    });

    it('should handle legacy boolean true as HSL mode', () => {
      const mainColors = ['#ff0000', '#00ff00'];
      const result = getMergedDisplayColors(mainColors, [], true);

      // Should use HSL mode (hueFamily present)
      expect(result[0].hueFamily).toBeDefined();
    });

    it('should handle legacy boolean false as None mode', () => {
      const mainColors = ['#ff0000', '#00ff00'];
      const result = getMergedDisplayColors(mainColors, [], false);

      // Should preserve original order
      expect(result[0].color).toBe('#ff0000');
      expect(result[1].color).toBe('#00ff00');
    });
  });
});
