import type { ViewEffectPipeline } from './pipeline';
import type { ViewEffectParams } from './types';

export const MIN_VIEW_EFFECT_EXPORT_SCALE = 4;

export function getViewEffectExportBaseName(baseName: string, effectId: string): string {
  return `${baseName}-${effectId}`;
}

export interface ViewEffectCanvasRenderOptions {
  effectId: string;
  params: ViewEffectParams;
  pipeline: Pick<ViewEffectPipeline, 'canvas' | 'render'>;
  spritePixelScale: number;
}

export function renderViewEffectToCanvas(
  source: HTMLCanvasElement,
  options: ViewEffectCanvasRenderOptions
): HTMLCanvasElement | null {
  const rendered = options.pipeline.render(options.effectId, source, options.params, {
    width: source.width,
    height: source.height,
    spritePixelScale: options.spritePixelScale,
  });
  if (!rendered) return null;

  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;

  const context = output.getContext('2d');
  if (!context) return null;

  context.imageSmoothingEnabled = false;
  context.drawImage(options.pipeline.canvas, 0, 0);
  return output;
}
