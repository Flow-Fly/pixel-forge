import { signal } from "../core/signal";
import type { Brush, BrushSpacing, StoredCustomBrush } from "../types/brush";
import { brushPersistence } from "../services/persistence/brush-persistence";
import { gridStore } from "./grid";

class BrushStore {
  // Built-in brushes (not editable, not persisted)
  readonly builtinBrushes: Brush[] = [
    {
      id: "pixel-1",
      name: "1px Pixel",
      type: "builtin",
      size: 1,
      shape: "square",
      opacity: 1,
      pixelPerfect: true,
      spacing: 1,
    },
    {
      id: "square-3",
      name: "3px Square",
      type: "builtin",
      size: 3,
      shape: "square",
      opacity: 1,
      pixelPerfect: false,
      spacing: 1,
    },
    {
      id: "square-5",
      name: "5px Square",
      type: "builtin",
      size: 5,
      shape: "square",
      opacity: 1,
      pixelPerfect: false,
      spacing: 1,
    },
  ];

  // Custom brushes (user-created, persisted to IndexedDB)
  customBrushes = signal<Brush[]>([]);

  // All brushes combined (computed)
  get allBrushes(): Brush[] {
    return [...this.builtinBrushes, ...this.customBrushes.value];
  }

  // Legacy accessor for backwards compatibility
  get brushes() {
    return signal(this.allBrushes);
  }

  // Currently active brush
  activeBrush = signal<Brush>(this.builtinBrushes[0]);

  // Big Pixel Mode state
  bigPixelMode = signal<boolean>(false);

  // Store previous settings before entering Big Pixel Mode
  private preBigPixelSettings: {
    spacing: BrushSpacing;
    tileGridSize: number;
    tileGridEnabled: boolean;
  } | null = null;

  // Initialization flag
  private initialized = false;

  /**
   * Initialize the brush store by loading custom brushes from IndexedDB.
   * Should be called on app startup.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const storedBrushes = await brushPersistence.getAllBrushes();
    this.customBrushes.value = storedBrushes.map((stored) => this.storedToRuntime(stored));
    this.initialized = true;
  }

  /**
   * Convert a stored brush to a runtime brush
   */
  private storedToRuntime(stored: StoredCustomBrush): Brush {
    return {
      id: stored.id,
      name: stored.name,
      type: "custom",
      size: Math.max(stored.imageData.width, stored.imageData.height),
      shape: "square",
      opacity: 1,
      pixelPerfect: false,
      spacing: stored.spacing,
      imageData: stored.imageData,
      createdAt: stored.createdAt,
      modifiedAt: stored.modifiedAt,
    };
  }

  /**
   * Convert a runtime brush to a stored brush
   */
  private runtimeToStored(brush: Brush): StoredCustomBrush | null {
    if (brush.type !== "custom" || !brush.imageData) return null;

    return {
      id: brush.id,
      name: brush.name,
      imageData: brush.imageData,
      spacing: brush.spacing,
      createdAt: brush.createdAt ?? Date.now(),
      modifiedAt: brush.modifiedAt ?? Date.now(),
    };
  }

  setActiveBrush(brush: Brush) {
    this.activeBrush.value = brush;
  }

  updateActiveBrushSettings(updates: Partial<Brush>) {
    this.activeBrush.value = { ...this.activeBrush.value, ...updates };
  }

  /**
   * Add a new custom brush
   */
  async addCustomBrush(brush: Brush): Promise<void> {
    if (brush.type !== "custom") return;

    // Add to memory
    this.customBrushes.value = [...this.customBrushes.value, brush];

    // Persist to IndexedDB
    const stored = this.runtimeToStored(brush);
    if (stored) {
      await brushPersistence.saveBrush(stored);
    }
  }

  /**
   * Update a custom brush
   */
  async updateCustomBrush(id: string, updates: Partial<Brush>): Promise<void> {
    const index = this.customBrushes.value.findIndex((b) => b.id === id);
    if (index === -1) return;

    const updatedBrush: Brush = {
      ...this.customBrushes.value[index],
      ...updates,
      modifiedAt: Date.now(),
    };

    // Update in memory
    const newBrushes = [...this.customBrushes.value];
    newBrushes[index] = updatedBrush;
    this.customBrushes.value = newBrushes;

    // Update active brush if it's the one being updated
    if (this.activeBrush.value.id === id) {
      this.activeBrush.value = updatedBrush;
    }

    // Persist to IndexedDB
    const stored = this.runtimeToStored(updatedBrush);
    if (stored) {
      await brushPersistence.saveBrush(stored);
    }
  }

  /**
   * Delete a custom brush
   */
  async deleteCustomBrush(id: string): Promise<void> {
    const brush = this.customBrushes.value.find((b) => b.id === id);
    if (!brush) return;

    // Remove from memory
    this.customBrushes.value = this.customBrushes.value.filter((b) => b.id !== id);

    // If the deleted brush was active, switch to first builtin
    if (this.activeBrush.value.id === id) {
      this.activeBrush.value = this.builtinBrushes[0];
    }

    // Remove from IndexedDB
    await brushPersistence.deleteBrush(id);
  }

  /**
   * Calculate effective spacing in pixels.
   * Returns the actual spacing value, resolving "match" to brush size.
   */
  getEffectiveSpacing(): number {
    const brush = this.activeBrush.value;
    if (brush.spacing === "match") {
      return brush.size;
    }
    return brush.spacing;
  }

  /**
   * Toggle Big Pixel Mode.
   * When enabled: sets spacing to match brush size, aligns tile grid.
   * When disabled: restores previous settings.
   */
  toggleBigPixelMode() {
    if (this.bigPixelMode.value) {
      // Exiting Big Pixel Mode - restore previous settings
      if (this.preBigPixelSettings) {
        this.updateActiveBrushSettings({ spacing: this.preBigPixelSettings.spacing });
        gridStore.setTileSize(this.preBigPixelSettings.tileGridSize);
        if (!this.preBigPixelSettings.tileGridEnabled) {
          gridStore.tileGridEnabled.value = false;
        }
        this.preBigPixelSettings = null;
      }
      this.bigPixelMode.value = false;
    } else {
      // Entering Big Pixel Mode - save current settings and apply
      const brush = this.activeBrush.value;
      this.preBigPixelSettings = {
        spacing: brush.spacing,
        tileGridSize: gridStore.tileGridSize.value,
        tileGridEnabled: gridStore.tileGridEnabled.value,
      };

      // Set spacing to match brush size
      this.updateActiveBrushSettings({ spacing: "match" });

      // Set tile grid to match brush size and enable it
      gridStore.setTileSize(brush.size);
      gridStore.tileGridEnabled.value = true;

      this.bigPixelMode.value = true;
    }
  }

  /**
   * Update Big Pixel Mode grid when brush size changes (if mode is active).
   */
  syncBigPixelModeWithBrushSize() {
    if (this.bigPixelMode.value) {
      gridStore.setTileSize(this.activeBrush.value.size);
    }
  }

  // Legacy method for backwards compatibility
  addBrush(brush: Brush) {
    if (brush.type === "custom") {
      this.addCustomBrush(brush);
    }
  }
}

export const brushStore = new BrushStore();
