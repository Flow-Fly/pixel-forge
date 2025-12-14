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

/** Maximum number of colors in indexed mode (standard limit) */
const MAX_PALETTE_SIZE = 256;

class PaletteStore {
  /** Main palette colors (user-managed, visible in palette panel) */
  mainColors = signal<string[]>([...DB32_COLORS]);

  /** Ephemeral colors (auto-generated shades, not in main palette) */
  ephemeralColors = signal<string[]>([]);

  /** @deprecated Use mainColors instead - kept for compatibility during migration */
  get colors() {
    return this.mainColors;
  }

  // Extracted colors staging area
  extractedColors = signal<string[]>([]);
  isExtracting = signal<boolean>(false);

  // ==========================================
  // Indexed Color Management
  // ==========================================

  /** Fast lookup: normalized hex color -> palette index (for main palette) */
  private colorToIndex = new Map<string, number>();

  /** Fast lookup: normalized hex color -> ephemeral index offset */
  private ephemeralColorToIndex = new Map<string, number>();

  constructor() {
    this.loadFromStorage();
    this.rebuildColorMap();
  }

  /**
   * Rebuild the color-to-index lookup maps.
   * Call this after any palette modification.
   */
  rebuildColorMap() {
    this.colorToIndex.clear();
    this.ephemeralColorToIndex.clear();

    // Index 0 is reserved for transparent, so palette colors start at index 1
    // Main palette: indices 1 to mainColors.length
    this.mainColors.value.forEach((color, i) => {
      this.colorToIndex.set(this.normalizeHex(color), i + 1);
    });

    // Ephemeral colors: indices mainColors.length + 1 to mainColors.length + ephemeralColors.length
    const ephemeralOffset = this.mainColors.value.length;
    this.ephemeralColors.value.forEach((color, i) => {
      this.ephemeralColorToIndex.set(this.normalizeHex(color), ephemeralOffset + i + 1);
    });
  }

  /**
   * Normalize hex color to lowercase 6-digit format.
   */
  private normalizeHex(hex: string): string {
    const clean = hex.replace('#', '').toLowerCase();
    if (clean.length === 3) {
      return '#' + clean.split('').map(c => c + c).join('');
    }
    return '#' + clean;
  }

  /**
   * Get the palette index for a color. Returns 0 (transparent) if not found.
   * Checks both main palette and ephemeral colors.
   */
  getColorIndex(color: string): number {
    const normalized = this.normalizeHex(color);
    // Check main palette first
    const mainIndex = this.colorToIndex.get(normalized);
    if (mainIndex !== undefined) return mainIndex;
    // Check ephemeral colors
    return this.ephemeralColorToIndex.get(normalized) ?? 0;
  }

  /**
   * Check if a color is in the main palette (not ephemeral).
   */
  isMainPaletteColor(color: string): boolean {
    return this.colorToIndex.has(this.normalizeHex(color));
  }

  /**
   * Check if a color is ephemeral (not in main palette).
   */
  isEphemeralColor(color: string): boolean {
    return this.ephemeralColorToIndex.has(this.normalizeHex(color));
  }

  /**
   * Get the palette index for a color, adding it to the palette if not present.
   * New colors are inserted near their closest hue match.
   * Returns the index (1-based, 0 = transparent).
   */
  getOrAddColor(color: string): number {
    const normalized = this.normalizeHex(color);
    const existing = this.colorToIndex.get(normalized);
    if (existing !== undefined) {
      return existing;
    }

    // Check if we've hit the palette limit
    if (this.colors.value.length >= MAX_PALETTE_SIZE) {
      // Find closest existing color instead
      return this.findClosestColorIndex(normalized);
    }

    // Find insertion position near similar hue
    const insertionIndex = this.findInsertionIndex(normalized);

    // Insert color at the calculated position
    const newColors = [...this.colors.value];
    newColors.splice(insertionIndex, 0, normalized);
    this.colors.value = newColors;
    this.rebuildColorMap();
    this.saveToStorage();

    // Return the new index (insertionIndex in array + 1 for 1-based indexing)
    return insertionIndex + 1;
  }

  /**
   * Get the palette index for a color, adding it to EPHEMERAL if not present anywhere.
   * Use this when drawing with generated shades to avoid polluting the main palette.
   * Returns the index (1-based, 0 = transparent).
   */
  getOrAddEphemeralColor(color: string): number {
    const normalized = this.normalizeHex(color);

    // Check main palette first - if it's there, use that index
    const mainIndex = this.colorToIndex.get(normalized);
    if (mainIndex !== undefined) {
      return mainIndex;
    }

    // Check ephemeral palette
    const ephemeralIndex = this.ephemeralColorToIndex.get(normalized);
    if (ephemeralIndex !== undefined) {
      return ephemeralIndex;
    }

    // Check combined palette limit
    const totalColors = this.mainColors.value.length + this.ephemeralColors.value.length;
    if (totalColors >= MAX_PALETTE_SIZE) {
      // Find closest existing color instead
      return this.findClosestColorIndex(normalized);
    }

    // Add to ephemeral palette (append at end)
    const newEphemeral = [...this.ephemeralColors.value, normalized];
    this.ephemeralColors.value = newEphemeral;
    this.rebuildColorMap();
    // Note: ephemeral colors are not saved to localStorage

    // Return the new ephemeral index
    return this.mainColors.value.length + newEphemeral.length;
  }

