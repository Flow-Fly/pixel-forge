/**
 * Palette Store
 *
 * Central store for palette state management.
 * Delegates specialized operations to extracted modules.
 */

import { signal } from '../../core/signal';
import { layerStore } from '../layers';
import { getAnimationSource } from '../store-refs';
import type { CustomPalette } from '../../types/palette';

import { DB32_COLORS, MAX_PALETTE_SIZE, PALETTE_BY_ID } from './types';
import { normalizeHex } from './color-utils';
import * as indexedColor from './indexed-color';
import * as extraction from './extraction';
import * as variations from './variations';
import * as persistence from './persistence';
import { log } from '../../utils/log';

function waitForNextFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    requestAnimationFrame(() => resolve());
  });
}

type AddColorOptions = {
  flagNew?: boolean;
};

class PaletteStore {
  // ==========================================
  // State (Signals)
  // ==========================================

  /** Main palette colors (user-managed, visible in palette panel) */
  mainColors = signal<string[]>([...DB32_COLORS]);

  /** Colors added by drawing during this session and awaiting user acknowledgement. */
  newColorFlags = signal<Set<string>>(new Set());

  /** Current preset palette ID (null when using custom palette) */
  currentPresetId = signal<string | null>('db32');

  /** Current custom palette ID (null when using preset or unsaved) */
  currentCustomPaletteId = signal<string | null>(null);

  /** Whether current palette has unsaved changes */
  isDirty = signal<boolean>(false);

  /** List of saved custom palettes (loaded from IndexedDB) */
  customPalettes = signal<CustomPalette[]>([]);

  /** Extracted colors staging area */
  extractedColors = signal<string[]>([]);
  isExtracting = signal<boolean>(false);

  /** Colors currently in use in the drawing (for usage indicators) */
  usedColors = signal<Set<string>>(new Set());

  // ==========================================
  // Private State
  // ==========================================

  private colorToIndex = new Map<string, number>();
  private cachedPaletteName: string | null = null;

  // ==========================================
  // Deprecated Aliases
  // ==========================================

  /** @deprecated Use currentPresetId instead */
  get currentPaletteId() {
    return this.currentPresetId;
  }

  /** @deprecated Use mainColors instead */
  get colors() {
    return this.mainColors;
  }

  // ==========================================
  // Constructor
  // ==========================================

  constructor() {
    this.loadFromStorage();
    this.rebuildColorMap();
    this.loadCustomPalettes();
  }

  // ==========================================
  // Color Map Management
  // ==========================================

  rebuildColorMap() {
    const maps = indexedColor.buildColorMaps(this.mainColors.value);
    this.colorToIndex = maps.colorToIndex;
  }

  getColorIndex(color: string): number {
    return indexedColor.getColorIndex(color, this.colorToIndex);
  }

  isMainPaletteColor(color: string): boolean {
    return indexedColor.isMainPaletteColor(color, this.colorToIndex);
  }

  getColorByIndex(index: number): string | null {
    return indexedColor.getColorByIndex(index, this.mainColors.value);
  }

  // ==========================================
  // Color Addition
  // ==========================================

  getOrAddColor(color: string, options: AddColorOptions = {}): number {
    return this.addColor(color, options);
  }

  getOrAddColorForDrawing(color: string): number {
    return this.addColor(color, { flagNew: true });
  }

  addColor(color: string, options: AddColorOptions = {}): number {
    const normalized = normalizeHex(color);
    const existing = this.colorToIndex.get(normalized);
    if (existing !== undefined) return existing;

    if (this.colors.value.length >= MAX_PALETTE_SIZE) {
      return indexedColor.findClosestColorIndex(normalized, this.colors.value);
    }

    const newIndex = this.colors.value.length + 1;
    this.colors.value = [...this.colors.value, normalized];
    if (options.flagNew) {
      this.addNewFlag(normalized);
    }
    this.markDirty();
    this.rebuildColorMap();
    this.saveToStorage();

    return newIndex;
  }

  findClosestColorIndex(hex: string): number {
    return indexedColor.findClosestColorIndex(hex, this.colors.value);
  }

  // ==========================================
  // New Color Flags
  // ==========================================

