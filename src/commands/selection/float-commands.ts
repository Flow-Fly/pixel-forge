import { type Command } from '../../stores/history';
import { selectionStore } from '../../stores/selection';
import { type Rect } from '../../types/geometry';
import { type SelectionShape } from '../../types/selection';
import { trimTransparentPixels } from './image-data';

/**
 * Command for cutting selected pixels into a floating selection.
 * Execute: cuts pixels from layer, stores in floating state
 * Undo: restores pixels to layer, returns to selected state
 */
export class CutToFloatCommand implements Command {
  id: string;
  name = 'Move Selection';
  timestamp: number;

  private canvas: HTMLCanvasElement;
  private shape: SelectionShape;

  // Original selection bounds (for clearing and undo)
  private originalBounds: Rect;
  private originalMask?: Uint8Array;

  // Full captured image data (for undo - restores the full original area)
  private fullImageData: ImageData;

  // Trimmed data for floating state (excludes transparent pixels)
  private trimmedImageData: ImageData;
  private trimmedBounds: Rect;
  private trimmedMask?: Uint8Array;

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
    this.originalBounds = { ...bounds };
    this.shape = shape;
    this.originalMask = mask;

    // Capture the pixels we're about to cut
    const ctx = canvas.getContext('2d')!;
    this.fullImageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);

    // Create a working copy for masking and trimming
    const workingData = new ImageData(
      new Uint8ClampedArray(this.fullImageData.data),
      this.fullImageData.width,
      this.fullImageData.height
    );

    // For non-rectangle shapes, mask out pixels outside the selection
    if (shape === 'ellipse') {
      this.applyEllipseMaskToData(workingData);
    } else if (shape === 'freeform' && mask) {
      this.applyMaskToData(workingData, mask);
    }

    // Trim transparent pixels to get tight bounding box
    const trimResult = trimTransparentPixels(workingData, mask);

    if (trimResult) {
      this.trimmedImageData = trimResult.imageData;
      this.trimmedBounds = {
        x: bounds.x + trimResult.offset.x,
        y: bounds.y + trimResult.offset.y,
        width: trimResult.imageData.width,
        height: trimResult.imageData.height,
      };
      this.trimmedMask = trimResult.mask;
    } else {
      // All transparent - use original (edge case)
      this.trimmedImageData = workingData;
      this.trimmedBounds = { ...bounds };
      this.trimmedMask = mask;
    }
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;

    // Clear the pixels from the canvas (cut them) - use ORIGINAL bounds
    if (this.shape === 'rectangle') {
      ctx.clearRect(this.originalBounds.x, this.originalBounds.y, this.originalBounds.width, this.originalBounds.height);
    } else if (this.shape === 'ellipse') {
      this.clearEllipse(ctx);
    } else if (this.shape === 'freeform' && this.originalMask) {
      this.clearWithMask(ctx);
    }

    // Set selection store to floating state with TRIMMED pixels
    selectionStore.setFloating(this.trimmedImageData, this.trimmedBounds, this.shape, this.trimmedMask);
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;

    // Restore the full original pixels
    ctx.putImageData(this.fullImageData, this.originalBounds.x, this.originalBounds.y);

    // Return to selected state with original bounds
    selectionStore.setSelected(this.originalBounds, this.shape, this.originalMask);
  }

  private applyEllipseMaskToData(imageData: ImageData) {
    const { width, height } = this.originalBounds;
    const data = imageData.data;
    const rx = width / 2;
    const ry = height / 2;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const dx = (px + 0.5 - width / 2) / rx;
        const dy = (py + 0.5 - height / 2) / ry;
        // If OUTSIDE ellipse, make transparent
        if (dx * dx + dy * dy > 1) {
          const idx = (py * width + px) * 4;
          data[idx + 3] = 0;
        }
      }
    }
  }

  private applyMaskToData(imageData: ImageData, mask: Uint8Array) {
    const { width, height } = this.originalBounds;
    const data = imageData.data;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const maskIdx = py * width + px;
        // If NOT selected in mask, make transparent
        if (mask[maskIdx] !== 255) {
          const idx = maskIdx * 4;
          data[idx + 3] = 0;
        }
      }
    }
  }

  private clearEllipse(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.originalBounds;
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

  private clearWithMask(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.originalBounds;
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    // Clear pixels where mask is selected
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const maskIdx = py * width + px;
        if (this.originalMask![maskIdx] === 255) {
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

    // Paste the floating pixels at destination (only non-transparent pixels)
    if (this.shape === 'rectangle') {
      this.pasteWithAlpha(ctx);
    } else if (this.shape === 'ellipse') {
      this.pasteEllipse(ctx);
    } else if (this.shape === 'freeform') {
      this.pasteWithMask(ctx);
    }

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

    // Only paste pixels inside ellipse (with alpha)
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const dx = (px + 0.5 - width / 2) / (width / 2);
        const dy = (py + 0.5 - height / 2) / (height / 2);
        if (dx * dx + dy * dy <= 1) {
          const idx = (py * width + px) * 4;
          const srcAlpha = srcData[idx + 3];
          if (srcAlpha > 0) {
            dstData[idx] = srcData[idx];
            dstData[idx + 1] = srcData[idx + 1];
            dstData[idx + 2] = srcData[idx + 2];
            dstData[idx + 3] = srcData[idx + 3];
          }
        }
      }
    }

    ctx.putImageData(destData, x, y);
  }

  private pasteWithAlpha(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.destinationBounds;

    // Get destination image data
    const destData = ctx.getImageData(x, y, width, height);
    const srcData = this.floatingImageData.data;
    const dstData = destData.data;

    // Only paste non-transparent pixels
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const idx = (py * width + px) * 4;
        const srcAlpha = srcData[idx + 3];
        if (srcAlpha > 0) {
          dstData[idx] = srcData[idx];
          dstData[idx + 1] = srcData[idx + 1];
          dstData[idx + 2] = srcData[idx + 2];
          dstData[idx + 3] = srcData[idx + 3];
        }
      }
    }

    ctx.putImageData(destData, x, y);
  }

  private pasteWithMask(ctx: CanvasRenderingContext2D) {
    const { x, y, width, height } = this.destinationBounds;

    // Get destination image data
    const destData = ctx.getImageData(x, y, width, height);
    const srcData = this.floatingImageData.data;
    const dstData = destData.data;

    // Only paste pixels where mask is selected AND source has alpha
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const maskIdx = py * width + px;
        const idx = maskIdx * 4;
        const srcAlpha = srcData[idx + 3];

        // Paste if source has alpha (mask check is implicit - source was cut with mask)
        if (srcAlpha > 0) {
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
