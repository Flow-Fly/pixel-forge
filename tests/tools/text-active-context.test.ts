import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

import '../../src/components/canvas/pf-text-input';
import type { PfTextInput } from '../../src/components/canvas/pf-text-input';
import {
  createProjectContext,
  defaultProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';
import { TextTool } from '../../src/tools/text-tool';

const createdContexts: ProjectContext[] = [];

function createContext(): ProjectContext {
  const context = createProjectContext();
  createdContexts.push(context);
  return context;
}

function installCanvasMock() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({
          data: new Uint8ClampedArray(4),
          width: 1,
          height: 1,
        })),
        putImageData: vi.fn(),
      }) as unknown as CanvasRenderingContext2D
  );
}

function resetEditingState() {
  TextTool.editingState.value = {
    isEditing: false,
    layerId: null,
    celKey: null,
    cursorPosition: 0,
    cursorVisible: true,
  };
}

describe('TextTool active project context', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    installCanvasMock();
    resetEditingState();
  });

  afterEach(() => {
    document.body.replaceChildren();
    restoreDefaultProjectContext();
    resetEditingState();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps create, input, and commit bound to the initiating project after a switch', async () => {
    const projectA = createContext();
    const projectB = createContext();
    projectA.project.width.value = 20;
    projectA.project.height.value = 30;
    projectA.colors.setPrimaryColor('#123456');
    projectB.colors.setPrimaryColor('#abcdef');
    const projectALayerCount = projectA.layers.layers.value.length;
    const projectBLayerCount = projectB.layers.layers.value.length;
    const defaultLayerCount = defaultProjectContext.layers.layers.value.length;
    const inputComponent = document.createElement('pf-text-input') as PfTextInput;
    document.body.append(inputComponent);
    await inputComponent.updateComplete;

    const tool = new TextTool();
    tool.setProjectContext(projectA);
    tool.onDown(5, 6);

    const layerId = TextTool.editingState.value.layerId;
    expect(layerId).toBeTruthy();
    const layer = projectA.layers.layers.value.find((candidate) => candidate.id === layerId);
    expect(layer?.type).toBe('text');
    expect(layer?.textData?.color).toBe('#123456');
    expect(layer?.canvas?.width).toBe(20);
    expect(layer?.canvas?.height).toBe(30);

    setActiveProjectContext(projectB);
    const input = inputComponent.shadowRoot?.querySelector('input');
    expect(input).toBeTruthy();
    input!.value = 'hello';
    input!.dispatchEvent(new Event('input'));

    const frameId = projectA.animation.currentFrameId.value;
    expect(projectA.animation.getTextCelData(layerId!, frameId)?.content).toBe('hello');
    expect(projectB.layers.layers.value).toHaveLength(projectBLayerCount);
    expect(defaultProjectContext.layers.layers.value).toHaveLength(defaultLayerCount);

    input!.value = '';
    input!.dispatchEvent(new Event('input'));
    window.dispatchEvent(new CustomEvent('text-tool:commit'));

    expect(projectA.layers.layers.value).toHaveLength(projectALayerCount);
    expect(projectB.layers.layers.value).toHaveLength(projectBLayerCount);
    expect(defaultProjectContext.layers.layers.value).toHaveLength(defaultLayerCount);
  });

  it('moves text through the initiating project animation and history stores', () => {
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
    const projectBState = new Map(projectB.animation.cels.value);
    const defaultState = new Map(defaultProjectContext.animation.cels.value);
    const projectAHistory = vi.spyOn(projectA.history, 'execute');
    const projectBHistory = vi.spyOn(projectB.history, 'execute');

    const tool = new TextTool();
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