  /**
   * Promote an ephemeral color to the main palette.
   * @param color Hex color to promote
   * @returns New main palette index, or existing index if already in main
   */
  promoteEphemeralColor(color: string): number {
    const normalized = this.normalizeHex(color);

    // Already in main palette?
    const mainIndex = this.colorToIndex.get(normalized);
    if (mainIndex !== undefined) {
      return mainIndex;
    }

    // Remove from ephemeral if present
    const ephemeralIdx = this.ephemeralColors.value.indexOf(normalized);
    if (ephemeralIdx !== -1) {
      const newEphemeral = [...this.ephemeralColors.value];
      newEphemeral.splice(ephemeralIdx, 1);
      this.ephemeralColors.value = newEphemeral;
    }

    // Add to main palette using hue-based insertion
    const insertionIndex = this.findInsertionIndex(normalized);
    const newColors = [...this.mainColors.value];
    newColors.splice(insertionIndex, 0, normalized);
    this.mainColors.value = newColors;
    this.rebuildColorMap();
    this.saveToStorage();

    return insertionIndex + 1;
  }

  /**
   * Promote all ephemeral colors to the main palette.
   */
  promoteAllEphemeralColors() {
    for (const color of this.ephemeralColors.value) {
      this.promoteEphemeralColor(color);
    }
    // ephemeralColors is already cleared by promoteEphemeralColor
  }

  /**
   * Clear all ephemeral colors without promoting them.
   */
  clearEphemeralColors() {
    this.ephemeralColors.value = [];
    this.rebuildColorMap();
  }

  /**
   * Find the best insertion index for a new color based on hue proximity.
   * Returns the array index where the color should be inserted.
   */
  private findInsertionIndex(hex: string): number {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return this.colors.value.length; // Append at end

    const newHsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);

    let bestIndex = this.colors.value.length;
    let bestDistance = Infinity;

    for (let i = 0; i < this.colors.value.length; i++) {
      const existingRgb = this.hexToRgb(this.colors.value[i]);
      if (!existingRgb) continue;

      const existingHsl = this.rgbToHsl(existingRgb.r, existingRgb.g, existingRgb.b);
      const distance = this.hslDistance(newHsl, existingHsl);

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
  findClosestColorIndex(hex: string): number {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return 1; // Return first color if parse fails

    const targetHsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);

    let bestIndex = 1;
    let bestDistance = Infinity;

    for (let i = 0; i < this.colors.value.length; i++) {
      const existingRgb = this.hexToRgb(this.colors.value[i]);
      if (!existingRgb) continue;

      const existingHsl = this.rgbToHsl(existingRgb.r, existingRgb.g, existingRgb.b);
      const distance = this.hslDistance(targetHsl, existingHsl);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i + 1; // 1-based index
      }
    }

