import type { Layer } from '../types/layer';

export interface ExportFrameCompositionOptions {
  frameId: string;
  width: number;
  height: number;
  scale: number;
  layers: readonly Layer[];
  getCelCanvas: (frameId: string, layerId: string) => HTMLCanvasElement | undefined;
  useBackground?: boolean;
  backgroundColor?: string;
}

function isExportableArtworkLayer(layer: Layer): boolean {
  return layer.type !== 'reference';
}

export function getExportableArtworkLayers(layers: readonly Layer[]): Layer[] {
  return layers.filter(isExportableArtworkLayer);
}

export function composeExportFrame({
  frameId,
  width,
  height,
  scale,
  layers,
  getCelCanvas,
  useBackground = false,
  backgroundColor = '#ffffff',
}: ExportFrameCompositionOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;

  ctx.imageSmoothingEnabled = false;

  if (useBackground) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.scale(scale, scale);

  for (const layer of getExportableArtworkLayers(layers)) {
    if (!layer.visible) continue;

    const celCanvas = getCelCanvas(frameId, layer.id);
    if (!celCanvas) continue;

    ctx.globalAlpha = layer.opacity / 255;
    ctx.drawImage(celCanvas, 0, 0);
  }

  ctx.globalAlpha = 1;

  return canvas;
}
