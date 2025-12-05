import { BaseTool, type ModifierKeys } from './base-tool';
import { colorStore } from '../stores/colors';
import { shapeSettings } from '../stores/tool-settings';
import { constrainWithStickyAngles } from '../services/drawing/algorithms';

export abstract class ShapeTool extends BaseTool {
  cursor = 'crosshair';
  protected startX = 0;
  protected startY = 0;
  protected isDrawing = false;
  protected imageData: ImageData | null = null;

  // Bounds tracking for dirty rect
  protected boundsMinX = Infinity;
  protected boundsMaxX = -Infinity;
  protected boundsMinY = Infinity;
  protected boundsMaxY = -Infinity;

  protected resetBounds(): void {
    this.boundsMinX = Infinity;
    this.boundsMaxX = -Infinity;
    this.boundsMinY = Infinity;
    this.boundsMaxY = -Infinity;
  }

  protected expandBounds(x: number, y: number, size: number = 1): void {
    const offset = Math.floor((size - 1) / 2);
    this.boundsMinX = Math.min(this.boundsMinX, x - offset);
    this.boundsMaxX = Math.max(this.boundsMaxX, x - offset + size - 1);
    this.boundsMinY = Math.min(this.boundsMinY, y - offset);
    this.boundsMaxY = Math.max(this.boundsMaxY, y - offset + size - 1);
  }

  protected flushBounds(): void {
    if (this.boundsMinX !== Infinity) {
      this.markDirty(
        this.boundsMinX,
        this.boundsMinY,
        this.boundsMaxX - this.boundsMinX + 1,
        this.boundsMaxY - this.boundsMinY + 1
      );
    }
  }

  onDown(x: number, y: number, _modifiers?: ModifierKeys) {
    this.startX = Math.floor(x);
    this.startY = Math.floor(y);
    this.isDrawing = true;
    this.resetBounds();

    // Capture canvas state for preview
    if (this.ctx) {
      this.imageData = this.ctx.getImageData(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
  }

  onMove(_x: number, _y: number, _modifiers?: ModifierKeys) {
    // Optional: Highlight cursor position?
  }

  onDrag(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.isDrawing || !this.ctx || !this.imageData) return;

    // Restore original state
    this.ctx.putImageData(this.imageData, 0, 0);

    let currentX = Math.floor(x);
    let currentY = Math.floor(y);

    let effectiveStartX = this.startX;
    let effectiveStartY = this.startY;

    // Shift = Square/Circle (1:1 aspect ratio)
    if (modifiers?.shift) {
      const width = Math.abs(currentX - effectiveStartX);
      const height = Math.abs(currentY - effectiveStartY);
      const size = Math.max(width, height);

      currentX = effectiveStartX + (currentX >= effectiveStartX ? size : -size);
      currentY = effectiveStartY + (currentY >= effectiveStartY ? size : -size);
    }

    // Ctrl = Draw from center
    if (modifiers?.ctrl) {
      const halfWidth = Math.abs(currentX - effectiveStartX);
      const halfHeight = Math.abs(currentY - effectiveStartY);

      // Adjust start point to be opposite corner from current
      effectiveStartX = this.startX - (currentX >= this.startX ? halfWidth : -halfWidth);
      effectiveStartY = this.startY - (currentY >= this.startY ? halfHeight : -halfHeight);

      // Extend current point equally in the other direction
      currentX = this.startX + (currentX >= this.startX ? halfWidth : -halfWidth);
      currentY = this.startY + (currentY >= this.startY ? halfHeight : -halfHeight);
    }

    this.drawShape(effectiveStartX, effectiveStartY, currentX, currentY, shapeSettings.fill.value, shapeSettings.thickness.value);
  }

  onUp(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.isDrawing || !this.ctx || !this.imageData) return;

    // Restore and do final draw
    this.ctx.putImageData(this.imageData, 0, 0);

    let currentX = Math.floor(x);
    let currentY = Math.floor(y);

    let effectiveStartX = this.startX;
    let effectiveStartY = this.startY;

    // Apply same modifiers as onDrag
    if (modifiers?.shift) {
      const width = Math.abs(currentX - effectiveStartX);
      const height = Math.abs(currentY - effectiveStartY);
      const size = Math.max(width, height);

      currentX = effectiveStartX + (currentX >= effectiveStartX ? size : -size);
      currentY = effectiveStartY + (currentY >= effectiveStartY ? size : -size);
    }

    if (modifiers?.ctrl) {
      const halfWidth = Math.abs(currentX - effectiveStartX);
      const halfHeight = Math.abs(currentY - effectiveStartY);

      effectiveStartX = this.startX - (currentX >= this.startX ? halfWidth : -halfWidth);
      effectiveStartY = this.startY - (currentY >= this.startY ? halfHeight : -halfHeight);

      currentX = this.startX + (currentX >= this.startX ? halfWidth : -halfWidth);
      currentY = this.startY + (currentY >= this.startY ? halfHeight : -halfHeight);
    }

    this.drawShape(effectiveStartX, effectiveStartY, currentX, currentY, shapeSettings.fill.value, shapeSettings.thickness.value);

    this.isDrawing = false;
    this.imageData = null;
    this.flushBounds();
  }

  protected abstract drawShape(x1: number, y1: number, x2: number, y2: number, filled: boolean, thickness: number): void;

