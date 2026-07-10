import { afterEach, describe, expect, it, vi } from 'vitest';

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

class FakeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(width: number, height: number);
  constructor(data: Uint8ClampedArray, width: number, height: number);
  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
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

import { CommitIndexedFloatCommand } from '../../src/commands/selection-commands';
import { createClipboardIndexPasteRegionPlan } from '../../src/services/clipboard-index-paste-region';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';
import type { Rect } from '../../src/types/geometry';

const WIDTH = 4;
const HEIGHT = 4;
const FRAME_ID = 'frame-1';

interface TestCanvas {
  canvas: HTMLCanvasElement;
  getPixel(x: number, y: number): number[];
  setPixel(x: number, y: number, color: number[]): void;
}

interface IndexedContext {
  context: ProjectContext;
  layerId: string;
  indexBuffer: Uint8Array;
  canvas: TestCanvas;
}

const createdContexts: ProjectContext[] = [];

function rgbaIndex(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function makeImageData(width: number, height: number, pixels: number[][]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);

  pixels.forEach((pixel, pixelIndex) => {
    const offset = pixelIndex * 4;
    data[offset] = pixel[0];
    data[offset + 1] = pixel[1];
    data[offset + 2] = pixel[2];
    data[offset + 3] = pixel[3];
  });

  return new ImageData(data, width, height);
}

function makeCanvas(width: number, height: number): TestCanvas {
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

  const createImageData = (regionWidth: number, regionHeight: number) =>
    new ImageData(regionWidth, regionHeight);

  const canvas = {
    width,
    height,
    getContext: () => ({ createImageData, getImageData, putImageData }),
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    getPixel(x: number, y: number) {
      const offset = rgbaIndex(width, x, y);
      return Array.from(buffer.slice(offset, offset + 4));
    },
    setPixel(x: number, y: number, color: number[]) {
      const offset = rgbaIndex(width, x, y);
      buffer[offset] = color[0];
      buffer[offset + 1] = color[1];
      buffer[offset + 2] = color[2];
      buffer[offset + 3] = color[3];
    },
  };
}

function createIndexedContext(initialIndex = 1): IndexedContext {
  const context = createProjectContext();
  createdContexts.push(context);

  const canvas = makeCanvas(WIDTH, HEIGHT);
  const layer = context.layers.layers.value[0];
  const layerId = layer.id;
  const indexBuffer = new Uint8Array(WIDTH * HEIGHT).fill(initialIndex);

  context.layers.updateLayer(layerId, { canvas: canvas.canvas });
  context.layers.activeLayerId.value = layerId;
  context.animation.currentFrameId.value = FRAME_ID;
  context.animation.cels.value = new Map([
    [
      `${layerId}:${FRAME_ID}`,
      {
        id: `${layerId}:${FRAME_ID}`,
        layerId,
        frameId: FRAME_ID,
        canvas: canvas.canvas,
        indexBuffer,
      },
    ],
  ]);

  return { context, layerId, indexBuffer, canvas };
}

function fillCanvas(canvas: TestCanvas, color: number[]): void {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      canvas.setPixel(x, y, color);
    }
  }
}

function regionValues(indexBuffer: Uint8Array, bounds: Rect): number[] {
  const values: number[] = [];

  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      values.push(indexBuffer[y * WIDTH + x]);
    }
  }

  return values;
}

function makeCommand(target: IndexedContext) {
  const destinationBounds: Rect = { x: 1, y: 1, width: 2, height: 2 };
  const paletteBeforeCommit = {
    colors: [...target.context.palette.mainColors.value],
    newColorFlags: new Set(target.context.palette.newColorFlags.value),
  };

  target.context.palette.addColor('#ff0000', { flagNew: true });

  const indexRegionPlan = createClipboardIndexPasteRegionPlan({
    sourceIndexData: Uint8Array.from([2, 0, 0, 2]),
    targetIndexBuffer: target.indexBuffer,
    targetWidth: WIDTH,
    destinationBounds,
  });

  const imageData = makeImageData(2, 2, [
    [255, 0, 0, 255],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [255, 0, 0, 255],
  ]);

  const command = new CommitIndexedFloatCommand(
    target.canvas.canvas,
    imageData,
    destinationBounds,
    { x: 0, y: 0 },
    'rectangle',
    {
      layerId: target.layerId,
      frameId: FRAME_ID,
      canvasWidth: WIDTH,
      indexRegionPlan,
      paletteBeforeCommit,
    },
    target.context
  );

  return { command, destinationBounds };
}

describe('CommitIndexedFloatCommand', () => {
  afterEach(() => {
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
  });

  it('restores palette state, index buffer data, pixels, and floating state on undo and redo', () => {
    const target = createIndexedContext();
    target.context.palette.setPalette(['#00ff00']);
    target.context.palette.clearAllNewFlags();
    fillCanvas(target.canvas, [0, 255, 0, 255]);

    const { command, destinationBounds } = makeCommand(target);

    command.execute();

    expect(target.context.selection.state.value.type).toBe('none');
    expect(target.context.palette.mainColors.value).toEqual(['#00ff00', '#ff0000']);
    expect(target.context.palette.isNewColor('#ff0000')).toBe(true);
    expect(regionValues(target.indexBuffer, destinationBounds)).toEqual([2, 1, 1, 2]);
    expect(target.canvas.getPixel(1, 1)).toEqual([255, 0, 0, 255]);
    expect(target.canvas.getPixel(2, 1)).toEqual([0, 255, 0, 255]);

    command.undo();

    const state = target.context.selection.state.value;
    expect(state.type).toBe('floating');
    expect(target.context.palette.mainColors.value).toEqual(['#00ff00']);
    expect(target.context.palette.newColorFlags.value.size).toBe(0);
    expect(regionValues(target.indexBuffer, destinationBounds)).toEqual([1, 1, 1, 1]);
    expect(target.canvas.getPixel(1, 1)).toEqual([0, 255, 0, 255]);
    expect(target.canvas.getPixel(2, 2)).toEqual([0, 255, 0, 255]);

    command.execute();

    expect(target.context.selection.state.value.type).toBe('none');
    expect(target.context.palette.mainColors.value).toEqual(['#00ff00', '#ff0000']);
    expect(target.context.palette.isNewColor('#ff0000')).toBe(true);
    expect(regionValues(target.indexBuffer, destinationBounds)).toEqual([2, 1, 1, 2]);
    expect(target.canvas.getPixel(1, 1)).toEqual([255, 0, 0, 255]);
    expect(target.canvas.getPixel(2, 2)).toEqual([255, 0, 0, 255]);
  });

  it('uses the target context captured at creation time', () => {
    const target = createIndexedContext();
    const other = createIndexedContext(3);
    target.context.palette.setPalette(['#00ff00']);
    other.context.palette.setPalette(['#123456']);
    fillCanvas(target.canvas, [0, 255, 0, 255]);
    fillCanvas(other.canvas, [18, 52, 86, 255]);

    const { command, destinationBounds } = makeCommand(target);

    setActiveProjectContext(other.context);
    command.execute();

    expect(target.context.palette.mainColors.value).toEqual(['#00ff00', '#ff0000']);
    expect(other.context.palette.mainColors.value).toEqual(['#123456']);
    expect(regionValues(target.indexBuffer, destinationBounds)).toEqual([2, 1, 1, 2]);
    expect(regionValues(other.indexBuffer, destinationBounds)).toEqual([3, 3, 3, 3]);
    expect(target.canvas.getPixel(1, 1)).toEqual([255, 0, 0, 255]);
    expect(other.canvas.getPixel(1, 1)).toEqual([18, 52, 86, 255]);
  });
});
