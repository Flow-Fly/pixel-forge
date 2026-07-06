import { type Command } from '../../stores/history';
import { selectionStore } from '../../stores/selection';
import { type Rect } from '../../types/geometry';
import { type SelectionShape } from '../../types/selection';

/**
 * Command for applying a transform (scale and/or rotation) to a selection.
 * Execute: pastes transformed pixels at new bounds, clears original location
 * Undo: restores original pixels, returns to transforming state
 *
 * Note: This command receives the already-transformed image data from the
 * selection store. The transform calculation happens before the command
 * is created (to support async web worker processing).
 */
export class TransformSelectionCommand implements Command {
  id: string;
  name: string;
  timestamp: number;

  private canvas: HTMLCanvasElement;

  // Original state (for undo)
  private originalImageData: ImageData;
  private originalBounds: Rect;
  private originalShape: SelectionShape;
  private originalMask?: Uint8Array;

  // Final state (after transform)
  private transformedImageData: ImageData;
  private rotation: number;
  private scale: { x: number; y: number };

  // Actual destination position (calculated from transformed image dimensions)
  private actualDestX: number;
  private actualDestY: number;

  // For proper undo/redo: what was at the destination before pasting
  private overwrittenAtDestination: ImageData;

  constructor(
    canvas: HTMLCanvasElement,
    originalImageData: ImageData,
    originalBounds: Rect,
    transformedImageData: ImageData,
    _transformedBounds: Rect,
    rotation: number,
    scale: { x: number; y: number },
    shape: SelectionShape,
    originalMask?: Uint8Array,
    offset: { x: number; y: number } = { x: 0, y: 0 }
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.canvas = canvas;

    // Generate descriptive name based on what changed
    const hasScale = scale.x !== 1 || scale.y !== 1;
    const hasRotation = rotation !== 0;
    if (hasScale && hasRotation) {
      this.name = 'Transform Selection';
    } else if (hasScale) {
      this.name = 'Scale Selection';
    } else if (hasRotation) {
      this.name = 'Rotate Selection';
    } else {
      this.name = 'Move Selection';
    }

    // Store original state
    this.originalImageData = originalImageData;
    this.originalBounds = { ...originalBounds };
    this.originalShape = shape;
    this.originalMask = originalMask;

    // Store transformed state
    this.transformedImageData = transformedImageData;
    this.rotation = rotation;
    this.scale = { ...scale };

    // Calculate actual destination position (including offset from movement during transform)
    // IMPORTANT: Use originalBounds center + offset, not transformedBounds (which has preview dimensions)
    // Both preview (nearest-neighbor) and RotSprite may produce slightly different dimensions
    // due to rounding, but both should be centered on the same original center point.
    const originalCenterX = originalBounds.x + offset.x + originalBounds.width / 2;
    const originalCenterY = originalBounds.y + offset.y + originalBounds.height / 2;
    this.actualDestX = Math.round(originalCenterX - transformedImageData.width / 2);
    this.actualDestY = Math.round(originalCenterY - transformedImageData.height / 2);

    // Capture what's at the actual destination before we paste
    const ctx = canvas.getContext('2d')!;
    this.overwrittenAtDestination = ctx.getImageData(
      this.actualDestX,
      this.actualDestY,
      transformedImageData.width,
      transformedImageData.height
    );
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;

    // Note: The original location was already cleared when we cut to floating state
    // So we just need to paste the transformed pixels at the new location

    // Paste transformed pixels (respecting alpha)
    this.pasteWithAlpha(ctx, this.transformedImageData);

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

    // Re-apply the transforms for preview
    if (this.scale.x !== 1 || this.scale.y !== 1) {
      selectionStore.updateScale(this.scale.x, this.scale.y);
    }
    if (this.rotation !== 0) {
      selectionStore.updateRotation(this.rotation);
    }
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
