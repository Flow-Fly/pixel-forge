import type { Rect } from '../types/geometry';
import { rectUnion } from '../types/geometry';

/**
 * Store for tracking dirty rectangles during drawing operations.
 * Enables partial canvas redraws for better performance.
 */
class DirtyRectStore {
  // Current stroke's accumulated dirty region
  private strokeDirty: Rect | null = null;

  // Pending dirty region for next render frame
  private pendingDirty: Rect | null = null;

  // Full redraw flag (for layer visibility changes, frame switches, etc.)
  private fullRedrawNeeded: boolean = true; // Start with full redraw

  /**
   * Mark a region as dirty during tool operations.
   * Accumulates into strokeDirty during a single stroke.
   */
  markDirty(rect: Rect): void {
    this.strokeDirty = rectUnion(this.strokeDirty, rect);
    this.pendingDirty = rectUnion(this.pendingDirty, rect);
  }

  /**
   * Flush stroke dirty rect (call on mouseup).
   * Returns the accumulated dirty region for the entire stroke.
   */
  flushStroke(): Rect | null {
    const result = this.strokeDirty;
    this.strokeDirty = null;
    return result;
  }

  /**
   * Get and clear pending dirty region for rendering.
   */
  consumePendingDirty(): Rect | null {
    const result = this.pendingDirty;
    this.pendingDirty = null;
    return result;
  }

  /**
   * Request full canvas redraw (layer changes, frame changes, etc.)
   */
  requestFullRedraw(): void {
    this.fullRedrawNeeded = true;
    this.pendingDirty = null;
  }

  /**
   * Check and clear full redraw flag.
   */
  consumeFullRedraw(): boolean {
    const result = this.fullRedrawNeeded;
    this.fullRedrawNeeded = false;
    return result;
  }

  /**
   * Reset all dirty state (useful for frame changes).
   */
  reset(): void {
    this.strokeDirty = null;
    this.pendingDirty = null;
    this.fullRedrawNeeded = true;
  }
}

export const dirtyRectStore = new DirtyRectStore();
