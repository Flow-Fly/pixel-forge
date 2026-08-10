import { animationStore } from '../stores/animation';
import { layerStore } from '../stores/layers';
import type { ProjectContext } from '../stores/project-context';
import {
  createArtworkCompositionPlan,
  drawArtworkComposition,
} from '../services/export-composition';

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

  const plan = createArtworkCompositionPlan({
    frameId,
    layers,
    cels,
    getCelKey: animation.getCelKey,
  });
  drawArtworkComposition(targetCtx, plan);
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
