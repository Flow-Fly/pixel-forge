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
import { HandTool } from '../../src/tools/hand-tool';
import { ZoomTool } from '../../src/tools/zoom-tool';

const createdContexts: ProjectContext[] = [];

function createContext(): ProjectContext {
  const context = createProjectContext();
  createdContexts.push(context);
  return context;
}

function canvasContext(): CanvasRenderingContext2D {
  return {
    canvas: {
      style: { cursor: '' },
    },
  } as unknown as CanvasRenderingContext2D;
}

function viewportState(context: ProjectContext) {
  return {
    zoom: context.viewport.zoom.value,
    panX: context.viewport.panX.value,
    panY: context.viewport.panY.value,
  };
}

describe('hand and zoom active project context', () => {
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

  it('pans only the initiating project viewport', () => {
    const projectA = createContext();
    const projectB = createContext();
    projectA.viewport.zoom.value = 2;
    projectA.viewport.setPan(10, 20);
    projectB.viewport.zoom.value = 4;
    projectB.viewport.setPan(30, 40);
    const projectBState = viewportState(projectB);
    const defaultState = viewportState(defaultProjectContext);

    const tool = new HandTool();
    tool.setContext(canvasContext());
    tool.setProjectContext(projectA);
    tool.onDown(1, 1);
    tool.onDrag(3, 4);
    tool.onUp(3, 4);

    expect(viewportState(projectA)).toEqual({ zoom: 2, panX: 14, panY: 26 });
    expect(viewportState(projectB)).toEqual(projectBState);
    expect(viewportState(defaultProjectContext)).toEqual(defaultState);
  });

  it('zooms only the initiating project viewport around its own screen point', () => {
    const projectA = createContext();
    const projectB = createContext();
    projectA.viewport.zoom.value = 1;
    projectA.viewport.setPan(10, 20);
    projectA.viewport.containerWidth.value = 500;
    projectA.viewport.containerHeight.value = 500;
    projectB.viewport.zoom.value = 4;
    projectB.viewport.setPan(30, 40);
    const projectBState = viewportState(projectB);
    const defaultState = viewportState(defaultProjectContext);
    const zoomInAt = vi.spyOn(projectA.viewport, 'zoomInAt');

    const tool = new ZoomTool();
    tool.setContext(canvasContext());
    tool.setProjectContext(projectA);
    tool.onDown(1, 1);

    expect(zoomInAt).toHaveBeenCalledWith(11, 21);
    expect(projectA.viewport.zoom.value).toBe(2);
    expect(viewportState(projectB)).toEqual(projectBState);
    expect(viewportState(defaultProjectContext)).toEqual(defaultState);
  });
});
