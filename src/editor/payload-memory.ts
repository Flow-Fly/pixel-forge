import type { Cel } from '../types/animation';

/** Estimate the retained canvas and indexed payload bytes for one history snapshot. */
export function estimateCelPayloadBytes(cels: ReadonlyMap<string, Cel>): number {
  const canvases = new Set<HTMLCanvasElement>();
  const indexes = new Set<Uint8Array>();
  let bytes = 0;
  for (const cel of cels.values()) {
    if (!canvases.has(cel.canvas)) {
      canvases.add(cel.canvas);
      bytes += cel.canvas.width * cel.canvas.height * 4;
    }
    if (cel.indexBuffer && !indexes.has(cel.indexBuffer)) {
      indexes.add(cel.indexBuffer);
      bytes += cel.indexBuffer.byteLength;
    }
  }
  return bytes;
}
