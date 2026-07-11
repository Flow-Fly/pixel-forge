import { type Command } from '../../stores/history';
import { getActiveProjectContext, type ProjectContext } from '../../stores/project-context';
import type { ClipboardIndexPasteRegionPlan } from '../../services/clipboard-index-paste-region';
import { type Rect } from '../../types/geometry';
import { type FloatingIndexedPaste, type SelectionShape } from '../../types/selection';
import { writeIndexRegion } from '../../utils/buffer-region';
import { trimTransparentPixels } from './image-data';
import {
  clearCanvasSelection,
  maskPixelsOutsideSelection,
  pasteImageDataWithAlpha,
} from './pixels';

type SelectionCommandContext = Pick<ProjectContext, 'animation' | 'selection'>;
type IndexedSelectionCommandContext = Pick<ProjectContext, 'animation' | 'palette' | 'selection'>;

function getEditableCanvas(
  context: Pick<ProjectContext, 'animation'>,
  layerId: string,
  frameId: string
): HTMLCanvasElement {
  const canvas = context.animation.getEditableCelCanvas(layerId, frameId);
  if (!canvas) throw new Error('Editable cel canvas not found');
  return canvas;
}

export interface IndexedFloatPaletteState {
  colors: string[];
  newColorFlags: Set<string>;
}

export interface CommitIndexedFloatCommandOptions {
  layerId: string;
  frameId: string;
  canvasWidth: number;
  indexRegionPlan: ClipboardIndexPasteRegionPlan;
  paletteBeforeCommit: IndexedFloatPaletteState;
  mask?: Uint8Array;
  indexedPaste?: FloatingIndexedPaste;
}

function clonePaletteState(state: IndexedFloatPaletteState): IndexedFloatPaletteState {
  return {
    colors: [...state.colors],
    newColorFlags: new Set(state.newColorFlags),
  };
}

function currentPaletteState(context: IndexedSelectionCommandContext): IndexedFloatPaletteState {
  return {
    colors: [...context.palette.mainColors.value],
    newColorFlags: new Set(context.palette.newColorFlags.value),
  };
}

function getDestinationBounds(
  originalBounds: Rect,
  offset: { x: number; y: number }
): Rect {
  return {
    x: originalBounds.x + offset.x,
    y: originalBounds.y + offset.y,
    width: originalBounds.width,
    height: originalBounds.height,
  };
}

function getPasteShape(shape: SelectionShape): SelectionShape {
  return shape === 'ellipse' ? 'ellipse' : 'rectangle';
}