  protected setPixel(x: number, y: number) {
    if (!this.ctx) return;
    const color = colorStore.primaryColor.value;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, 1, 1);
    this.expandBounds(x, y, 1);
  }

  protected setThickPixel(x: number, y: number, thickness: number) {
    if (!this.ctx || thickness <= 0) return;
    const color = colorStore.primaryColor.value;
    this.ctx.fillStyle = color;
    const offset = Math.floor((thickness - 1) / 2);
    this.ctx.fillRect(x - offset, y - offset, thickness, thickness);
    this.expandBounds(x, y, thickness);
  }

  protected fillRect(x1: number, y1: number, x2: number, y2: number) {
    if (!this.ctx) return;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const color = colorStore.primaryColor.value;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(minX, minY, maxX - minX + 1, maxY - minY + 1);

    // Track bounds of filled rectangle
    this.boundsMinX = Math.min(this.boundsMinX, minX);
    this.boundsMaxX = Math.max(this.boundsMaxX, maxX);
    this.boundsMinY = Math.min(this.boundsMinY, minY);
    this.boundsMaxY = Math.max(this.boundsMaxY, maxY);
  }
}

export class LineTool extends ShapeTool {
  name = 'line';

  // Override: Shift = angle snapping (not aspect ratio like other shapes)
  onDrag(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.isDrawing || !this.ctx || !this.imageData) return;

    this.ctx.putImageData(this.imageData, 0, 0);

    let currentX = Math.floor(x);
    let currentY = Math.floor(y);

    // Shift = Constrain to 15° angles with sticky zones
    if (modifiers?.shift) {
      const constrained = constrainWithStickyAngles(
        this.startX, this.startY, currentX, currentY
      );
      currentX = constrained.x;
      currentY = constrained.y;
    }

    this.drawShape(this.startX, this.startY, currentX, currentY, false, shapeSettings.thickness.value);
  }

  // Override: Shift = angle snapping (not aspect ratio like other shapes)
  onUp(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.isDrawing || !this.ctx || !this.imageData) return;

    this.ctx.putImageData(this.imageData, 0, 0);

    let currentX = Math.floor(x);
    let currentY = Math.floor(y);

    if (modifiers?.shift) {
      const constrained = constrainWithStickyAngles(
        this.startX, this.startY, currentX, currentY
      );
      currentX = constrained.x;
      currentY = constrained.y;
    }

    this.drawShape(this.startX, this.startY, currentX, currentY, false, shapeSettings.thickness.value);

    this.isDrawing = false;
    this.imageData = null;
    this.flushBounds();
  }

  protected drawShape(x1: number, y1: number, x2: number, y2: number, _filled: boolean, thickness: number) {
    // Bresenham's Line Algorithm (filled doesn't apply to lines)
    let dx = Math.abs(x2 - x1);
    let dy = Math.abs(y2 - y1);
    let sx = (x1 < x2) ? 1 : -1;
    let sy = (y1 < y2) ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this.setThickPixel(x1, y1, thickness);

      if ((x1 === x2) && (y1 === y2)) break;
      let e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x1 += sx; }
      if (e2 < dx) { err += dx; y1 += sy; }
    }
  }
}

export class RectangleTool extends ShapeTool {
  name = 'rectangle';

  protected drawShape(x1: number, y1: number, x2: number, y2: number, filled: boolean, thickness: number) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    if (filled) {
      this.fillRect(x1, y1, x2, y2);
    } else {
      // Draw horizontal lines
      for (let x = minX; x <= maxX; x++) {
        this.setThickPixel(x, minY, thickness);
        this.setThickPixel(x, maxY, thickness);
      }

      // Draw vertical lines
      for (let y = minY; y <= maxY; y++) {
        this.setThickPixel(minX, y, thickness);
        this.setThickPixel(maxX, y, thickness);
      }
    }
  }
}

export class EllipseTool extends ShapeTool {
  name = 'ellipse';

  protected drawShape(x1: number, y1: number, x2: number, y2: number, filled: boolean, thickness: number) {
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
      for (let y = minY; y <= maxY; y++) this.setThickPixel(xc, y, thickness);
      return;
    }
    if (b === 0) {
      for (let x = minX; x <= maxX; x++) this.setThickPixel(x, yc, thickness);
      return;
    }

    if (filled) {
      this.drawFilledEllipse(xc, yc, a, b);
    } else {
      this.drawEllipseOutline(xc, yc, a, b, thickness);
    }
  }

  private drawEllipseOutline(xc: number, yc: number, a: number, b: number, thickness: number) {
    let x = 0;
    let y = b;
    let d1 = (b * b) - (a * a * b) + (0.25 * a * a);
    let dx = 2 * b * b * x;
    let dy = 2 * a * a * y;

    while (dx < dy) {
      this.plotEllipsePoints(xc, yc, x, y, thickness);

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
      this.plotEllipsePoints(xc, yc, x, y, thickness);

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

  private drawFilledEllipse(xc: number, yc: number, a: number, b: number) {
    // Scan line fill for ellipse
    for (let y = -b; y <= b; y++) {
      // Calculate x range for this y using ellipse equation
      // x^2/a^2 + y^2/b^2 = 1
      // x = a * sqrt(1 - y^2/b^2)
      const xRange = Math.round(a * Math.sqrt(1 - (y * y) / (b * b)));
      for (let x = -xRange; x <= xRange; x++) {
        this.setPixel(xc + x, yc + y);
      }
    }
  }

  private plotEllipsePoints(xc: number, yc: number, x: number, y: number, thickness: number) {
    this.setThickPixel(xc + x, yc + y, thickness);
    this.setThickPixel(xc - x, yc + y, thickness);
    this.setThickPixel(xc + x, yc - y, thickness);
    this.setThickPixel(xc - x, yc - y, thickness);
  }
}
