import { signal } from '../core/signal';
import { layerStore } from './layers';
import { animationStore } from './animation';

// DB32 Palette - Default colors
const DB32_COLORS = [
  '#000000', '#222034', '#45283c', '#663931', '#8f563b', '#df7126', '#d9a066', '#eec39a',
  '#fbf236', '#99e550', '#6abe30', '#37946e', '#4b692f', '#524b24', '#323c39', '#3f3f74',
  '#306082', '#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
  '#696a6a', '#595652', '#76428a', '#ac3232', '#d95763', '#d77bba', '#8f974a', '#8a6f30'
];

class PaletteStore {
  colors = signal<string[]>([...DB32_COLORS]);

  // Extracted colors staging area
  extractedColors = signal<string[]>([]);
  isExtracting = signal<boolean>(false);

  constructor() {
    this.loadFromStorage();
  }

  addColor(color: string) {
    if (!this.colors.value.includes(color)) {
      this.colors.value = [...this.colors.value, color];
      this.saveToStorage();
    }
  }

  removeColor(index: number) {
    if (index >= 0 && index < this.colors.value.length) {
      const newColors = [...this.colors.value];
      newColors.splice(index, 1);
      this.colors.value = newColors;
      this.saveToStorage();
    }
  }

  /**
   * Move a color from one position to another (for drag-and-drop reordering)
   */
  moveColor(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.colors.value.length) return;
    if (toIndex < 0 || toIndex >= this.colors.value.length) return;

