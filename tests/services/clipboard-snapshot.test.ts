import { describe, expect, it } from 'vitest';

import { createClipboardIndexedSelection } from '../../src/services/clipboard-snapshot';

describe('createClipboardIndexedSelection', () => {
  it('copies region index data with a cloned source palette snapshot', () => {
    const indexBuffer = Uint8Array.from([
      0, 1, 2, 3,
      4, 2, 0, 1,
      3, 3, 1, 0,
    ]);
    const sourceColors = ['#111111', '#222222', '#333333', '#444444'];

    const snapshot = createClipboardIndexedSelection({
      bounds: { x: 1, y: 0, width: 2, height: 2 },
      shape: 'rectangle',
      indexBuffer,
      canvasWidth: 4,
      sourceColors,
    });

    sourceColors[0] = '#999999';

    expect(Array.from(snapshot!.indexData)).toEqual([1, 2, 2, 0]);
    expect(snapshot!.sourceColors).toEqual(['#111111', '#222222', '#333333', '#444444']);
    expect(snapshot!.usedIndices).toEqual([1, 2]);
    expect(snapshot!.width).toBe(2);
    expect(snapshot!.height).toBe(2);
    expect(snapshot!.shape).toBe('rectangle');
  });

  it('applies freeform masks and keeps transparent index 0 out of used indices', () => {
    const mask = Uint8Array.from([255, 0, 255, 255]);

    const snapshot = createClipboardIndexedSelection({
      bounds: { x: 0, y: 0, width: 2, height: 2 },
      shape: 'freeform',
      mask,
      indexBuffer: Uint8Array.from([2, 3, 0, 2]),
      canvasWidth: 2,
      sourceColors: ['#111111', '#222222', '#333333'],
    });

    mask[0] = 0;

    expect(Array.from(snapshot!.indexData)).toEqual([2, 0, 0, 2]);
    expect(snapshot!.usedIndices).toEqual([2]);
    expect(Array.from(snapshot!.mask!)).toEqual([255, 0, 255, 255]);
  });

  it('skips indexed payloads when no index buffer is available', () => {
    const snapshot = createClipboardIndexedSelection({
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      shape: 'rectangle',
      canvasWidth: 1,
      sourceColors: ['#111111'],
    });

    expect(snapshot).toBeUndefined();
  });
});
