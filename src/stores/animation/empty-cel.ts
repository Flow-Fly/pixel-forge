import type { Cel } from '../../types/animation';

const runtimeEmptyCanvases = new WeakSet<HTMLCanvasElement>();

export function markRuntimeEmptyCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  runtimeEmptyCanvases.add(canvas);
  return canvas;
}

export function isRuntimeEmptyCel(cel: Cel): boolean {
  return !cel.linkedCelId && runtimeEmptyCanvases.has(cel.canvas);
}
