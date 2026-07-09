import { describe, expect, it, vi } from 'vitest';

import {
  ReferenceBitmapCache,
  type ReferenceBitmapDecoder,
} from '../../src/services/reference-bitmap-cache';
import type { ReferenceLayerRenderEntry } from '../../src/services/reference-render-plan';

interface FakeBitmap {
  id: string;
  close?: () => void;
}

function entry(
  overrides: Partial<ReferenceLayerRenderEntry> = {}
): ReferenceLayerRenderEntry {
  return {
    layerId: 'reference-layer',
    bytes: Uint8Array.from([1, 2, 3]),
    mimeType: 'image/png',
    x: 0,
    y: 0,
    scale: 1,
    opacity: 128,
    desaturate: false,
    position: 'below',
    ...overrides,
  };
}

function createFakeDecoder() {
  const bitmaps: FakeBitmap[] = [];
  const decode: ReferenceBitmapDecoder<FakeBitmap> = vi.fn(async () => {
    const bitmap = {
      id: `bitmap-${bitmaps.length + 1}`,
      close: vi.fn(),
    };
    bitmaps.push(bitmap);
    return bitmap;
  });

  return { bitmaps, decode };
}

describe('ReferenceBitmapCache', () => {
  it('reuses decoded bitmaps for the same reference data', async () => {
    const { decode } = createFakeDecoder();
    const cache = new ReferenceBitmapCache({ decode });

    const first = await cache.get(entry());
    const second = await cache.get(entry({ bytes: Uint8Array.from([1, 2, 3]) }));

    expect(first).toBe(second);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);
  });

  it('redecodes and closes the previous bitmap when layer data changes', async () => {
    const { bitmaps, decode } = createFakeDecoder();
    const cache = new ReferenceBitmapCache({ decode });

    const first = await cache.get(entry());
    const second = await cache.get(entry({ bytes: Uint8Array.from([4, 5, 6]) }));

    expect(second).not.toBe(first);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(bitmaps[0].close).toHaveBeenCalledTimes(1);
    expect(bitmaps[1].close).not.toHaveBeenCalled();
    expect(cache.size).toBe(1);
  });

  it('treats MIME type and layer identity as cache key inputs', async () => {
    const { bitmaps, decode } = createFakeDecoder();
    const cache = new ReferenceBitmapCache({ decode });

    const firstLayerPng = await cache.get(entry({ layerId: 'first', mimeType: 'image/png' }));
    const secondLayerPng = await cache.get(entry({ layerId: 'second', mimeType: 'image/png' }));
    const secondLayerJpeg = await cache.get(entry({ layerId: 'second', mimeType: 'image/jpeg' }));

    expect(firstLayerPng).not.toBe(secondLayerPng);
    expect(secondLayerJpeg).not.toBe(secondLayerPng);
    expect(decode).toHaveBeenCalledTimes(3);
    expect(bitmaps[0].close).not.toHaveBeenCalled();
    expect(bitmaps[1].close).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(2);
  });

  it('dedupes in-flight decode requests for matching reference data', async () => {
    let resolveDecode: ((bitmap: FakeBitmap) => void) | undefined;
    const decode: ReferenceBitmapDecoder<FakeBitmap> = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveDecode = resolve;
        })
    );
    const cache = new ReferenceBitmapCache({ decode });

    const firstRequest = cache.get(entry());
    const secondRequest = cache.get(entry());
    const bitmap = { id: 'bitmap' };
    resolveDecode?.(bitmap);

    await expect(firstRequest).resolves.toBe(bitmap);
    await expect(secondRequest).resolves.toBe(bitmap);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('clears cached bitmaps and tolerates bitmaps without close', async () => {
    const closable = { id: 'closable', close: vi.fn() };
    const plain = { id: 'plain' };
    const decode: ReferenceBitmapDecoder<FakeBitmap> = vi
      .fn()
      .mockResolvedValueOnce(closable)
      .mockResolvedValueOnce(plain);
    const cache = new ReferenceBitmapCache({ decode });

    await cache.get(entry({ layerId: 'closable' }));
    await cache.get(entry({ layerId: 'plain' }));

    cache.clear();

    expect(closable.close).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(0);
  });
});
