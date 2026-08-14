import { CutToFloatCommand } from '../commands/selection-commands';
import {
  cloneImageData,
  cloneSelectionState,
  restoreSelectionState,
  TransformSelectionCommand,
  type PreparedSelectionTransform,
  type SelectionTransformIndexEntry,
} from '../commands/selection/transform-commands';
import { type ProjectContext } from '../stores/project-context';
import { findClosestColorIndex } from '../stores/palette/indexed-color';
import { hexToRgb, rgbToHex } from '../stores/palette/color-utils';
import type { Rect } from '../types/geometry';
import type { SelectionShape, SelectionState } from '../types/selection';

export type SelectionTransformErrorCode =
  | 'invalid_request'
  | 'target_not_found'
  | 'revision_conflict'
  | 'invalid_state'
  | 'limit_exceeded'
  | 'unsupported'
  | 'internal';

export interface SelectionTransformError {
  readonly code: SelectionTransformErrorCode;
  readonly retryable: boolean;
  readonly message: string;
}

export type SelectionTransformResult<T extends object = Record<never, never>> =
  | ({ ok: true; changed: boolean; revision: number } & T)
  | { ok: false; error: SelectionTransformError };

interface TransformSession {
  readonly projectId: string;
  readonly observedRevision: number;
  readonly layerId: string;
  readonly frameId: string;
  readonly celId: string;
  readonly canvas: HTMLCanvasElement;
  readonly beforePixels: ImageData;
  readonly initialPixels: ImageData;
  readonly beforeIndices: readonly SelectionTransformIndexEntry[];
  readonly beforeSelection: SelectionState;
  readonly cutCommand?: CutToFloatCommand;
}

const sessions = new WeakMap<ProjectContext, TransformSession>();

const ERROR_MESSAGES: Record<SelectionTransformErrorCode, string> = {
  invalid_request: 'Transform request is not valid.',
  target_not_found: 'The transform target is no longer available.',
  revision_conflict: 'Transform is no longer current. No changes were applied.',
  invalid_state: 'Transform could not be prepared.',
  limit_exceeded: 'The transformed selection does not fit in the canvas.',
  unsupported: 'This transform is not available for the current content.',
  internal: 'Transform failed. Your original pixels were restored.',
};

function failure(
  code: SelectionTransformErrorCode,
  retryable = false,
): { ok: false; error: SelectionTransformError } {
  return {
    ok: false,
    error: { code, retryable, message: ERROR_MESSAGES[code] },
  };
}

function isDisposed(context: ProjectContext): boolean {
  return context.isDisposed === true;
}

function readPixels(canvas: HTMLCanvasElement): ImageData | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
}

