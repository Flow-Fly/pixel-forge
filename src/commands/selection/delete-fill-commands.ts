import { type Command } from '../../stores/history';
import { getActiveProjectContext, type ProjectContext } from '../../stores/project-context';
import { type Rect } from '../../types/geometry';
import { type SelectionShape } from '../../types/selection';
import { clearCanvasSelection, fillCanvasSelection } from './pixels';

type SelectionCommandContext = Pick<ProjectContext, 'animation' | 'selection'>;

function getEditableCanvas(
  context: SelectionCommandContext,
  layerId: string,
  frameId: string
): HTMLCanvasElement {
  const canvas = context.animation.getEditableCelCanvas(layerId, frameId);
  if (!canvas) throw new Error('Editable cel canvas not found');
  return canvas;
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
    this.bounds = { ...bounds };
    this.shape = shape;
    this.mask = mask;

    // Capture pixels before deleting
    const ctx = this.canvas.getContext('2d')!;
    this.deletedImageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;
    clearCanvasSelection(ctx, this.bounds, this.shape, this.mask);

    this.context.selection.clear();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(this.deletedImageData, this.bounds.x, this.bounds.y);

    // Restore selection
    this.context.selection.setSelected(this.bounds, this.shape, this.mask);
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
  private readonly context: SelectionCommandContext;

  constructor(
    layerId: string,
    frameId: string,
    bounds: Rect,
    shape: SelectionShape,
    fillColor: string,
    mask?: Uint8Array,
    context: SelectionCommandContext = getActiveProjectContext()
  ) {
    this.id = crypto.randomUUID();
    this.timestamp = Date.now();
    this.context = context;
    this.canvas = getEditableCanvas(context, layerId, frameId);
    this.bounds = { ...bounds };
    this.shape = shape;
    this.fillColor = fillColor;
    this.mask = mask;

    // Capture pixels before filling
    const ctx = this.canvas.getContext('2d')!;
    this.previousImageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  execute() {
    const ctx = this.canvas.getContext('2d')!;
    fillCanvasSelection(ctx, this.bounds, this.fillColor, this.shape, this.mask);
    this.context.selection.clear();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(this.previousImageData, this.bounds.x, this.bounds.y);

    // Restore selection
    this.context.selection.setSelected(this.bounds, this.shape, this.mask);
  }
}
