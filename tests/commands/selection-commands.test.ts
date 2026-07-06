import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/persistence/indexed-db', () => ({
  projectRepository: {
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    getLastOpenedProjectId: vi.fn(async () => null),
    setLastOpenedProjectId: vi.fn(async () => {}),
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

import {
  CutToFloatCommand,
  DeleteSelectionCommand,
  FillSelectionCommand,
} from '../../src/commands/selection-commands';
import { trimTransparentPixels } from '../../src/commands/selection/image-data';
import { maskPixelsOutsideSelection } from '../../src/commands/selection/pixels';
import { selectionStore } from '../../src/stores/selection';
import { type Rect } from '../../src/types/geometry';

class FakeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(width: number, height: number);
  constructor(data: Uint8ClampedArray, width: number, height: number);
  constructor(
    dataOrWidth: Uint8ClampedArray | number,
    widthOrHeight: number,
    height?: number
  ) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      return;
    }

    this.data = dataOrWidth;
    this.width = widthOrHeight;
    this.height = height ?? 0;
  }
}

vi.stubGlobal('ImageData', FakeImageData);

function rgbaIndex(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}

function setPixel(
  imageData: ImageData,
  x: number,
  y: number,
  [r, g, b, a]: [number, number, number, number]
) {
  const index = rgbaIndex(imageData.width, x, y);
  imageData.data[index] = r;
  imageData.data[index + 1] = g;
  imageData.data[index + 2] = b;
  imageData.data[index + 3] = a;
}

function readPixel(
  imageData: ImageData,
  x: number,
  y: number
): [number, number, number, number] {
  const index = rgbaIndex(imageData.width, x, y);

  return [
    imageData.data[index],
    imageData.data[index + 1],
    imageData.data[index + 2],
    imageData.data[index + 3],
  ];
}

function makeCanvas(width: number, height: number) {
  const buffer = new Uint8ClampedArray(width * height * 4);

  const getImageData = (x: number, y: number, regionWidth: number, regionHeight: number) => {
    const region = new ImageData(regionWidth, regionHeight);

    for (let py = 0; py < regionHeight; py++) {
      for (let px = 0; px < regionWidth; px++) {
        const sourceIndex = rgbaIndex(width, x + px, y + py);
        const targetIndex = rgbaIndex(regionWidth, px, py);
        region.data[targetIndex] = buffer[sourceIndex];
        region.data[targetIndex + 1] = buffer[sourceIndex + 1];
        region.data[targetIndex + 2] = buffer[sourceIndex + 2];
        region.data[targetIndex + 3] = buffer[sourceIndex + 3];
      }
    }

    return region;
  };

  const putImageData = (imageData: ImageData, x: number, y: number) => {
    for (let py = 0; py < imageData.height; py++) {
      for (let px = 0; px < imageData.width; px++) {
        const sourceIndex = rgbaIndex(imageData.width, px, py);
        const targetIndex = rgbaIndex(width, x + px, y + py);
        buffer[targetIndex] = imageData.data[sourceIndex];
        buffer[targetIndex + 1] = imageData.data[sourceIndex + 1];
        buffer[targetIndex + 2] = imageData.data[sourceIndex + 2];
        buffer[targetIndex + 3] = imageData.data[sourceIndex + 3];
      }
    }
  };

  const clearRect = (x: number, y: number, regionWidth: number, regionHeight: number) => {
    for (let py = 0; py < regionHeight; py++) {
      for (let px = 0; px < regionWidth; px++) {
        const index = rgbaIndex(width, x + px, y + py);
        buffer[index] = 0;
        buffer[index + 1] = 0;
        buffer[index + 2] = 0;
        buffer[index + 3] = 0;
      }
    }
  };

  const context = { getImageData, putImageData, clearRect };
  const canvas = {
    width,
    height,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    getImageData: () => getImageData(0, 0, width, height),
    setPixel: (x: number, y: number, color: [number, number, number, number]) => {
      const imageData = getImageData(0, 0, width, height);
      setPixel(imageData, x, y, color);
      putImageData(imageData, 0, 0);
    },
  };
}