function captureIndexEntries(
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

function activeTarget(context: ProjectContext): {
  layerId: string;
  frameId: string;
  celId: string;
  canvas: HTMLCanvasElement;
} | null {
  const layerId = context.layers.activeLayerId.value;
  const frameId = context.animation.currentFrameId.value;
  if (!layerId || !frameId) return null;

  const cel = context.animation.cels.value.get(
    context.animation.getCelKey(layerId, frameId),
  );
  if (!cel) return null;
  return { layerId, frameId, celId: cel.id, canvas: cel.canvas };
}

function targetFor(
  context: ProjectContext,
  layerId: string,
  frameId: string,
): { celId: string; canvas: HTMLCanvasElement } | null {
  const cel = context.animation.cels.value.get(
    context.animation.getCelKey(layerId, frameId),
  );
  if (!cel) return null;
  return { celId: cel.id, canvas: cel.canvas };
}

function ensureTargetIndexBuffer(context: ProjectContext, layerId: string, frameId: string): void {
  const cel = context.animation.cels.value.get(
    context.animation.getCelKey(layerId, frameId),
  );
  if (cel?.indexBuffer) return;

  const ensure = context.animation.ensureCelIndexBuffer;
  if (typeof ensure === 'function') ensure.call(context.animation, layerId, frameId);
}

function transformStateHasChanges(
  state: ReturnType<ProjectContext['selection']['getTransformState']>,
): boolean {
  if (!state) return false;
  return (
    state.currentOffset.x !== 0
    || state.currentOffset.y !== 0
    || state.rotation !== 0
    || state.scale.x !== 1
    || state.scale.y !== 1
  );
}

function selectionFromFloating(
  context: ProjectContext,
  floating: Extract<SelectionState, { type: 'floating' }>,
  layerId: string,
  frameId: string,
): void {
  context.selection.startTransform(
    floating.imageData,
    floating.originalBounds,
    floating.shape,
    floating.mask,
    layerId,
    frameId,
  );
  if (floating.currentOffset.x !== 0 || floating.currentOffset.y !== 0) {
    context.selection.moveTransform(floating.currentOffset.x, floating.currentOffset.y);
  }
}

function createSession(
  context: ProjectContext,
  target: { layerId: string; frameId: string; celId: string; canvas: HTMLCanvasElement },
  beforePixels: ImageData,
  initialPixels: ImageData,
  beforeSelection: SelectionState,
  cutCommand?: CutToFloatCommand,
): TransformSession {
  return {
    projectId: context.project.id.value,
    observedRevision: context.project.revision.value,
    layerId: target.layerId,
    frameId: target.frameId,
    celId: target.celId,
    canvas: target.canvas,
    beforePixels: cloneImageData(beforePixels),
    initialPixels: cloneImageData(initialPixels),
    beforeIndices: captureIndexEntries(context, target.canvas),
    beforeSelection: cloneSelectionState(beforeSelection),
    cutCommand,
  };
}

function restoreSession(context: ProjectContext, session: TransformSession): void {
  if (session.cutCommand) {
    try {
      session.cutCommand.undo();
    } catch {
      // The full snapshot below is the final recovery path.
    }
  }

  const ctx = session.canvas.getContext('2d');
  if (ctx) ctx.putImageData(session.beforePixels, 0, 0);

  const cels = new Map(context.animation.cels.value);
  for (const entry of session.beforeIndices) {
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
  restoreSelectionState(context, session.beforeSelection);
}

function isSelectedPixel(
  x: number,
  y: number,
  width: number,
  height: number,
  shape: SelectionShape,
  mask?: Uint8Array,
): boolean {
  if (shape === 'rectangle') return true;
  if (shape === 'freeform') return mask?.[y * width + x] === 255;
  const radiusX = width / 2;
  const radiusY = height / 2;
  if (radiusX === 0 || radiusY === 0) return false;
  const dx = (x + 0.5 - radiusX) / radiusX;
  const dy = (y + 0.5 - radiusY) / radiusY;
  return dx * dx + dy * dy <= 1;
}

function clearRegion(
  image: ImageData,
  touched: Uint8Array,
  bounds: Rect,
  shape: SelectionShape,
  mask?: Uint8Array,
): void {
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      if (!isSelectedPixel(x, y, bounds.width, bounds.height, shape, mask)) continue;
      const targetX = bounds.x + x;
      const targetY = bounds.y + y;
      if (targetX < 0 || targetY < 0 || targetX >= image.width || targetY >= image.height) continue;
      const pixel = targetY * image.width + targetX;
      const offset = pixel * 4;
      image.data[offset] = 0;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
      image.data[offset + 3] = 0;
      touched[pixel] = 1;
    }
  }
}

function palettePixel(
  context: ProjectContext,
  data: Uint8ClampedArray,
  offset: number,
): number {
  if (data[offset + 3] < 128) return 0;
  const colors = context.palette.mainColors.value;
  if (colors.length === 0) return 0;
  const hex = rgbToHex(data[offset], data[offset + 1], data[offset + 2]);
  let index = context.palette.getColorIndex(hex);
  if (index === 0) index = context.palette.findClosestColorIndex(hex);
  if (index === 0) index = findClosestColorIndex(hex, colors);
  const getColorByIndex = context.palette.getColorByIndex as
    | ((paletteIndex: number) => string | null)
    | undefined;
  const chosen = getColorByIndex?.call(context.palette, index) ?? colors[index - 1];
  const rgb = chosen ? hexToRgb(chosen) : null;
  if (rgb) {
    data[offset] = rgb.r;
    data[offset + 1] = rgb.g;
    data[offset + 2] = rgb.b;
    data[offset + 3] = 255;
  }
  return index;
}

