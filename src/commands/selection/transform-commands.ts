import { type Command } from '../../stores/history';
import { getActiveProjectContext, type ProjectContext } from '../../stores/project-context';
import type { ProjectChangeEvent } from '../../stores/project-store';
import { type Rect } from '../../types/geometry';
import {
  type FloatingIndexedPaste,
  type SelectionShape,
  type SelectionState,
} from '../../types/selection';
import { flipSelectedPixels } from './pixels';
import { EditableCelCommand, type EditableCelCommandContext } from './editable-cel-command';

/**
 * Command for applying a transform (scale and/or rotation) to a selection.
 * Execute: pastes transformed pixels at new bounds, clears original location
 * Undo: restores original pixels, returns to transforming state
 *
 * Note: This command receives the already-transformed image data from the
 * selection store. The transform calculation happens before the command
 * is created (to support async web worker processing).
 */
export interface SelectionTransformIndexEntry {
  readonly key: string;
  readonly buffer?: Uint8Array;
  readonly bytes?: Uint8Array;
}

export interface PreparedSelectionTransform {
  readonly context: ProjectContext;
  readonly layerId: string;
  readonly frameId: string;
  readonly celId: string;
  readonly canvas: HTMLCanvasElement;
  readonly beforePixels: ImageData;
  readonly initialPixels: ImageData;
  readonly afterPixels: ImageData;
  readonly beforeIndices: readonly SelectionTransformIndexEntry[];
  readonly afterIndices: Uint8Array;
  readonly beforeSelection: SelectionState;
}

function cloneIndexedPaste(indexedPaste: FloatingIndexedPaste): FloatingIndexedPaste {
  return {
    remappedIndexData: new Uint8Array(indexedPaste.remappedIndexData),
    paletteBeforeCommit: {
      colors: [...indexedPaste.paletteBeforeCommit.colors],
      newColorFlags: new Set(indexedPaste.paletteBeforeCommit.newColorFlags),
      entryIds: [...indexedPaste.paletteBeforeCommit.entryIds],
    },
  };
}

export function cloneImageData(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  if (typeof ImageData === 'function') {
    return new ImageData(data, imageData.width, imageData.height);
  }
  return {
    data,
    width: imageData.width,
    height: imageData.height,
    colorSpace: 'srgb',
  } as ImageData;
}

export function cloneSelectionState(state: SelectionState): SelectionState {
  switch (state.type) {
    case 'none':
      return { type: 'none' };
    case 'selecting':
      return {
        ...state,
        startPoint: { ...state.startPoint },
        currentBounds: { ...state.currentBounds },
        previewPath: state.previewPath?.map((point) => ({ ...point })),
      };
    case 'selected':
      return {
        ...state,
        bounds: { ...state.bounds },
        ...(state.shape === 'freeform' ? { mask: new Uint8Array(state.mask) } : {}),
      };
    case 'floating':
      return {
        ...state,
        imageData: cloneImageData(state.imageData),
        originalBounds: { ...state.originalBounds },
        currentOffset: { ...state.currentOffset },
        mask: state.mask ? new Uint8Array(state.mask) : undefined,
        indexedPaste: state.indexedPaste ? cloneIndexedPaste(state.indexedPaste) : undefined,
      };
    case 'transforming':
      return {
        ...state,
        imageData: cloneImageData(state.imageData),
        originalBounds: { ...state.originalBounds },
        currentBounds: { ...state.currentBounds },
        currentOffset: { ...state.currentOffset },
        scale: { ...state.scale },
        previewData: state.previewData ? cloneImageData(state.previewData) : null,
        mask: state.mask ? new Uint8Array(state.mask) : undefined,
      };
  }
}

// fallow-ignore-next-line complexity -- Existing restoration handles each public selection variant.
export function restoreSelectionState(
  context: Pick<ProjectContext, 'selection'>,
  state: SelectionState,
): void {
  switch (state.type) {
    case 'none':
      context.selection.clearAfterTransform();
      return;
    case 'selected':
      context.selection.setSelected(
        { ...state.bounds },
        state.shape,
        state.shape === 'freeform' ? new Uint8Array(state.mask) : undefined,
      );
      return;
    case 'floating':
      context.selection.setFloating(
        cloneImageData(state.imageData),
        { ...state.originalBounds },
        state.shape,
        state.mask ? new Uint8Array(state.mask) : undefined,
        state.indexedPaste ? cloneIndexedPaste(state.indexedPaste) : undefined,
        state.targetLayerId && state.targetFrameId
          ? {
              layerId: state.targetLayerId,
              frameId: state.targetFrameId,
              ...(state.targetCelId ? { celId: state.targetCelId } : {}),
            }
          : undefined,
      );
      context.selection.moveFloat(state.currentOffset.x, state.currentOffset.y);
      return;
    case 'transforming':
      context.selection.startTransform(
        cloneImageData(state.imageData),
        { ...state.originalBounds },
        state.shape,
        state.mask ? new Uint8Array(state.mask) : undefined,
        state.targetLayerId,
        state.targetFrameId,
      );
      context.selection.moveTransform(state.currentOffset.x, state.currentOffset.y);
      if (state.scale.x !== 1 || state.scale.y !== 1) {
        context.selection.updateScale(state.scale.x, state.scale.y);
      }
      if (state.rotation !== 0) {
        context.selection.updateRotation(state.rotation);
      }
      return;
  }
}

