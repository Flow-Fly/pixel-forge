import { describe, expect, it, vi } from 'vitest';

import {
  ReferenceViewportRenderer,
  type ReferenceImageDrawer,
} from '../../src/services/reference-viewport-renderer';
import {
  ReferenceBitmapCache,
  type ReferenceBitmapDecoder,
} from '../../src/services/reference-bitmap-cache';
import type { ReferenceLayerRenderEntry } from '../../src/services/reference-render-plan';

function createEntry(
  overrides: Partial<ReferenceLayerRenderEntry> = {}
): ReferenceLayerRenderEntry {
  return {
    layerId: 'reference-layer',
    bytes: Uint8Array.from([1, 2, 3]),
    mimeType: 'image/png',
    x: 4,
    y: 8,
    scale: 2,
    opacity: 128,
    desaturate: false,
    position: 'below',
    ...overrides,
  };
}

function createBitmap(label: string): ImageBitmap {
  return {
    label,
    close: vi.fn(),
    height: 10,
    width: 20,
  } as unknown as ImageBitmap;
}

function createContext(): CanvasRenderingContext2D {
  return {} as CanvasRenderingContext2D;
}

describe('ReferenceViewportRenderer', () => {
  it('draws ready cached reference images in entry order', async () => {
    const firstEntry = createEntry({ layerId: 'first' });
    const secondEntry = createEntry({ layerId: 'second' });
    const firstBitmap = createBitmap('first');
    const secondBitmap = createBitmap('second');
    const decoder = vi
      .fn<ReferenceBitmapDecoder>()
      .mockResolvedValueOnce(firstBitmap)
      .mockResolvedValueOnce(secondBitmap);
    const cache = new ReferenceBitmapCache(decoder);
    const drawImage = vi.fn<ReferenceImageDrawer>();
    const requestRedraw = vi.fn();
    const renderer = new ReferenceViewportRenderer({
      cache,
      drawImage,
      requestRedraw,
    });

    await cache.get(firstEntry);
    await cache.get(secondEntry);
    renderer.render(createContext(), [firstEntry, secondEntry]);

    expect(drawImage).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      firstEntry,
      firstBitmap
    );
    expect(drawImage).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      secondEntry,
      secondBitmap
    );
    expect(requestRedraw).not.toHaveBeenCalled();
  });

  it('loads missing images and requests redraw after decode succeeds', async () => {
    const bitmap = createBitmap('loaded');
    const decoder = vi.fn<ReferenceBitmapDecoder>(async () => bitmap);
    const cache = new ReferenceBitmapCache(decoder);
    const drawImage = vi.fn<ReferenceImageDrawer>();
    const requestRedraw = vi.fn();
    const renderer = new ReferenceViewportRenderer({
      cache,
      drawImage,
      requestRedraw,
    });
    const entry = createEntry();

    renderer.render(createContext(), [entry]);
    expect(drawImage).not.toHaveBeenCalled();
    expect(cache.getCached(entry)).toBeNull();

    await expect(cache.get(entry)).resolves.toBe(bitmap);
    expect(decoder).toHaveBeenCalledOnce();
    expect(requestRedraw).toHaveBeenCalledOnce();
    expect(cache.getCached(entry)).toBe(bitmap);
  });

  it('does not duplicate pending decodes or redraw callbacks for repeated renders', async () => {
    let resolveDecode: ((bitmap: ImageBitmap) => void) | undefined;
    const decoder = vi.fn<ReferenceBitmapDecoder>(
      () =>
        new Promise((resolve) => {
          resolveDecode = resolve;
        })
    );
    const cache = new ReferenceBitmapCache(decoder);
    const requestRedraw = vi.fn();
    const renderer = new ReferenceViewportRenderer({
      cache,
      requestRedraw,
    });
    const entry = createEntry();
    const bitmap = createBitmap('decoded');

    renderer.render(createContext(), [entry]);
    renderer.render(createContext(), [entry]);

    expect(decoder).toHaveBeenCalledOnce();
    resolveDecode?.(bitmap);
    await expect(cache.get(entry)).resolves.toBe(bitmap);
    expect(requestRedraw).toHaveBeenCalledOnce();
  });

  it('ignores decode failures without drawing or requesting redraw', async () => {
    const error = new Error('decode failed');
    const decoder = vi.fn<ReferenceBitmapDecoder>(async () => {
      throw error;
    });
    const cache = new ReferenceBitmapCache(decoder);
    const drawImage = vi.fn<ReferenceImageDrawer>();
    const requestRedraw = vi.fn();
    const renderer = new ReferenceViewportRenderer({
      cache,
      drawImage,
      requestRedraw,
    });

    renderer.render(createContext(), [createEntry()]);
    await Promise.resolve();
    await Promise.resolve();

    expect(drawImage).not.toHaveBeenCalled();
    expect(requestRedraw).not.toHaveBeenCalled();
  });
});
