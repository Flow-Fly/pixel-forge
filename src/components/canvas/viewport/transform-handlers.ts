/**
 * Transform handlers for the canvas viewport.
 *
 * Handles rotation start/end, resize start/end, and transform commit operations.
 */

import { getActiveProjectContext, type ProjectContext } from '../../../stores/project-context';
import { CutToFloatCommand, TransformSelectionCommand } from '../../../commands/selection-commands';
import { log } from '../../../utils/log';

type TransformContext = Pick<ProjectContext, 'history' | 'layers' | 'selection'>;

/**
 * Transition selection to transforming state if needed.
 * Called when starting rotation or resize operations.
 */
function ensureTransformState(context: TransformContext): void {
  const { history, layers, selection } = context;
  const state = selection.state.value;

  // If we're in floating state, we need to transition to transforming
  if (state.type === 'floating') {
    selection.startTransform(
      state.imageData,
      {
        x: state.originalBounds.x + state.currentOffset.x,
        y: state.originalBounds.y + state.currentOffset.y,
        width: state.originalBounds.width,
        height: state.originalBounds.height,
      },
      state.shape,
      state.mask
    );
  } else if (state.type === 'selected') {
    // For selected state, we need to cut to floating first, then transform
    const activeLayerId = layers.activeLayerId.value;
    const activeLayer = layers.layers.value.find((l) => l.id === activeLayerId);
    if (!activeLayer?.canvas) return;

    const canvas = activeLayer.canvas;
    const bounds = state.bounds;
    const shape = state.shape;
    const mask = state.shape === 'freeform' ? state.mask : undefined;

    // Cut to float from the active layer
    const cutCommand = new CutToFloatCommand(
      canvas,
      activeLayerId || '',
      bounds,
      shape,
      mask,
      context
    );
    history.execute(cutCommand);

    // Now we should be in floating state - start transform
    const floatingState = selection.state.value;
    if (floatingState.type === 'floating') {
      selection.startTransform(
        floatingState.imageData,
        floatingState.originalBounds,
        floatingState.shape,
        floatingState.mask
      );
    }
  }
  // If already transforming, do nothing (drag tracking continues in transform-handles)
}

/**
 * Handle rotation start event from transform handles.
 */
export function handleRotationStart(context: TransformContext = getActiveProjectContext()): void {
  ensureTransformState(context);
}

/**
 * Handle resize start event from transform handles.
 */
export function handleResizeStart(context: TransformContext = getActiveProjectContext()): void {
  ensureTransformState(context);
}

/**
 * Handle rotation end event from transform handles.
 */
export function handleRotationEnd(): void {
  // Rotation drag ended - the transform will be committed when user
  // clicks outside or presses Enter
}

/**
 * Commit the current transform (scale and/or rotation) to the canvas.
 * Called when user presses Enter or clicks Apply.
 */
export function commitTransform(context: TransformContext = getActiveProjectContext()): void {
  const { history, layers, selection } = context;
  const transformState = selection.getTransformState();
  if (!transformState) return;

  const { imageData, originalBounds, currentBounds, currentOffset, rotation, scale, shape, mask } =
    transformState;

  // If no transform and no movement, just cancel (no change needed)
  const hasRotation = rotation !== 0;
  const hasScale = scale.x !== 1 || scale.y !== 1;
  const hasMovement = currentOffset.x !== 0 || currentOffset.y !== 0;

  if (!hasRotation && !hasScale && !hasMovement) {
    selection.cancelTransform();
    return;
  }

  // Get the active layer's canvas
  const activeLayerId = layers.activeLayerId.value;
  const activeLayer = layers.layers.value.find((l) => l.id === activeLayerId);
  if (!activeLayer?.canvas) {
    log.error('Active layer canvas not found');
    selection.cancelTransform();
    return;
  }

  // Use already-computed preview data (scaled + rotated)
  const transformedImageData = selection.getTransformPreview();
  if (!transformedImageData) {
    selection.cancelTransform();
    return;
  }

  // Create and execute the transform command on the active layer
  const command = new TransformSelectionCommand(
    activeLayer.canvas,
    imageData,
    originalBounds,
    transformedImageData,
    currentBounds,
    rotation,
    scale,
    shape,
    mask,
    currentOffset,
    context
  );

  history.execute(command);
}
