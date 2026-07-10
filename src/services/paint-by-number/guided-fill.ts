import type { Rect } from '../../types/geometry';

export interface GuidedFillRegion {
  bounds: Rect;
  guideNumber: number;
  indices: number[];
}

export interface GuidedFillColor {
  r: number;
  g: number;
  b: number;
  a: number;
  paletteIndex: number;
}

export function collectGuidedFillRegion(
  target: Uint8Array,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
): GuidedFillRegion | null {
  assertMatchingBuffers(target, pixels, width, height);
  if (!isPointInside(startX, startY, width, height)) return null;

  const startIndex = startY * width + startX;
  const guideNumber = target[startIndex];
  if (guideNumber === 0) return null;

  const connectedIndices = collectConnectedGuideIndices(
    target,
    width,
    startIndex,
    guideNumber,
  );
  const indices = connectedIndices.filter((index) => pixels[index * 4 + 3] === 0);
  if (indices.length === 0) return null;

  return {
    bounds: findBounds(indices, width),
    guideNumber,
    indices,
  };
}

function collectConnectedGuideIndices(
  target: Uint8Array,
  width: number,
  startIndex: number,
  guideNumber: number,
): number[] {
  const visited = new Uint8Array(target.length);
  const queue = new Int32Array(target.length);
  const connected: number[] = [];
  let queueStart = 0;
  let queueEnd = 1;
  const height = target.length / width;

  queue[0] = startIndex;
  visited[startIndex] = 1;

  const enqueue = (index: number) => {
    if (visited[index] || target[index] !== guideNumber) return;
    visited[index] = 1;
    queue[queueEnd] = index;
    queueEnd += 1;
  };

  while (queueStart < queueEnd) {
    const index = queue[queueStart];
    queueStart += 1;
    connected.push(index);
    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  return connected;
}

function findBounds(indices: number[], width: number): Rect {
  let minX = width;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;

  for (const index of indices) {
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function assertMatchingBuffers(
  target: Uint8Array,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (target.length !== width * height || pixels.length !== target.length * 4) {
    throw new RangeError('Guided fill buffers do not match the project dimensions');
  }
}

function isPointInside(x: number, y: number, width: number, height: number) {
  return x >= 0 && x < width && y >= 0 && y < height;
}

export function paintGuidedFillRegion(
  pixels: Uint8ClampedArray,
  indexBuffer: Uint8Array,
  region: GuidedFillRegion,
  color: GuidedFillColor,
) {
  if (pixels.length !== indexBuffer.length * 4) {
    throw new RangeError('Guided fill pixel and palette buffers do not match');
  }

  for (const index of region.indices) {
    const offset = index * 4;
    pixels[offset] = color.r;
    pixels[offset + 1] = color.g;
    pixels[offset + 2] = color.b;
    pixels[offset + 3] = color.a;
    indexBuffer[index] = color.paletteIndex;
  }
}
