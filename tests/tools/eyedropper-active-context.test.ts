import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

import {
  createProjectContext,
  defaultProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';
import { EyedropperTool } from '../../src/tools/eyedropper-tool';
import type { Cel } from '../../src/types/animation';
import type { Layer } from '../../src/types/layer';

class FakeCanvasContext {
  readonly canvas = {
    width: 1,
    height: 1,
  } as HTMLCanvasElement;

  readonly getImageData = vi.fn(() => ({
    data: Uint8ClampedArray.from(this.fallbackColor),
    width: 1,
    height: 1,
  }) as ImageData);

  constructor(private readonly fallbackColor: [number, number, number, number]) {}
}

const createdContexts: ProjectContext[] = [];

function createContext(): ProjectContext {
  const context = createProjectContext();
  createdContexts.push(context);
  return context;
}

function installIndexedColor(
  context: ProjectContext,
  canvas: HTMLCanvasElement,
  layerId: string,
  color: string
) {
  const frameId = `frame-${layerId}`;
  const activeLayer: Layer = {
    id: layerId,
    name: layerId,
    type: 'image',
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    parentId: null,
    canvas,
  };
  const cel: Cel = {
    id: `cel-${layerId}`,
    layerId,
    frameId,
    canvas,
    indexBuffer: Uint8Array.from([1]),
  };

  context.layers.layers.value = [activeLayer];
  context.layers.activeLayerId.value = layerId;
  context.animation.currentFrameId.value = frameId;
  context.animation.cels.value = new Map([
    [context.animation.getCelKey(layerId, frameId), cel],
  ]);
  context.palette.mainColors.value = [color];
  context.palette.rebuildColorMap();
}

function installCanvasFallbackLayer(
  context: ProjectContext,
  canvas: HTMLCanvasElement,
  layerId: string
) {
  context.layers.layers.value = [{
    id: layerId,
    name: layerId,
    type: 'image',
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    parentId: null,
    canvas,
  }];
  context.layers.activeLayerId.value = layerId;
  context.animation.cels.value = new Map();
}

describe('EyedropperTool active project context', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads indexed color from the initiating project and writes only its primary color', () => {
    const projectA = createContext();
    const projectB = createContext();
    const canvasContext = new FakeCanvasContext([255, 0, 0, 255]);
    installIndexedColor(projectA, canvasContext.canvas, 'layer-a', '#123456');
    installIndexedColor(projectB, canvasContext.canvas, 'layer-b', '#abcdef');

    projectA.colors.setPrimaryColor('#000000');
    projectB.colors.setPrimaryColor('#222222');
    const defaultPrimaryColor = defaultProjectContext.colors.primaryColor.value;
    const updateProjectALightness = vi.spyOn(
      projectA.colors,
      'updateLightnessVariations'
    );
    const updateProjectBLightness = vi.spyOn(
      projectB.colors,
      'updateLightnessVariations'
    );

    const tool = new EyedropperTool(
      canvasContext as unknown as CanvasRenderingContext2D
    );
    tool.setProjectContext(projectA);
    tool.onDown(0, 0);

    expect(projectA.colors.primaryColor.value).toBe('#123456');
    expect(updateProjectALightness).toHaveBeenCalledWith('#123456');
    expect(updateProjectBLightness).not.toHaveBeenCalled();
    expect(projectB.colors.primaryColor.value).toBe('#222222');
    expect(defaultProjectContext.colors.primaryColor.value).toBe(defaultPrimaryColor);
    expect(canvasContext.getImageData).not.toHaveBeenCalled();
  });

  it('writes a canvas fallback pick only to the initiating project secondary color', () => {
    const projectA = createContext();
    const projectB = createContext();
    const canvasContext = new FakeCanvasContext([171, 205, 239, 255]);
    installCanvasFallbackLayer(projectA, canvasContext.canvas, 'layer-a');
    installCanvasFallbackLayer(projectB, canvasContext.canvas, 'layer-b');

    projectA.colors.setPrimaryColor('#111111');
    projectA.colors.setSecondaryColor('#222222');
    projectB.colors.setSecondaryColor('#333333');
    const defaultSecondaryColor = defaultProjectContext.colors.secondaryColor.value;

    const tool = new EyedropperTool(
      canvasContext as unknown as CanvasRenderingContext2D
    );
    tool.setProjectContext(projectA);
    tool.onDown(0, 0, {
      shift: false,
      ctrl: false,
      alt: false,
      button: 2,
    });

    expect(projectA.colors.primaryColor.value).toBe('#111111');
    expect(projectA.colors.secondaryColor.value).toBe('#abcdef');
    expect(projectB.colors.secondaryColor.value).toBe('#333333');
    expect(defaultProjectContext.colors.secondaryColor.value).toBe(defaultSecondaryColor);
    expect(canvasContext.getImageData).toHaveBeenCalledWith(0, 0, 1, 1);
  });
});