export class TransformSelectionCommand implements Command {
  readonly id = crypto.randomUUID();
  readonly name = 'Transform Selection';
  // The history store reads this flag through the Command contract to keep the
  // one atomic apply transition from advancing the revision twice.
  // fallow-ignore-next-line unused-class-member -- Read by HistoryStore through Command.
  readonly managesProjectRevision = true;
  readonly memorySize: number;

  private readonly context: ProjectContext;
  private readonly layerId: string;
  private readonly frameId: string;
  private readonly celId: string;
  private readonly canvas: HTMLCanvasElement;
  private readonly beforePixels: ImageData;
  private readonly initialPixels: ImageData;
  private readonly afterPixels: ImageData;
  private readonly beforeIndices: readonly SelectionTransformIndexEntry[];
  private readonly afterIndices: Uint8Array;
  private readonly beforeSelection: SelectionState;
  private applied = false;
  private hasExecuted = false;
  private afterIndexBuffer: Uint8Array | null = null;
  private _lastEvent: ProjectChangeEvent | null = null;

  constructor(prepared: PreparedSelectionTransform) {
    this.context = prepared.context;
    this.layerId = prepared.layerId;
    this.frameId = prepared.frameId;
    this.celId = prepared.celId;
    this.canvas = prepared.canvas;
    this.beforePixels = cloneImageData(prepared.beforePixels);
    this.initialPixels = cloneImageData(prepared.initialPixels);
    this.afterPixels = cloneImageData(prepared.afterPixels);
    this.beforeIndices = prepared.beforeIndices.map((entry) => ({
      key: entry.key,
      buffer: entry.buffer,
      bytes: entry.bytes ? new Uint8Array(entry.bytes) : undefined,
    }));
    this.afterIndices = new Uint8Array(prepared.afterIndices);
    this.beforeSelection = cloneSelectionState(prepared.beforeSelection);
    this.memorySize = this.beforePixels.data.byteLength + this.afterPixels.data.byteLength +
      this.afterIndices.byteLength + 256;
  }

  get lastEvent() {
    return this._lastEvent;
  }

  execute(): void {
    if (this.applied) throw transformError('invalid_state', false, { reason: 'already_applied' });
    this.assertTarget();
    this.assertCel();
    this.assertPixels(this.hasExecuted ? this.beforePixels : this.initialPixels);
    this.assertIndices(this.beforeIndices);

    const currentPixels = this.readPixels();
    const currentSelection = cloneSelectionState(this.context.selection.state.value);
    const currentIndices = captureSelectionTransformIndexEntries(this.context, this.canvas);
    try {
      this.applyPixels(this.afterPixels);
      this.applyIndices(this.afterIndices);
      this.context.selection.clearAfterTransform();
      this._lastEvent = this.context.project.commitChange(this.id, ['raster-content']);
      this.context.dirtyRect?.requestFullRedraw();
      this.hasExecuted = true;
      this.applied = true;
    } catch (error) {
      this.restorePixels(currentPixels);
      restoreIndexEntries(this.context, currentIndices);
      restoreSelectionState(this.context, currentSelection);
      throw error;
    }
  }

  undo(): void {
    if (!this.applied) throw transformError('invalid_state', false, { reason: 'not_applied' });
    this.assertTarget();
    this.assertCel();
    this.assertPixels(this.afterPixels);
    this.assertIndicesForBuffer(this.afterIndices);

    const currentPixels = this.readPixels();
    const currentSelection = cloneSelectionState(this.context.selection.state.value);
    const currentIndices = captureSelectionTransformIndexEntries(this.context, this.canvas);
    try {
      this.applyPixels(this.beforePixels);
      restoreIndexEntries(this.context, this.beforeIndices);
      restoreSelectionState(this.context, this.beforeSelection);
      this._lastEvent = this.context.project.commitChange(this.id, ['raster-content']);
      this.context.dirtyRect?.requestFullRedraw();
      this.applied = false;
    } catch (error) {
      this.restorePixels(currentPixels);
      restoreIndexEntries(this.context, currentIndices);
      restoreSelectionState(this.context, currentSelection);
      throw error;
    }
  }

  private assertTarget(): void {
    if (this.context.isDisposed || this.context.project.id.value.length === 0) {
      throw transformError('target_not_found', true);
    }
  }

  private assertCel(): void {
    const editableCanvas = this.context.animation.getEditableCelCanvas(this.layerId, this.frameId);
    const key = this.context.animation.getCelKey(this.layerId, this.frameId);
    const cel = this.context.animation.cels.value.get(key);
    if (!editableCanvas || !cel || cel.id !== this.celId || cel.canvas !== this.canvas || editableCanvas !== this.canvas) {
      throw transformError('revision_conflict', true, { reason: 'cel_changed' });
    }
  }

