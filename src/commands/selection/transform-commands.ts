import { type Command } from '../../stores/history';
import { getActiveProjectContext, type ProjectContext } from '../../stores/project-context';
import { type Rect } from '../../types/geometry';
import { type SelectionShape } from '../../types/selection';
import { flipSelectedPixels, pasteImageDataWithAlpha } from './pixels';

type SelectionCommandContext = Pick<ProjectContext, 'selection'>;

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
  private readonly context: SelectionCommandContext;

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
    offset: { x: number; y: number } = { x: 0, y: 0 },
    context: SelectionCommandContext = getActiveProjectContext()
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.canvas = canvas;
    this.context = context;

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

    pasteImageDataWithAlpha(ctx, this.transformedImageData, this.actualDestX, this.actualDestY);

    // Clear selection state
    this.context.selection.clearAfterTransform();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;

    // Restore what was at the actual destination
    ctx.putImageData(this.overwrittenAtDestination, this.actualDestX, this.actualDestY);

    // Restore to transforming state with original data
    this.context.selection.startTransform(
      this.originalImageData,
      this.originalBounds,
      this.originalShape,
      this.originalMask
    );

    // Re-apply the transforms for preview
    if (this.scale.x !== 1 || this.scale.y !== 1) {
      this.context.selection.updateScale(this.scale.x, this.scale.y);
    }
    if (this.rotation !== 0) {
      this.context.selection.updateRotation(this.rotation);
    }
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
    const imageData = ctx.getImageData(x, y, width, height);
    const flippedImageData = flipSelectedPixels(imageData, this.shape, this.direction, this.mask);

    ctx.putImageData(flippedImageData, x, y);
  }
}
