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
  readonly getImageData = vi.fn(() => ({
    data: new Uint8ClampedArray(4 * 4 * 4),
    width: 4,
    height: 4,
  }) as ImageData);
  readonly putImageData = vi.fn();
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

  it('draws a gradient with colors from the initiating project', () => {
    const projectA = createContext('#123456', '#654321');
    const projectB = createContext('#abcdef', '#fedcba');
    const defaultColors = {
      primary: defaultProjectContext.colors.primaryColor.value,
      secondary: defaultProjectContext.colors.secondaryColor.value,
    };
    const canvas = new FakeCanvasContext();
    const tool = new GradientTool();
    tool.setContext(canvas as unknown as CanvasRenderingContext2D);
    tool.setProjectContext(projectA);

    tool.onDown(0, 0);
    tool.onUp(3, 3);

    expect(canvas.colorStops.mock.calls).toEqual([
      [0, '#123456'],
      [1, '#654321'],
    ]);
    expect(projectB.colors.primaryColor.value).toBe('#abcdef');
    expect(projectB.colors.secondaryColor.value).toBe('#fedcba');
    expect(defaultProjectContext.colors.primaryColor.value).toBe(defaultColors.primary);
    expect(defaultProjectContext.colors.secondaryColor.value).toBe(defaultColors.secondary);
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