// fallow-ignore-next-line complexity -- The atomic preview composes RGBA and indexed pixels while preserving the existing palette policy.
function composeTransform(
  context: ProjectContext,
  session: TransformSession,
  state: NonNullable<ReturnType<ProjectContext['selection']['getTransformState']>>,
): { afterPixels: ImageData; afterIndices: Uint8Array } | { error: SelectionTransformErrorCode } {
  const preview = context.selection.getTransformPreview() ?? state.imageData;
  const afterPixels = cloneImageData(session.initialPixels);
  const touched = new Uint8Array(afterPixels.width * afterPixels.height);
  clearRegion(afterPixels, touched, state.originalBounds, state.shape, state.mask);

  const destinationX = Math.round(
    state.originalBounds.x
      + state.currentOffset.x
      + state.originalBounds.width / 2
      - preview.width / 2,
  );
  const destinationY = Math.round(
    state.originalBounds.y
      + state.currentOffset.y
      + state.originalBounds.height / 2
      - preview.height / 2,
  );

  const previewShape = state.shape === 'freeform' ? 'rectangle' : state.shape;
  for (let y = 0; y < preview.height; y += 1) {
    for (let x = 0; x < preview.width; x += 1) {
      if (!isSelectedPixel(x, y, preview.width, preview.height, previewShape)) continue;
      const sourceOffset = (y * preview.width + x) * 4;
      if (preview.data[sourceOffset + 3] === 0) continue;
      const targetX = destinationX + x;
      const targetY = destinationY + y;
      if (targetX < 0 || targetY < 0 || targetX >= afterPixels.width || targetY >= afterPixels.height) {
        continue;
      }
      const targetPixel = targetY * afterPixels.width + targetX;
      const targetOffset = targetPixel * 4;
      afterPixels.data.set(preview.data.slice(sourceOffset, sourceOffset + 4), targetOffset);
      touched[targetPixel] = 1;
    }
  }

  const targetKey = context.animation.getCelKey(session.layerId, session.frameId);
  const targetCel = context.animation.cels.value.get(targetKey);
  const currentIndices = targetCel?.indexBuffer;
  const afterIndices = currentIndices
    ? new Uint8Array(currentIndices)
    : new Uint8Array(afterPixels.width * afterPixels.height);
  if (afterIndices.length < afterPixels.width * afterPixels.height) {
    return { error: 'invalid_state' };
  }

  for (let pixel = 0; pixel < touched.length; pixel += 1) {
    if (!touched[pixel]) continue;
    const offset = pixel * 4;
    afterIndices[pixel] = palettePixel(context, afterPixels.data, offset);
  }

  return { afterPixels, afterIndices };
}

function makeSessionForExistingTransform(context: ProjectContext):
  | { session: TransformSession; state: NonNullable<ReturnType<ProjectContext['selection']['getTransformState']>> }
  | { error: SelectionTransformErrorCode } {
  const state = context.selection.getTransformState();
  if (!state) return { error: 'invalid_request' };
  const layerId = state.targetLayerId ?? context.layers.activeLayerId.value;
  const frameId = state.targetFrameId ?? context.animation.currentFrameId.value;
  if (!layerId || !frameId) return { error: 'target_not_found' };
  const editableCanvas = context.animation.getEditableCelCanvas(layerId, frameId);
  const target = targetFor(context, layerId, frameId);
  if (!target || !editableCanvas) return { error: 'target_not_found' };
  const pixels = readPixels(target.canvas);
  if (!pixels) return { error: 'invalid_state' };
  const beforeSelection = cloneSelectionState(context.selection.state.value);
  const session = createSession(
    context,
    { layerId, frameId, celId: target.celId, canvas: target.canvas },
    pixels,
    pixels,
    beforeSelection,
  );
  return { session, state };
}

/** Begin a session-only transform. No history or project revision is touched. */
// fallow-ignore-next-line complexity -- Capture and prepare validates the active target before opening the session-only transform.
export function beginSelectionTransform(context: ProjectContext):
  | { ok: true; changed: false; revision: number }
  | { ok: false; error: SelectionTransformError } {
  if (isDisposed(context) || !context.project.id.value) return failure('target_not_found', true);
  if (sessions.has(context)) return { ok: true, changed: false, revision: context.project.revision.value };

  const current = context.selection.state.value;
  if (current.type === 'selected') {
    const target = activeTarget(context);
    if (!target) return failure('target_not_found', true);
    ensureTargetIndexBuffer(context, target.layerId, target.frameId);

    const cut = new CutToFloatCommand(
      target.layerId,
      target.frameId,
      current.bounds,
      current.shape,
      current.shape === 'freeform' ? current.mask : undefined,
      context,
    );
    const refreshed = targetFor(context, target.layerId, target.frameId);
    if (!refreshed) return failure('target_not_found', true);
    const beforePixels = readPixels(refreshed.canvas);
    if (!beforePixels) return failure('invalid_state');
    try {
      cut.execute();
      const floating = context.selection.state.value;
      if (floating.type !== 'floating') {
        cut.undo();
        return failure('invalid_state');
      }
      selectionFromFloating(context, floating, target.layerId, target.frameId);
      const initialPixels = readPixels(refreshed.canvas);
      if (!initialPixels) {
        cut.undo();
        return failure('invalid_state');
      }
      sessions.set(
        context,
        createSession(
          context,
          { ...target, canvas: refreshed.canvas, celId: refreshed.celId },
          beforePixels,
          initialPixels,
          current,
          cut,
        ),
      );
      return { ok: true, changed: false, revision: context.project.revision.value };
    } catch {
      try {
        cut.undo();
      } catch {
        // No durable transition has occurred; return the bounded failure.
      }
      return failure('internal');
    }
  }

  if (current.type === 'floating') {
    const target = activeTarget(context);
    if (!target) return failure('target_not_found', true);
    const pixels = readPixels(target.canvas);
    if (!pixels) return failure('invalid_state');
    selectionFromFloating(context, current, target.layerId, target.frameId);
    const session = createSession(context, target, pixels, pixels, current);
    sessions.set(context, session);
    return { ok: true, changed: false, revision: context.project.revision.value };
  }

  if (current.type === 'transforming') {
    const layerId = current.targetLayerId ?? context.layers.activeLayerId.value;
    const frameId = current.targetFrameId ?? context.animation.currentFrameId.value;
    if (!layerId || !frameId) return failure('target_not_found', true);
    const target = targetFor(context, layerId, frameId);
    if (!target) return failure('target_not_found', true);
    const pixels = readPixels(target.canvas);
    if (!pixels) return failure('invalid_state');
    sessions.set(
      context,
      createSession(context, { layerId, frameId, ...target }, pixels, pixels, current),
    );
    return { ok: true, changed: false, revision: context.project.revision.value };
  }

  return failure('invalid_request');
}