describe('selection image helpers', () => {
  it('trims transparent image data and carries the matching mask region', () => {
    const imageData = new ImageData(4, 3);
    setPixel(imageData, 1, 1, [10, 20, 30, 255]);
    setPixel(imageData, 2, 1, [40, 50, 60, 255]);

    const mask = new Uint8Array(12);
    mask[1 * 4 + 1] = 255;
    mask[1 * 4 + 2] = 128;

    const result = trimTransparentPixels(imageData, mask);

    expect(result?.offset).toEqual({ x: 1, y: 1 });
    expect(result?.imageData.width).toBe(2);
    expect(result?.imageData.height).toBe(1);
    expect(readPixel(result!.imageData, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(readPixel(result!.imageData, 1, 0)).toEqual([40, 50, 60, 255]);
    expect(Array.from(result!.mask!)).toEqual([255, 128]);
  });

  it('returns null when every pixel is transparent', () => {
    expect(trimTransparentPixels(new ImageData(2, 2))).toBeNull();
  });

  it('makes pixels outside a freeform mask transparent', () => {
    const imageData = new ImageData(3, 1);
    setPixel(imageData, 0, 0, [1, 1, 1, 255]);
    setPixel(imageData, 1, 0, [2, 2, 2, 255]);
    setPixel(imageData, 2, 0, [3, 3, 3, 255]);

    maskPixelsOutsideSelection(imageData, 'freeform', Uint8Array.from([255, 0, 255]));

    expect(readPixel(imageData, 0, 0)).toEqual([1, 1, 1, 255]);
    expect(readPixel(imageData, 1, 0)).toEqual([2, 2, 2, 0]);
    expect(readPixel(imageData, 2, 0)).toEqual([3, 3, 3, 255]);
  });
});

describe('selection commands', () => {
  beforeEach(() => {
    selectionStore.clear();
  });

  afterEach(() => {
    selectionStore.clear();
  });

  it('fills only freeform-mask pixels and restores them on undo', () => {
    const { canvas, getImageData, setPixel: setCanvasPixel } = makeCanvas(3, 2);
    const bounds: Rect = { x: 0, y: 0, width: 3, height: 2 };
    const mask = Uint8Array.from([255, 0, 0, 0, 255, 0]);
    setCanvasPixel(1, 0, [9, 9, 9, 255]);

    selectionStore.setSelected(bounds, 'freeform', mask);
    const command = new FillSelectionCommand(canvas, bounds, 'freeform', '#336699', mask);

    command.execute();
    let imageData = getImageData();

    expect(readPixel(imageData, 0, 0)).toEqual([51, 102, 153, 255]);
    expect(readPixel(imageData, 1, 0)).toEqual([9, 9, 9, 255]);
    expect(readPixel(imageData, 1, 1)).toEqual([51, 102, 153, 255]);
    expect(selectionStore.state.value.type).toBe('none');

    command.undo();
    imageData = getImageData();

    expect(readPixel(imageData, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(readPixel(imageData, 1, 0)).toEqual([9, 9, 9, 255]);
    expect(readPixel(imageData, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(selectionStore.state.value.type).toBe('selected');
  });

  it('deletes only ellipse pixels and restores the selection on undo', () => {
    const { canvas, getImageData, setPixel: setCanvasPixel } = makeCanvas(4, 4);
    const bounds: Rect = { x: 0, y: 0, width: 4, height: 4 };

    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        setCanvasPixel(x, y, [1, 2, 3, 255]);
      }
    }

    selectionStore.setSelected(bounds, 'ellipse');
    const command = new DeleteSelectionCommand(canvas, bounds, 'ellipse');

    command.execute();
    let imageData = getImageData();

    expect(readPixel(imageData, 0, 0)).toEqual([1, 2, 3, 255]);
    expect(readPixel(imageData, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(selectionStore.state.value.type).toBe('none');

    command.undo();
    imageData = getImageData();

    expect(readPixel(imageData, 1, 1)).toEqual([1, 2, 3, 255]);
    expect(selectionStore.state.value.type).toBe('selected');
  });

  it('cuts selected freeform pixels into a trimmed floating selection', () => {
    const { canvas, getImageData, setPixel: setCanvasPixel } = makeCanvas(5, 4);
    const bounds: Rect = { x: 1, y: 1, width: 3, height: 2 };
    const mask = Uint8Array.from([0, 255, 0, 0, 0, 255]);
    setCanvasPixel(3, 2, [90, 80, 70, 255]);

    const command = new CutToFloatCommand(canvas, 'layer-1', bounds, 'freeform', mask);

    command.execute();

    const canvasPixels = getImageData();
    expect(readPixel(canvasPixels, 3, 2)).toEqual([0, 0, 0, 0]);

    const state = selectionStore.state.value;
    expect(state.type).toBe('floating');
    if (state.type !== 'floating') return;

    expect(state.originalBounds).toEqual({ x: 3, y: 2, width: 1, height: 1 });
    expect(state.imageData.width).toBe(1);
    expect(state.imageData.height).toBe(1);
    expect(readPixel(state.imageData, 0, 0)).toEqual([90, 80, 70, 255]);
    expect(Array.from(state.mask!)).toEqual([255]);
  });
});
