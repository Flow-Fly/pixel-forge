import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  composeExportFrame,
  getExportableArtworkLayers,
} from '../../src/services/export-composition';
import type { Layer } from '../../src/types/layer';

interface RecordedDraw {
  image: HTMLCanvasElement;
  alpha: number;
}

interface FakeCanvasContext {
  canvas: HTMLCanvasElement;
  fillStyle: string;
  globalAlpha: number;
  imageSmoothingEnabled: boolean;
  draws: RecordedDraw[];
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
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

function createFakeContext(canvas: HTMLCanvasElement): FakeCanvasContext {
  const context: FakeCanvasContext = {
    canvas,
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    draws: [],
    fillRect: vi.fn(),
    drawImage: vi.fn((image: HTMLCanvasElement) => {
      context.draws.push({
        image,
        alpha: context.globalAlpha,
      });
    }),
    scale: vi.fn(),
  };

  return context;
}

function installCanvasContextMock() {
  const contexts = new WeakMap<HTMLCanvasElement, FakeCanvasContext>();

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function getContext() {
      let context = contexts.get(this);
      if (!context) {
        context = createFakeContext(this);
        contexts.set(this, context);
      }

      return context as unknown as CanvasRenderingContext2D;
    }
  );

  return {
    getContext(canvas: HTMLCanvasElement): FakeCanvasContext {
      const context = contexts.get(canvas);
      if (!context) throw new Error('No context recorded for canvas');
      return context;
    },
  };
}

function createCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

describe('export composition', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps reference layers out of the exportable artwork layer list', () => {
    const image = layer({ id: 'image-layer', type: 'image' });
    const text = layer({ id: 'text-layer', type: 'text' });
    const reference = layer({ id: 'reference-layer', type: 'reference' });

    expect(getExportableArtworkLayers([image, reference, text])).toEqual([
      image,
      text,
    ]);
  });

  it('composes visible artwork cels without reading visible reference layers', () => {
    const { getContext } = installCanvasContextMock();
    const imageCanvas = createCanvas();
    const textCanvas = createCanvas();
    const referenceCanvas = createCanvas();
    const getCelCanvas = vi.fn((frameId: string, layerId: string) => {
      expect(frameId).toBe('frame-1');
      return new Map([
        ['image-layer', imageCanvas],
        ['text-layer', textCanvas],
        ['reference-layer', referenceCanvas],
      ]).get(layerId);
    });

    const output = composeExportFrame({
      frameId: 'frame-1',
      width: 4,
      height: 3,
      scale: 2,
      layers: [
        layer({ id: 'image-layer', opacity: 255 }),
        layer({ id: 'reference-layer', type: 'reference', opacity: 128 }),
        layer({ id: 'hidden-layer', visible: false }),
        layer({ id: 'text-layer', type: 'text', opacity: 128 }),
      ],
      getCelCanvas,
      useBackground: true,
      backgroundColor: '#123456',
    });

    const context = getContext(output);

    expect(output.width).toBe(8);
    expect(output.height).toBe(6);
    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.fillStyle).toBe('#123456');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 8, 6);
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(getCelCanvas.mock.calls.map((call) => call[1])).toEqual([
      'image-layer',
      'text-layer',
    ]);
    expect(context.draws).toEqual([
      { image: imageCanvas, alpha: 1 },
      { image: textCanvas, alpha: 128 / 255 },
    ]);
    expect(context.globalAlpha).toBe(1);
  });

  it('exports the same artwork draw plan when a visible reference layer is present', () => {
    const { getContext } = installCanvasContextMock();
    const imageCanvas = createCanvas();
    const referenceCanvas = createCanvas();

    function drawPlan(layers: Layer[]) {
      const getCelCanvas = vi.fn((_: string, layerId: string) => {
        return layerId === 'reference-layer' ? referenceCanvas : imageCanvas;
      });
      const canvas = composeExportFrame({
        frameId: 'frame-1',
        width: 2,
        height: 2,
        scale: 1,
        layers,
        getCelCanvas,
      });

      return {
        drawImages: getContext(canvas).draws.map((draw) => draw.image),
        requestedLayerIds: getCelCanvas.mock.calls.map((call) => call[1]),
      };
    }

    const artwork = [layer({ id: 'image-layer' })];
    const withReference = [
      artwork[0],
      layer({ id: 'reference-layer', type: 'reference', visible: true }),
    ];

    expect(drawPlan(withReference)).toEqual(drawPlan(artwork));
  });
});
