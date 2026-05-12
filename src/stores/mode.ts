import { signal } from '../core/signal';
import { tilemapStore } from './tilemap';
import { viewportStore } from './viewport';

/**
 * Mode Store - Manages application mode state
 *
 * The application has two primary modes:
 * - 'art': Traditional pixel art editing mode
 * - 'map': Tilemap editing mode
 *
 * Hero Edit is nested within Map mode (not a separate mode).
 * Mode changes trigger tool filtering and panel swapping.
 */
class ModeStore {
  /**
   * Current application mode
   * - 'art': Pixel art editing mode (default)
   * - 'map': Tilemap editing mode
   */
  mode = signal<'art' | 'map'>('art');

  /**
   * Whether hero edit mode is active (only relevant in 'map' mode)
   * Hero edit allows in-place editing of individual tiles
   */
  heroEditActive = signal<boolean>(false);

  /**
   * Set the application mode
   * @param newMode - The mode to switch to
   */
  setMode(newMode: 'art' | 'map') {
    this.mode.value = newMode;
    viewportStore.setContext(newMode);
    if (newMode === 'map') {
      tilemapStore.initializeDefaultLayer();
    }
  }

  /**
   * Toggle between 'art' and 'map' modes
   * Note: Automatically disables hero edit when switching modes
   */
  toggleMode() {
    const newMode = this.mode.value === 'art' ? 'map' : 'art';
    this.setMode(newMode);
    // Hero edit is only valid in map mode - disable when switching
    if (this.heroEditActive.value) {
      this.heroEditActive.value = false;
    }
  }
}

export const modeStore = new ModeStore();
