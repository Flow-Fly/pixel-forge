import { BaseTool } from './base-tool';
import { colorStore } from '../stores/colors';

export abstract class ShapeTool extends BaseTool {
  cursor = 'crosshair';
  protected startX = 0;
  protected startY = 0;
  protected isDrawing = false;
  protected imageData: ImageData | null = null;

  onDown(x: number, y: number) {
    this.startX = Math.floor(x);
    this.startY = Math.floor(y);
    this.isDrawing = true;
    
    // Capture canvas state for preview
    if (this.ctx) {
      this.imageData = this.ctx.getImageData(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
  }

  onMove(x: number, y: number) {
    // Optional: Highlight cursor position?
  }

  onDrag(x: number, y: number) {
    if (!this.isDrawing || !this.ctx || !this.imageData) return;

    // Restore original state
    this.ctx.putImageData(this.imageData, 0, 0);

    const currentX = Math.floor(x);
    const currentY = Math.floor(y);

    this.drawShape(this.startX, this.startY, currentX, currentY);
  }

  onUp(x: number, y: number) {
    if (!this.isDrawing || !this.ctx || !this.imageData) return;

    // Final draw
    // We don't restore here because we want to commit the change
    // Actually, onDrag restores then draws. So the canvas is in the correct state.
    // But we might want to ensure the final coordinate is exact.
    
    // Restore one last time to be clean
    this.ctx.putImageData(this.imageData, 0, 0);
    
    const currentX = Math.floor(x);
    const currentY = Math.floor(y);
    
    this.drawShape(this.startX, this.startY, currentX, currentY);

    this.isDrawing = false;
    this.imageData = null;
  }

  protected abstract drawShape(x1: number, y1: number, x2: number, y2: number): void;

  protected setPixel(x: number, y: number) {
    if (!this.ctx) return;
    const color = colorStore.primaryColor.value;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 1, 1);
  }
}

export class LineTool extends ShapeTool {
  name = 'line';

  protected drawShape(x1: number, y1: number, x2: number, y2: number) {
    // Bresenham's Line Algorithm
    let dx = Math.abs(x2 - x1);
    let dy = Math.abs(y2 - y1);
    let sx = (x1 < x2) ? 1 : -1;
    let sy = (y1 < y2) ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this.setPixel(x1, y1);

      if ((x1 === x2) && (y1 === y2)) break;
      let e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x1 += sx; }
      if (e2 < dx) { err += dx; y1 += sy; }
    }
  }
}

export class RectangleTool extends ShapeTool {
  name = 'rectangle';

  protected drawShape(x1: number, y1: number, x2: number, y2: number) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    // Draw horizontal lines
    for (let x = minX; x <= maxX; x++) {
      this.setPixel(x, minY);
      this.setPixel(x, maxY);
    }

    // Draw vertical lines
    for (let y = minY; y <= maxY; y++) {
      this.setPixel(minX, y);
      this.setPixel(maxX, y);
    }
  }
}

export class EllipseTool extends ShapeTool {
  name = 'ellipse';

  protected drawShape(x1: number, y1: number, x2: number, y2: number) {
    // Midpoint Ellipse Algorithm
    // Adapted for integer coordinates
    
    let minX = Math.min(x1, x2);
    let maxX = Math.max(x1, x2);
    let minY = Math.min(y1, y2);
    let maxY = Math.max(y1, y2);
    
    let a = Math.floor((maxX - minX) / 2);
    let b = Math.floor((maxY - minY) / 2);
    let xc = minX + a;
    let yc = minY + b;

    // If width or height is 0, draw line
    if (a === 0) {
      for (let y = minY; y <= maxY; y++) this.setPixel(xc, y);
      return;
    }
    if (b === 0) {
      for (let x = minX; x <= maxX; x++) this.setPixel(x, yc);
      return;
    }

    let x = 0;
    let y = b;
    let d1 = (b * b) - (a * a * b) + (0.25 * a * a);
    let dx = 2 * b * b * x;
    let dy = 2 * a * a * y;

    while (dx < dy) {
      this.plotEllipsePoints(xc, yc, x, y);
      
      if (d1 < 0) {
        x++;
        dx += 2 * b * b;
        d1 += dx + (b * b);
      } else {
        x++;
        y--;
        dx += 2 * b * b;
        dy -= 2 * a * a;
        d1 += dx - dy + (b * b);
      }
    }

    let d2 = ((b * b) * ((x + 0.5) * (x + 0.5))) +
             ((a * a) * ((y - 1) * (y - 1))) -
             (a * a * b * b);

    while (y >= 0) {
      this.plotEllipsePoints(xc, yc, x, y);
      
      if (d2 > 0) {
        y--;
        dy -= 2 * a * a;
        d2 += (a * a) - dy;
      } else {
        y--;
        x++;
        dx += 2 * b * b;
        dy -= 2 * a * a;
        d2 += dx - dy + (a * a);
      }
    }
  }

  private plotEllipsePoints(xc: number, yc: number, x: number, y: number) {
    this.setPixel(xc + x, yc + y);
    this.setPixel(xc - x, yc + y);
    this.setPixel(xc + x, yc - y);
    this.setPixel(xc - x, yc - y);
  }
}
