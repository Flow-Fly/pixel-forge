import type { Layer } from '../types/layer';

export type PaintableLayer = Layer & { canvas: HTMLCanvasElement };

export function isReferenceLayer(layer: { type?: string } | null | undefined): boolean {
  return layer?.type === 'reference';
}

export function isPaintableLayer(layer: Layer | null | undefined): layer is PaintableLayer {
  return Boolean(layer?.canvas) && !isReferenceLayer(layer);
}
