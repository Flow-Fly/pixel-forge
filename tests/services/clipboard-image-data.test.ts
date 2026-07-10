import { describe, expect, it } from 'vitest';

import { createClipboardImageDataFromIndices } from '../../src/services/clipboard-image-data';

function pixelAt(imageData: ImageData, x: number, y: number): number[] {
  const offset = (y * imageData.width + x) * 4;
  return Array.from(imageData.data.slice(offset, offset + 4));
}

describe('createClipboardImageDataFromIndices', () => {
  it('materializes remapped indices with the target palette colors', () => {
    const imageData = createClipboardImageDataFromIndices({
      indexData: Uint8Array.from([1, 0, 2, 3]),
      targetColors: ['#ff0000', '#00ff00'],
      width: 2,
      height: 2,
    });

    expect(pixelAt(imageData, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(imageData, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(imageData, 0, 1)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(imageData, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it('keeps masked-out pixels transparent', () => {
    const imageData = createClipboardImageDataFromIndices({
      indexData: Uint8Array.from([1, 1, 1, 1]),
      targetColors: ['#123456'],
      width: 2,
      height: 2,
      mask: Uint8Array.from([255, 0, 0, 255]),
    });

    expect(pixelAt(imageData, 0, 0)).toEqual([18, 52, 86, 255]);
    expect(pixelAt(imageData, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(imageData, 0, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(imageData, 1, 1)).toEqual([18, 52, 86, 255]);
  });

  it('normalizes target colors and leaves inputs untouched', () => {
    const indexData = Uint8Array.from([1]);
    const targetColors = ['#ABC'];

    const imageData = createClipboardImageDataFromIndices({
      indexData,
      targetColors,
      width: 1,
      height: 1,
    });

    expect(pixelAt(imageData, 0, 0)).toEqual([170, 187, 204, 255]);
    expect(Array.from(indexData)).toEqual([1]);
    expect(targetColors).toEqual(['#ABC']);
  });
});
