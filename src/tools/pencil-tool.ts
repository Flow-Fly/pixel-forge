import { BaseTool, type Point } from './base-tool';
import { colorStore } from '../stores/colors';
import { brushStore } from '../stores/brush';

export class PencilTool extends BaseTool {
  name = 'pencil';
  cursor = 'crosshair';
  
  private points: Point[] = [];
  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

  onDown(x: number, y: number) {
    if (!this.context) return;
    this.isDrawing = true;
    this.lastX = Math.floor(x);
    this.lastY = Math.floor(y);
    this.points = [{ x: this.lastX, y: this.lastY }];
    this.drawPoint(this.lastX, this.lastY);
  }

  onDrag(x: number, y: number) {
    if (!this.isDrawing || !this.context) return;

    const currentX = Math.floor(x);
    const currentY = Math.floor(y);

    if (this.lastX === currentX && this.lastY === currentY) return;

    this.points.push({ x: currentX, y: currentY });
    
    // Connect last point to current point using Bresenham's
    this.drawLine(this.lastX, this.lastY, currentX, currentY);

    this.lastX = currentX;
    this.lastY = currentY;
  }

  onUp(_x: number, _y: number) {
    this.isDrawing = false;
    this.points = [];
  }

  private drawLine(x1: number, y1: number, x2: number, y2: number) {
    let dx = Math.abs(x2 - x1);
    let dy = Math.abs(y2 - y1);
    let sx = (x1 < x2) ? 1 : -1;
    let sy = (y1 < y2) ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this.drawPoint(x1, y1);

      if ((x1 === x2) && (y1 === y2)) break;
      let e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x1 += sx; }
      if (e2 < dx) { err += dx; y1 += sy; }
    }
  }

  private drawPoint(x: number, y: number) {
    if (!this.context) return;
    
    const brush = brushStore.activeBrush.value;
    const size = brush.size;
    const halfSize = Math.floor(size / 2);
    
    this.context.fillStyle = colorStore.primaryColor.value;

    if (brush.shape === 'square') {
      this.context.fillRect(x - halfSize, y - halfSize, size, size);
    } else {
      // Circle (approximate)
      this.context.beginPath();
      this.context.arc(x, y, size / 2, 0, Math.PI * 2);
      this.context.fill();
    }
  }
}
