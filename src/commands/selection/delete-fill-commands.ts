import { type Command } from '../../stores/history';
import { selectionStore } from '../../stores/selection';
import { type Rect } from '../../types/geometry';
import { type SelectionShape } from '../../types/selection';

/**
 * Command for deleting selected pixels (without moving).
 * Execute: clears selected pixels
 * Undo: restores cleared pixels
 */
export class DeleteSelectionCommand implements Command {
  id: string;
  name = 'Delete Selection';
  timestamp: number;

  private canvas: HTMLCanvasElement;
  private bounds: Rect;
  private shape: SelectionShape;
  private deletedImageData: ImageData;
  private mask?: Uint8Array;

  constructor(
    canvas: HTMLCanvasElement,
    bounds: Rect,
    shape: SelectionShape,
    mask?: Uint8Array
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.canvas = canvas;
    this.bounds = { ...bounds };
    this.shape = shape;
    this.mask = mask;

    // Capture pixels before deleting
    const ctx = canvas.getContext('2d')!;
    this.deletedImageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;

    if (this.shape === 'rectangle') {
      ctx.clearRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
    } else if (this.shape === 'ellipse') {
      this.clearEllipse(ctx);
    } else if (this.shape === 'freeform' && this.mask) {
      this.clearWithMask(ctx);
    }

    selectionStore.clear();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(this.deletedImageData, this.bounds.x, this.bounds.y);

    // Restore selection
    selectionStore.setSelected(this.bounds, this.shape, this.mask);
  }

  private clearEllipse(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.bounds;
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const dx = (px + 0.5 - width / 2) / (width / 2);
        const dy = (py + 0.5 - height / 2) / (height / 2);
        if (dx * dx + dy * dy <= 1) {
          const idx = (py * width + px) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        }
      }
    }

    ctx.putImageData(imageData, x, y);
  }

  private clearWithMask(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.bounds;
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    // Clear pixels where mask is selected
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const maskIdx = py * width + px;
        if (this.mask![maskIdx] === 255) {
          const idx = maskIdx * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        }
      }
    }

    ctx.putImageData(imageData, x, y);
  }
}

/**
 * Command for filling selected area with a color.
 * Execute: fills selected pixels with the specified color
 * Undo: restores original pixels
 */
export class FillSelectionCommand implements Command {
  id: string;
  name = 'Fill Selection';
  timestamp: number;

  private canvas: HTMLCanvasElement;
  private bounds: Rect;
  private shape: SelectionShape;
  private fillColor: string;
  private previousImageData: ImageData;
  private mask?: Uint8Array;

  constructor(
    canvas: HTMLCanvasElement,
    bounds: Rect,
    shape: SelectionShape,
    fillColor: string,
    mask?: Uint8Array
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.canvas = canvas;
    this.bounds = { ...bounds };
    this.shape = shape;
    this.fillColor = fillColor;
    this.mask = mask;

    // Capture pixels before filling
    const ctx = canvas.getContext('2d')!;
    this.previousImageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;
    const { x, y, width, height } = this.bounds;

    // Parse fill color
    const r = parseInt(this.fillColor.slice(1, 3), 16);
    const g = parseInt(this.fillColor.slice(3, 5), 16);
    const b = parseInt(this.fillColor.slice(5, 7), 16);

    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    if (this.shape === 'rectangle') {
      // Fill entire rectangle
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const idx = (py * width + px) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    } else if (this.shape === 'ellipse') {
      // Fill ellipse
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const dx = (px + 0.5 - width / 2) / (width / 2);
          const dy = (py + 0.5 - height / 2) / (height / 2);
          if (dx * dx + dy * dy <= 1) {
            const idx = (py * width + px) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }
    } else if (this.shape === 'freeform' && this.mask) {
      // Fill with mask
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const maskIdx = py * width + px;
          if (this.mask[maskIdx] === 255) {
            const idx = maskIdx * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, x, y);
    selectionStore.clear();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(this.previousImageData, this.bounds.x, this.bounds.y);

    // Restore selection
    selectionStore.setSelected(this.bounds, this.shape, this.mask);
  }
}
