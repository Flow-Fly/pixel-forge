import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// happy-dom has neither IndexedDB nor canvas encoding. Keep those boundaries out
// of these focused drawing-tool tests.
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

vi.mock('../../src/services/persistence/brush-persistence', () => ({
  brushPersistence: {
    getAllBrushes: vi.fn(async () => []),
    saveBrush: vi.fn(async () => {}),
    deleteBrush: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/utils/canvas-binary', () => ({
  canvasToPngBytes: vi.fn(async () => new Uint8Array([1])),
  loadImageDataToCanvas: vi.fn(async () => {}),
}));

import { StrokeSession } from '../../src/tools/stroke-session';
import { PencilTool } from '../../src/tools/pencil-tool';
import { EraserTool } from '../../src/tools/eraser-tool';
import { brushStore } from '../../src/stores/brush';
import { colorStore } from '../../src/stores/colors';
import { paletteStore } from '../../src/stores/palette';
import { eraserSettings, toolSizes } from '../../src/stores/tool-settings';
import { getIndexBufferPixel } from '../../src/utils/indexed-color';
import {
  createProjectContext,
  defaultProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';

type Rgba = [number, number, number, number];

const width = 4;
const height = 4;
const frameId = 'frame-restore';
const layerId = 'layer-restore';
const celId = 'cel-restore';
const red: Rgba = [255, 0, 0, 255];
const green: Rgba = [0, 255, 0, 255];
const transparent: Rgba = [0, 0, 0, 0];
const createdContexts: ProjectContext[] = [];

class FakeCanvasContext {
  readonly canvas: HTMLCanvasElement;
  fillStyle = '#000000';
  globalAlpha = 1;

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

  getImageData(x: number, y: number, width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const source = this.offset(x + px, y + py);
        const target = (py * width + px) * 4;

        if (source === null) continue;

        data[target] = this.pixels[source];
        data[target + 1] = this.pixels[source + 1];
        data[target + 2] = this.pixels[source + 2];
        data[target + 3] = this.pixels[source + 3];
      }
    }

    return { data, width, height } as ImageData;
  }

  createImageData(width: number, height: number): ImageData {
    return {
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    } as ImageData;
  }

  putImageData(imageData: ImageData, x: number, y: number) {
    for (let py = 0; py < imageData.height; py++) {
      for (let px = 0; px < imageData.width; px++) {
        const source = (py * imageData.width + px) * 4;
        this.setPixel(x + px, y + py, [
          imageData.data[source],
          imageData.data[source + 1],
          imageData.data[source + 2],
          imageData.data[source + 3],
        ]);
      }
    }
  }

  clearRect(x: number, y: number, width: number, height: number) {
    this.fillPixels(x, y, width, height, transparent);
  }

  fillRect(x: number, y: number, width: number, height: number) {
    this.fillPixels(x, y, width, height, parseColor(this.fillStyle, this.globalAlpha));
  }

  setPixel(x: number, y: number, color: Rgba) {
    const index = this.offset(x, y);
    if (index === null) return;

    this.pixels[index] = color[0];
    this.pixels[index + 1] = color[1];
    this.pixels[index + 2] = color[2];
    this.pixels[index + 3] = color[3];
  }

  getPixel(x: number, y: number): Rgba {
    const index = this.offset(x, y);
    if (index === null) return transparent;

    return [
      this.pixels[index],
      this.pixels[index + 1],
      this.pixels[index + 2],
      this.pixels[index + 3],
    ];
  }

  private fillPixels(x: number, y: number, width: number, height: number, color: Rgba) {
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        this.setPixel(x + px, y + py, color);
      }
    }
  }

  private offset(x: number, y: number): number | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return null;
    }

    return (y * this.width + x) * 4;
  }
}

function parseColor(style: string, globalAlpha: number): Rgba {
  const hex = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(style);
  if (hex) {
    return [
      parseInt(hex[1], 16),
      parseInt(hex[2], 16),
      parseInt(hex[3], 16),
      Math.round(255 * globalAlpha),
    ];
  }

  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([.\d]+)\)$/i.exec(style);
  if (rgba) {
    return [
      Number(rgba[1]),
      Number(rgba[2]),
      Number(rgba[3]),
      Math.round(255 * Number(rgba[4]) * globalAlpha),
    ];
  }

  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i.exec(style);
  if (rgb) {
    return [
      Number(rgb[1]),
      Number(rgb[2]),
      Number(rgb[3]),
      Math.round(255 * globalAlpha),
    ];
  }

  throw new Error(`Unsupported fake canvas color: ${style}`);
}