    return bestIndex;
  }

  /**
   * Update a color at a specific palette index.
   * This will trigger a rebuild of all canvases using this color.
   * @param index 1-based palette index (0 = transparent, not editable)
   * @param newColor New hex color value
   */
  updateColor(index: number, newColor: string) {
    const arrayIndex = index - 1; // Convert to 0-based array index
    if (arrayIndex < 0 || arrayIndex >= this.colors.value.length) return;

    const normalized = this.normalizeHex(newColor);
    const colors = [...this.colors.value];
    colors[arrayIndex] = normalized;
    this.colors.value = colors;
    this.rebuildColorMap();
    this.saveToStorage();

    // Dispatch event to notify animation store to rebuild canvases
    window.dispatchEvent(new CustomEvent('palette-color-changed', {
      detail: { index, color: normalized }
    }));
  }

  /**
   * Update a color directly without dispatching events.
   * Used by PaletteChangeCommand for undo/redo.
   * @param index 1-based palette index
   * @param newColor New hex color value
   */
  updateColorDirect(index: number, newColor: string) {
    const arrayIndex = index - 1;
    if (arrayIndex < 0 || arrayIndex >= this.colors.value.length) return;

    const normalized = this.normalizeHex(newColor);
    const colors = [...this.colors.value];
    colors[arrayIndex] = normalized;
    this.colors.value = colors;
    this.rebuildColorMap();
    this.saveToStorage();
  }

  /**
   * Remove a color by its 1-based palette index.
   * Used by PaletteAddColorCommand for undo.
   * @param index 1-based palette index
   */
  removeColorByIndex(index: number) {
    const arrayIndex = index - 1;
    if (arrayIndex < 0 || arrayIndex >= this.colors.value.length) return;

    const newColors = [...this.colors.value];
    newColors.splice(arrayIndex, 1);
    this.colors.value = newColors;
    this.rebuildColorMap();
    this.saveToStorage();
  }

  /**
   * Insert a color at a specific 1-based palette index.
   * Used by PaletteRemoveColorCommand for undo.
   * @param index 1-based palette index where to insert
   * @param color Hex color to insert
   */
  insertColorAt(index: number, color: string) {
    const arrayIndex = index - 1;
    if (arrayIndex < 0 || arrayIndex > this.colors.value.length) return;

    const normalized = this.normalizeHex(color);
    const newColors = [...this.colors.value];
    newColors.splice(arrayIndex, 0, normalized);
    this.colors.value = newColors;
    this.rebuildColorMap();
    this.saveToStorage();
  }

  /**
   * Get the hex color for a palette index.
   * Checks both main palette and ephemeral colors.
   * @param index 1-based palette index (0 = transparent)
   * @returns Hex color string, or null for transparent/invalid
   */
  getColorByIndex(index: number): string | null {
    if (index === 0) return null; // Transparent

    const mainLength = this.mainColors.value.length;

    // Check main palette first (indices 1 to mainLength)
    if (index >= 1 && index <= mainLength) {
      return this.mainColors.value[index - 1];
    }

    // Check ephemeral colors (indices mainLength+1 to mainLength+ephemeralLength)
    const ephemeralIndex = index - mainLength - 1;
    if (ephemeralIndex >= 0 && ephemeralIndex < this.ephemeralColors.value.length) {
      return this.ephemeralColors.value[ephemeralIndex];
    }

    return null;
  }

  addColor(color: string) {
    if (!this.colors.value.includes(color)) {
      this.colors.value = [...this.colors.value, color];
      this.rebuildColorMap();
      this.saveToStorage();
    }
  }

  removeColor(index: number) {
    if (index >= 0 && index < this.colors.value.length) {
      const newColors = [...this.colors.value];
      newColors.splice(index, 1);
      this.colors.value = newColors;
      this.rebuildColorMap();
      this.saveToStorage();

      // Dispatch event so animation store can remap affected pixels
      window.dispatchEvent(new CustomEvent('palette-color-removed', {
        detail: { removedIndex: index + 1 } // 1-based index
      }));
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
    this.rebuildColorMap();
    this.saveToStorage();

    // Dispatch event so animation store can update index buffers
    window.dispatchEvent(new CustomEvent('palette-colors-reordered', {
      detail: { fromIndex: fromIndex + 1, toIndex: toIndex + 1 } // 1-based indices
    }));
  }

  resetToDefault() {
    this.colors.value = [...DB32_COLORS];
    this.rebuildColorMap();
    this.saveToStorage();

    // Dispatch event to rebuild all canvases
    window.dispatchEvent(new CustomEvent('palette-reset'));
  }

  /**
   * Replace the entire palette with new colors.
   * Used when loading a project or importing a palette.
   */
  setPalette(colors: string[]) {
    this.colors.value = colors.map(c => this.normalizeHex(c));
    this.rebuildColorMap();
    this.saveToStorage();

    // Dispatch event to rebuild all canvases
    window.dispatchEvent(new CustomEvent('palette-replaced'));
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
  // Lightness Variations (Smart Shade Generation)
  // ==========================================

  /**
   * Generate lightness variations for a given color with pixel-art-style hue shifting.
   * Shadows shift toward blue/purple, highlights shift toward yellow/orange.
   * Peak shift occurs at mid-tones (25% and 75%), tapering at extremes.
   * Returns 7 variations from dark to light.
   */
  getLightnessVariations(hexColor: string): string[] {
    const rgb = this.hexToRgb(hexColor);
    if (!rgb) return [hexColor];

    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
    const variations: string[] = [];

    // Shade generation parameters: [lightness%, hueShift°, saturationShift%]
    // Positive hue shift = toward blue (shadows), negative = toward yellow (highlights)
    const shadeParams: [number, number, number][] = [
      [15, 8, -15],   // Dark shadow - moderate shift, significant desat
      [25, 12, -10],  // Peak shadow shift
      [35, 6, -5],    // Light shadow
      [50, 0, 0],     // Base color - no shift
      [65, -6, -5],   // Light highlight
      [75, -12, -10], // Peak highlight shift
      [85, -8, -15],  // Bright highlight - moderate shift, significant desat
    ];

    // Check if color is grayscale (skip hue shifting)
    const isGrayscale = hsl.s < 0.05;

    // Check if hue is already in shadow/highlight direction (reduce shift)
    // Hue is 0-1, so blue is ~0.55-0.72 (200-260°) and yellow/orange is ~0.08-0.17 (30-60°)
    const hueInDegrees = hsl.h * 360;
    const isAlreadyBlue = hueInDegrees >= 200 && hueInDegrees <= 260;
    const isAlreadyYellow = hueInDegrees >= 30 && hueInDegrees <= 60;

    for (const [lightness, hueShift, satShift] of shadeParams) {
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

      const newRgb = this.hslToRgb(newHue, newSat, lightness / 100);
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
