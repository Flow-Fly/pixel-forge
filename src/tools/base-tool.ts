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
}
