import { TransformSelectionCommand } from '../commands/selection-commands';
import type { ProjectContext } from '../stores/project-context';
import { log } from '../utils/log';

type SelectionTransformContext = Pick<
  ProjectContext,
  'animation' | 'history' | 'layers' | 'selection'
>;

export function commitSelectionTransform(context: SelectionTransformContext): void {
  const { history, layers, selection } = context;
  const transformState = selection.getTransformState();
  if (!transformState) return;

  const { imageData, originalBounds, currentBounds, currentOffset, rotation, scale, shape, mask } =
    transformState;
  const hasRotation = rotation !== 0;
  const hasScale = scale.x !== 1 || scale.y !== 1;
  const hasMovement = currentOffset.x !== 0 || currentOffset.y !== 0;

  if (!hasRotation && !hasScale && !hasMovement) {
    selection.cancelTransform();
    return;
  }

  const activeLayerId = layers.activeLayerId.value;
  const activeLayer = layers.layers.value.find((layer) => layer.id === activeLayerId);
  if (!activeLayer?.canvas) {
    log.error('Active layer canvas not found');
    selection.cancelTransform();
    return;
  }

  const transformedImageData = selection.getTransformPreview();
  if (!transformedImageData) {
    selection.cancelTransform();
    return;
  }

  const frameId = context.animation.currentFrameId.value;
  const command = new TransformSelectionCommand(
    activeLayer.id,
    frameId,
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

  void history.execute(command);
}
