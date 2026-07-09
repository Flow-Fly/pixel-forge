import { describe, expect, it } from 'vitest';

import { remapClipboardPaletteIndices } from '../../src/services/clipboard-remap';

describe('remapClipboardPaletteIndices', () => {
  it('reuses exact normalized matches from the target palette', () => {
    const plan = remapClipboardPaletteIndices({
      indexData: Uint8Array.from([1, 2, 0, 1]),
      sourceColors: ['#FF0000', '#0f0'],
      targetColors: ['#00ff00', '#ff0000'],
    });

    expect(Array.from(plan.remappedIndexData)).toEqual([2, 1, 0, 2]);
    expect(plan.colorsToAppend).toEqual([]);
  });

  it('plans missing colors as target palette appends in first-use order', () => {
    const plan = remapClipboardPaletteIndices({
      indexData: Uint8Array.from([2, 1, 2, 3]),
      sourceColors: ['#111111', '#222222', '#333333'],
      targetColors: ['#111111'],
    });

    expect(Array.from(plan.remappedIndexData)).toEqual([2, 1, 2, 3]);
    expect(plan.colorsToAppend).toEqual(['#222222', '#333333']);
  });

  it('dedupes visually equal source and target colors by normalized hex', () => {
    const plan = remapClipboardPaletteIndices({
      indexData: Uint8Array.from([1, 2, 3]),
      sourceColors: ['#abc', '#AABBCC', '#00ff00'],
      targetColors: ['#ABC', '#aabbcc'],
    });

    expect(Array.from(plan.remappedIndexData)).toEqual([1, 1, 3]);
    expect(plan.colorsToAppend).toEqual(['#00ff00']);
  });

  it('keeps transparent pixels transparent and out of the append plan', () => {
    const plan = remapClipboardPaletteIndices({
      indexData: Uint8Array.from([0, 1, 0, 1]),
      sourceColors: ['#123456'],
      targetColors: [],
    });

    expect(Array.from(plan.remappedIndexData)).toEqual([0, 1, 0, 1]);
    expect(plan.colorsToAppend).toEqual(['#123456']);
  });

  it('uses closest existing colors instead of exceeding the palette cap', () => {
    const plan = remapClipboardPaletteIndices({
      indexData: Uint8Array.from([1, 2]),
      sourceColors: ['#fefefe', '#010101'],
      targetColors: ['#000000', '#ffffff'],
      maxPaletteSize: 2,
    });

    expect(Array.from(plan.remappedIndexData)).toEqual([2, 1]);
    expect(plan.colorsToAppend).toEqual([]);
  });

  it('returns a pure plan without mutating the copied data or palettes', () => {
    const indexData = Uint8Array.from([1]);
    const sourceColors = ['#ABC'];
    const targetColors = ['#000000'];

    const plan = remapClipboardPaletteIndices({
      indexData,
      sourceColors,
      targetColors,
    });

    expect(plan.remappedIndexData).not.toBe(indexData);
    expect(Array.from(indexData)).toEqual([1]);
    expect(sourceColors).toEqual(['#ABC']);
    expect(targetColors).toEqual(['#000000']);
    expect(plan.colorsToAppend).toEqual(['#aabbcc']);
  });
});
