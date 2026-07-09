import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectContext } from '../../../src/stores/project-context';
import type { Layer } from '../../../src/types/layer';
import type { ReferenceLayerData } from '../../../src/types/reference';

interface RendererInstance {
  options: {
    requestRedraw: () => void;
  };
  render: ReturnType<typeof vi.fn>;
}

const rendererMock = vi.hoisted(() => {
  const instances: RendererInstance[] = [];
  const ReferenceViewportRenderer = vi.fn().mockImplementation(function (options) {
    const instance: RendererInstance = {
      options,
      render: vi.fn(),
    };
    instances.push(instance);
    return instance;
  });

  return { instances, ReferenceViewportRenderer };
});

vi.mock('../../../src/services/reference-viewport-renderer', () => ({
  ReferenceViewportRenderer: rendererMock.ReferenceViewportRenderer,
}));

function referenceData(overrides: Partial<ReferenceLayerData> = {}): ReferenceLayerData {
  return {
    bytes: Uint8Array.from([1, 2, 3]),
    mimeType: 'image/png',
    x: 4,
    y: 8,
    scale: 2,
    ...overrides,
  };
}

function referenceLayer(
  id: string,
  referenceOverrides: Partial<ReferenceLayerData> = {},
  layerOverrides: Partial<Layer> = {}
): Layer {
  return {
    id,
    name: id,
    type: 'reference',
    visible: true,
    locked: false,
    opacity: 128,
    blendMode: 'normal',
    parentId: null,
    referenceData: referenceData(referenceOverrides),
    ...layerOverrides,
  };
}

function createCanvasContext(): CanvasRenderingContext2D {
  return new Proxy(
    { imageSmoothingEnabled: false },
    {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        return vi.fn();
      },
      set(target, key, value) {
        (target as Record<PropertyKey, unknown>)[key] = value;
        return true;
      },
    }
  ) as unknown as CanvasRenderingContext2D;
}

function createContext(layers: Layer[]): ProjectContext {
  return {
    animation: {
      cels: { value: new Map() },
      currentFrameId: { value: 'frame-1' },
      frames: { value: [] },
      getCelKey: vi.fn((layerId: string, frameId: string) => `${layerId}:${frameId}`),
      onionSkin: {
        value: {
          enabled: false,
          nextFrames: 0,
          opacityStep: 0,
          prevFrames: 0,
          tint: false,
        },
      },
    },
    dirtyRect: {
      consumeFullRedraw: vi.fn(() => true),
      consumePendingDirty: vi.fn(() => null),
      requestFullRedraw: vi.fn(),
    },
    layers: {
      layers: { value: layers },
    },
  } as unknown as ProjectContext;
}

async function createDrawingCanvas() {
  await import('../../../src/components/canvas/pf-drawing-canvas');

  const element = document.createElement('pf-drawing-canvas') as HTMLElement & {
    renderCanvas: (context: ProjectContext) => void;
  };
  (element as any).ctx = createCanvasContext();
  return element;
}

describe('pf-drawing-canvas reference rendering', () => {
  beforeEach(() => {
    rendererMock.instances.length = 0;
    rendererMock.ReferenceViewportRenderer.mockClear();
  });

  it('renders below and above reference entries around artwork rendering', async () => {
    const element = await createDrawingCanvas();
    const context = createContext([
      referenceLayer('below-reference'),
      referenceLayer('above-reference', { position: 'above' }),
    ]);

    element.renderCanvas(context);

    const renderer = rendererMock.instances[0];
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.render.mock.calls[0][1].map((entry) => entry.layerId)).toEqual([
      'below-reference',
    ]);
    expect(renderer.render.mock.calls[1][1].map((entry) => entry.layerId)).toEqual([
      'above-reference',
    ]);
    expect(context.dirtyRect.consumePendingDirty).toHaveBeenCalledOnce();
  });

  it('does not render hidden reference layers', async () => {
    const element = await createDrawingCanvas();
    const context = createContext([
      referenceLayer('hidden-reference', {}, { visible: false }),
    ]);

    element.renderCanvas(context);

    const renderer = rendererMock.instances[0];
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('requests a full redraw when a reference bitmap finishes loading', async () => {
    const element = await createDrawingCanvas();
    const context = createContext([]);
    (element as any).context = context;
    (element as any).scheduleCanvasRender = vi.fn();

    rendererMock.instances[0].options.requestRedraw();

    expect(context.dirtyRect.requestFullRedraw).toHaveBeenCalledOnce();
    expect((element as any).scheduleCanvasRender).toHaveBeenCalledWith(context);
  });
});
