import { describe, expect, it, vi } from 'vitest';
import {
  generateNumberedGuide,
  perceptualColorDistance,
} from '../../../src/services/paint-by-number/guide-generator';

class FakeImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

vi.stubGlobal('ImageData', FakeImageData);

function imageData(width: number, height: number, pixels: number[][]): ImageData {
  return new ImageData(new Uint8ClampedArray(pixels.flat()), width, height);
}

describe('generateNumberedGuide', () => {
  it('keeps exact colors when they fit the requested limit', () => {
    const image = imageData(3, 1, [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [255, 0, 0, 255],
    ]);

    const guide = generateNumberedGuide(image, 2);

    expect(guide.palette).toEqual(['#0000ff', '#ff0000']);
    expect([...guide.target]).toEqual([2, 1, 2]);
    expect([guide.width, guide.height]).toEqual([3, 1]);
  });

  it('maps transparent cells to zero', () => {
    const image = imageData(2, 1, [
      [12, 34, 56, 0],
      [12, 34, 56, 255],
    ]);

    const guide = generateNumberedGuide(image, 4);

    expect(guide.palette).toEqual(['#0c2238']);
    expect([...guide.target]).toEqual([0, 1]);
  });

  it('never exceeds the requested palette size', () => {
    const image = imageData(6, 1, [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
      [255, 0, 255, 255],
      [0, 255, 255, 255],
    ]);

    const guide = generateNumberedGuide(image, 3);

    expect(guide.palette).toHaveLength(3);
    expect([...guide.target].every((index) => index >= 1 && index <= 3)).toBe(true);
  });

  it('produces stable palette and target fixtures', () => {
    const image = imageData(4, 2, [
      [5, 5, 8, 255],
      [20, 15, 25, 255],
      [220, 40, 30, 255],
      [250, 80, 35, 255],
      [10, 120, 200, 255],
      [20, 150, 240, 255],
      [230, 210, 40, 255],
      [250, 240, 90, 255],
    ]);

    const first = generateNumberedGuide(image, 4);
    const second = generateNumberedGuide(image, 4);

    expect(first.palette).toEqual(['#0d0a11', '#eb3c21', '#0f87dc', '#f0e141']);
    expect([...first.target]).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(second.palette).toEqual(first.palette);
    expect([...second.target]).toEqual([...first.target]);
  });

  it('returns an empty palette for a fully transparent image', () => {
    const image = imageData(1, 1, [[0, 0, 0, 0]]);

    expect(generateNumberedGuide(image, 4)).toEqual({
      palette: [],
      target: new Uint8Array([0]),
      width: 1,
      height: 1,
    });
  });
});

describe('perceptualColorDistance', () => {
  it('is zero for equal colors and symmetric for different colors', () => {
    const red = { r: 255, g: 0, b: 0 };
    const blue = { r: 0, g: 0, b: 255 };

    expect(perceptualColorDistance(red, red)).toBe(0);
    expect(perceptualColorDistance(red, blue)).toBe(
      perceptualColorDistance(blue, red),
    );
  });
});
