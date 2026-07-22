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
import { FillTool } from '../../src/tools/fill-tool';
import { analyzeGuidedDrawingProgress } from '../../src/services/paint-by-number/guided-progress';
import type { Cel } from '../../src/types/animation';
import { GUIDED_DRAWING_VERSION } from '../../src/types/guided-drawing';
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
        data.set(this.pixels.subarray(source, source + 4), target);
      }
    }

    return { data, width, height } as ImageData;
  });
  readonly putImageData = vi.fn((imageData: ImageData, x: number, y: number) => {
    for (let py = 0; py < imageData.height; py++) {
      for (let px = 0; px < imageData.width; px++) {
        const source = (py * imageData.width + px) * 4;
        const target = this.offset(x + px, y + py);
        this.pixels.set(imageData.data.subarray(source, source + 4), target);
      }
    }
  });

  private readonly pixels: Uint8ClampedArray;

  constructor(readonly width: number, readonly height: number) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
    this.canvas = {
      width,
      height,
      getContext: () => this,
    } as unknown as HTMLCanvasElement;
  }

  getPixel(x: number, y: number): Rgba {
    const index = this.offset(x, y);
    return [...this.pixels.subarray(index, index + 4)] as Rgba;
  }

  private offset(x: number, y: number): number {
    return (y * this.width + x) * 4;
  }
}

const createdContexts: ProjectContext[] = [];

function createContext(): ProjectContext {
  const context = createProjectContext();
  createdContexts.push(context);
  return context;
}

function installDrawingState(
  context: ProjectContext,
  canvas: HTMLCanvasElement,
  layerId: string,
  indexBuffer: Uint8Array
) {
  const frameId = `frame-${layerId}`;
  const layer: Layer = {
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
    indexBuffer,
  };

  context.layers.layers.value = [layer];
  context.layers.activeLayerId.value = layerId;
  context.animation.currentFrameId.value = frameId;
  context.animation.cels.value = new Map([
    [context.animation.getCelKey(layerId, frameId), cel],
  ]);
}

describe('FillTool active project context', () => {
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

  it('reads and writes only the initiating project stores', () => {
    const projectA = createContext();
    const projectB = createContext();
    const canvasA = new FakeCanvasContext(2, 2);
    const canvasB = new FakeCanvasContext(2, 2);
    const indexBufferA = new Uint8Array(4);
    const indexBufferB = Uint8Array.from([1, 1, 1, 1]);
    installDrawingState(projectA, canvasA.canvas, 'layer-a', indexBufferA);
    installDrawingState(projectB, canvasB.canvas, 'layer-b', indexBufferB);

    projectA.colors.setPrimaryColor('#123456');
    projectB.colors.setPrimaryColor('#abcdef');
    projectA.palette.mainColors.value = ['#000000'];
    projectA.palette.rebuildColorMap();
    projectB.palette.mainColors.value = ['#abcdef'];
    projectB.palette.rebuildColorMap();
    const projectBPalette = [...projectB.palette.mainColors.value];
    const defaultPalette = [...defaultProjectContext.palette.mainColors.value];
    const projectADirty = vi.spyOn(projectA.dirtyRect, 'markDirty');
    const projectBDirty = vi.spyOn(projectB.dirtyRect, 'markDirty');
    const defaultDirty = vi.spyOn(defaultProjectContext.dirtyRect, 'markDirty');

    const tool = new FillTool();
    tool.setContext(canvasA as unknown as CanvasRenderingContext2D);
    tool.setProjectContext(projectA);
    tool.onDown(0, 0);

    const paletteIndex = projectA.palette.getColorIndex('#123456');
    expect(paletteIndex).toBeGreaterThan(0);
    expect([...indexBufferA]).toEqual([paletteIndex, paletteIndex, paletteIndex, paletteIndex]);
    expect([...indexBufferB]).toEqual([1, 1, 1, 1]);
    expect(projectA.palette.mainColors.value).toContain('#123456');
    expect(projectB.palette.mainColors.value).toEqual(projectBPalette);
    expect(defaultProjectContext.palette.mainColors.value).toEqual(defaultPalette);
    expect(canvasA.getPixel(0, 0)).toEqual([18, 52, 86, 255]);
    expect(canvasA.getPixel(1, 1)).toEqual([18, 52, 86, 255]);
    expect(canvasB.getPixel(0, 0)).toEqual([0, 0, 0, 0]);
    expect(projectADirty).toHaveBeenCalled();
    expect(projectBDirty).not.toHaveBeenCalled();
    expect(defaultDirty).not.toHaveBeenCalled();
  });

  it('fills only the connected numbered region in a guided project', () => {
    const project = createContext();
    const canvas = new FakeCanvasContext(3, 1);
    const indexBuffer = new Uint8Array(3);
    installDrawingState(project, canvas.canvas, 'guided-layer', indexBuffer);
    project.guidedDrawing.start({
      version: GUIDED_DRAWING_VERSION,
      width: 3,
      height: 1,
      target: Uint8Array.from([1, 1, 2]),
      settings: {
        longSide: 3,
        paletteSource: 'generated',
        maxColors: 2,
        mapping: 'color',
        simplifyIsolatedPixels: false,
      },
      createdAt: 1,
    });
    project.colors.setPrimaryColor('#123456');

    const tool = new FillTool();
    tool.setContext(canvas as unknown as CanvasRenderingContext2D);
    tool.setProjectContext(project);
    tool.onDown(0, 0);

    const paletteIndex = project.palette.getColorIndex('#123456');
    expect([...indexBuffer]).toEqual([paletteIndex, paletteIndex, 0]);
    expect(canvas.getPixel(0, 0)).toEqual([18, 52, 86, 255]);
    expect(canvas.getPixel(1, 0)).toEqual([18, 52, 86, 255]);
    expect(canvas.getPixel(2, 0)).toEqual([0, 0, 0, 0]);

    const pixels = canvas.getImageData(0, 0, 3, 1).data;
    expect(analyzeGuidedDrawingProgress(
      project.guidedDrawing.session.value!.target,
      pixels,
    ).covered).toBe(2);
  });
});
