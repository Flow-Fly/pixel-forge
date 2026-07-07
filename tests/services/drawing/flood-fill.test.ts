import { describe, it, expect } from 'vitest';
import { floodFill, type FloodFillColor } from '../../../src/services/drawing/algorithms';

const FILL: FloodFillColor = { r: 255, g: 0, b: 0, a: 255, paletteIndex: 2 };

/** Build RGBA pixel data from a grid of [r,g,b,a] tuples. */
function pixels(grid: number[][][]): { data: Uint8ClampedArray; width: number; height: number } {
  const height = grid.length;
  const width = grid[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(grid[y][x], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

const W = [255, 255, 255, 255]; // white
const B = [0, 0, 0, 255]; // black wall
const T = [0, 0, 0, 0]; // transparent

function colorAt(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const pos = (y * width + x) * 4;
  return [data[pos], data[pos + 1], data[pos + 2], data[pos + 3]];
}

describe('floodFill (RGBA mode)', () => {
  it('fills the whole area when uniform and reports bounds', () => {
    const { data, width, height } = pixels([
      [T, T],
      [T, T],
    ]);
    const bounds = floodFill(data, width, height, 0, 0, FILL);
    expect(bounds).toEqual({ x: 0, y: 0, width: 2, height: 2 });
    expect(colorAt(data, width, 1, 1)).toEqual([255, 0, 0, 255]);
  });

  it('stops at walls of a different color', () => {
    const { data, width, height } = pixels([
      [W, B, W],
      [W, B, W],
      [W, B, W],
    ]);
    const bounds = floodFill(data, width, height, 0, 0, FILL);
    expect(bounds).toEqual({ x: 0, y: 0, width: 1, height: 3 });
    // Wall and right side untouched
    expect(colorAt(data, width, 1, 1)).toEqual(B);
    expect(colorAt(data, width, 2, 1)).toEqual(W);
    expect(colorAt(data, width, 0, 2)).toEqual([255, 0, 0, 255]);
  });

  it('returns null for an out-of-bounds start', () => {
    const { data, width, height } = pixels([[W]]);
    expect(floodFill(data, width, height, -1, 0, FILL)).toBeNull();
    expect(floodFill(data, width, height, 0, 1, FILL)).toBeNull();
  });

  it('returns null when the target already has the fill color', () => {
    const { data, width, height } = pixels([[[255, 0, 0, 255]]]);
    expect(floodFill(data, width, height, 0, 0, FILL)).toBeNull();
  });
});

describe('floodFill (indexed mode)', () => {
  it('matches by palette index and writes both buffers', () => {
    // Same RGBA everywhere, but two palette regions: left column 0, right column 1
    const { data, width, height } = pixels([
      [W, W],
      [W, W],
    ]);
    const indexBuffer = new Uint8Array([0, 1, 0, 1]);

    const bounds = floodFill(data, width, height, 0, 0, FILL, indexBuffer);
    // Only the index-0 column fills even though RGBA matches everywhere
    expect(bounds).toEqual({ x: 0, y: 0, width: 1, height: 2 });
    expect(Array.from(indexBuffer)).toEqual([2, 1, 2, 1]);
    expect(colorAt(data, width, 0, 1)).toEqual([255, 0, 0, 255]);
    expect(colorAt(data, width, 1, 1)).toEqual(W);
  });

  it('returns null when the target index equals the fill index', () => {
    const { data, width, height } = pixels([[W]]);
    const indexBuffer = new Uint8Array([2]);
    expect(floodFill(data, width, height, 0, 0, FILL, indexBuffer)).toBeNull();
    expect(colorAt(data, width, 0, 0)).toEqual(W);
  });
});
