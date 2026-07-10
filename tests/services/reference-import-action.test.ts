import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  importReferenceImageFile,
  isSupportedReferenceImageFile,
} from '../../src/services/reference-import-action';
import {
  createProjectContext,
  defaultProjectContext,
  restoreDefaultProjectContext,
} from '../../src/stores/project-context';
import type { ProjectContext } from '../../src/stores/project-context';

function createImageFile(
  name = 'reference.png',
  type = 'image/png',
  bytes = [1, 2, 3]
): File {
  return new File([Uint8Array.from(bytes)], name, { type });
}

function createBitmap(width: number, height: number): ImageBitmap {
  return {
    close: vi.fn(),
    height,
    width,
  } as unknown as ImageBitmap;
}

describe('reference import action', () => {
  let contexts: ProjectContext[];

  beforeEach(() => {
    contexts = [];
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => createBitmap(10, 10))
    );
  });

  afterEach(() => {
    restoreDefaultProjectContext();
    for (const context of contexts) {
      context.dispose();
    }
    vi.unstubAllGlobals();
  });

  it('imports a supported image file as a reference layer in the provided context', async () => {
    const context = createProjectContext();
    contexts.push(context);
    context.project.width.value = 100;
    context.project.height.value = 50;
    const file = createImageFile('guide.png', 'image/png', [9, 8, 7]);

    const layer = await importReferenceImageFile(context, file);

    expect(layer?.type).toBe('reference');
    expect(layer?.name).toBe('guide.png');
    expect(layer?.opacity).toBe(128);
    expect(layer?.referenceData).toMatchObject({
      mimeType: 'image/png',
      position: 'below',
      scale: 5,
      x: 25,
      y: 0,
    });
    expect(Array.from(layer?.referenceData?.bytes ?? [])).toEqual([9, 8, 7]);
    expect(context.layers.activeLayerId.value).toBe(layer?.id);
    expect(context.dirtyRect.consumeFullRedraw()).toBe(true);
    expect(defaultProjectContext.layers.layers.value).not.toContain(layer);
  });

  it('normalizes supported image types inferred from file extension', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const file = createImageFile('reference.webp', '', [4, 5, 6]);

    const layer = await importReferenceImageFile(context, file);

    expect(layer?.referenceData?.mimeType).toBe('image/webp');
    expect(Array.from(layer?.referenceData?.bytes ?? [])).toEqual([4, 5, 6]);
  });

  it('rejects unsupported files without mutating layers or requesting redraw', async () => {
    const context = createProjectContext();
    contexts.push(context);
    context.dirtyRect.consumeFullRedraw();
    const originalLayers = context.layers.layers.value;
    const originalActiveLayerId = context.layers.activeLayerId.value;
    const file = createImageFile('notes.txt', 'text/plain');

    const layer = await importReferenceImageFile(context, file);

    expect(layer).toBeNull();
    expect(context.layers.layers.value).toBe(originalLayers);
    expect(context.layers.activeLayerId.value).toBe(originalActiveLayerId);
    expect(context.dirtyRect.consumeFullRedraw()).toBe(false);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('reports supported reference image files by MIME type or extension', () => {
    expect(isSupportedReferenceImageFile(createImageFile('a.png', 'image/png'))).toBe(true);
    expect(isSupportedReferenceImageFile(createImageFile('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isSupportedReferenceImageFile(createImageFile('a.webp', 'image/webp'))).toBe(true);
    expect(isSupportedReferenceImageFile(createImageFile('a.jpeg', ''))).toBe(true);
    expect(isSupportedReferenceImageFile(createImageFile('a.gif', 'image/gif'))).toBe(false);
  });
});
