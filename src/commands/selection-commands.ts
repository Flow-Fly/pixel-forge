import { type Command } from '../stores/history';
import { selectionStore } from '../stores/selection';
import { type SelectionShape } from '../types/selection';
import { type Rect } from '../types/geometry';

/**
 * Command for cutting selected pixels into a floating selection.
 * Execute: cuts pixels from layer, stores in floating state
 * Undo: restores pixels to layer, returns to selected state
 */
export class CutToFloatCommand implements Command {
  id: string;
  name = 'Move Selection';
  timestamp: number;

  private bounds: Rect;
  private shape: SelectionShape;
  private cutImageData: ImageData;
  private canvas: HTMLCanvasElement;
  private mask?: Uint8Array;

  constructor(
    canvas: HTMLCanvasElement,
    _layerId: string,
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

    // Capture the pixels we're about to cut
    const ctx = canvas.getContext('2d')!;
    this.cutImageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;

    // Clear the pixels from the canvas (cut them)
    if (this.shape === 'rectangle') {
      ctx.clearRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
    } else if (this.shape === 'ellipse') {
      // Clear ellipse region
      this.clearEllipse(ctx);
    }
    // freeform would use mask

    // Set selection store to floating state with the cut pixels
    selectionStore.setFloating(this.cutImageData, this.bounds, this.shape, this.mask);
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;

    // Restore the cut pixels
    ctx.putImageData(this.cutImageData, this.bounds.x, this.bounds.y);

    // Return to selected state
    selectionStore.setSelected(this.bounds, this.shape, this.mask);
  }

  private clearEllipse(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.bounds;
    const rx = width / 2;
    const ry = height / 2;

    // Get current image data
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    // Clear pixels inside ellipse
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const dx = (px + 0.5 - width / 2) / rx;
        const dy = (py + 0.5 - height / 2) / ry;
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
}

/**
 * Command for committing a floating selection to the canvas.
 * Execute: pastes floating pixels at destination, clears selection
 * Undo: removes pasted pixels, restores floating state at destination
 */
export class CommitFloatCommand implements Command {
  id: string;
  name = 'Commit Selection';
  timestamp: number;

  private canvas: HTMLCanvasElement;
  private floatingImageData: ImageData;
  private destinationBounds: Rect;
  private overwrittenImageData: ImageData;
  private shape: SelectionShape;
  private mask?: Uint8Array;

  constructor(
    canvas: HTMLCanvasElement,
    _layerId: string,
    floatingImageData: ImageData,
    originalBounds: Rect,
    offset: { x: number; y: number },
    shape: SelectionShape,
    mask?: Uint8Array
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.canvas = canvas;
    this.floatingImageData = floatingImageData;
    this.shape = shape;
    this.mask = mask;

    // Calculate destination bounds
    this.destinationBounds = {
      x: originalBounds.x + offset.x,
      y: originalBounds.y + offset.y,
      width: originalBounds.width,
      height: originalBounds.height,
    };

    // Capture what's currently at the destination (for undo)
    const ctx = canvas.getContext('2d')!;
    this.overwrittenImageData = ctx.getImageData(
      this.destinationBounds.x,
      this.destinationBounds.y,
      this.destinationBounds.width,
      this.destinationBounds.height
    );
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;

    // Paste the floating pixels at destination
    if (this.shape === 'rectangle') {
      ctx.putImageData(this.floatingImageData, this.destinationBounds.x, this.destinationBounds.y);
    } else if (this.shape === 'ellipse') {
      this.pasteEllipse(ctx);
    }
    // freeform would use mask

    // Clear selection state
    selectionStore.clearAfterCommit();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;

    // Restore what was overwritten at destination
    ctx.putImageData(this.overwrittenImageData, this.destinationBounds.x, this.destinationBounds.y);

    // Restore floating state at the destination position
    selectionStore.setFloating(
      this.floatingImageData,
      {
        x: this.destinationBounds.x,
        y: this.destinationBounds.y,
        width: this.destinationBounds.width,
        height: this.destinationBounds.height,
      },
      this.shape,
      this.mask
    );
    // Reset offset to 0 since we're now at destination
  }

  private pasteEllipse(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.destinationBounds;

    // Get destination image data
    const destData = ctx.getImageData(x, y, width, height);
    const srcData = this.floatingImageData.data;
    const dstData = destData.data;

    // Only paste pixels inside ellipse
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const dx = (px + 0.5 - width / 2) / (width / 2);
        const dy = (py + 0.5 - height / 2) / (height / 2);
        if (dx * dx + dy * dy <= 1) {
          const idx = (py * width + px) * 4;
          dstData[idx] = srcData[idx];
          dstData[idx + 1] = srcData[idx + 1];
          dstData[idx + 2] = srcData[idx + 2];
          dstData[idx + 3] = srcData[idx + 3];
        }
      }
    }

    ctx.putImageData(destData, x, y);
  }
}

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
}
