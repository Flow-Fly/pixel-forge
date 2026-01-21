import { dirtyRectStore } from '../stores/dirty-rect';
import { toolStore } from '../stores/tools';
import { tilemapStore } from '../stores/tilemap';
import { rectExpand, type Rect } from '../types/geometry';

export interface Point {
  x: number;
  y: number;
}

export interface ModifierKeys {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  button: number; // 0 = left, 1 = middle, 2 = right
}

export abstract class BaseTool {
  abstract name: string;
  abstract cursor: string;

  // Called when mouse/pen goes down
  abstract onDown(x: number, y: number, modifiers?: ModifierKeys): void;

  // Called when mouse/pen moves while down
  abstract onDrag(x: number, y: number, modifiers?: ModifierKeys): void;

  // Called when mouse/pen goes up
  abstract onUp(x: number, y: number, modifiers?: ModifierKeys): void;

  // Called when mouse moves without being down (for hover effects)
  onMove(_x: number, _y: number, _modifiers?: ModifierKeys): void {}

  // Called when a key is pressed (for tool-specific shortcuts)
  onKeyDown(_e: KeyboardEvent): void {}

  // Called when a key is released
  onKeyUp(_e: KeyboardEvent): void {}

  // Private backing field for context
  private _context: CanvasRenderingContext2D | null = null;

  /**
   * Get the active context for drawing.
   * Story 5-4 Task 3.1-3.4: Returns override canvas context if set (hero edit mode),
   * otherwise returns the normal drawing context.
   */
  protected get context(): CanvasRenderingContext2D | null {
    // Story 5-4 Task 3.1: Check for override canvas (hero edit mode)
    const overrideCanvas = toolStore.overrideCanvas.value;
    if (overrideCanvas) {
      return overrideCanvas.getContext('2d');
    }
    return this._context;
  }

  setContext(ctx: CanvasRenderingContext2D) {
    this._context = ctx;
  }

  /**
   * Get the active context (alias for context getter)
   */
  get ctx(): CanvasRenderingContext2D | null {
    return this.context;
  }

  /**
   * Check if drawing to override canvas (hero edit mode)
   * Story 5-4 Task 3.4
   */
  protected isOverrideMode(): boolean {
    return toolStore.overrideCanvas.value !== null;
  }

  /**
   * Mark a region as dirty for partial canvas redraw.
   * Tools should call this after modifying pixels.
   * Story 5-4 Task 3.5: Also syncs hero edit canvas when in override mode.
   * @param x - Top-left x coordinate of the dirty region
   * @param y - Top-left y coordinate of the dirty region
   * @param width - Width of the dirty region
   * @param height - Height of the dirty region (defaults to width for square regions)
   */
  protected markDirty(x: number, y: number, width: number = 1, height: number = width): void {
    // Story 5-4 Task 3.5: If in override mode (hero edit), sync changes to OffscreenCanvas
    if (this.isOverrideMode()) {
      tilemapStore.syncHeroEditCanvas();
      // Request full redraw of tilemap canvas to show live preview
      dirtyRectStore.requestFullRedraw();
      return;
    }

    const rect: Rect = { x, y, width, height };
    dirtyRectStore.markDirty(rectExpand(rect, 1)); // +1 for safety margin
  }
}
