import { animationStore } from '../stores/animation';
import { layerStore } from '../stores/layers';
import type { ProjectContext } from '../stores/project-context';

type CompositeFrameContext = Pick<ProjectContext, 'animation' | 'layers'>;

interface CompositeFrameOptions {
  clearFirst?: boolean;
  context?: CompositeFrameContext;
}

/**
 * Composite all visible layers for a specific frame onto a target canvas.
 */
export function compositeFrame(
  frameId: string,
  targetCtx: CanvasRenderingContext2D,
  options: CompositeFrameOptions = {}
): void {
  const { clearFirst = true, context } = options;
  const animation = context?.animation ?? animationStore;
  const layers = context?.layers.layers.value ?? layerStore.layers.value;
  const cels = animation.cels.value;

  if (clearFirst) {
    targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
  }

  // Render layers in order (bottom to top)
  for (const layer of layers) {
    if (!layer.visible) continue;

    const key = animation.getCelKey(layer.id, frameId);
    const cel = cels.get(key);

    // Fall back to layer.canvas if cel doesn't exist yet (new layers)
    const canvasToUse = cel?.canvas ?? layer.canvas;

    if (canvasToUse) {
      // Combine layer opacity (0-255) and cel opacity (0-100)
      const layerOpacity = layer.opacity / 255;
      const celOpacity = (cel?.opacity ?? 100) / 100;
      targetCtx.globalAlpha = layerOpacity * celOpacity;
      targetCtx.globalCompositeOperation =
        layer.blendMode === 'normal'
          ? 'source-over'
          : (layer.blendMode as GlobalCompositeOperation);
      targetCtx.drawImage(canvasToUse, 0, 0);
    }
  }

  // Reset composite state
  targetCtx.globalAlpha = 1;
  targetCtx.globalCompositeOperation = 'source-over';
}

/**
 * Reset the transform, clear the whole canvas, and re-apply the
 * device-pixel-ratio scale so subsequent drawing uses CSS pixels.
 */
export function clearCanvasForDpr(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);
}