function restoreFloatingSelection(
  context: SelectionCommandContext,
  imageData: ImageData,
  bounds: Rect,
  shape: SelectionShape,
  mask?: Uint8Array,
  indexedPaste?: FloatingIndexedPaste
): void {
  context.selection.setFloating(
    imageData,
    {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
    shape,
    mask,
    indexedPaste
  );
}

function restoreCommittedFloat(
  canvas: HTMLCanvasElement,
  overwrittenImageData: ImageData,
  context: SelectionCommandContext,
  floatingImageData: ImageData,
  destinationBounds: Rect,
  shape: SelectionShape,
  mask?: Uint8Array,
  indexedPaste?: FloatingIndexedPaste
): void {
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(overwrittenImageData, destinationBounds.x, destinationBounds.y);
  restoreFloatingSelection(context, floatingImageData, destinationBounds, shape, mask, indexedPaste);
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
  private readonly context: SelectionCommandContext;

  constructor(
    layerId: string,
    frameId: string,
    bounds: Rect,
    shape: SelectionShape,
    mask?: Uint8Array,
    context: SelectionCommandContext = getActiveProjectContext()
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.canvas = getEditableCanvas(context, layerId, frameId);
    this.originalBounds = { ...bounds };
    this.shape = shape;
    this.originalMask = mask;

    // Capture the pixels we're about to cut
    const ctx = this.canvas.getContext('2d')!;
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
    layerId: string,
    frameId: string,
    floatingImageData: ImageData,
    originalBounds: Rect,
    offset: { x: number; y: number },
    shape: SelectionShape,
    mask?: Uint8Array,
    context: SelectionCommandContext = getActiveProjectContext()
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.canvas = getEditableCanvas(context, layerId, frameId);
    this.floatingImageData = floatingImageData;
    this.shape = shape;
    this.mask = mask;

    this.destinationBounds = getDestinationBounds(originalBounds, offset);

    // Capture what's currently at the destination (for undo)
    const ctx = this.canvas.getContext('2d')!;
    this.overwrittenImageData = ctx.getImageData(
      this.destinationBounds.x,
      this.destinationBounds.y,
      this.destinationBounds.width,
      this.destinationBounds.height
    );
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;
    const pasteShape = getPasteShape(this.shape);

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
    restoreCommittedFloat(
      this.canvas,
      this.overwrittenImageData,
      this.context,
      this.floatingImageData,
      this.destinationBounds,
      this.shape,
      this.mask
    );
    // Reset offset to 0 since we're now at destination
  }
}

/**
 * Command for committing an indexed floating selection to the canvas.
 * Execute/redo restores the target palette after remap append, writes the
 * pasted index-buffer region, pastes pixels, and clears the floating selection.
 * Undo restores the previous palette, index-buffer region, pixels, and float.
 */
export class CommitIndexedFloatCommand implements Command {
  id: string;
  name = 'Commit Selection';
  timestamp: number;
  memorySize: number;

  private canvas: HTMLCanvasElement;
  private floatingImageData: ImageData;
  private destinationBounds: Rect;
  private overwrittenImageData: ImageData;
  private shape: SelectionShape;
  private layerId: string;
  private frameId: string;
  private canvasWidth: number;
  private indexRegionPlan: ClipboardIndexPasteRegionPlan;
  private paletteBeforeCommit: IndexedFloatPaletteState;
  private paletteAfterCommit: IndexedFloatPaletteState;
  private indexedPaste?: FloatingIndexedPaste;
  private mask?: Uint8Array;
  private readonly context: IndexedSelectionCommandContext;

  constructor(
    floatingImageData: ImageData,
    originalBounds: Rect,
    offset: { x: number; y: number },
    shape: SelectionShape,
    options: CommitIndexedFloatCommandOptions,
    context: IndexedSelectionCommandContext = getActiveProjectContext()
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.canvas = getEditableCanvas(context, options.layerId, options.frameId);
    this.floatingImageData = floatingImageData;
    this.destinationBounds = getDestinationBounds(originalBounds, offset);
    this.shape = shape;
    this.layerId = options.layerId;
    this.frameId = options.frameId;
    this.canvasWidth = options.canvasWidth;
    this.indexRegionPlan = {
      previousIndexData: new Uint8Array(options.indexRegionPlan.previousIndexData),
      nextIndexData: new Uint8Array(options.indexRegionPlan.nextIndexData),
    };
    this.paletteBeforeCommit = clonePaletteState(options.paletteBeforeCommit);
    this.paletteAfterCommit = currentPaletteState(context);
    this.indexedPaste = options.indexedPaste
      ? {
          remappedIndexData: new Uint8Array(options.indexedPaste.remappedIndexData),
          paletteBeforeCommit: clonePaletteState(options.indexedPaste.paletteBeforeCommit),
        }
      : undefined;
    this.mask = options.mask;

    const ctx = this.canvas.getContext('2d')!;
    this.overwrittenImageData = ctx.getImageData(
      this.destinationBounds.x,
      this.destinationBounds.y,
      this.destinationBounds.width,
      this.destinationBounds.height
    );

    this.memorySize =
      this.floatingImageData.data.byteLength +
      this.overwrittenImageData.data.byteLength +
      this.indexRegionPlan.previousIndexData.byteLength +
      this.indexRegionPlan.nextIndexData.byteLength +
      200;
  }

  execute(): void {
    this.applyPaletteState(this.paletteAfterCommit);
    this.writeIndexRegion(this.indexRegionPlan.nextIndexData);
    this.context.animation.rebuildAllCelCanvases();

    const ctx = this.canvas.getContext('2d')!;
    pasteImageDataWithAlpha(
      ctx,
      this.floatingImageData,
      this.destinationBounds.x,
      this.destinationBounds.y,
      getPasteShape(this.shape)
    );

    this.context.selection.clearAfterCommit();
  }

  undo(): void {
    this.applyPaletteState(this.paletteBeforeCommit);
    this.writeIndexRegion(this.indexRegionPlan.previousIndexData);
    this.context.animation.rebuildAllCelCanvases();

    restoreCommittedFloat(
      this.canvas,
      this.overwrittenImageData,
      this.context,
      this.floatingImageData,
      this.destinationBounds,
      this.shape,
      this.mask,
      this.indexedPaste
    );
  }

  private applyPaletteState(state: IndexedFloatPaletteState): void {
    this.context.palette.setColorsDirect(state.colors, state.newColorFlags);
  }

  private writeIndexRegion(data: Uint8Array): void {
    const indexBuffer = this.context.animation.getCelIndexBuffer(this.layerId, this.frameId);
    if (!indexBuffer) return;

    writeIndexRegion(indexBuffer, this.canvasWidth, this.destinationBounds, data);
  }
}
