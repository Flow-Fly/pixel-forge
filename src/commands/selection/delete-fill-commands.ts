import { type Command } from '../../stores/history';
import { selectionStore } from '../../stores/selection';
import { type Rect } from '../../types/geometry';
import { type SelectionShape } from '../../types/selection';
import { clearCanvasSelection, fillCanvasSelection } from './pixels';

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
    clearCanvasSelection(ctx, this.bounds, this.shape, this.mask);

    selectionStore.clear();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(this.deletedImageData, this.bounds.x, this.bounds.y);

    // Restore selection
    selectionStore.setSelected(this.bounds, this.shape, this.mask);
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
    fillCanvasSelection(ctx, this.bounds, this.fillColor, this.shape, this.mask);
    selectionStore.clear();
  }

  undo() {
    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(this.previousImageData, this.bounds.x, this.bounds.y);

    // Restore selection
    selectionStore.setSelected(this.bounds, this.shape, this.mask);
  }
}
