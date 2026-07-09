import { describe, expect, it, vi } from 'vitest';
import type { ProjectContext } from '../../src/stores/project-context';
import { BaseTool, type ModifierKeys } from '../../src/tools/base-tool';
import { ToolController } from '../../src/tools/tool-controller';

class FakeTool extends BaseTool {
  name = 'pencil';
  cursor = 'test-cursor';
  onDown = vi.fn();
  onDrag = vi.fn();
  onUp = vi.fn();
  onMove = vi.fn();

  constructor(ctx: CanvasRenderingContext2D) {
    super();
    this.setContext(ctx);
    fakeToolInstances.push(this);
  }

  get activeProjectContext() {
    return this.projectContext;
  }
}

class TransformTool extends FakeTool {
  name = 'transform';
}

const fakeToolInstances: FakeTool[] = [];

function createContext() {
  return document.createElement('canvas').getContext('2d')!;
}

function createController() {
  fakeToolInstances.length = 0;

  return new ToolController(createContext(), {
    pencil: async () => FakeTool,
    transform: async () => TransformTool,
  });
}

describe('ToolController', () => {
  it('loads active tool identity, cursor, and command name', async () => {
    const controller = createController();

    expect(controller.hasActiveTool).toBe(false);
    expect(controller.commandName).toBe('Drawing');

    await expect(controller.load('pencil')).resolves.toBe(true);

    expect(controller.hasActiveTool).toBe(true);
    expect(controller.activeName).toBe('pencil');
    expect(controller.cursor).toBe('test-cursor');
    expect(controller.isActive('pencil')).toBe(true);
    expect(controller.commandName).toBe('Brush Stroke');
  });

  it('uses the fallback drawing command name for non-drawing tools', async () => {
    const controller = createController();

    await controller.load('transform');

    expect(controller.activeName).toBe('transform');
    expect(controller.commandName).toBe('Drawing');
  });

  it('forwards pointer lifecycle calls to the active tool', async () => {
    const controller = createController();
    const strokeContext = createContext();
    const projectContext = {} as ProjectContext;
    const modifiers: ModifierKeys = {
      shift: true,
      ctrl: false,
      alt: false,
      button: 0,
    };

    await controller.load('pencil');
    const tool = fakeToolInstances[0];

    controller.onDown(strokeContext, projectContext, { x: 1, y: 2 }, modifiers);
    controller.onDrag({ x: 3, y: 4 }, modifiers);
    controller.onUp({ x: 5, y: 6 }, modifiers);
    controller.onMove({ x: 7, y: 8 }, modifiers);

    expect(tool.ctx).toBe(strokeContext);
    expect(tool.activeProjectContext).toBe(projectContext);
    expect(tool.onDown).toHaveBeenCalledWith(1, 2, modifiers);
    expect(tool.onDrag).toHaveBeenCalledWith(3, 4, modifiers);
    expect(tool.onUp).toHaveBeenCalledWith(5, 6, modifiers);
    expect(tool.onMove).toHaveBeenCalledWith(7, 8, modifiers);
  });
});
