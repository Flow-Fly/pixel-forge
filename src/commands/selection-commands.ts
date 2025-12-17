import { type Command } from '../stores/history';
import { selectionStore } from '../stores/selection';
import { type SelectionShape } from '../types/selection';
import { type Rect } from '../types/geometry';

/**
 * Find the bounding box of non-transparent pixels in ImageData.
 * Returns null if all pixels are transparent.
 */
function findContentBounds(imageData: ImageData): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const { width, height, data } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null; // All transparent
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Trim transparent pixels from ImageData and return the cropped result.
 * Returns the trimmed ImageData, the offset from original bounds, and updated mask if provided.
 */
function trimTransparentPixels(
  imageData: ImageData,
  mask?: Uint8Array
): {
  imageData: ImageData;
  offset: { x: number; y: number };
  mask?: Uint8Array;
} | null {
  const contentBounds = findContentBounds(imageData);

  if (!contentBounds) {
    return null; // All transparent
  }

  const { minX, minY, maxX, maxY } = contentBounds;
  const newWidth = maxX - minX + 1;
  const newHeight = maxY - minY + 1;

  // If no trimming needed, return original
  if (minX === 0 && minY === 0 && newWidth === imageData.width && newHeight === imageData.height) {
    return { imageData, offset: { x: 0, y: 0 }, mask };
  }

  // Create trimmed ImageData
  const trimmedData = new ImageData(newWidth, newHeight);
  const srcData = imageData.data;
  const dstData = trimmedData.data;

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcIdx = ((minY + y) * imageData.width + (minX + x)) * 4;
      const dstIdx = (y * newWidth + x) * 4;
      dstData[dstIdx] = srcData[srcIdx];
      dstData[dstIdx + 1] = srcData[srcIdx + 1];
      dstData[dstIdx + 2] = srcData[srcIdx + 2];
      dstData[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }

  // Trim mask if provided
  let trimmedMask: Uint8Array | undefined;
  if (mask) {
    trimmedMask = new Uint8Array(newWidth * newHeight);
    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcIdx = (minY + y) * imageData.width + (minX + x);
        const dstIdx = y * newWidth + x;
        trimmedMask[dstIdx] = mask[srcIdx];
      }
    }
  }

  return {
    imageData: trimmedData,
    offset: { x: minX, y: minY },
    mask: trimmedMask,
  };
}

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

/**
 * Command for applying a rotation transform to a selection.
 * Execute: pastes rotated pixels at new bounds, clears original location
 * Undo: restores original pixels, returns to transforming state
 *
 * Note: This command receives the already-rotated image data from the
 * rotation service. The rotation calculation happens before the command
 * is created (to support async web worker processing).
 */
export class TransformSelectionCommand implements Command {
  id: string;
  name = 'Rotate Selection';
  timestamp: number;

  private canvas: HTMLCanvasElement;

  // Original state (for undo)
  private originalImageData: ImageData;
  private originalBounds: Rect;
  private originalShape: SelectionShape;
  private originalMask?: Uint8Array;

  // Final state (after rotation)
  private rotatedImageData: ImageData;
  private rotation: number;

  // Actual destination position (calculated from rotated image dimensions)
  private actualDestX: number;
  private actualDestY: number;

  // For proper undo/redo: what was at the destination before pasting
  private overwrittenAtDestination: ImageData;

  constructor(
    canvas: HTMLCanvasElement,
    originalImageData: ImageData,
    originalBounds: Rect,
    rotatedImageData: ImageData,
    rotatedBounds: Rect,
    rotation: number,
    shape: SelectionShape,
    originalMask?: Uint8Array,
    offset: { x: number; y: number } = { x: 0, y: 0 }
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.canvas = canvas;

    // Store original state
    this.originalImageData = originalImageData;
    this.originalBounds = { ...originalBounds };
    this.originalShape = shape;
    this.originalMask = originalMask;

    // Store rotated state
    this.rotatedImageData = rotatedImageData;
    this.rotation = rotation;

    // Calculate actual destination position (including offset from movement during transform)
    // IMPORTANT: Use originalBounds center + offset, not rotatedBounds (which has preview dimensions)
    // Both preview (nearest-neighbor) and RotSprite may produce slightly different dimensions
    // due to rounding, but both should be centered on the same original center point.
    const originalCenterX = originalBounds.x + offset.x + originalBounds.width / 2;
    const originalCenterY = originalBounds.y + offset.y + originalBounds.height / 2;
    this.actualDestX = Math.round(originalCenterX - rotatedImageData.width / 2);
    this.actualDestY = Math.round(originalCenterY - rotatedImageData.height / 2);

    // Capture what's at the actual destination before we paste
    const ctx = canvas.getContext('2d')!;
    this.overwrittenAtDestination = ctx.getImageData(
      this.actualDestX,
      this.actualDestY,
      rotatedImageData.width,
      rotatedImageData.height
    );
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;

    // Note: The original location was already cleared when we cut to floating state
    // So we just need to paste the rotated pixels at the new location

    // Paste rotated pixels (respecting alpha)
    this.pasteWithAlpha(ctx, this.rotatedImageData);

    // Clear selection state
    selectionStore.clearAfterTransform();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;

    // Restore what was at the actual destination
    ctx.putImageData(
      this.overwrittenAtDestination,
      this.actualDestX,
      this.actualDestY
    );

    // Restore to transforming state with original data
    selectionStore.startTransform(
      this.originalImageData,
      this.originalBounds,
      this.originalShape,
      this.originalMask
    );

    // Re-apply the rotation for preview
    selectionStore.updateRotation(this.rotation);
  }

