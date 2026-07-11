import { type Command } from '../../stores/history';
import { getActiveProjectContext } from '../../stores/project-context';
import { type Rect } from '../../types/geometry';
import { type SelectionShape } from '../../types/selection';
import { clearCanvasSelection, fillCanvasSelection } from './pixels';
import { SelectionRegionCommand, type EditableCelCommandContext } from './editable-cel-command';

/**
 * Command for deleting selected pixels (without moving).
 * Execute: clears selected pixels
 * Undo: restores cleared pixels
 */
export class DeleteSelectionCommand extends SelectionRegionCommand implements Command {
  name = 'Delete Selection';

  private deletedImageData: ImageData;

  constructor(
    layerId: string,
    frameId: string,
    bounds: Rect,
    shape: SelectionShape,
    mask?: Uint8Array,
    context: EditableCelCommandContext = getActiveProjectContext()
  ) {
    super(layerId, frameId, bounds, shape, mask, context);

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
export class FillSelectionCommand extends SelectionRegionCommand implements Command {
  name = 'Fill Selection';

  private fillColor: string;
  private previousImageData: ImageData;

  constructor(
    layerId: string,
    frameId: string,
    bounds: Rect,
    shape: SelectionShape,
    fillColor: string,
    mask?: Uint8Array,
    context: EditableCelCommandContext = getActiveProjectContext()
  ) {
    super(layerId, frameId, bounds, shape, mask, context);
    this.fillColor = fillColor;

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