  clearNewFlag(color: string): void {
    const normalized = normalizeHex(color);
    if (!this.newColorFlags.value.has(normalized)) return;

    const flags = new Set(this.newColorFlags.value);
    flags.delete(normalized);
    this.newColorFlags.value = flags;
  }

  clearAllNewFlags(): void {
    if (this.newColorFlags.value.size === 0) return;
    this.newColorFlags.value = new Set();
  }

  isNewColor(color: string): boolean {
    return this.newColorFlags.value.has(normalizeHex(color));
  }

  private addNewFlag(normalizedColor: string): void {
    const flags = new Set(this.newColorFlags.value);
    flags.add(normalizedColor);
    this.newColorFlags.value = flags;
  }

  private pruneNewFlags(): void {
    const paletteColors = new Set(this.mainColors.value.map(c => normalizeHex(c)));
    const flags = new Set(
      [...this.newColorFlags.value].filter(color => paletteColors.has(color))
    );

    if (flags.size !== this.newColorFlags.value.size) {
      this.newColorFlags.value = flags;
    }
  }

  // ==========================================
  // Color CRUD
  // ==========================================

  updateColor(index: number, newColor: string) {
    const arrayIndex = index - 1;
    if (arrayIndex < 0 || arrayIndex >= this.colors.value.length) return;

    const normalized = normalizeHex(newColor);
    const colors = [...this.colors.value];
    colors[arrayIndex] = normalized;
    this.colors.value = colors;
    this.markDirty();
    this.pruneNewFlags();
    this.rebuildColorMap();
    this.saveToStorage();

    window.dispatchEvent(
      new CustomEvent('palette-color-changed', {
        detail: { index, color: normalized },
      })
    );
  }

  updateColorDirect(index: number, newColor: string) {
    const arrayIndex = index - 1;
    if (arrayIndex < 0 || arrayIndex >= this.colors.value.length) return;

    const normalized = normalizeHex(newColor);
    const colors = [...this.colors.value];
    colors[arrayIndex] = normalized;
    this.colors.value = colors;
    this.pruneNewFlags();
    this.rebuildColorMap();
    this.saveToStorage();
  }

  removeColor(index: number) {
    if (index >= 0 && index < this.colors.value.length) {
      const newColors = [...this.colors.value];
      newColors.splice(index, 1);
      this.colors.value = newColors;
      this.markDirty();
      this.pruneNewFlags();
      this.rebuildColorMap();
      this.saveToStorage();

      window.dispatchEvent(
        new CustomEvent('palette-color-removed', {
          detail: { removedIndex: index + 1 },
        })
      );
    }
  }

  removeColorByIndex(index: number) {
    const arrayIndex = index - 1;
    if (arrayIndex < 0 || arrayIndex >= this.colors.value.length) return;

    const newColors = [...this.colors.value];
    newColors.splice(arrayIndex, 1);
    this.colors.value = newColors;
    this.markDirty();
    this.pruneNewFlags();
    this.rebuildColorMap();
    this.saveToStorage();

    window.dispatchEvent(
      new CustomEvent('palette-color-removed', {
        detail: { removedIndex: index },
      })
    );
  }

  insertColorAt(index: number, color: string) {
    const arrayIndex = index - 1;
    if (arrayIndex < 0 || arrayIndex > this.colors.value.length) return;

    const normalized = normalizeHex(color);
    const newColors = [...this.colors.value];
    newColors.splice(arrayIndex, 0, normalized);
    this.colors.value = newColors;
    this.markDirty();
    this.pruneNewFlags();
    this.rebuildColorMap();
    this.saveToStorage();

    window.dispatchEvent(
      new CustomEvent('palette-color-inserted', {
        detail: { insertedIndex: index },
      })
    );
  }

  moveColor(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.colors.value.length) return;
    if (toIndex < 0 || toIndex >= this.colors.value.length) return;

    const colors = [...this.colors.value];
    const [movedColor] = colors.splice(fromIndex, 1);
    colors.splice(toIndex, 0, movedColor);
    this.colors.value = colors;
    this.markDirty();
    this.rebuildColorMap();
    this.saveToStorage();

