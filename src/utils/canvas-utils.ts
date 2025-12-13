import { animationStore } from '../stores/animation';
import { layerStore } from '../stores/layers';
import { projectStore } from '../stores/project';

/**
 * Composite all visible layers for a specific frame onto a target canvas.
 */
export function compositeFrame(
  frameId: string,
  targetCtx: CanvasRenderingContext2D,
  options: { clearFirst?: boolean } = {}
): void {
  const { clearFirst = true } = options;
  const layers = layerStore.layers.value;
  const cels = animationStore.cels.value;

  if (clearFirst) {
    targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
  }

  // Render layers in order (bottom to top)
  for (const layer of layers) {
    if (!layer.visible) continue;

    const key = animationStore.getCelKey(layer.id, frameId);
    const cel = cels.get(key);

    // Fall back to layer.canvas if cel doesn't exist yet (new layers)
    const canvasToUse = cel?.canvas ?? layer.canvas;

    if (canvasToUse) {
      // Combine layer opacity (0-255) and cel opacity (0-100)
      const layerOpacity = layer.opacity / 255;
      const celOpacity = (cel?.opacity ?? 100) / 100;
      targetCtx.globalAlpha = layerOpacity * celOpacity;
      targetCtx.globalCompositeOperation =
        layer.blendMode === 'normal' ? 'source-over' : (layer.blendMode as GlobalCompositeOperation);
      targetCtx.drawImage(canvasToUse, 0, 0);
    }
  }

  // Reset composite state
  targetCtx.globalAlpha = 1;
  targetCtx.globalCompositeOperation = 'source-over';
}

/**
 * Render a single layer's cel for a specific frame onto a target canvas.
 */
export function compositeLayer(
  layerId: string,
  frameId: string,
  targetCtx: CanvasRenderingContext2D,
  options: { clearFirst?: boolean; applyOpacity?: boolean } = {}
): void {
  const { clearFirst = true, applyOpacity = false } = options;
  const cels = animationStore.cels.value;
  const layer = layerStore.layers.value.find(l => l.id === layerId);

  if (clearFirst) {
    targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
  }

  const key = animationStore.getCelKey(layerId, frameId);
  const cel = cels.get(key);

  // Fall back to layer.canvas if cel doesn't exist yet (new layers)
  const canvasToUse = cel?.canvas ?? layer?.canvas;

  if (canvasToUse) {
    if (applyOpacity && layer) {
      targetCtx.globalAlpha = layer.opacity / 255;
    }
    targetCtx.drawImage(canvasToUse, 0, 0);
    targetCtx.globalAlpha = 1;
  }
}

/**
 * Create a temporary canvas for rendering operations.
 */
export function createTempCanvas(
  width?: number,
  height?: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const w = width ?? projectStore.width.value;
  const h = height ?? projectStore.height.value;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d', { alpha: true })!;
  ctx.imageSmoothingEnabled = false;

  return { canvas, ctx };
}

/**
 * Check if a canvas has any non-transparent pixels.
 */
export function hasContent(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Check every 4th byte (alpha channel)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) return true;
  }

  return false;
}