    const colors = [...this.colors.value];
    const [movedColor] = colors.splice(fromIndex, 1);
    colors.splice(toIndex, 0, movedColor);
    this.colors.value = colors;
    this.saveToStorage();
  }

  resetToDefault() {
    this.colors.value = [...DB32_COLORS];
    this.saveToStorage();
  }

  // ==========================================
  // Color Extraction Methods
  // ==========================================

  /**
   * Extract distinct colors from the current drawing (all visible layers)
   */
  async extractFromDrawing(): Promise<void> {
    this.isExtracting.value = true;

    // Use setTimeout to allow UI to update with loading state
    await new Promise(resolve => setTimeout(resolve, 10));

    try {
      const currentFrameId = animationStore.currentFrameId.value;
      const layers = layerStore.layers.value;
      const cels = animationStore.cels.value;

      // Collect all pixel colors from visible layers
      const colorCounts = new Map<string, number>();

      for (const layer of layers) {
        if (!layer.visible) continue;

        const key = animationStore.getCelKey(layer.id, currentFrameId);
        const cel = cels.get(key);
        if (!cel?.canvas) continue;

        const ctx = cel.canvas.getContext('2d');
        if (!ctx) continue;

        const imageData = ctx.getImageData(0, 0, cel.canvas.width, cel.canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 128) continue; // Skip transparent pixels

          const hex = this.rgbToHex(data[i], data[i + 1], data[i + 2]);
          colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
        }
      }

      if (colorCounts.size === 0) {
        this.extractedColors.value = [];
        return;
      }

      // Cluster similar colors
      const clusters = this.clusterColors(colorCounts);

      // Sort by total pixel count and return all distinct colors (no limit)
      clusters.sort((a, b) => b.count - a.count);
      const extractedColors = clusters.map(c => c.representative);

      this.extractedColors.value = extractedColors;
    } finally {
      this.isExtracting.value = false;
    }
  }

  /**
   * Add a single extracted color to the main palette
   */
  addExtractedColor(color: string) {
    if (!this.colors.value.includes(color)) {
      this.colors.value = [...this.colors.value, color];
      this.saveToStorage();
    }
    // Remove from extracted colors
    this.extractedColors.value = this.extractedColors.value.filter(c => c !== color);
  }

  /**
   * Add all extracted colors to the main palette
   */
  addAllExtracted() {
    const newColors = this.extractedColors.value.filter(
      c => !this.colors.value.includes(c)
    );
    if (newColors.length > 0) {
      this.colors.value = [...this.colors.value, ...newColors];
      this.saveToStorage();
    }
    this.extractedColors.value = [];
  }

  /**
   * Replace the entire palette with extracted colors
   */
  replaceWithExtracted() {
    if (this.extractedColors.value.length > 0) {
      this.colors.value = [...this.extractedColors.value];
      this.extractedColors.value = [];
      this.saveToStorage();
    }
  }

  /**
   * Clear extracted colors
   */
  clearExtracted() {
    this.extractedColors.value = [];
  }

  /**
   * Cluster similar colors together using HSL distance
   */
  private clusterColors(colorCounts: Map<string, number>): Array<{ representative: string; count: number }> {
    const threshold = 0.15; // HSL distance threshold for clustering
    const clusters: Array<{ colors: Map<string, number>; hsl: { h: number; s: number; l: number } }> = [];

    for (const [hex, count] of colorCounts) {
      const rgb = this.hexToRgb(hex);
      if (!rgb) continue;

      const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);

      // Find existing cluster within threshold
      let foundCluster = false;
      for (const cluster of clusters) {
        const dist = this.hslDistance(hsl, cluster.hsl);
        if (dist < threshold) {
          cluster.colors.set(hex, count);
          foundCluster = true;
          break;
        }
      }

      if (!foundCluster) {
        const newCluster = { colors: new Map<string, number>(), hsl };
        newCluster.colors.set(hex, count);
        clusters.push(newCluster);
      }
    }

    // Convert clusters to result format with representative color (most frequent in cluster)
    return clusters.map(cluster => {
      let maxCount = 0;
      let representative = '';
      let totalCount = 0;

      for (const [hex, count] of cluster.colors) {
        totalCount += count;
        if (count > maxCount) {
          maxCount = count;
          representative = hex;
        }
      }

      return { representative, count: totalCount };
    });
  }

  /**
   * Calculate distance between two HSL colors (0-1 range)
   */
  private hslDistance(a: { h: number; s: number; l: number }, b: { h: number; s: number; l: number }): number {
    // Hue is circular, so we need to handle wrap-around
    let hueDiff = Math.abs(a.h - b.h);
    if (hueDiff > 0.5) hueDiff = 1 - hueDiff;

    const satDiff = Math.abs(a.s - b.s);
    const lightDiff = Math.abs(a.l - b.l);

    // Weighted distance (hue matters most for color perception)
    return Math.sqrt(hueDiff * hueDiff * 2 + satDiff * satDiff + lightDiff * lightDiff);
  }

  // ==========================================
  // Lightness Variations
  // ==========================================

  /**
   * Generate lightness variations for a given color.
   * Returns 7 variations from dark to light.
   */
  getLightnessVariations(hexColor: string): string[] {
    const rgb = this.hexToRgb(hexColor);
    if (!rgb) return [hexColor];

    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
    const variations: string[] = [];

    // Generate 7 variations: 15%, 25%, 35%, 50%, 65%, 75%, 85% lightness
    const lightnessLevels = [15, 25, 35, 50, 65, 75, 85];

    for (const l of lightnessLevels) {
      const newRgb = this.hslToRgb(hsl.h, hsl.s, l / 100);
      variations.push(this.rgbToHex(newRgb.r, newRgb.g, newRgb.b));
    }

    return variations;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
      const hex = Math.round(x).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return { h, s, l };
  }

  private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return { r: r * 255, g: g * 255, b: b * 255 };
  }

  private loadFromStorage() {
    const saved = localStorage.getItem('pf-palette-colors');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.colors.value = parsed;
        }
      } catch {
        // Invalid JSON, use defaults
      }
    }
  }

  private saveToStorage() {
    localStorage.setItem('pf-palette-colors', JSON.stringify(this.colors.value));
  }
}

export const paletteStore = new PaletteStore();