    window.dispatchEvent(
      new CustomEvent('palette-colors-reordered', {
        detail: { fromIndex: fromIndex + 1, toIndex: toIndex + 1 },
      })
    );
  }

  // ==========================================
  // Palette Loading
  // ==========================================

  resetToDefault() {
    this.loadPreset('db32');
  }

  loadPreset(id: string) {
    const preset = PALETTE_BY_ID.get(id);
    if (!preset) {
      log.warn(`Unknown palette preset: ${id}`);
      return;
    }

    const oldMainColors = [...this.mainColors.value];
    this.mainColors.value = this.withUsedColorsPreserved(preset.colors);
    this.currentPresetId.value = id;
    this.currentCustomPaletteId.value = null;
    this.isDirty.value = false;
    this.clearAllNewFlags();
    this.rebuildColorMap();
    this.saveToStorage();

    window.dispatchEvent(
      new CustomEvent('palette-replaced', {
        detail: { oldMainColors },
      })
    );
  }

  async loadCustomPalette(id: string) {
    const palette = this.customPalettes.value.find(p => p.id === id);
    if (!palette) {
      log.warn(`Unknown custom palette: ${id}`);
      return;
    }

    const oldMainColors = [...this.mainColors.value];
    this.mainColors.value = this.withUsedColorsPreserved(palette.colors);
    this.currentPresetId.value = null;
    this.currentCustomPaletteId.value = id;
    this.isDirty.value = false;
    this.clearAllNewFlags();
    this.rebuildColorMap();
    this.saveToStorage();

    window.dispatchEvent(
      new CustomEvent('palette-replaced', {
        detail: { oldMainColors },
      })
    );
  }

  createEmpty() {
    this.mainColors.value = [];
    this.currentPresetId.value = null;
    this.currentCustomPaletteId.value = null;
    this.isDirty.value = true;
    this.clearAllNewFlags();
    this.rebuildColorMap();
    this.saveToStorage();

    window.dispatchEvent(
      new CustomEvent('palette-replaced', {
        detail: { skipRemap: true },
      })
    );
  }

  setPalette(colors: string[], preserveSelection = false) {
    this.colors.value = colors.map(c => normalizeHex(c));
    this.clearAllNewFlags();

    if (!preserveSelection) {
      this.currentPresetId.value = null;
      this.currentCustomPaletteId.value = null;
      this.isDirty.value = true;
      this.saveToStorage();
    }

    this.rebuildColorMap();

    window.dispatchEvent(
      new CustomEvent('palette-replaced', {
        detail: { skipRemap: true },
      })
    );
  }

  // ==========================================
  // Color Extraction
  // ==========================================

  async extractFromDrawing(): Promise<void> {
    this.isExtracting.value = true;
    await waitForNextFrame();

    try {
      const animation = getAnimationSource();
      const colors = animation
        ? await extraction.extractColorsFromDrawing(animation, layerStore)
        : [];
      this.extractedColors.value = colors;
    } finally {
      this.isExtracting.value = false;
    }
  }

  addExtractedColor(color: string) {
    const normalized = normalizeHex(color);
    this.addColor(normalized);
    this.extractedColors.value = this.extractedColors.value.filter(
      c => normalizeHex(c) !== normalized
    );
  }

  addAllExtracted() {
    const existingColors = new Set(this.colors.value.map(c => normalizeHex(c)));
    const newColors: string[] = [];

    for (const color of this.extractedColors.value) {
      const normalized = normalizeHex(color);
      if (existingColors.has(normalized)) continue;

      existingColors.add(normalized);
      newColors.push(normalized);
    }

    if (newColors.length > 0) {
      this.colors.value = [...this.colors.value, ...newColors];
      this.markDirty();
      this.rebuildColorMap();
      this.saveToStorage();
    }
    this.extractedColors.value = [];
  }

  replaceWithExtracted() {
    if (this.extractedColors.value.length > 0) {
      const oldMainColors = [...this.mainColors.value];

      this.colors.value = this.extractedColors.value.map(c => normalizeHex(c));
      this.extractedColors.value = [];
      this.markDirty();
      this.clearAllNewFlags();
      this.rebuildColorMap();
      this.saveToStorage();

      // Dispatch event to remap index buffers by color
      window.dispatchEvent(
        new CustomEvent('palette-replaced', {
          detail: { oldMainColors },
        })
      );
    }
  }

  clearExtracted() {
    this.extractedColors.value = [];
  }

  // ==========================================
  // Lightness Variations
  // ==========================================

  getLightnessVariations(hexColor: string): string[] {
    return variations.getLightnessVariations(hexColor);
  }

  // ==========================================
  // Storage & Persistence
  // ==========================================

  private loadFromStorage() {
    const stored = persistence.loadFromStorage();

    if (stored.colors.length > 0) {
      this.colors.value = stored.colors;
    }

    if (stored.customId) {
      this.currentPresetId.value = null;
      this.currentCustomPaletteId.value = stored.customId;
    } else if (stored.presetId) {
      this.currentPresetId.value = stored.presetId;
      this.currentCustomPaletteId.value = null;
    } else {
      this.currentPresetId.value = 'db32';
      this.currentCustomPaletteId.value = null;
    }

    if (stored.cachedName) {
      this.cachedPaletteName = stored.cachedName;
    }
  }

  private saveToStorage() {
    persistence.saveToStorage(
      this.colors.value,
      this.currentPresetId.value,
      this.currentCustomPaletteId.value,
      this.getCurrentPaletteName()
    );
  }

  private markDirty() {
    this.isDirty.value = true;
  }

  // ==========================================
  // Custom Palette Management
  // ==========================================

  async loadCustomPalettes() {
    const palettes = await persistence.loadCustomPalettes();
    this.customPalettes.value = palettes;

    if (this.currentCustomPaletteId.value) {
      const palette = palettes.find(p => p.id === this.currentCustomPaletteId.value);
      if (palette) {
        this.cachedPaletteName = palette.name;
        localStorage.setItem('pf-palette-name', palette.name);
      }
    }
  }

  async saveCurrentPalette(): Promise<boolean> {
    const customId = this.currentCustomPaletteId.value;
    if (!customId) return false;

    await persistence.updatePalette(customId, {
      colors: [...this.mainColors.value],
    });

    await this.loadCustomPalettes();
    this.isDirty.value = false;
    return true;
  }

  async saveAsNewPalette(name: string): Promise<string> {
    const id = await persistence.saveAsNewPalette(name, this.mainColors.value);
    await this.loadCustomPalettes();

    this.currentPresetId.value = null;
    this.currentCustomPaletteId.value = id;
    this.isDirty.value = false;

    return id;
  }

  async deleteCustomPalette(id: string): Promise<void> {
    await persistence.deletePalette(id);
    await this.loadCustomPalettes();

    if (this.currentCustomPaletteId.value === id) {
      this.loadPreset('db32');
    }
  }

  async renameCustomPalette(id: string, newName: string): Promise<void> {
    await persistence.renamePalette(id, newName);
    await this.loadCustomPalettes();
  }

  getCurrentPaletteName(): string {
    return persistence.getPaletteName(
      this.currentPresetId.value,
      this.currentCustomPaletteId.value,
      this.customPalettes.value,
      this.cachedPaletteName
    );
  }

  isCustomPalette(): boolean {
    return this.currentCustomPaletteId.value !== null;
  }

  isPresetPalette(): boolean {
    return this.currentPresetId.value !== null;
  }

  resetPresetToOriginal(): void {
    const presetId = this.currentPresetId.value;
    if (presetId) {
      this.loadPreset(presetId);
    }
  }

  // ==========================================
  // Color Preservation
  // ==========================================

  private withUsedColorsPreserved(newPaletteColors: string[]): string[] {
    const normalizedPalette = newPaletteColors.map(c => normalizeHex(c));
    const usedColors = getAnimationSource()?.scanUsedColors() ?? new Set<string>();
    if (usedColors.size === 0) return normalizedPalette;

    const paletteSet = new Set(normalizedPalette);
    const colors = [...normalizedPalette];

    for (const color of usedColors) {
      const normalized = normalizeHex(color);
      if (paletteSet.has(normalized)) continue;

      paletteSet.add(normalized);
      colors.push(normalized);
    }

    return colors;
  }

  refreshUsedColors(): void {
    const colors = getAnimationSource()?.scanUsedColorsFromCanvas() ?? new Set<string>();
    const normalized = new Set<string>();
    for (const color of colors) {
      normalized.add(normalizeHex(color));
    }
    this.usedColors.value = normalized;
  }

  isColorUsed(color: string): boolean {
    return this.usedColors.value.has(normalizeHex(color));
  }
}

export const paletteStore = new PaletteStore();
