import { describe, expect, it } from 'vitest';
import {
  collectGuidedFillRegion,
  paintGuidedFillRegion,
} from '../../../src/services/paint-by-number/guided-fill';

function transparentPixels(length: number) {
  return new Uint8ClampedArray(length * 4);
}

describe('guided region fill', () => {
  it('collects only the four-connected island sharing the clicked number', () => {
    const target = Uint8Array.from([
      1, 1, 2, 1,
      1, 2, 2, 2,
      3, 3, 1, 1,
    ]);

    const region = collectGuidedFillRegion(
      target,
      transparentPixels(target.length),
      4,
      3,
      0,
      0,
    );

    expect(region).toEqual({
      bounds: { x: 0, y: 0, width: 2, height: 2 },
      guideNumber: 1,
      indices: [0, 1, 4],
    });
  });

  it('does not join regions that only touch diagonally', () => {
    const target = Uint8Array.from([
      1, 2,
      2, 1,
    ]);

    const region = collectGuidedFillRegion(
      target,
      transparentPixels(target.length),
      2,
      2,
      0,
      0,
    );

    expect(region?.indices).toEqual([0]);
  });

  it('preserves painted cells without letting them split the guide region', () => {
    const target = Uint8Array.from([1, 1, 1]);
    const pixels = transparentPixels(target.length);
    pixels.set([9, 8, 7, 255], 4);
    const indexBuffer = Uint8Array.from([0, 4, 0]);
    const region = collectGuidedFillRegion(target, pixels, 3, 1, 0, 0);

    expect(region?.indices).toEqual([0, 2]);
    paintGuidedFillRegion(pixels, indexBuffer, region!, {
      r: 18,
      g: 52,
      b: 86,
      a: 255,
      paletteIndex: 6,
    });

    expect([...pixels.slice(0, 4)]).toEqual([18, 52, 86, 255]);
    expect([...pixels.slice(4, 8)]).toEqual([9, 8, 7, 255]);
    expect([...pixels.slice(8, 12)]).toEqual([18, 52, 86, 255]);
    expect([...indexBuffer]).toEqual([6, 4, 6]);
  });

  it('does nothing for an unnumbered cell or a fully painted region', () => {
    expect(collectGuidedFillRegion(
      Uint8Array.from([0]),
      transparentPixels(1),
      1,
      1,
      0,
      0,
    )).toBeNull();

    expect(collectGuidedFillRegion(
      Uint8Array.from([1]),
      Uint8ClampedArray.from([1, 2, 3, 255]),
      1,
      1,
      0,
      0,
    )).toBeNull();
  });
});
