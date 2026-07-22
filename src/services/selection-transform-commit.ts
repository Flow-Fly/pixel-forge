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

  const {
    imageData,
    originalBounds,
    currentBounds,
    currentOffset,
    rotation,
    scale,
    shape,
    mask,
    targetLayerId,
    targetFrameId,
  } = transformState;
  const hasRotation = rotation !== 0;
  const hasScale = scale.x !== 1 || scale.y !== 1;
  const hasMovement = currentOffset.x !== 0 || currentOffset.y !== 0;

  if (!hasRotation && !hasScale && !hasMovement) {
    selection.cancelTransform();
    return;
  }

  const layerId = targetLayerId ?? layers.activeLayerId.value;
  const frameId = targetFrameId ?? context.animation.currentFrameId.value;
  const targetLayer = layers.layers.value.find((layer) => layer.id === layerId);
  if (!targetLayer?.canvas || !frameId) {
    log.error('Selection transform target not found');
    selection.cancelTransform();
    return;
  }

  const transformedImageData = selection.getTransformPreview();
  if (!transformedImageData) {
    selection.cancelTransform();
    return;
  }

  const command = new TransformSelectionCommand(
    targetLayer.id,
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
