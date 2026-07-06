import type { Rect } from '../types/geometry';

/**
 * Region helpers for 1-byte-per-pixel buffers (palette index buffers).
 * Row-major, same iteration order in both directions so
 * extract -> write round-trips exactly.
 */

/** Copy a rectangular region out of a full-canvas index buffer. */
export function extractIndexRegion(
  source: Uint8Array,
  sourceWidth: number,
  bounds: Rect
): Uint8Array {
  const region = new Uint8Array(bounds.width * bounds.height);
  let dataIndex = 0;
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const bufferIndex = y * sourceWidth + x;
      if (bufferIndex >= 0 && bufferIndex < source.length) {
        region[dataIndex] = source[bufferIndex];
      }
      dataIndex++;
    }
  }
  return region;
}

/** Write a rectangular region back into a full-canvas index buffer. */
export function writeIndexRegion(
  target: Uint8Array,
  targetWidth: number,
  bounds: Rect,
  data: Uint8Array
): void {
  let dataIndex = 0;
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const bufferIndex = y * targetWidth + x;
      if (bufferIndex >= 0 && bufferIndex < target.length && dataIndex < data.length) {
        target[bufferIndex] = data[dataIndex];
      }
      dataIndex++;
    }
  }
}
