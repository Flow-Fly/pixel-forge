/**
 * Transform handlers for the canvas viewport.
 *
 * Handles rotation start/end and transform commit operations.
 */

import { selectionStore } from '../../../stores/selection';
import { historyStore } from '../../../stores/history';
import { layerStore } from '../../../stores/layers';
import { CutToFloatCommand, TransformSelectionCommand } from '../../../commands/selection-commands';

/**
 * Handle rotation start event from transform handles.
 */
export function handleRotationStart(): void {
  const state = selectionStore.state.value;

  // If we're in floating state, we need to transition to transforming
  if (state.type === 'floating') {
    selectionStore.startTransform(
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
    // Use the active layer's canvas, not the composited drawing canvas
    const activeLayerId = layerStore.activeLayerId.value;
    const activeLayer = layerStore.layers.value.find(l => l.id === activeLayerId);
    if (!activeLayer?.canvas) return;

    const canvas = activeLayer.canvas;
    const bounds = state.bounds;
    const shape = state.shape;
    const mask = state.shape === 'freeform' ? state.mask : undefined;

    // Cut to float from the active layer
    const cutCommand = new CutToFloatCommand(canvas, activeLayerId || '', bounds, shape, mask);
    historyStore.execute(cutCommand);

    // Now we should be in floating state - start transform
    const floatingState = selectionStore.state.value;
    if (floatingState.type === 'floating') {
      selectionStore.startTransform(
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
 * Handle rotation end event from transform handles.
 */
export function handleRotationEnd(): void {
  // Rotation drag ended - the transform will be committed when user
  // clicks outside or presses Enter
}

/**
 * Commit the current transform (rotation) to the canvas.
 * Called when user presses Enter or clicks Apply.
 */
export function commitTransform(): void {
  const transformState = selectionStore.getTransformState();
  if (!transformState) return;

  const { imageData, originalBounds, currentBounds, currentOffset, rotation, shape, mask } = transformState;

  // If rotation is 0 and no movement, just cancel (no change needed)
  if (rotation === 0 && currentOffset.x === 0 && currentOffset.y === 0) {
    selectionStore.cancelTransform();
    return;
  }

  // Get the active layer's canvas
  const activeLayerId = layerStore.activeLayerId.value;
  const activeLayer = layerStore.layers.value.find(l => l.id === activeLayerId);
  if (!activeLayer?.canvas) {
    console.error('Active layer canvas not found');
    selectionStore.cancelTransform();
    return;
  }

  // Use already-computed preview data (same CleanEdge algorithm)
  const rotatedImageData = selectionStore.getTransformPreview();
  if (!rotatedImageData) {
    selectionStore.cancelTransform();
    return;
  }

  // Create and execute the transform command on the active layer
  const command = new TransformSelectionCommand(
    activeLayer.canvas,
    imageData,
    originalBounds,
    rotatedImageData,
    currentBounds,
    rotation,
    shape,
    mask,
    currentOffset
  );

  historyStore.execute(command);
}
