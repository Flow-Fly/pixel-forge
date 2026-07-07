import { describe, it, expect } from 'vitest';
import { rotateCleanEdge } from '../../../src/utils/rotation/clean-edge';

// happy-dom does not provide ImageData; the rotation code constructs it.
if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataPolyfill {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;

    constructor(width: number, height: number);
    constructor(data: Uint8ClampedArray, width: number, height?: number);
    constructor(arg1: number | Uint8ClampedArray, arg2: number, arg3?: number) {
      if (typeof arg1 === 'number') {
        this.width = arg1;
        this.height = arg2;
        this.data = new Uint8ClampedArray(arg1 * arg2 * 4);
      } else {
        this.data = arg1;
        this.width = arg2;
        this.height = arg3 ?? arg1.length / 4 / arg2;
      }
    }
  }
  globalThis.ImageData = ImageDataPolyfill as unknown as typeof ImageData;
}

const RED = [255, 0, 0, 255];
const CLEAR = [0, 0, 0, 0];

/** Build ImageData from a string grid ('#' = red, '.' = transparent). */
function imageFrom(rows: string[]): ImageData {
  const height = rows.length;
  const width = rows[0].length;
  const img = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      img.data.set(rows[y][x] === '#' ? RED : CLEAR, (y * width + x) * 4);
    }
  }
  return img;
}

function opaquePixelCount(img: ImageData, alphaThreshold = 128): number {
  let count = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] >= alphaThreshold) count++;
  }
  return count;
}

function pixelAt(img: ImageData, x: number, y: number): number[] {
  const pos = (y * img.width + x) * 4;
  return Array.from(img.data.slice(pos, pos + 4));
}

describe('rotateCleanEdge', () => {
  it('returns an identical copy for 0 degrees', () => {
    const img = imageFrom(['##..', '##..', '....', '....']);
    const result = rotateCleanEdge(img, 0);
    expect(result.width).toBe(img.width);
    expect(result.height).toBe(img.height);
    expect(Array.from(result.data)).toEqual(Array.from(img.data));
    expect(result).not.toBe(img); // must be a copy
  });

  it('normalizes full turns to the identity', () => {
    const img = imageFrom(['#.', '..']);
    const result = rotateCleanEdge(img, 360);
    expect(Array.from(result.data)).toEqual(Array.from(img.data));
  });

  it('roughly preserves opaque area for a 45-degree rotation', () => {
    const img = imageFrom([
      '........',
      '..####..',
      '..####..',
      '..####..',
      '..####..',
      '........',
      '........',
      '........',
    ]);
    const before = opaquePixelCount(img);

    const result = rotateCleanEdge(img, 45);
    expect(result.width).toBeGreaterThanOrEqual(img.width);
    expect(result.height).toBeGreaterThanOrEqual(img.height);

    const after = opaquePixelCount(result);
    // Allow generous tolerance for edge resampling, but the shape must survive
    expect(after).toBeGreaterThan(before * 0.5);
    expect(after).toBeLessThan(before * 2);

    // The rotated shape keeps the source color at its center
    const cx = Math.floor(result.width / 2);
    const cy = Math.floor(result.height / 2);
    const center = pixelAt(result, cx, cy);
    expect(center[3]).toBeGreaterThan(200); // opaque
    expect(center[0]).toBeGreaterThan(200); // still red
    expect(center[1]).toBeLessThan(50);
  });

  it('supports draft quality and cleanup options', () => {
    const img = imageFrom(['.##.', '.##.', '.##.', '....']);
    const draft = rotateCleanEdge(img, 30, { quality: 'draft', cleanup: true });
    expect(opaquePixelCount(draft)).toBeGreaterThan(0);

    const lighter = rotateCleanEdge(img, 30, { edgePriority: 'lighter' });
    expect(opaquePixelCount(lighter)).toBeGreaterThan(0);
  });

  it('preserves shape mass across a sweep of angles and patterns', () => {
    // Varied silhouettes exercise the different slant branches of the
    // CleanEdge slice detection (shallow/steep slants, notches, diagonals).
    const patterns = [
      ['........', '.#......', '.##.....', '.###....', '.####...', '.#####..', '........', '........'],
      ['........', '..####..', '.######.', '.##..##.', '.##..##.', '.######.', '..####..', '........'],
      ['........', '.#.#.#..', '..#.#...', '.#.#.#..', '..#.#...', '.#.#.#..', '........', '........'],
      ['........', '.######.', '..####..', '...##...', '...##...', '...##...', '...##...', '........'],
    ];
    const angles = [15, 22.5, 45, 67.5, 120, 210, -30];

    for (const rows of patterns) {
      const img = imageFrom(rows);
      const before = opaquePixelCount(img);
      for (const angle of angles) {
        for (const cleanup of [false, true]) {
          const result = rotateCleanEdge(img, angle, { cleanup });
          const after = opaquePixelCount(result);
          expect(after).toBeGreaterThan(before * 0.4);
          expect(after).toBeLessThan(before * 2.5);
        }
      }
    }
  });

  it('keeps a two-color edge free of foreign colors at 90 degrees', () => {
    // Left half red, right half green
    const img = new ImageData(4, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        img.data.set(x < 2 ? RED : [0, 255, 0, 255], (y * 4 + x) * 4);
      }
    }

    const result = rotateCleanEdge(img, 90);
    // Every opaque pixel must stay red-ish or green-ish; blue never appears
    for (let i = 0; i < result.data.length; i += 4) {
      if (result.data[i + 3] > 128) {
        expect(result.data[i + 2]).toBeLessThan(64); // no blue channel
      }
    }
    expect(opaquePixelCount(result)).toBeGreaterThan(8);
  });
});
