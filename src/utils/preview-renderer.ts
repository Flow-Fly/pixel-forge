import type { Layer } from '../types/layer';
import type { Cel } from '../types/animation';
import { animationStore } from '../stores/animation';

/**
 * Render a specific frame to a canvas context by compositing all visible layers.
 *
 * @param ctx - The canvas rendering context to draw to
 * @param frameId - The frame ID to render
 * @param layers - Array of layers (in render order)
 * @param cels - Map of cel key to Cel objects
 */
export function renderFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  frameId: string,
  layers: Layer[],
  cels: Map<string, Cel>
): void {
  const canvas = ctx.canvas;

  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Render each visible layer
  for (const layer of layers) {
    if (!layer.visible) continue;

    const key = animationStore.getCelKey(layer.id, frameId);
    const cel = cels.get(key);

    // Fall back to layer.canvas if cel doesn't exist yet (new layers)
    const canvasToUse = cel?.canvas ?? layer.canvas;

    if (canvasToUse) {
      // Calculate effective opacity: layer opacity * cel opacity
      // Layer opacity is 0-255, cel opacity is 0-100
      const layerOpacity = layer.opacity / 255;
      const celOpacity = (cel?.opacity ?? 100) / 100;
      ctx.globalAlpha = layerOpacity * celOpacity;

      ctx.globalCompositeOperation =
        layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
      ctx.drawImage(canvasToUse, 0, 0);
    }
  }

  // Reset composite settings
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Get frame IDs within a tag's range.
 *
 * @param tag - The frame tag
 * @returns Array of frame IDs in the tag's range
 */
export function getFrameIdsForTag(tagId: string): string[] {
  const tag = animationStore.tags.value.find(t => t.id === tagId);
  if (!tag) return [];

  const frames = animationStore.frames.value;
  return frames
    .filter((_, index) => index >= tag.startFrameIndex && index <= tag.endFrameIndex)
    .map(f => f.id);
}
