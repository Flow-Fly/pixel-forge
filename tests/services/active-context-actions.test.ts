import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { brushStore } from '../../src/stores/brush';
import { defaultProjectContext } from '../../src/stores/project-context';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';
import { toolStore } from '../../src/stores/tools';
import { canCaptureBrush, captureBrushAndAdd } from '../../src/services/brush-capture';

const createdContexts: ProjectContext[] = [];

function installCanvas(context: ProjectContext, rgba: number[]) {
  const layerId = crypto.randomUUID();
  const frameId = crypto.randomUUID();
  const imageData = {
    width: 1,
    height: 1,
    data: Uint8ClampedArray.from(rgba),
  } as ImageData;
  const canvas = {
    width: 1,
    height: 1,
    getContext: () => ({
      getImageData: () => ({
        width: 1,
        height: 1,
        data: new Uint8ClampedArray(imageData.data),
      }),
    }),
  } as unknown as HTMLCanvasElement;

  context.layers.layers.value = [
    {
      id: layerId,
      name: 'Active layer',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 255,
      blendMode: 'normal',
      parentId: null,
      canvas,
    },
  ];
  context.layers.activeLayerId.value = layerId;
  context.animation.frames.value = [{ id: frameId, duration: 100 }];
  context.animation.currentFrameId.value = frameId;
  context.animation.cels.value = new Map([
    [
      context.animation.getCelKey(layerId, frameId),
      { id: crypto.randomUUID(), layerId, frameId, canvas },
    ],
  ]);
}

function createContext(rgba: number[]): ProjectContext {
  const context = createProjectContext();
  installCanvas(context, rgba);
  createdContexts.push(context);
  return context;
}

describe('active-context tool and brush actions', () => {
  beforeEach(() => {
    defaultProjectContext.selection.clear();
    toolStore.setActiveTool('pencil');
  });

  afterEach(() => {
    restoreDefaultProjectContext();
    defaultProjectContext.selection.clear();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    vi.restoreAllMocks();
  });

  it('auto-selects transform pixels from the active project', () => {
    const activeContext = createContext([12, 34, 56, 255]);
    setActiveProjectContext(activeContext);

    toolStore.setActiveTool('transform');

    expect(activeContext.selection.state.value.type).toBe('selected');
    expect(defaultProjectContext.selection.state.value.type).toBe('none');
  });

  it('captures a brush from the active project selection', async () => {
    const activeContext = createContext([12, 34, 56, 255]);
    activeContext.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    setActiveProjectContext(activeContext);
    vi.spyOn(brushStore, 'addCustomBrush').mockResolvedValue();
    vi.spyOn(brushStore, 'setActiveBrush').mockImplementation(() => {});

    expect(canCaptureBrush()).toBe(true);
    const brush = await captureBrushAndAdd();

    expect(brush?.imageData?.data).toEqual([12, 34, 56, 255]);
  });
});
