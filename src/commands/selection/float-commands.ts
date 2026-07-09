import { type Command } from '../../stores/history';
import { getActiveProjectContext, type ProjectContext } from '../../stores/project-context';
import { type Rect } from '../../types/geometry';
import { type SelectionShape } from '../../types/selection';
import { trimTransparentPixels } from './image-data';
import {
  clearCanvasSelection,
  maskPixelsOutsideSelection,
  pasteImageDataWithAlpha,
} from './pixels';

type SelectionCommandContext = Pick<ProjectContext, 'selection'>;

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
  private readonly context: SelectionCommandContext;

  constructor(
    canvas: HTMLCanvasElement,
    _layerId: string,
    bounds: Rect,
    shape: SelectionShape,
    mask?: Uint8Array,
    context: SelectionCommandContext = getActiveProjectContext()
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.canvas = canvas;
    this.context = context;
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

    maskPixelsOutsideSelection(workingData, shape, mask);

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
    clearCanvasSelection(ctx, this.originalBounds, this.shape, this.originalMask);

    // Set selection store to floating state with TRIMMED pixels
    this.context.selection.setFloating(
      this.trimmedImageData,
      this.trimmedBounds,
      this.shape,
      this.trimmedMask
    );
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;

    // Restore the full original pixels
    ctx.putImageData(this.fullImageData, this.originalBounds.x, this.originalBounds.y);

    // Return to selected state with original bounds
    this.context.selection.setSelected(this.originalBounds, this.shape, this.originalMask);
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
  private readonly context: SelectionCommandContext;

  constructor(
    canvas: HTMLCanvasElement,
    _layerId: string,
    floatingImageData: ImageData,
    originalBounds: Rect,
    offset: { x: number; y: number },
    shape: SelectionShape,
    mask?: Uint8Array,
    context: SelectionCommandContext = getActiveProjectContext()
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.canvas = canvas;
    this.context = context;
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
    const pasteShape = this.shape === 'ellipse' ? 'ellipse' : 'rectangle';

    pasteImageDataWithAlpha(
      ctx,
      this.floatingImageData,
      this.destinationBounds.x,
      this.destinationBounds.y,
      pasteShape
    );

    // Clear selection state
    this.context.selection.clearAfterCommit();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;

    // Restore what was overwritten at destination
    ctx.putImageData(this.overwrittenImageData, this.destinationBounds.x, this.destinationBounds.y);

    // Restore floating state at the destination position
    this.context.selection.setFloating(
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
}
