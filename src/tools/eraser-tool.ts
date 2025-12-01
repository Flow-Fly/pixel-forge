import { BaseTool } from './base-tool';

export class EraserTool extends BaseTool {
  name = 'eraser';
  cursor = 'cell'; // Or custom eraser cursor
  
  private isDrawing = false;

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

  onDown(x: number, y: number) {
    if (!this.context) return;
    this.isDrawing = true;
    this.erasePixel(x, y);
  }

  onDrag(x: number, y: number) {
    if (!this.isDrawing || !this.context) return;
    this.erasePixel(x, y);
  }

  onUp(_x: number, _y: number) {
    this.isDrawing = false;
  }

  private erasePixel(x: number, y: number) {
    if (!this.context) return;
    // In a real app, this would clear the pixel data in the layer
    // For now, we just clear the canvas rect
    this.context.clearRect(Math.floor(x), Math.floor(y), 1, 1);
  }
}