function asContext(context: FakeCanvasContext): CanvasRenderingContext2D {
  return context as unknown as CanvasRenderingContext2D;
}

function pixelIndex(x: number, y: number): number {
  return y * width + x;
}

function setupDrawingState(projectContext = defaultProjectContext) {
  const { animation, colors, guides, layers, palette, project } = projectContext;

  animation.cels.value = new Map();
  palette.clearAllNewFlags();
  palette.setPalette(['#ff0000', '#00ff00', '#ffffff']);
  project.setSize(width, height);
  guides.clearAllGuides();
  toolSizes.pencil.value = 1;
  toolSizes.eraser.value = 1;
  eraserSettings.mode.value = 'transparent';
  colors.primaryColor.value = '#00ff00';
  colors.secondaryColor.value = '#ffffff';
  brushStore.activeBrush.value = {
    ...brushStore.builtinBrushes[0],
    opacity: 1,
    pixelPerfect: true,
    spacing: 1,
  };

  const context = new FakeCanvasContext(width, height);
  const indexBuffer = new Uint8Array(width * height);

  layers.layers.value = [
    {
      id: layerId,
      name: 'Test Layer',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 255,
      blendMode: 'normal',
      parentId: null,
      canvas: context.canvas,
    },
  ];
  layers.activeLayerId.value = layerId;

  animation.frames.value = [{ id: frameId, order: 0, duration: 100 }];
  animation.currentFrameId.value = frameId;
  animation.cels.value = new Map([
    [
      `${layerId}:${frameId}`,
      {
        id: celId,
        layerId,
        frameId,
        canvas: context.canvas,
        indexBuffer,
      },
    ],
  ]);

  return { context, indexBuffer, projectContext };
}

beforeEach(() => {
  setupDrawingState();
});

afterEach(() => {
  for (const context of createdContexts.splice(0)) {
    context.dispose();
  }
});

describe('StrokeSession', () => {
  it('restores an opaque snapshot pixel and its palette index', () => {
    const { context, indexBuffer } = setupDrawingState();
    const redIndex = paletteStore.getColorIndex('#ff0000');
    const greenIndex = paletteStore.getColorIndex('#00ff00');

    context.setPixel(1, 1, red);
    indexBuffer[pixelIndex(1, 1)] = redIndex;

    const session = new StrokeSession();
    session.begin(asContext(context), defaultProjectContext);

    context.setPixel(1, 1, green);
    indexBuffer[pixelIndex(1, 1)] = greenIndex;

    expect(session.restorePixel(asContext(context), 1, 1)).toBe(true);
    expect(context.getPixel(1, 1)).toEqual(red);
    expect(getIndexBufferPixel(indexBuffer, width, 1, 1)).toBe(redIndex);
  });

  it('restores a transparent snapshot pixel and clears its palette index', () => {
    const { context, indexBuffer } = setupDrawingState();
    const greenIndex = paletteStore.getColorIndex('#00ff00');

    const session = new StrokeSession();
    session.begin(asContext(context), defaultProjectContext);

    context.setPixel(2, 1, green);
    indexBuffer[pixelIndex(2, 1)] = greenIndex;

    expect(session.restorePixel(asContext(context), 2, 1)).toBe(true);
    expect(context.getPixel(2, 1)).toEqual(transparent);
    expect(getIndexBufferPixel(indexBuffer, width, 2, 1)).toBe(0);
  });

  it('reports that a pixel cannot be restored before a snapshot starts', () => {
    const { context } = setupDrawingState();
    const session = new StrokeSession();

    expect(session.restorePixel(asContext(context), 1, 1)).toBe(false);
  });
});

