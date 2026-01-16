/**
 * Palette Store
 *
 * Central store for palette state management.
 * Delegates specialized operations to extracted modules.
 */

import { signal } from '../../core/signal';
import { layerStore } from '../layers';
import { animationStore } from '../animation';
import type { CustomPalette } from '../../types/palette';

import { DB32_COLORS, MAX_PALETTE_SIZE, PALETTE_BY_ID } from './types';
import { normalizeHex } from './color-utils';
import * as indexedColor from './indexed-color';
import * as extraction from './extraction';
import * as variations from './variations';
import * as persistence from './persistence';

class PaletteStore {
  // ==========================================
  // State (Signals)
  // ==========================================

  /** Main palette colors (user-managed, visible in palette panel) */
  mainColors = signal<string[]>([...DB32_COLORS]);

  /** Ephemeral colors (auto-generated shades, not in main palette) */
  ephemeralColors = signal<string[]>([]);

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

  /** Colors used in the current frame */
  usedColorsInCurrentFrame = signal<Set<string>>(new Set());

  /** Colors used in other frames (not the current one) */
  usedColorsInOtherFrames = signal<Set<string>>(new Set());

  // ==========================================
  // Private State
  // ==========================================

  private colorToIndex = new Map<string, number>();
  private ephemeralColorToIndex = new Map<string, number>();
  private cachedPaletteName: string | null = null;
  private frameChangeHandler: (() => void) | null = null;

