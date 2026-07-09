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
import type { Layer } from '../../src/types/layer';
import { BaseSelectionTool } from '../../src/tools/selection/base-selection-tool';
import { LassoTool } from '../../src/tools/selection/lasso-tool';

class TestImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

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
    this.height = height ?? dataOrWidth.length / 4 / widthOrHeight;
  }
}

function opaqueImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 3; index < data.length; index += 4) {
    data[index] = 255;
  }
  return new TestImageData(data, width, height) as unknown as ImageData;
}

function canvasContext(): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    getImageData: vi.fn(
      (_x: number, _y: number, width: number, height: number) =>
        opaqueImageData(width, height)
    ),
    putImageData: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function layerCanvas(width = 8, height = 8): HTMLCanvasElement {
  const context = canvasContext();
  return {
    width,
    height,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
}

function imageLayer(id: string, canvas: HTMLCanvasElement): Layer {
  return {
    id,
    name: id,
    type: 'image',
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    parentId: null,
    canvas,
  };
}

class TestSelectionTool extends BaseSelectionTool {
  name = 'test-selection';
  cursor = 'default';

  onDrag() {}
  onUp() {}

  cutSelectionToFloat() {
    this.cutToFloat();
  }
}

const createdContexts: ProjectContext[] = [];

function createContext(): ProjectContext {
  const context = createProjectContext();
  createdContexts.push(context);
  return context;
}

describe('selection tools active project context', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('ImageData', TestImageData);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => canvasContext()
    );
  });

  afterEach(() => {
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('cuts through the initiating project layer, history, selection, and command context', () => {
    const projectA = createContext();
    const projectB = createContext();
    const canvas = layerCanvas();
    const layer = imageLayer('layer-a', canvas);
    projectA.layers.layers.value = [layer];
    projectA.layers.activeLayerId.value = layer.id;
    projectA.selection.setSelected(
      { x: 0, y: 0, width: 2, height: 2 },
      'rectangle'
    );
    projectB.selection.setSelected(
      { x: 4, y: 4, width: 2, height: 2 },
      'rectangle'
    );
    const projectBState = projectB.selection.state.value;
    const defaultState = defaultProjectContext.selection.state.value;
    const projectAHistory = vi.spyOn(projectA.history, 'execute');
    const projectBHistory = vi.spyOn(projectB.history, 'execute');
    const defaultHistory = vi.spyOn(defaultProjectContext.history, 'execute');

    const tool = new TestSelectionTool();
    tool.setProjectContext(projectA);
    tool.cutSelectionToFloat();

    expect(projectAHistory).toHaveBeenCalledOnce();
    expect(projectA.selection.state.value.type).toBe('floating');
    expect(projectBHistory).not.toHaveBeenCalled();
    expect(defaultHistory).not.toHaveBeenCalled();
    expect(projectB.selection.state.value).toEqual(projectBState);
    expect(defaultProjectContext.selection.state.value).toEqual(defaultState);
  });

  it('clips lasso geometry to the initiating project dimensions only', () => {
    const projectA = createContext();
    const projectB = createContext();
    projectA.project.width.value = 3;
    projectA.project.height.value = 3;
    projectB.project.width.value = 12;
    projectB.project.height.value = 12;
    projectB.selection.setSelected(
      { x: 8, y: 8, width: 2, height: 2 },
      'rectangle'
    );
    const projectBState = projectB.selection.state.value;
    const defaultState = defaultProjectContext.selection.state.value;

    const tool = new LassoTool();
    tool.setProjectContext(projectA);
    tool.onDown(0, 0);
    tool.onDrag(5, 0);
    tool.onDrag(0, 5);
    tool.onUp(0, 5);

    const state = projectA.selection.state.value;
    expect(state.type).toBe('selected');
    if (state.type !== 'selected') throw new Error('Expected selected state');
    expect(state.bounds).toEqual({ x: 0, y: 0, width: 3, height: 3 });
    expect(projectB.selection.state.value).toEqual(projectBState);
    expect(defaultProjectContext.selection.state.value).toEqual(defaultState);
  });
});