  private pasteWithAlpha(ctx: CanvasRenderingContext2D, srcImageData: ImageData) {
    // Use the pre-calculated destination position and actual image dimensions
    const srcWidth = srcImageData.width;
    const srcHeight = srcImageData.height;

    // Get destination image data at the pre-calculated target location
    const destData = ctx.getImageData(this.actualDestX, this.actualDestY, srcWidth, srcHeight);
    const srcData = srcImageData.data;
    const dstData = destData.data;

    // Only paste non-transparent pixels
    for (let py = 0; py < srcHeight; py++) {
      for (let px = 0; px < srcWidth; px++) {
        const idx = (py * srcWidth + px) * 4;
        const srcAlpha = srcData[idx + 3];
        if (srcAlpha > 0) {
          dstData[idx] = srcData[idx];
          dstData[idx + 1] = srcData[idx + 1];
          dstData[idx + 2] = srcData[idx + 2];
          dstData[idx + 3] = srcData[idx + 3];
        }
      }
    }

    ctx.putImageData(destData, this.actualDestX, this.actualDestY);
  }
}

/**
 * Command for flipping selected pixels horizontally or vertically.
 * Works on "selected" state only - flips pixels in-place on the canvas.
 */
export class FlipSelectionCommand implements Command {
  id: string;
  name: string;
  timestamp: number;

  private canvas: HTMLCanvasElement;
  private bounds: Rect;
  private shape: SelectionShape;
  private mask?: Uint8Array;
  private direction: 'horizontal' | 'vertical';

  // Store original pixels for undo
  private originalImageData: ImageData;

  constructor(
    canvas: HTMLCanvasElement,
    bounds: Rect,
    shape: SelectionShape,
    direction: 'horizontal' | 'vertical',
    mask?: Uint8Array
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.name = `Flip Selection ${direction === 'horizontal' ? 'Horizontal' : 'Vertical'}`;
    this.canvas = canvas;
    this.bounds = { ...bounds };
    this.shape = shape;
    this.direction = direction;
    this.mask = mask;

    // Capture original pixels
    const ctx = canvas.getContext('2d')!;
    this.originalImageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  execute() {
    this.flip();
  }

  undo() {
    // Restore original pixels
    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(this.originalImageData, this.bounds.x, this.bounds.y);
  }

  private flip() {
    const ctx = this.canvas.getContext('2d')!;
    const { x, y, width, height } = this.bounds;

    // Get current pixels
    const imageData = ctx.getImageData(x, y, width, height);
    const data = imageData.data;

    // Create flipped version
    const flippedData = new Uint8ClampedArray(data.length);

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const srcIdx = (py * width + px) * 4;

        // Check if this pixel is within the selection mask
        let inSelection = true;
        if (this.shape === 'freeform' && this.mask) {
          inSelection = this.mask[py * width + px] === 255;
        } else if (this.shape === 'ellipse') {
          // Check ellipse bounds
          const cx = width / 2;
          const cy = height / 2;
          const rx = width / 2;
          const ry = height / 2;
          const dx = (px + 0.5 - cx) / rx;
          const dy = (py + 0.5 - cy) / ry;
          inSelection = dx * dx + dy * dy <= 1;
        }

        let destPx: number, destPy: number;

        if (inSelection) {
          // Calculate flipped position
          if (this.direction === 'horizontal') {
            destPx = width - 1 - px;
            destPy = py;
          } else {
            destPx = px;
            destPy = height - 1 - py;
          }
        } else {
          // Keep original position for pixels outside selection
          destPx = px;
          destPy = py;
        }

        const destIdx = (destPy * width + destPx) * 4;

        // For pixels inside selection, swap with flipped position
        // For pixels outside, just copy as-is
        if (inSelection) {
          flippedData[destIdx] = data[srcIdx];
          flippedData[destIdx + 1] = data[srcIdx + 1];
          flippedData[destIdx + 2] = data[srcIdx + 2];
          flippedData[destIdx + 3] = data[srcIdx + 3];
        } else {
          flippedData[srcIdx] = data[srcIdx];
          flippedData[srcIdx + 1] = data[srcIdx + 1];
          flippedData[srcIdx + 2] = data[srcIdx + 2];
          flippedData[srcIdx + 3] = data[srcIdx + 3];
        }
      }
    }

    // Put flipped pixels back
    const flippedImageData = new ImageData(flippedData, width, height);
    ctx.putImageData(flippedImageData, x, y);
  }
}
