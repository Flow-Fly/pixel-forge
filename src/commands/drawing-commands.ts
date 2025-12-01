import { type Command } from './index';

export class BrushCommand implements Command {
  id: string;
  name: string = 'Brush Stroke';
  
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private previousImageData: ImageData | null = null;
  private newImageData: ImageData | null = null;
  private bounds: { x: number, y: number, w: number, h: number };

  constructor(
    canvas: HTMLCanvasElement,
    bounds: { x: number, y: number, w: number, h: number },
    previousImageData: ImageData,
    newImageData: ImageData
  ) {
    this.id = crypto.randomUUID();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.bounds = bounds;
    this.previousImageData = previousImageData;
    this.newImageData = newImageData;
  }

  execute() {
    if (this.newImageData) {
      this.ctx.putImageData(this.newImageData, this.bounds.x, this.bounds.y);
    }
  }

  undo() {
    if (this.previousImageData) {
      this.ctx.putImageData(this.previousImageData, this.bounds.x, this.bounds.y);
    }
  }
}
