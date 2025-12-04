import { signal } from '../core/signal';
import { type SelectionState, type SelectionShape } from '../types/selection';
import { type Rect } from '../types/geometry';

export type SelectionMode = 'replace' | 'add' | 'subtract';

class SelectionStore {
  state = signal<SelectionState>({ type: 'none' });

  // Track the layer we're operating on
  private activeLayerId: string | null = null;

  // Convenience getters
  get isActive(): boolean {
    return this.state.value.type !== 'none';
  }

  get isFloating(): boolean {
    return this.state.value.type === 'floating';
  }

  get isSelecting(): boolean {
    return this.state.value.type === 'selecting';
  }

  get bounds(): Rect | null {
    const s = this.state.value;
    if (s.type === 'none') return null;
    if (s.type === 'selecting') return s.currentBounds;
    if (s.type === 'selected') return s.bounds;
    if (s.type === 'floating') {
      return {
        x: s.originalBounds.x + s.currentOffset.x,
        y: s.originalBounds.y + s.currentOffset.y,
        width: s.originalBounds.width,
        height: s.originalBounds.height,
      };
    }
    return null;
  }

  // ============================================
  // Creating selections
  // ============================================

  startSelection(shape: SelectionShape, point: { x: number; y: number }) {
    this.state.value = {
      type: 'selecting',
      shape,
      startPoint: point,
      currentBounds: { x: point.x, y: point.y, width: 1, height: 1 },
    };
  }

  updateSelection(currentPoint: { x: number; y: number }, modifiers?: { shift?: boolean }) {
    const s = this.state.value;
    if (s.type !== 'selecting') return;

    let width = Math.abs(currentPoint.x - s.startPoint.x) + 1;
    let height = Math.abs(currentPoint.y - s.startPoint.y) + 1;
    const x = Math.min(s.startPoint.x, currentPoint.x);
    const y = Math.min(s.startPoint.y, currentPoint.y);

    // Shift = square aspect ratio
    if (modifiers?.shift) {
      const size = Math.max(width, height);
      width = size;
      height = size;
    }

    this.state.value = {
      ...s,
      currentBounds: { x, y, width, height },
    };
  }

  finalizeSelection() {
    const s = this.state.value;
    if (s.type !== 'selecting') return;

    // Don't create selection if too small
    if (s.currentBounds.width < 2 && s.currentBounds.height < 2) {
      this.clear();
      return;
    }

    if (s.shape === 'freeform') {
      // Freeform would need mask - not implemented yet
      this.clear();
      return;
    }

    this.state.value = {
      type: 'selected',
      shape: s.shape as 'rectangle' | 'ellipse',
      bounds: s.currentBounds,
    };
  }

  // ============================================
  // Floating operations
  // ============================================

  /**
   * Called by CutToFloatCommand.execute()
   * Transitions from 'selected' to 'floating' with the cut pixels
   */
  setFloating(imageData: ImageData, originalBounds: Rect, shape: SelectionShape, mask?: Uint8Array) {
    this.state.value = {
      type: 'floating',
      imageData,
      originalBounds,
      currentOffset: { x: 0, y: 0 },
      shape,
      mask,
    };
  }

  /**
   * Called by CutToFloatCommand.undo()
   * Transitions from 'floating' back to 'selected'
   */
  setSelected(bounds: Rect, shape: SelectionShape, mask?: Uint8Array) {
    if (shape === 'freeform' && mask) {
      this.state.value = {
        type: 'selected',
        shape: 'freeform',
        bounds,
        mask,
      };
    } else {
      this.state.value = {
        type: 'selected',
        shape: shape as 'rectangle' | 'ellipse',
        bounds,
      };
    }
  }

  moveFloat(dx: number, dy: number) {
    const s = this.state.value;
    if (s.type !== 'floating') return;

    this.state.value = {
      ...s,
      currentOffset: {
        x: s.currentOffset.x + dx,
        y: s.currentOffset.y + dy,
      },
    };
  }

  /**
   * Called by CommitFloatCommand - just clears state
   * The command handles the actual pixel operations
   */
  clearAfterCommit() {
    this.state.value = { type: 'none' };
  }

  /**
   * Cancel floating selection (triggers undo externally)
   */
  cancelFloat() {
    // This is handled by historyStore.undo() externally
    // Just a placeholder for documentation
  }

  // ============================================
  // Utilities
  // ============================================

  clear() {
    this.state.value = { type: 'none' };
  }

  isPointInSelection(x: number, y: number): boolean {
    const s = this.state.value;

    if (s.type === 'selected') {
      return this.isPointInBounds(x, y, s.bounds, s.shape);
    }

    if (s.type === 'floating') {
      const floatBounds = {
        x: s.originalBounds.x + s.currentOffset.x,
        y: s.originalBounds.y + s.currentOffset.y,
        width: s.originalBounds.width,
        height: s.originalBounds.height,
      };
      return this.isPointInBounds(x, y, floatBounds, s.shape);
    }

    return false;
  }

  private isPointInBounds(x: number, y: number, bounds: Rect, shape: SelectionShape): boolean {
    const { x: bx, y: by, width: bw, height: bh } = bounds;

    if (x < bx || x >= bx + bw || y < by || y >= by + bh) {
      return false;
    }

    if (shape === 'rectangle') {
      return true;
    }

    if (shape === 'ellipse') {
      // Point in ellipse test
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      const rx = bw / 2;
      const ry = bh / 2;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      return dx * dx + dy * dy <= 1;
    }

    // For freeform, would check mask - not implemented
    return true;
  }

  setActiveLayerId(layerId: string) {
    this.activeLayerId = layerId;
  }

  getActiveLayerId(): string | null {
    return this.activeLayerId;
  }

  /**
   * Set the selection mode for the next selection operation.
   */
  setMode(mode: SelectionMode) {
    this.mode.value = mode;
  }

  /**
   * Reset mode to 'replace' after selection is finalized.
   */
  resetMode() {
    this.mode.value = 'replace';
  }
}

export const selectionStore = new SelectionStore();