/** Cancel a session-only transform and restore the exact captured state. */
export function cancelSelectionTransform(context: ProjectContext):
  | { ok: true; changed: false; revision: number }
  | { ok: false; error: SelectionTransformError } {
  const session = sessions.get(context);
  if (!session) {
    if (context.selection.state.value.type === 'transforming') context.selection.cancelTransform();
    return { ok: true, changed: false, revision: context.project.revision.value };
  }
  try {
    restoreSession(context, session);
    sessions.delete(context);
    return { ok: true, changed: false, revision: context.project.revision.value };
  } catch {
    return failure('internal');
  }
}

/** Commit one transform session as one atomic History/Revision transition. */
// fallow-ignore-next-line complexity -- Commit keeps target, revision, palette, and history checks in one atomic boundary.
export async function commitSelectionTransform(
  context: ProjectContext,
): Promise<SelectionTransformResult<{ event?: ReturnType<ProjectContext['project']['commitChange']> }>> {
  let session = sessions.get(context);
  if (!session || !context.selection.getTransformState()) {
    const fallback = makeSessionForExistingTransform(context);
    if ('error' in fallback) return failure(fallback.error);
    session = fallback.session;
    sessions.set(context, session);
  }

  if (isDisposed(context) || context.project.id.value !== session.projectId) {
    restoreSession(context, session);
    sessions.delete(context);
    return failure('target_not_found', true);
  }
  if (context.project.revision.value !== session.observedRevision) {
    restoreSession(context, session);
    sessions.delete(context);
    return failure('revision_conflict', true);
  }

  const target = targetFor(context, session.layerId, session.frameId);
  if (!target || target.celId !== session.celId || target.canvas !== session.canvas) {
    restoreSession(context, session);
    sessions.delete(context);
    return failure('target_not_found', true);
  }
  const currentState = context.selection.getTransformState();
  if (
    !currentState
    || currentState.targetLayerId !== session.layerId
    || currentState.targetFrameId !== session.frameId
  ) {
    restoreSession(context, session);
    sessions.delete(context);
    return failure('invalid_state');
  }

  if (!transformStateHasChanges(currentState)) {
    restoreSession(context, session);
    sessions.delete(context);
    return { ok: true, changed: false, revision: context.project.revision.value };
  }

  const composed = composeTransform(context, session, currentState);
  if ('error' in composed) {
    restoreSession(context, session);
    sessions.delete(context);
    return failure(composed.error);
  }

  const prepared: PreparedSelectionTransform = {
    context,
    layerId: session.layerId,
    frameId: session.frameId,
    celId: session.celId,
    canvas: session.canvas,
    beforePixels: session.beforePixels,
    initialPixels: session.initialPixels,
    afterPixels: composed.afterPixels,
    beforeIndices: session.beforeIndices,
    afterIndices: composed.afterIndices,
    beforeSelection: session.beforeSelection,
  };

  try {
    const command = new TransformSelectionCommand(prepared);
    await context.history.execute(command);
    sessions.delete(context);
    return {
      ok: true,
      changed: true,
      revision: command.lastEvent?.toRevision ?? context.project.revision.value,
      ...(command.lastEvent ? { event: command.lastEvent } : {}),
    };
  } catch {
    restoreSession(context, session);
    sessions.delete(context);
    return failure('internal');
  }
}