  private assertPixels(expected: ImageData): void {
    if (!arraysEqual(this.readPixels().data, expected.data)) {
      throw transformError('revision_conflict', true, { reason: 'pixels_changed' });
    }
  }

  private assertIndices(expected: readonly SelectionTransformIndexEntry[]): void {
    const current = captureSelectionTransformIndexEntries(this.context, this.canvas);
    if (current.length !== expected.length) {
      throw transformError('revision_conflict', true, { reason: 'index_buffer_changed' });
    }
    for (const entry of expected) {
      const actual = current.find((candidate) => candidate.key === entry.key);
      if (!actual || !arraysEqual(actual.bytes ?? new Uint8Array(), entry.bytes ?? new Uint8Array())) {
        throw transformError('revision_conflict', true, { reason: 'index_buffer_changed' });
      }
    }
  }

  private assertIndicesForBuffer(expected: Uint8Array): void {
    const key = this.context.animation.getCelKey(this.layerId, this.frameId);
    const buffer = this.context.animation.cels.value.get(key)?.indexBuffer;
    if (!buffer || !arraysEqual(buffer, expected)) {
      throw transformError('revision_conflict', true, { reason: 'index_buffer_changed' });
    }
  }

  private readPixels(): ImageData {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw transformError('invalid_state', true, { reason: 'canvas_context' });
    return ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  private applyPixels(imageData: ImageData): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw transformError('invalid_state', true, { reason: 'canvas_context' });
    ctx.putImageData(imageData, 0, 0);
  }

  private restorePixels(imageData: ImageData): void {
    try {
      this.applyPixels(imageData);
    } catch {
      // Preserve the original bounded failure.
    }
  }

  private applyIndices(indices: Uint8Array): void {
    const current = new Map(this.context.animation.cels.value);
    const affected = this.beforeIndices.map((entry) => entry.key);
    const key = this.context.animation.getCelKey(this.layerId, this.frameId);
    if (!affected.includes(key)) affected.push(key);

    if (!this.afterIndexBuffer) {
      const reusable = this.beforeIndices.find((entry) => entry.buffer)?.buffer;
      this.afterIndexBuffer = reusable ?? new Uint8Array(indices);
    }
    this.afterIndexBuffer.set(indices);

    for (const celKey of affected) {
      const cel = current.get(celKey);
      if (cel) current.set(celKey, { ...cel, indexBuffer: this.afterIndexBuffer });
    }
    this.context.animation.cels.value = current;
  }
}

function arraysEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

export function captureSelectionTransformIndexEntries(
  context: ProjectContext,
  canvas: HTMLCanvasElement,
): SelectionTransformIndexEntry[] {
  const entries: SelectionTransformIndexEntry[] = [];
  for (const [key, cel] of context.animation.cels.value) {
    if (cel.canvas !== canvas) continue;
    entries.push({
      key,
      buffer: cel.indexBuffer,
      bytes: cel.indexBuffer ? new Uint8Array(cel.indexBuffer) : undefined,
    });
  }
  return entries;
}

function restoreIndexEntries(
  context: ProjectContext,
  entries: readonly SelectionTransformIndexEntry[],
): void {
  const cels = new Map(context.animation.cels.value);
  for (const entry of entries) {
    const cel = cels.get(entry.key);
    if (!cel) continue;
    if (entry.buffer) {
      entry.buffer.set(entry.bytes ?? []);
      cels.set(entry.key, { ...cel, indexBuffer: entry.buffer });
    } else {
      const { indexBuffer: _indexBuffer, ...withoutIndexBuffer } = cel;
      cels.set(entry.key, withoutIndexBuffer);
    }
  }
  context.animation.cels.value = cels;
}

function transformError(
  code: 'invalid_request' | 'target_not_found' | 'revision_conflict' | 'invalid_state' | 'limit_exceeded' | 'unsupported' | 'internal',
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
) {
  const error = new Error(code) as Error & {
    editorError: { code: typeof code; retryable: boolean; details?: Readonly<Record<string, string | number>> };
  };
  error.editorError = { code, retryable, ...(details ? { details } : {}) };
  return error;
}

/**
 * Command for flipping selected pixels horizontally or vertically.
 * Works on "selected" state only - flips pixels in-place on the canvas.
 */
export class FlipSelectionCommand extends EditableCelCommand implements Command {
  name: string;
  private bounds: Rect;
  private shape: SelectionShape;
  private mask?: Uint8Array;
  private direction: 'horizontal' | 'vertical';

  // Store original pixels for undo
  private originalImageData: ImageData;

  constructor(
    layerId: string,
    frameId: string,
    bounds: Rect,
    shape: SelectionShape,
    direction: 'horizontal' | 'vertical',
    mask?: Uint8Array,
    context: EditableCelCommandContext = getActiveProjectContext()
  ) {
    super(layerId, frameId, context);
    this.name = `Flip Selection ${direction === 'horizontal' ? 'Horizontal' : 'Vertical'}`;
    this.bounds = { ...bounds };
    this.shape = shape;
    this.direction = direction;
    this.mask = mask;

    // Capture original pixels
    const ctx = this.canvas.getContext('2d')!;
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
