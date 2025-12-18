import { type Command } from './index';

type Bounds = { x: number; y: number; w: number; h: number };

/**
 * Base class for all drawing commands that capture canvas state.
 */
export class DrawingCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;

  private ctx: CanvasRenderingContext2D;
  private previousImageData: ImageData;
  private newImageData: ImageData;
  private bounds: Bounds;

  constructor(
    canvas: HTMLCanvasElement,
    bounds: Bounds,
    previousImageData: ImageData,
    newImageData: ImageData,
    name: string = 'Drawing'
  ) {
    this.id = crypto.randomUUID();
    this.name = name;
    this.ctx = canvas.getContext('2d')!;
    this.bounds = bounds;
    this.previousImageData = previousImageData;
    this.newImageData = newImageData;
    this.timestamp = Date.now();
  }

  execute() {
    this.ctx.putImageData(this.newImageData, this.bounds.x, this.bounds.y);
  }

  undo() {
    this.ctx.putImageData(this.previousImageData, this.bounds.x, this.bounds.y);
  }
}

/**
 * Command for brush/pencil strokes.
 */
export class BrushCommand extends DrawingCommand {
  constructor(
    canvas: HTMLCanvasElement,
    bounds: Bounds,
    previousImageData: ImageData,
    newImageData: ImageData
  ) {
    super(canvas, bounds, previousImageData, newImageData, 'Brush Stroke');
  }
}

/**
 * Command for fill (bucket) operations.
 */
export class FillCommand extends DrawingCommand {
  constructor(
    canvas: HTMLCanvasElement,
    bounds: Bounds,
    previousImageData: ImageData,
    newImageData: ImageData
  ) {
    super(canvas, bounds, previousImageData, newImageData, 'Fill');
  }
}

/**
 * Command for gradient operations.
 */
export class GradientCommand extends DrawingCommand {
  constructor(
    canvas: HTMLCanvasElement,
    bounds: Bounds,
    previousImageData: ImageData,
    newImageData: ImageData
  ) {
    super(canvas, bounds, previousImageData, newImageData, 'Gradient');
  }
}

/**
 * Command for shape drawing (Line, Rectangle, Ellipse).
 */
export class ShapeCommand extends DrawingCommand {
  constructor(
    canvas: HTMLCanvasElement,
    bounds: Bounds,
    previousImageData: ImageData,
    newImageData: ImageData,
    shapeType: 'Line' | 'Rectangle' | 'Ellipse'
  ) {
    super(canvas, bounds, previousImageData, newImageData, `Draw ${shapeType}`);
  }
}
