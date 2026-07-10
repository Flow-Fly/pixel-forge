import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// happy-dom has neither IndexedDB nor canvas encoding. Keep persistence out of
// these focused tool-boundary tests.
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

import { FillTool } from '../../src/tools/fill-tool';
import { EyedropperTool } from '../../src/tools/eyedropper-tool';
import { animationStore } from '../../src/stores/animation';
import { colorStore } from '../../src/stores/colors';
import { layerStore } from '../../src/stores/layers';
import { paletteStore } from '../../src/stores/palette';
import type { Cel } from '../../src/types/animation';
import type { Layer } from '../../src/types/layer';

type Rgba = [number, number, number, number];

class FakeCanvasContext {
  readonly canvas: HTMLCanvasElement;
  readonly getImageData = vi.fn((x: number, y: number, width: number, height: number) => {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const source = this.offset(x + px, y + py);
        const target = (py * width + px) * 4;
        data[target] = this.pixels[source];
        data[target + 1] = this.pixels[source + 1];
        data[target + 2] = this.pixels[source + 2];
        data[target + 3] = this.pixels[source + 3];
      }
    }

    return { data, width, height } as ImageData;
  });
  readonly putImageData = vi.fn((imageData: ImageData, x: number, y: number) => {
    for (let py = 0; py < imageData.height; py++) {
      for (let px = 0; px < imageData.width; px++) {
        const source = (py * imageData.width + px) * 4;
        const target = this.offset(x + px, y + py);
        this.pixels[target] = imageData.data[source];
        this.pixels[target + 1] = imageData.data[source + 1];
        this.pixels[target + 2] = imageData.data[source + 2];
        this.pixels[target + 3] = imageData.data[source + 3];
      }
    }
  });

  private readonly pixels: Uint8ClampedArray;

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

  setPixel(x: number, y: number, color: Rgba) {
    const index = this.offset(x, y);
    this.pixels[index] = color[0];
    this.pixels[index + 1] = color[1];
    this.pixels[index + 2] = color[2];
    this.pixels[index + 3] = color[3];
  }

  getPixel(x: number, y: number): Rgba {
    const index = this.offset(x, y);
    return [
      this.pixels[index],
      this.pixels[index + 1],
      this.pixels[index + 2],
      this.pixels[index + 3],
    ];
  }

  private offset(x: number, y: number): number {
    return (y * this.width + x) * 4;
  }
}

function layer(overrides: Partial<Layer>): Layer {
  return {
    id: 'layer',
    name: 'Layer',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    parentId: null,
    ...overrides,
  };
}

function installActiveLayer(activeLayer: Layer, cel?: Cel) {
  layerStore.layers.value = [activeLayer];
  layerStore.activeLayerId.value = activeLayer.id;
  animationStore.currentFrameId.value = 'frame-1';
  animationStore.cels.value = cel
    ? new Map([[animationStore.getCelKey(activeLayer.id, 'frame-1'), cel]])
    : new Map();
}

describe('reference sampling guards', () => {
  let originalLayers: Layer[];
  let originalActiveLayerId: string | null;
  let originalFrameId: string;
  let originalCels: Map<string, Cel>;
  let originalPrimaryColor: string;
  let originalPalette: string[];

  beforeEach(() => {
    originalLayers = layerStore.layers.value;
    originalActiveLayerId = layerStore.activeLayerId.value;
    originalFrameId = animationStore.currentFrameId.value;
    originalCels = animationStore.cels.value;
    originalPrimaryColor = colorStore.primaryColor.value;
    originalPalette = paletteStore.mainColors.value;

    paletteStore.clearAllNewFlags();
    paletteStore.setPalette(['#ff0000', '#00ff00']);
    colorStore.setPrimaryColor('#000000');
  });

  afterEach(() => {
    layerStore.layers.value = originalLayers;
    layerStore.activeLayerId.value = originalActiveLayerId;
    animationStore.currentFrameId.value = originalFrameId;
    animationStore.cels.value = originalCels;
    paletteStore.setPalette(originalPalette);
    paletteStore.clearAllNewFlags();
    colorStore.setPrimaryColor(originalPrimaryColor);
    vi.restoreAllMocks();
  });

  it('does not pick colors from an active reference layer', () => {
    const context = new FakeCanvasContext(1, 1);
    context.setPixel(0, 0, [255, 0, 0, 255]);
    installActiveLayer(layer({
      id: 'reference-layer',
      type: 'reference',
      opacity: 128,
      canvas: context.canvas,
      referenceData: {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/png',
        x: 0,
        y: 0,
        scale: 1,
      },
    }));

    new EyedropperTool(context as unknown as CanvasRenderingContext2D).onDown(0, 0);

    expect(colorStore.primaryColor.value).toBe('#000000');
    expect(context.getImageData).not.toHaveBeenCalled();
  });

  it('still picks colors from paintable indexed layers', () => {
    const context = new FakeCanvasContext(1, 1);
    context.setPixel(0, 0, [255, 0, 0, 255]);
    const activeLayer = layer({
      id: 'artwork-layer',
      canvas: context.canvas,
    });
    installActiveLayer(activeLayer, {
      id: 'cel-1',
      layerId: activeLayer.id,
      frameId: 'frame-1',
      canvas: context.canvas,
      indexBuffer: Uint8Array.from([2]),
    });

    new EyedropperTool(context as unknown as CanvasRenderingContext2D).onDown(0, 0);

    expect(colorStore.primaryColor.value).toBe('#00ff00');
    expect(context.getImageData).not.toHaveBeenCalled();
  });

  it('does not flood fill an active reference layer', () => {
    const context = new FakeCanvasContext(2, 2);
    context.setPixel(0, 0, [255, 0, 0, 255]);
    installActiveLayer(layer({
      id: 'reference-layer',
      type: 'reference',
      opacity: 128,
      canvas: context.canvas,
      referenceData: {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/png',
        x: 0,
        y: 0,
        scale: 1,
      },
    }));
    colorStore.setPrimaryColor('#00ff00');

    const tool = new FillTool();
    tool.setContext(context as unknown as CanvasRenderingContext2D);
    tool.onDown(0, 0);

    expect(context.getImageData).not.toHaveBeenCalled();
    expect(context.putImageData).not.toHaveBeenCalled();
    expect(context.getPixel(0, 0)).toEqual([255, 0, 0, 255]);
  });
});