describe('drawing tools pixel-perfect restore', () => {
  it('draws with the initiating project color and palette index', () => {
    const projectA = createProjectContext();
    createdContexts.push(projectA);
    const { context: contextA, indexBuffer: indexBufferA } = setupDrawingState(projectA);
    const { context: contextB, indexBuffer: indexBufferB } = setupDrawingState();
    const defaultPaletteBefore = [...paletteStore.mainColors.value];
    const defaultDirtyRect = vi.spyOn(defaultProjectContext.dirtyRect, 'markDirty');
    const projectDirtyRect = vi.spyOn(projectA.dirtyRect, 'markDirty');

    projectA.colors.primaryColor.value = '#123456';
    colorStore.primaryColor.value = '#abcdef';

    const tool = new PencilTool(asContext(contextA));
    tool.setProjectContext(projectA);
    tool.onDown(1, 1);
    tool.onUp(1, 1);

    const paletteIndexA = projectA.palette.getColorIndex('#123456');
    expect(contextA.getPixel(1, 1)).toEqual([18, 52, 86, 255]);
    expect(paletteIndexA).toBeGreaterThan(0);
    expect(getIndexBufferPixel(indexBufferA, width, 1, 1)).toBe(paletteIndexA);
    expect(projectA.palette.mainColors.value).toContain('#123456');
    expect(paletteStore.mainColors.value).toEqual(defaultPaletteBefore);
    expect(projectDirtyRect).toHaveBeenCalled();
    expect(defaultDirtyRect).not.toHaveBeenCalled();

    tool.setContext(asContext(contextB));
    tool.setProjectContext(defaultProjectContext);
    tool.onDown(2, 2);

    const paletteIndexB = paletteStore.getColorIndex('#abcdef');
    expect(contextB.getPixel(2, 2)).toEqual([171, 205, 239, 255]);
    expect(paletteIndexB).toBeGreaterThan(0);
    expect(getIndexBufferPixel(indexBufferB, width, 2, 2)).toBe(paletteIndexB);
    expect(projectA.palette.mainColors.value).not.toContain('#abcdef');
  });

  it('erases to the initiating project background color', () => {
    const projectA = createProjectContext();
    createdContexts.push(projectA);
    const { context, indexBuffer } = setupDrawingState(projectA);
    const defaultPaletteBefore = [...paletteStore.mainColors.value];

    projectA.colors.secondaryColor.value = '#654321';
    colorStore.secondaryColor.value = '#abcdef';

    const tool = new EraserTool(asContext(context));
    tool.setProjectContext(projectA);
    tool.onDown(1, 1, { shift: false, ctrl: false, alt: false, button: 2 });

    const paletteIndex = projectA.palette.getColorIndex('#654321');
    expect(context.getPixel(1, 1)).toEqual([101, 67, 33, 255]);
    expect(paletteIndex).toBeGreaterThan(0);
    expect(getIndexBufferPixel(indexBuffer, width, 1, 1)).toBe(paletteIndex);
    expect(paletteStore.mainColors.value).toEqual(defaultPaletteBefore);
  });

  it('pencil restores an L-corner stamp to its pre-stroke pixel and palette index', () => {
    const { context, indexBuffer } = setupDrawingState();
    const redIndex = paletteStore.getColorIndex('#ff0000');
    const greenIndex = paletteStore.getColorIndex('#00ff00');

    context.setPixel(1, 0, red);
    indexBuffer[pixelIndex(1, 0)] = redIndex;

    const tool = new PencilTool(asContext(context));
    tool.onDown(0, 0);
    tool.onDrag(1, 0);
    tool.onDrag(1, 1);

    expect(context.getPixel(1, 0)).toEqual(red);
    expect(getIndexBufferPixel(indexBuffer, width, 1, 0)).toBe(redIndex);
    expect(context.getPixel(0, 0)).toEqual(green);
    expect(context.getPixel(1, 1)).toEqual(green);
    expect(getIndexBufferPixel(indexBuffer, width, 1, 1)).toBe(greenIndex);
  });

  it('eraser restores an L-corner pixel to its pre-stroke pixel and palette index', () => {
    const { context, indexBuffer } = setupDrawingState();
    const redIndex = paletteStore.getColorIndex('#ff0000');

    context.setPixel(1, 0, red);
    indexBuffer[pixelIndex(1, 0)] = redIndex;

    const tool = new EraserTool(asContext(context));
    tool.onDown(0, 0);
    tool.onDrag(1, 0);
    tool.onDrag(1, 1);

    expect(context.getPixel(1, 0)).toEqual(red);
    expect(getIndexBufferPixel(indexBuffer, width, 1, 0)).toBe(redIndex);
    expect(context.getPixel(0, 0)).toEqual(transparent);
    expect(context.getPixel(1, 1)).toEqual(transparent);
    expect(getIndexBufferPixel(indexBuffer, width, 1, 1)).toBe(0);
  });
});
