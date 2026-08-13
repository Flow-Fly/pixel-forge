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
import { shapeSettings } from '../../src/stores/tool-settings';
import { GradientTool } from '../../src/tools/gradient-tool';
import { RectangleTool } from '../../src/tools/shape-tool';

class FakeCanvasContext {
  readonly canvas = {
    width: 4,
    height: 4,
  } as HTMLCanvasElement;
  readonly colorStops = vi.fn();
  readonly createLinearGradient = vi.fn(() => ({
    addColorStop: this.colorStops,
  }));
  private pixels = new Uint8ClampedArray(4 * 4 * 4);
  readonly getImageData = vi.fn(() => ({
    data: new Uint8ClampedArray(this.pixels),
    width: 4,
    height: 4,
  }) as ImageData);
  readonly putImageData = vi.fn((imageData: ImageData) => {
    this.pixels = new Uint8ClampedArray(imageData.data);
  });
  readonly fillColors: string[] = [];
  readonly fillRect = vi.fn(() => {
    this.fillColors.push(String(this.fillStyle));
  });
  fillStyle: string | CanvasGradient | CanvasPattern = '';
}

const createdContexts: ProjectContext[] = [];
let originalShapeFill: boolean;
let originalShapeFillColor: 'foreground' | 'background';

function createContext(primary: string, secondary: string): ProjectContext {
  const context = createProjectContext();
  context.colors.setPrimaryColor(primary);
  context.colors.setSecondaryColor(secondary);
  createdContexts.push(context);
  return context;
}

function stubPreviewCanvas(): { canvas: HTMLCanvasElement; context: FakeCanvasContext } {
  const context = new FakeCanvasContext();
  const canvas = {
    width: 4,
    height: 4,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) =>
    tagName === 'canvas' ? canvas : createElement(tagName)
  );
  return { canvas, context };
}

describe('gradient and shape active project context', () => {
  beforeEach(() => {
    localStorage.clear();
    originalShapeFill = shapeSettings.fill.value;
    originalShapeFillColor = shapeSettings.fillColor.value;
  });

  afterEach(() => {
    shapeSettings.fill.value = originalShapeFill;
    shapeSettings.fillColor.value = originalShapeFillColor;
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('draws a gradient with colors from the initiating project', async () => {
    const projectA = createContext('#123456', '#654321');
    const projectB = createContext('#abcdef', '#fedcba');
    projectA.palette.mainColors.value = ['#123456', '#654321'];
    projectA.palette.rebuildColorMap();
    const defaultColors = {
      primary: defaultProjectContext.colors.primaryColor.value,
      secondary: defaultProjectContext.colors.secondaryColor.value,
    };
    const canvas = new FakeCanvasContext();
    const preview = stubPreviewCanvas();
    const presentPreview = vi.fn();
    const tool = new GradientTool();
    tool.setContext(canvas as unknown as CanvasRenderingContext2D);
    tool.setProjectContext(projectA);
    tool.setPreviewPresenter(presentPreview);

    tool.onDown(0, 0);
    tool.onUp(3, 3);

    expect(canvas.colorStops).not.toHaveBeenCalled();
    expect(canvas.putImageData).not.toHaveBeenCalled();
    expect(preview.context.putImageData).toHaveBeenCalled();
    await Promise.resolve();
    expect(presentPreview).toHaveBeenLastCalledWith(null);
    expect(projectB.colors.primaryColor.value).toBe('#abcdef');
    expect(projectB.colors.secondaryColor.value).toBe('#fedcba');
    expect(defaultProjectContext.colors.primaryColor.value).toBe(defaultColors.primary);
    expect(defaultProjectContext.colors.secondaryColor.value).toBe(defaultColors.secondary);
  });

  it('clears the presented Gradient preview when a gesture is cancelled', () => {
    const project = createContext('#123456', '#654321');
    project.palette.mainColors.value = ['#123456', '#654321'];
    project.palette.rebuildColorMap();
    const canvas = new FakeCanvasContext();
    const preview = stubPreviewCanvas();
    const presentPreview = vi.fn();
    const layerId = project.layers.activeLayerId.value;
    const frameId = project.animation.currentFrameId.value;
    if (!layerId) throw new Error('Expected an active layer');
    const celKey = project.animation.getCelKey(layerId, frameId);
    const cel = project.animation.cels.value.get(celKey);
    if (!cel) throw new Error('Expected an active cel');
    project.animation.cels.value = new Map([
      [celKey, { ...cel, canvas: canvas.canvas }],
    ]);
    const tool = new GradientTool();
    tool.setContext(canvas as unknown as CanvasRenderingContext2D);
    tool.setProjectContext(project);
    tool.setPreviewPresenter(presentPreview);

    tool.onDown(0, 0);
    tool.onDrag(3, 3);
    const previewCalls = preview.context.putImageData.mock.calls.length;
    tool.onCancel();

    expect(preview.context.putImageData).toHaveBeenCalledTimes(previewCalls);
    expect(presentPreview).toHaveBeenLastCalledWith(null);
    expect(project.project.revision.value).toBe(0);
    expect(project.history.undoStack.value).toHaveLength(0);
  });

  it('fills a shape with the initiating project background color', () => {
    const projectA = createContext('#112233', '#445566');
    const projectB = createContext('#aabbcc', '#ddeeff');
    const canvas = new FakeCanvasContext();
    shapeSettings.fill.value = true;
    shapeSettings.fillColor.value = 'background';

    const tool = new RectangleTool();
    tool.setContext(canvas as unknown as CanvasRenderingContext2D);
    tool.setProjectContext(projectA);
    tool.onDown(0, 0);
    tool.onUp(2, 2);

    expect(canvas.fillColors).toContain('#445566');
    expect(projectA.colors.primaryColor.value).toBe('#112233');
    expect(projectA.colors.secondaryColor.value).toBe('#445566');
    expect(projectB.colors.primaryColor.value).toBe('#aabbcc');
    expect(projectB.colors.secondaryColor.value).toBe('#ddeeff');
  });
});
