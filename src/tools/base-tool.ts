import { dirtyRectStore } from '../stores/dirty-rect';
import { brushStore } from '../stores/brush';
import { rectExpand, type Rect } from '../types/geometry';

export interface Point {
  x: number;
  y: number;
}

export interface ModifierKeys {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
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

  protected context: CanvasRenderingContext2D | null = null;

  setContext(ctx: CanvasRenderingContext2D) {
    this.context = ctx;
  }

  get ctx(): CanvasRenderingContext2D | null {
    return this.context;
  }

  /**
   * Mark a region as dirty for partial canvas redraw.
   * Tools should call this after modifying pixels.
   */
  protected markDirty(x: number, y: number, width: number = 1, height: number = 1): void {
    const brushSize = brushStore.activeBrush.value.size;
    const rect: Rect = { x, y, width, height };
    dirtyRectStore.markDirty(rectExpand(rect, brushSize));
  }
}
