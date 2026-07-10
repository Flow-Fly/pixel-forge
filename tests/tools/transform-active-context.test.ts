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
import { TransformTool } from '../../src/tools/transform-tool';

const createdContexts: ProjectContext[] = [];

function createContext(): ProjectContext {
  const context = createProjectContext();
  createdContexts.push(context);
  return context;
}

function imageData(width = 2, height = 2): ImageData {
  return {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData;
}

function installCanvasMock() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => imageData(1, 1)),
        putImageData: vi.fn(),
      }) as unknown as CanvasRenderingContext2D
  );
}

describe('TransformTool active project context', () => {
  beforeEach(() => {
    localStorage.clear();
    installCanvasMock();
  });

  afterEach(() => {
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('moves floating selection state only in the initiating project', () => {
    const projectA = createContext();
    const projectB = createContext();
    projectA.selection.setFloating(
      imageData(),
      { x: 0, y: 0, width: 2, height: 2 },
      'rectangle'
    );
    projectB.selection.setFloating(
      imageData(),
      { x: 5, y: 5, width: 2, height: 2 },
      'rectangle'
    );
    const projectBState = projectB.selection.state.value;
    const defaultState = defaultProjectContext.selection.state.value;

    const tool = new TransformTool();
    tool.setProjectContext(projectA);
    tool.onDown(0, 0);
    tool.onDrag(2, 3);

    const state = projectA.selection.state.value;
    expect(state.type).toBe('floating');
    if (state.type !== 'floating') throw new Error('Expected floating state');
    expect(state.currentOffset).toEqual({ x: 2, y: 3 });
    expect(projectB.selection.state.value).toEqual(projectBState);
    expect(defaultProjectContext.selection.state.value).toEqual(defaultState);
  });

  it('moves text through the initiating project animation, layers, and history', () => {
    const projectA = createContext();
    const projectB = createContext();
    const frameId = projectA.animation.currentFrameId.value;
    const layer = projectA.layers.addTextLayer({
      font: 'basic',
      color: '#123456',
    });
    projectA.animation.setTextCelData(layer.id, frameId, {
      content: 'A',
      x: 0,
      y: 0,
    });
    projectA.layers.setActiveLayer(layer.id);
    const projectBState = new Map(projectB.animation.cels.value);
    const defaultState = new Map(defaultProjectContext.animation.cels.value);
    const projectAHistory = vi.spyOn(projectA.history, 'execute');
    const projectBHistory = vi.spyOn(projectB.history, 'execute');

    const tool = new TransformTool();
    tool.setProjectContext(projectA);
    tool.onDown(0, 0);
    tool.onDrag(2, 3);
    tool.onUp(2, 3);

    expect(projectAHistory).toHaveBeenCalledOnce();
    expect(projectA.animation.getTextCelData(layer.id, frameId)).toMatchObject({
      x: 2,
      y: 3,
    });
    expect(projectBHistory).not.toHaveBeenCalled();
    expect(projectB.animation.cels.value).toEqual(projectBState);
    expect(defaultProjectContext.animation.cels.value).toEqual(defaultState);
  });
});
