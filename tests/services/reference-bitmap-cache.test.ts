import { describe, expect, it, vi } from 'vitest';

import {
  ReferenceBitmapCache,
  type ReferenceBitmapDecoder,
} from '../../src/services/reference-bitmap-cache';
import type { ReferenceLayerRenderEntry } from '../../src/services/reference-render-plan';

interface FakeBitmap {
  label: string;
  close: ReturnType<typeof vi.fn>;
}

function createFakeBitmap(label: string): ImageBitmap {
  return {
    label,
    close: vi.fn(),
  } as unknown as ImageBitmap;
}

function fakeBitmap(bitmap: ImageBitmap): FakeBitmap {
  return bitmap as unknown as FakeBitmap;
}

function createEntry(
  overrides: Partial<ReferenceLayerRenderEntry> = {}
): ReferenceLayerRenderEntry {
  return {
    layerId: 'reference-layer',
    bytes: Uint8Array.from([1, 2, 3]),
    mimeType: 'image/png',
    x: 1,
    y: 2,
    scale: 0.5,
    opacity: 128,
    desaturate: false,
    position: 'below',
    ...overrides,
  };
}

describe('ReferenceBitmapCache', () => {
  it('reuses the decoded bitmap for the same reference data', async () => {
    const bitmap = createFakeBitmap('first');
    const decoder = vi.fn<ReferenceBitmapDecoder>(async () => bitmap);
    const cache = new ReferenceBitmapCache(decoder);
    const entry = createEntry();

    expect(cache.getCached(entry)).toBeNull();
    await expect(cache.get(entry)).resolves.toBe(bitmap);
    await expect(cache.get(entry)).resolves.toBe(bitmap);

    expect(decoder).toHaveBeenCalledOnce();
    expect(cache.getCached(entry)).toBe(bitmap);
    expect(cache.size).toBe(1);
    expect(fakeBitmap(bitmap).close).not.toHaveBeenCalled();
  });

  it('reuses a pending decode for matching reference data', async () => {
    let resolveDecode: ((bitmap: ImageBitmap) => void) | undefined;
    const decoder = vi.fn<ReferenceBitmapDecoder>(
      () =>
        new Promise((resolve) => {
          resolveDecode = resolve;
        })
    );
    const cache = new ReferenceBitmapCache(decoder);
    const entry = createEntry();

    const firstRequest = cache.get(entry);
    const secondRequest = cache.get(entry);
    const bitmap = createFakeBitmap('decoded');

    expect(firstRequest).toBe(secondRequest);
    expect(decoder).toHaveBeenCalledOnce();
    expect(cache.getCached(entry)).toBeNull();

    resolveDecode?.(bitmap);
    await expect(firstRequest).resolves.toBe(bitmap);
    expect(cache.getCached(entry)).toBe(bitmap);
  });

  it('decodes again and closes stale bitmaps when image identity changes', async () => {
    const firstBitmap = createFakeBitmap('first');
    const secondBitmap = createFakeBitmap('second');
    const decoder = vi
      .fn<ReferenceBitmapDecoder>()
      .mockResolvedValueOnce(firstBitmap)
      .mockResolvedValueOnce(secondBitmap);
    const cache = new ReferenceBitmapCache(decoder);
    const firstEntry = createEntry();
    const secondEntry = createEntry({ bytes: Uint8Array.from([4, 5, 6]) });

    await expect(cache.get(firstEntry)).resolves.toBe(firstBitmap);
    await expect(cache.get(secondEntry)).resolves.toBe(secondBitmap);

    expect(decoder).toHaveBeenCalledTimes(2);
    expect(fakeBitmap(firstBitmap).close).toHaveBeenCalledOnce();
    expect(fakeBitmap(secondBitmap).close).not.toHaveBeenCalled();
    expect(cache.getCached(firstEntry)).toBeNull();
    expect(cache.getCached(secondEntry)).toBe(secondBitmap);
  });

  it('does not let stale pending decodes replace newer cached data', async () => {
    const resolvers: Array<(bitmap: ImageBitmap) => void> = [];
    const decoder = vi.fn<ReferenceBitmapDecoder>(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    const cache = new ReferenceBitmapCache(decoder);
    const staleEntry = createEntry();
    const currentEntry = createEntry({ bytes: Uint8Array.from([4, 5, 6]) });

    const staleRequest = cache.get(staleEntry);
    const currentRequest = cache.get(currentEntry);
    const staleBitmap = createFakeBitmap('stale');
    const currentBitmap = createFakeBitmap('current');

    resolvers[1](currentBitmap);
    await expect(currentRequest).resolves.toBe(currentBitmap);
    expect(cache.getCached(currentEntry)).toBe(currentBitmap);

    resolvers[0](staleBitmap);
    await expect(staleRequest).resolves.toBe(staleBitmap);

    expect(fakeBitmap(staleBitmap).close).toHaveBeenCalledOnce();
    expect(fakeBitmap(currentBitmap).close).not.toHaveBeenCalled();
    expect(cache.getCached(currentEntry)).toBe(currentBitmap);
    expect(cache.size).toBe(1);
  });

  it('treats MIME type and layer id as part of the cache identity', async () => {
    const firstBitmap = createFakeBitmap('first');
    const mimeBitmap = createFakeBitmap('mime');
    const layerBitmap = createFakeBitmap('layer');
    const decoder = vi
      .fn<ReferenceBitmapDecoder>()
      .mockResolvedValueOnce(firstBitmap)
      .mockResolvedValueOnce(mimeBitmap)
      .mockResolvedValueOnce(layerBitmap);
    const cache = new ReferenceBitmapCache(decoder);
    const bytes = Uint8Array.from([1, 2, 3]);

    await expect(cache.get(createEntry({ bytes }))).resolves.toBe(firstBitmap);
    await expect(cache.get(createEntry({ bytes, mimeType: 'image/jpeg' }))).resolves.toBe(
      mimeBitmap
    );
    await expect(
      cache.get(createEntry({ layerId: 'other-layer', bytes, mimeType: 'image/jpeg' }))
    ).resolves.toBe(layerBitmap);

    expect(decoder).toHaveBeenCalledTimes(3);
    expect(fakeBitmap(firstBitmap).close).toHaveBeenCalledOnce();
    expect(fakeBitmap(mimeBitmap).close).not.toHaveBeenCalled();
    expect(cache.size).toBe(2);
  });

  it('does not poison the cache when decoding fails', async () => {
    const error = new Error('decode failed');
    const bitmap = createFakeBitmap('later-success');
    const decoder = vi
      .fn<ReferenceBitmapDecoder>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(bitmap);
    const cache = new ReferenceBitmapCache(decoder);
    const entry = createEntry();

    await expect(cache.get(entry)).rejects.toThrow(error);
    expect(cache.getCached(entry)).toBeNull();
    await expect(cache.get(entry)).resolves.toBe(bitmap);

    expect(decoder).toHaveBeenCalledTimes(2);
    expect(cache.getCached(entry)).toBe(bitmap);
    expect(cache.size).toBe(1);
  });

  it('can invalidate one layer or clear every cached bitmap', async () => {
    const firstBitmap = createFakeBitmap('first');
    const secondBitmap = createFakeBitmap('second');
    const decoder = vi
      .fn<ReferenceBitmapDecoder>()
      .mockResolvedValueOnce(firstBitmap)
      .mockResolvedValueOnce(secondBitmap);
    const cache = new ReferenceBitmapCache(decoder);

    await cache.get(createEntry({ layerId: 'first-layer' }));
    await cache.get(createEntry({ layerId: 'second-layer' }));

    cache.invalidateLayer('first-layer');
    expect(fakeBitmap(firstBitmap).close).toHaveBeenCalledOnce();
    expect(fakeBitmap(secondBitmap).close).not.toHaveBeenCalled();
    expect(cache.size).toBe(1);

    cache.clear();
    expect(fakeBitmap(secondBitmap).close).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
  });
});
