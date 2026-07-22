import type { ProjectContext } from '../../stores/project-context';
import type { Rect } from '../../types/geometry';
import type { SelectionShape } from '../../types/selection';

export type EditableCelCommandContext = Pick<ProjectContext, 'animation' | 'selection'>;

export abstract class EditableCelCommand<
  Context extends EditableCelCommandContext = EditableCelCommandContext,
> {
  readonly id = crypto.randomUUID();
  readonly timestamp = Date.now();

  protected readonly canvas: HTMLCanvasElement;
  protected readonly context: Context;

  protected constructor(layerId: string, frameId: string, context: Context) {
    const canvas = context.animation.getEditableCelCanvas(layerId, frameId);
    if (!canvas) throw new Error('Editable cel canvas not found');

    this.canvas = canvas;
    this.context = context;
  }
}

export abstract class SelectionRegionCommand extends EditableCelCommand {
  protected readonly bounds: Rect;
  protected readonly shape: SelectionShape;
  protected readonly mask?: Uint8Array;

  protected constructor(
    layerId: string,
    frameId: string,
    bounds: Rect,
    shape: SelectionShape,
    mask: Uint8Array | undefined,
    context: EditableCelCommandContext
  ) {
    super(layerId, frameId, context);
    this.bounds = { ...bounds };
    this.shape = shape;
    this.mask = mask;
  }
}
