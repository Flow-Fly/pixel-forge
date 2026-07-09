import { beforeEach, describe, expect, it, vi } from 'vitest';

// happy-dom has neither IndexedDB nor canvas encoding — mock the boundaries.
vi.mock('../../src/services/persistence/indexed-db', () => ({
  projectRepository: {
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    getLastOpenedProjectId: vi.fn(async () => null),
    setLastOpenedProjectId: vi.fn(async () => {}),
    getWorkspaceState: vi.fn(async () => null),
    setWorkspaceState: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/utils/canvas-binary', () => ({
  canvasToPngBytes: vi.fn(async () => new Uint8Array([1])),
  loadImageDataToCanvas: vi.fn(async () => {}),
}));

import { DeletePaletteColorCommand } from '../../src/commands/palette-command';
import { animationStore } from '../../src/stores/animation';
import { historyStore } from '../../src/stores/history';
import { paletteStore } from '../../src/stores/palette';
import type { Cel } from '../../src/types/animation';

const palette = ['#000000', '#111111', '#ffffff'];

class FakeCanvasContext {
  readonly canvas: HTMLCanvasElement;
  private pixels: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
    this.canvas = {
      width,
      height,
      getContext: () => this,
    } as unknown as HTMLCanvasElement;
  }

  createImageData(width: number, height: number): ImageData {
    return {
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    } as ImageData;
  }

  getImageData(_x: number, _y: number, width: number, height: number): ImageData {
    return {
      data: new Uint8ClampedArray(this.pixels),
      width,
      height,
    } as ImageData;
  }

  putImageData(imageData: ImageData) {
    this.pixels = new Uint8ClampedArray(imageData.data);
  }
}

function makeCanvas(pixelCount: number): HTMLCanvasElement {
  return new FakeCanvasContext(pixelCount, 1).canvas;
}

function setIndexedCels(buffers: Record<string, Uint8Array>) {
  const cels = new Map<string, Cel>();

  for (const [key, indexBuffer] of Object.entries(buffers)) {
    const [layerId, frameId] = key.split(':');
    cels.set(key, {
      id: `cel-${key}`,
      layerId,
      frameId,
      canvas: makeCanvas(indexBuffer.length),
      indexBuffer,
    });
  }

  animationStore.cels.value = cels;
}

function getBuffer(key: string): number[] {
  const buffer = animationStore.cels.value.get(key)?.indexBuffer;
  return buffer ? Array.from(buffer) : [];
}

function expectNoStaleIndices() {
  const maxIndex = paletteStore.mainColors.value.length;

  for (const cel of animationStore.cels.value.values()) {
    if (!cel.indexBuffer) continue;

    for (const index of cel.indexBuffer) {
      expect(index).toBeLessThanOrEqual(maxIndex);
    }
  }
}

function expectIndexUnused(index: number) {
  expect(animationStore.scanPaletteIndexUsage(index).pixelCount).toBe(0);
}

beforeEach(() => {
  historyStore.clear();
  paletteStore.clearAllNewFlags();
  paletteStore.setPalette([...palette]);
  setIndexedCels({
    'layer-a:frame-a': new Uint8Array([0]),
  });
});

describe('DeletePaletteColorCommand', () => {
  it('reports where a palette index is used', () => {
    setIndexedCels({
      'layer-a:frame-a': new Uint8Array([2, 2, 0]),
      'layer-a:frame-b': new Uint8Array([1, 2, 3]),
    });

    const usage = animationStore.scanPaletteIndexUsage(2);

    expect(usage.pixelCount).toBe(3);
    expect(usage.celCount).toBe(2);
    expect(usage.frameIds).toEqual(['frame-a', 'frame-b']);
    expect(usage.celKeys).toEqual(['layer-a:frame-a', 'layer-a:frame-b']);
  });

  it('deletes an unused color and shifts later palette indices', async () => {
    setIndexedCels({
      'layer-a:frame-a': new Uint8Array([1, 3, 0, 3]),
    });

    await historyStore.execute(new DeletePaletteColorCommand(2, 'transparent'));

    expect(paletteStore.mainColors.value).toEqual(['#000000', '#ffffff']);
    expect(getBuffer('layer-a:frame-a')).toEqual([1, 2, 0, 2]);
    expectNoStaleIndices();
  });

  it('replaces a used color with the nearest remaining palette color', async () => {
    setIndexedCels({
      'layer-a:frame-a': new Uint8Array([2, 3, 1, 0]),
    });

    await historyStore.execute(new DeletePaletteColorCommand(2, 'nearest'));

    expect(paletteStore.mainColors.value).toEqual(['#000000', '#ffffff']);
    expect(getBuffer('layer-a:frame-a')).toEqual([1, 2, 1, 0]);
    expectNoStaleIndices();
  });

  it('replaces a used color with transparency', async () => {
    setIndexedCels({
      'layer-a:frame-a': new Uint8Array([2, 3, 2, 1]),
    });

    await historyStore.execute(new DeletePaletteColorCommand(2, 'transparent'));

    expect(paletteStore.mainColors.value).toEqual(['#000000', '#ffffff']);
    expect(getBuffer('layer-a:frame-a')).toEqual([0, 2, 0, 1]);
    expectNoStaleIndices();
  });

  it('undo restores the exact palette, flags, and index buffers', async () => {
    setIndexedCels({
      'layer-a:frame-a': new Uint8Array([2, 3, 2, 1]),
    });
    paletteStore.newColorFlags.value = new Set(['#111111']);
    const beforeColors = [...paletteStore.mainColors.value];
    const beforeFlags = new Set(paletteStore.newColorFlags.value);
    const beforeBuffer = getBuffer('layer-a:frame-a');

    await historyStore.execute(new DeletePaletteColorCommand(2, 'transparent'));
    await historyStore.undo();

    expect(paletteStore.mainColors.value).toEqual(beforeColors);
    expect(paletteStore.newColorFlags.value).toEqual(beforeFlags);
    expect(getBuffer('layer-a:frame-a')).toEqual(beforeBuffer);
  });

  it('clears stale palette indices during delete remap', async () => {
    setIndexedCels({
      'layer-a:frame-a': new Uint8Array([4, 3, 2, 0]),
    });

    await historyStore.execute(new DeletePaletteColorCommand(2, 'transparent'));

    expect(getBuffer('layer-a:frame-a')).toEqual([0, 2, 0, 0]);
    expectIndexUnused(3);
    expectIndexUnused(4);
    expectNoStaleIndices();
  });
});