  // Frame-aware usage tracking optimization
  private previousFrameId: string | null = null;
  private initialScanComplete = false;
  private initialScanInProgress = false;

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
    this.setupFrameChangeListener();
  }

  private setupFrameChangeListener(): void {
    this.frameChangeHandler = () => this.refreshFrameUsedColors();
    window.addEventListener('frame-changed', this.frameChangeHandler);
  }

  dispose(): void {
    if (this.frameChangeHandler) {
      window.removeEventListener('frame-changed', this.frameChangeHandler);
      this.frameChangeHandler = null;
    }
  }

  // ==========================================
  // Color Map Management
  // ==========================================

  rebuildColorMap() {
    const maps = indexedColor.buildColorMaps(
      this.mainColors.value,
      this.ephemeralColors.value
    );
    this.colorToIndex = maps.colorToIndex;
    this.ephemeralColorToIndex = maps.ephemeralColorToIndex;
  }

  getColorIndex(color: string): number {
    return indexedColor.getColorIndex(
      color,
      this.colorToIndex,
      this.ephemeralColorToIndex
    );
  }

  isMainPaletteColor(color: string): boolean {
    return indexedColor.isMainPaletteColor(color, this.colorToIndex);
  }

  isEphemeralColor(color: string): boolean {
    return indexedColor.isEphemeralColor(color, this.ephemeralColorToIndex);
  }

  getColorByIndex(index: number): string | null {
    return indexedColor.getColorByIndex(
      index,
      this.mainColors.value,
      this.ephemeralColors.value
    );
  }

  // ==========================================
  // Color Addition
  // ==========================================

  getOrAddColor(color: string): number {
    const normalized = normalizeHex(color);
    const existing = this.colorToIndex.get(normalized);
    if (existing !== undefined) return existing;

    if (this.colors.value.length >= MAX_PALETTE_SIZE) {
      return indexedColor.findClosestColorIndex(normalized, this.colors.value);
    }

    const insertionIndex = indexedColor.findInsertionIndex(normalized, this.colors.value);
    const newColors = [...this.colors.value];
    newColors.splice(insertionIndex, 0, normalized);
    this.colors.value = newColors;
    this.markDirty();
    this.rebuildColorMap();
    this.saveToStorage();

    // Dispatch event to shift indices in index buffers
    window.dispatchEvent(
      new CustomEvent('palette-color-inserted', {
        detail: { insertedIndex: insertionIndex + 1 },
      })
    );

    return insertionIndex + 1;
  }

  getOrAddColorForDrawing(color: string): number {
    const normalized = normalizeHex(color);

    const mainIndex = this.colorToIndex.get(normalized);
    if (mainIndex !== undefined) return mainIndex;

    const ephemeralIndex = this.ephemeralColorToIndex.get(normalized);
    if (ephemeralIndex !== undefined) return ephemeralIndex;

    const totalColors = this.mainColors.value.length + this.ephemeralColors.value.length;
    if (totalColors >= MAX_PALETTE_SIZE) {
      return indexedColor.findClosestColorIndex(normalized, this.colors.value);
    }

    const newEphemeral = [...this.ephemeralColors.value, normalized];
    this.ephemeralColors.value = newEphemeral;
    this.rebuildColorMap();

    return this.mainColors.value.length + newEphemeral.length;
  }

  /** @deprecated Use getOrAddColorForDrawing instead */
  getOrAddEphemeralColor(color: string): number {
    return this.getOrAddColorForDrawing(color);
  }

  findClosestColorIndex(hex: string): number {
    return indexedColor.findClosestColorIndex(hex, this.colors.value);
  }

  // ==========================================
  // Ephemeral Color Management
  // ==========================================

  promoteEphemeralColor(color: string): number {
    const normalized = normalizeHex(color);

    const mainIndex = this.colorToIndex.get(normalized);
    if (mainIndex !== undefined) return mainIndex;

    const ephemeralIdx = this.ephemeralColors.value.indexOf(normalized);
    // Calculate old ephemeral 1-based index before any changes
    const oldEphemeralIndex = ephemeralIdx !== -1
      ? this.mainColors.value.length + ephemeralIdx + 1
      : -1;

    if (ephemeralIdx !== -1) {
      const newEphemeral = [...this.ephemeralColors.value];
      newEphemeral.splice(ephemeralIdx, 1);
      this.ephemeralColors.value = newEphemeral;
    }

    const insertionIndex = indexedColor.findInsertionIndex(normalized, this.mainColors.value);
    const newColors = [...this.mainColors.value];
    newColors.splice(insertionIndex, 0, normalized);
    this.mainColors.value = newColors;
    this.markDirty();
    this.rebuildColorMap();
    this.saveToStorage();

    const newMainIndex = insertionIndex + 1;

    // Dispatch event to remap index buffers
    // This tells the handler: oldEphemeralIndex should become newMainIndex,
    // and main indices >= newMainIndex need to shift up by 1
    window.dispatchEvent(
      new CustomEvent('palette-ephemeral-promoted', {
        detail: {
          oldEphemeralIndex,
          newMainIndex,
          oldMainLength: newColors.length - 1 // length before insertion
        },
      })
    );

    return newMainIndex;
  }

  promoteAllEphemeralColors() {
    if (this.ephemeralColors.value.length === 0) return;

    // Capture old state for remapping
    const oldMainColors = [...this.mainColors.value];
    const oldEphemeralColors = [...this.ephemeralColors.value];

    // Add all ephemeral colors to main palette (append at end for batch)
    const newColors = [...this.mainColors.value, ...this.ephemeralColors.value];
    this.mainColors.value = newColors;
    this.ephemeralColors.value = [];
    this.markDirty();
    this.rebuildColorMap();
    this.saveToStorage();

    // Single event to remap all index buffers
    window.dispatchEvent(
      new CustomEvent('palette-replaced', {
        detail: { oldMainColors, oldEphemeralColors },
      })
    );
  }

  clearEphemeralColors(skipRemap = false) {
    if (this.ephemeralColors.value.length === 0) return;

    const oldMainColors = [...this.mainColors.value];
    const oldEphemeralColors = [...this.ephemeralColors.value];

    this.ephemeralColors.value = [];
    this.rebuildColorMap();

    // Dispatch event to remap orphaned ephemeral indices to closest main color
    if (!skipRemap) {
      window.dispatchEvent(
        new CustomEvent('palette-replaced', {
          detail: { oldMainColors, oldEphemeralColors },
        })
      );
    }
  }

  removeFromEphemeral(color: string): void {
    const normalized = normalizeHex(color);
    const index = this.ephemeralColors.value.findIndex(
      c => normalizeHex(c) === normalized
    );
    if (index !== -1) {
      // Calculate 1-based palette index (ephemeral indices start after main colors)
      const paletteIndex = this.mainColors.value.length + index + 1;

      const newEphemeral = [...this.ephemeralColors.value];
      newEphemeral.splice(index, 1);
      this.ephemeralColors.value = newEphemeral;
      this.rebuildColorMap();

      // Dispatch event to shift indices in index buffers
      window.dispatchEvent(
        new CustomEvent('palette-color-removed', {
          detail: { removedIndex: paletteIndex },
        })
      );
    }
  }

  deduplicateEphemeral(): void {
    const mainPaletteSet = new Set(
      this.mainColors.value.map(c => normalizeHex(c))
    );
    const dedupedEphemeral = this.ephemeralColors.value.filter(
      c => !mainPaletteSet.has(normalizeHex(c))
    );

    if (dedupedEphemeral.length !== this.ephemeralColors.value.length) {
      this.ephemeralColors.value = dedupedEphemeral;
      this.rebuildColorMap();
    }
  }

  // ==========================================
  // Color CRUD
  // ==========================================

  addColor(color: string) {
    if (!this.colors.value.includes(color)) {
      this.colors.value = [...this.colors.value, color];
      this.markDirty();
      this.rebuildColorMap();
      this.saveToStorage();
    }
  }

  updateColor(index: number, newColor: string) {
    const arrayIndex = index - 1;
    if (arrayIndex < 0 || arrayIndex >= this.colors.value.length) return;

    const normalized = normalizeHex(newColor);
    const colors = [...this.colors.value];
    colors[arrayIndex] = normalized;
    this.colors.value = colors;
    this.markDirty();
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
    this.rebuildColorMap();
    this.saveToStorage();
  }

  removeColor(index: number) {
    if (index >= 0 && index < this.colors.value.length) {
      const newColors = [...this.colors.value];
      newColors.splice(index, 1);
      this.colors.value = newColors;
      this.markDirty();
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

  removeColorToEphemeral(arrayIndex: number): void {
    if (arrayIndex < 0 || arrayIndex >= this.mainColors.value.length) return;

    const color = this.mainColors.value[arrayIndex];
    const oneBasedIndex = arrayIndex + 1;

    const newColors = [...this.mainColors.value];
    newColors.splice(arrayIndex, 1);
    this.mainColors.value = newColors;

    const normalizedColor = normalizeHex(color);
    if (!this.ephemeralColors.value.some(c => normalizeHex(c) === normalizedColor)) {
      this.ephemeralColors.value = [...this.ephemeralColors.value, normalizedColor];
    }

    this.markDirty();
    this.rebuildColorMap();
    this.saveToStorage();

    const newEphemeralIndex = this.getColorIndex(normalizedColor);
    window.dispatchEvent(
      new CustomEvent('palette-color-moved-to-ephemeral', {
        detail: {
          removedIndex: oneBasedIndex,
          newIndex: newEphemeralIndex,
          color: normalizedColor,
        },
      })
    );
  }

  swapMainWithEphemeral(mainArrayIndex: number, ephemeralColor: string): void {
    if (mainArrayIndex < 0 || mainArrayIndex >= this.mainColors.value.length) return;

    const normalizedEphemeral = normalizeHex(ephemeralColor);
    const mainColor = this.mainColors.value[mainArrayIndex];

    const newMainColors = [...this.mainColors.value];
    newMainColors[mainArrayIndex] = normalizedEphemeral;
    this.mainColors.value = newMainColors;

    const ephemeralIdx = this.ephemeralColors.value.findIndex(
      c => normalizeHex(c) === normalizedEphemeral
    );
    if (ephemeralIdx !== -1) {
      const newEphemeral = [...this.ephemeralColors.value];
      newEphemeral.splice(ephemeralIdx, 1);
      newEphemeral.push(mainColor);
      this.ephemeralColors.value = newEphemeral;
    }

    this.markDirty();
    this.rebuildColorMap();
    this.saveToStorage();

    window.dispatchEvent(
      new CustomEvent('palette-color-changed', {
        detail: { index: mainArrayIndex + 1, color: normalizedEphemeral },
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
      console.warn(`Unknown palette preset: ${id}`);
      return;
    }

    const oldMainColors = [...this.mainColors.value];
    const oldEphemeralColors = [...this.ephemeralColors.value];

    this.preserveColorsOnSwitch(preset.colors);

    this.mainColors.value = [...preset.colors];
    this.currentPresetId.value = id;
    this.currentCustomPaletteId.value = null;
    this.isDirty.value = false;
    this.rebuildColorMap();
    this.deduplicateEphemeral();
    this.saveToStorage();

    window.dispatchEvent(
      new CustomEvent('palette-replaced', {
        detail: { oldMainColors, oldEphemeralColors },
      })
    );
  }

  async loadCustomPalette(id: string) {
    const palette = this.customPalettes.value.find(p => p.id === id);
    if (!palette) {
      console.warn(`Unknown custom palette: ${id}`);
      return;
    }

    const oldMainColors = [...this.mainColors.value];
    const oldEphemeralColors = [...this.ephemeralColors.value];

    this.preserveColorsOnSwitch(palette.colors);

    this.mainColors.value = [...palette.colors];
    this.currentPresetId.value = null;
    this.currentCustomPaletteId.value = id;
    this.isDirty.value = false;
    this.rebuildColorMap();
    this.deduplicateEphemeral();
    this.saveToStorage();

    window.dispatchEvent(
      new CustomEvent('palette-replaced', {
        detail: { oldMainColors, oldEphemeralColors },
      })
    );
  }

  createEmpty() {
    this.mainColors.value = [];
    this.ephemeralColors.value = [];
    this.currentPresetId.value = null;
    this.currentCustomPaletteId.value = null;
    this.isDirty.value = true;
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
    await new Promise(resolve => setTimeout(resolve, 10));

    try {
      const colors = await extraction.extractColorsFromDrawing(
        animationStore,
        layerStore
      );
      this.extractedColors.value = colors;
    } finally {
      this.isExtracting.value = false;
    }
  }

  addExtractedColor(color: string) {
    if (!this.colors.value.includes(color)) {
      this.colors.value = [...this.colors.value, color];
      this.markDirty();
      this.rebuildColorMap();
      this.saveToStorage();
    }
    this.extractedColors.value = this.extractedColors.value.filter(c => c !== color);
  }

  addAllExtracted() {
    const newColors = this.extractedColors.value.filter(
      c => !this.colors.value.includes(c)
    );
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
      const oldEphemeralColors = [...this.ephemeralColors.value];

      this.colors.value = [...this.extractedColors.value];
      this.extractedColors.value = [];
      this.markDirty();
      this.rebuildColorMap();
      this.saveToStorage();

      // Dispatch event to remap index buffers by color
      window.dispatchEvent(
        new CustomEvent('palette-replaced', {
          detail: { oldMainColors, oldEphemeralColors },
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

  preserveColorsOnSwitch(newPaletteColors: string[]): void {
    const usedColors = animationStore.scanUsedColors();
    if (usedColors.size === 0) return;

    const newPaletteSet = new Set(newPaletteColors.map(c => normalizeHex(c)));
    const orphanedColors: string[] = [];

    for (const color of usedColors) {
      const normalized = normalizeHex(color);
      if (!newPaletteSet.has(normalized)) {
        orphanedColors.push(normalized);
      }
    }

    if (orphanedColors.length > 0) {
      const currentEphemeral = new Set(
        this.ephemeralColors.value.map(c => normalizeHex(c))
      );
      const newEphemeral = [...this.ephemeralColors.value];

      for (const color of orphanedColors) {
        if (!currentEphemeral.has(color)) {
          newEphemeral.push(color);
        }
      }

      this.ephemeralColors.value = newEphemeral;
    }
  }

  rebuildEphemeralFromDrawing(): void {
    const usedColors = animationStore.scanUsedColorsFromCanvas();
    if (usedColors.size === 0) return;

    const mainPaletteSet = new Set(
      this.mainColors.value.map(c => normalizeHex(c))
    );

    const ephemeralNeeded: string[] = [];
    for (const color of usedColors) {
      const normalized = normalizeHex(color);
      if (!mainPaletteSet.has(normalized)) {
        ephemeralNeeded.push(normalized);
      }
    }

    if (ephemeralNeeded.length > 0) {
      this.ephemeralColors.value = ephemeralNeeded;
      this.rebuildColorMap();
    } else {
      this.ephemeralColors.value = [];
      this.rebuildColorMap();
    }
  }

  refreshUsedColors(): void {
    const colors = animationStore.scanUsedColorsFromCanvas();
    const normalized = new Set<string>();
    for (const color of colors) {
      normalized.add(normalizeHex(color));
    }
    this.usedColors.value = normalized;
  }

  /**
   * Refresh frame-aware color usage.
   * Called on frame switch (but skipped during playback for performance).
   *
   * Optimization: Uses incremental scanning after initial background scan.
   * - First call: Scans current frame immediately, triggers background scan for others
   * - Subsequent calls: Only scans previous + current frame, updates incrementally
   */
  refreshFrameUsedColors(): void {
    // Skip if animation is playing to avoid performance issues
    if (animationStore.isPlaying.value) return;

    const currentFrameId = animationStore.currentFrameId.value;
    if (!currentFrameId) return;

    // Always scan current frame immediately
    const currentFrameColors = animationStore.scanUsedColorsInFrame(currentFrameId);
    const normalizedCurrent = new Set<string>();
    for (const color of currentFrameColors) {
      normalizedCurrent.add(normalizeHex(color));
    }
    this.usedColorsInCurrentFrame.value = normalizedCurrent;

    if (!this.initialScanComplete) {
      // First time: trigger background scan for all other frames
      if (!this.initialScanInProgress) {
        this.performInitialBackgroundScan(currentFrameId);
      }
      this.previousFrameId = currentFrameId;
      return;
    }

    // Incremental update: compare previous and current frame
    this.incrementalUpdateOtherFrames(currentFrameId, normalizedCurrent);
    this.previousFrameId = currentFrameId;

    // Update aggregate usedColors
    this.updateAggregateUsedColors();
  }

  /**
   * Perform initial background scan of all frames using requestIdleCallback.
   */
  private performInitialBackgroundScan(excludeFrameId: string): void {
    this.initialScanInProgress = true;

    const doScan = () => {
      const otherFrameColors = animationStore.scanUsedColorsExcludingFrame(excludeFrameId);
      const normalizedOther = new Set<string>();
      for (const color of otherFrameColors) {
        normalizedOther.add(normalizeHex(color));
      }
      this.usedColorsInOtherFrames.value = normalizedOther;
      this.initialScanComplete = true;
      this.initialScanInProgress = false;
      this.updateAggregateUsedColors();
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(doScan);
    } else {
      setTimeout(doScan, 0);
    }
  }

  /**
   * Incrementally update usedColorsInOtherFrames based on frame transition.
   * Only scans previous frame (if different) instead of all other frames.
   */
  private incrementalUpdateOtherFrames(
    currentFrameId: string,
    currentFrameColors: Set<string>
  ): void {
    const otherFrames = new Set(this.usedColorsInOtherFrames.value);

    // If we have a previous frame and it's different, scan it and add its colors to "other"
    if (this.previousFrameId && this.previousFrameId !== currentFrameId) {
      const prevFrameColors = animationStore.scanUsedColorsInFrame(this.previousFrameId);
      for (const color of prevFrameColors) {
        const normalized = normalizeHex(color);
        // Colors from previous frame are now in "other frames"
        if (!currentFrameColors.has(normalized)) {
          otherFrames.add(normalized);
        }
      }
    }

    // Remove current frame colors from "other frames" display
    // (they're shown with solid dot, not hollow)
    for (const color of currentFrameColors) {
      otherFrames.delete(color);
    }

    this.usedColorsInOtherFrames.value = otherFrames;
  }

  /**
   * Update the aggregate usedColors from current + other frame sets.
   */
  private updateAggregateUsedColors(): void {
    const allColors = new Set<string>();
    for (const color of this.usedColorsInCurrentFrame.value) {
      allColors.add(color);
    }
    for (const color of this.usedColorsInOtherFrames.value) {
      allColors.add(color);
    }
    this.usedColors.value = allColors;
  }

  isColorUsed(color: string): boolean {
    return this.usedColors.value.has(normalizeHex(color));
  }
}

export const paletteStore = new PaletteStore();
