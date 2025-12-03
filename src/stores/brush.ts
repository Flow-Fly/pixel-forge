import { signal } from '../core/signal';
import type { Brush, BrushSpacing } from '../types/brush';
import { gridStore } from './grid';

class BrushStore {
  brushes = signal<Brush[]>([
    { id: 'pixel-1', name: '1px Pixel', size: 1, shape: 'square', opacity: 1, pixelPerfect: true, spacing: 1 },
    { id: 'round-3', name: '3px Round', size: 3, shape: 'circle', opacity: 1, pixelPerfect: false, spacing: 1 },
    { id: 'round-5', name: '5px Round', size: 5, shape: 'circle', opacity: 1, pixelPerfect: false, spacing: 1 },
    { id: 'square-3', name: '3px Square', size: 3, shape: 'square', opacity: 1, pixelPerfect: false, spacing: 1 },
    { id: 'square-5', name: '5px Square', size: 5, shape: 'square', opacity: 1, pixelPerfect: false, spacing: 1 },
  ]);

  activeBrush = signal<Brush>(this.brushes.value[0]);

  // Big Pixel Mode state
  bigPixelMode = signal<boolean>(false);

  // Store previous settings before entering Big Pixel Mode
  private preBigPixelSettings: {
    spacing: BrushSpacing;
    tileGridSize: number;
    tileGridEnabled: boolean;
  } | null = null;

  setActiveBrush(brush: Brush) {
    this.activeBrush.value = brush;
  }

  updateActiveBrushSettings(updates: Partial<Brush>) {
    this.activeBrush.value = { ...this.activeBrush.value, ...updates };
  }

  addBrush(brush: Brush) {
    this.brushes.value = [...this.brushes.value, brush];
  }

  /**
   * Calculate effective spacing in pixels.
   * Returns the actual spacing value, resolving "match" to brush size.
   */
  getEffectiveSpacing(): number {
    const brush = this.activeBrush.value;
    if (brush.spacing === 'match') {
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
      this.updateActiveBrushSettings({ spacing: 'match' });

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
}

export const brushStore = new BrushStore();
