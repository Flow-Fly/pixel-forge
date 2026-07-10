import { describe, expect, it, vi } from 'vitest';
import {
  getTargetGridSize,
  sampleImageToGrid,
} from '../../../src/services/paint-by-number/image-sampling';

class FakeImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number);
  constructor(data: Uint8ClampedArray, width: number, height: number);
  constructor(
    dataOrWidth: Uint8ClampedArray | number,
    widthOrHeight: number,
    maybeHeight?: number,
  ) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      return;
    }

    this.data = dataOrWidth;
    this.width = widthOrHeight;
    this.height = maybeHeight ?? 0;
  }
}

vi.stubGlobal('ImageData', FakeImageData);

function imageData(width: number, height: number, pixels: number[][]): ImageData {
  return new ImageData(
    new Uint8ClampedArray(pixels.flat()),
    width,
    height,
  );
}

describe('getTargetGridSize', () => {
  it('preserves landscape, portrait, and square aspect ratios', () => {
    expect(getTargetGridSize(8, 4, 4)).toEqual({ width: 4, height: 2 });
    expect(getTargetGridSize(4, 8, 4)).toEqual({ width: 2, height: 4 });
    expect(getTargetGridSize(5, 5, 3)).toEqual({ width: 3, height: 3 });
  });

  it('keeps the shorter side at least one cell', () => {
    expect(getTargetGridSize(100, 1, 8)).toEqual({ width: 8, height: 1 });
  });

  it('rejects invalid dimensions', () => {
    expect(() => getTargetGridSize(0, 1, 1)).toThrow(RangeError);
    expect(() => getTargetGridSize(1, 1, 0)).toThrow(RangeError);
  });
});

describe('sampleImageToGrid', () => {
  it('averages source regions into target cells', () => {
    const source = imageData(4, 2, [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 255, 0, 255],
      [0, 255, 0, 255],
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 255, 0, 255],
      [0, 255, 0, 255],
    ]);

    const result = sampleImageToGrid(source, { longSide: 2 });

    expect([result.width, result.height]).toEqual([2, 1]);
    expect([...result.data]).toEqual([
      128, 0, 128, 255,
      0, 255, 0, 255,
    ]);
  });

  it('supports non-integer downscale regions deterministically', () => {
    const source = imageData(3, 1, [
      [0, 0, 0, 255],
      [120, 120, 120, 255],
      [240, 240, 240, 255],
    ]);

    const first = sampleImageToGrid(source, { longSide: 2 });
    const second = sampleImageToGrid(source, { longSide: 2 });

    expect([...first.data]).toEqual([40, 40, 40, 255, 200, 200, 200, 255]);
    expect([...second.data]).toEqual([...first.data]);
  });

  it('uses premultiplied color averaging and hard transparency', () => {
    const source = imageData(2, 1, [
      [255, 0, 0, 255],
      [0, 0, 255, 0],
    ]);

    const visible = sampleImageToGrid(source, {
      longSide: 1,
      alphaThreshold: 127,
    });
    const transparent = sampleImageToGrid(source, {
      longSide: 1,
      alphaThreshold: 129,
    });

    expect([...visible.data]).toEqual([255, 0, 0, 255]);
    expect([...transparent.data]).toEqual([0, 0, 0, 0]);
  });

  it('copies a one-pixel input', () => {
    const source = imageData(1, 1, [[12, 34, 56, 255]]);
    const result = sampleImageToGrid(source, { longSide: 1 });

    expect([...result.data]).toEqual([12, 34, 56, 255]);
  });
});
