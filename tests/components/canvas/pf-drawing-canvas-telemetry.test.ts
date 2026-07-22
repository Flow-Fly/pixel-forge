import { afterEach, describe, expect, it, vi } from 'vitest';

import { productTelemetry } from '../../../src/services/telemetry';
import {
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';
import { toolStore, type ToolType } from '../../../src/stores/tools';
import type { Layer } from '../../../src/types/layer';

interface DrawingContextHarness {
  context: ProjectContext;
  execute: ReturnType<typeof vi.fn>;
  pixels: Uint8ClampedArray;
}

interface DrawingCanvasHarness extends HTMLElement {
  context: ProjectContext;
  getStrokeTarget(context: ProjectContext): unknown;
  handleDocumentMouseUp(event: MouseEvent): void;
  startStroke(event: MouseEvent, tool: ToolType, target: unknown, context: ProjectContext): void;
  toolController: {
    commandName: string;
    hasActiveTool: boolean;
    onDown: ReturnType<typeof vi.fn>;
    onUp: ReturnType<typeof vi.fn>;
  };
}

function createDrawingContext(
  execute: ReturnType<typeof vi.fn> = vi.fn(async () => undefined)
): DrawingContextHarness {
  const pixels = new Uint8ClampedArray(4);
  const canvasContext = {
    getImageData: vi.fn(() => ({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray(pixels),
    })),
  } as unknown as CanvasRenderingContext2D;
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(canvasContext);
  const layer: Layer = {
    id: 'layer-1',
    name: 'Layer',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 255,
    blendMode: 'normal',
    parentId: null,
    canvas,
  };
  const context = {
    animation: {
      cels: { value: new Map() },
      currentFrameId: { value: 'frame-1' },
      ensureCelIndexBuffer: vi.fn(() => null),
      ensureUnlinkedForEdit: vi.fn(() => false),
      getCelIndexBuffer: vi.fn(() => null),
      getCelKey: vi.fn((layerId: string, frameId: string) => `${layerId}:${frameId}`),
    },
    dirtyRect: {
      flushStroke: vi.fn(() => ({ x: 0, y: 0, width: 1, height: 1 })),
      requestFullRedraw: vi.fn(),
      resetStroke: vi.fn(),
    },
    history: { execute },
    layers: {
      activeLayerId: { value: layer.id },
      layers: { value: [layer] },
    },
  } as unknown as ProjectContext;

  return { context, execute, pixels };
}

async function createDrawingCanvas(context: ProjectContext): Promise<DrawingCanvasHarness> {
  await import('../../../src/components/canvas/pf-drawing-canvas');
  const element = document.createElement('pf-drawing-canvas') as DrawingCanvasHarness;
  element.context = context;
  element.toolController = {
    commandName: 'Drawing',
    hasActiveTool: true,
    onDown: vi.fn(),
    onUp: vi.fn(),
  };
  (
    element as unknown as { getCanvasCoordinates: () => { x: number; y: number } }
  ).getCanvasCoordinates = () => ({ x: 0, y: 0 });
  (
    element as unknown as { getClampedMousePoint: () => { x: number; y: number } }
  ).getClampedMousePoint = () => ({ x: 0, y: 0 });
  (element as unknown as { scheduleCanvasRender: () => void }).scheduleCanvasRender = vi.fn();
  (element as unknown as { renderFinalStrokeState: () => void }).renderFinalStrokeState = vi.fn();
  return element;
}

function beginAndFinishStroke(
  element: DrawingCanvasHarness,
  context: ProjectContext,
  tool: ToolType
) {
  const target = element.getStrokeTarget(context);
  expect(target).not.toBeNull();
  element.startStroke(new MouseEvent('mousedown', { button: 0 }), tool, target, context);
  element.handleDocumentMouseUp(new MouseEvent('mouseup', { button: 0 }));
}

describe('pf-drawing-canvas first drawing telemetry', () => {
  afterEach(() => {
    restoreDefaultProjectContext();
    toolStore.activeTool.value = 'pencil';
    vi.restoreAllMocks();
  });

  // #412: No-op strokes are not completed drawing milestones.
  it('does not emit or create history for a stroke that changes no pixels', async () => {
    const origin = createDrawingContext();
    const element = await createDrawingCanvas(origin.context);
    const record = vi.spyOn(productTelemetry, 'record');

    beginAndFinishStroke(element, origin.context, 'pencil');

    expect(origin.execute).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  // #412: Work and tool semantics stay attached to the stroke that began them.
  it('keeps a changed stroke on its origin and emits its initiating tool after history', async () => {
    let finishHistory: (() => void) | undefined;
    const historyFinished = new Promise<void>((resolve) => {
      finishHistory = resolve;
    });
    const origin = createDrawingContext(vi.fn(() => historyFinished));
    const destination = createDrawingContext();
    const element = await createDrawingCanvas(origin.context);
    const record = vi.spyOn(productTelemetry, 'record');
    setActiveProjectContext(origin.context);
    toolStore.activeTool.value = 'line';

    const target = element.getStrokeTarget(origin.context);
    expect(target).not.toBeNull();
    element.startStroke(new MouseEvent('mousedown', { button: 0 }), 'line', target, origin.context);
    origin.pixels[0] = 255;

    setActiveProjectContext(destination.context);
    element.context = destination.context;
    toolStore.activeTool.value = 'fill';
    element.handleDocumentMouseUp(new MouseEvent('mouseup', { button: 0 }));

    expect(origin.execute).toHaveBeenCalledOnce();
    expect(destination.execute).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();

    finishHistory?.();
    await vi.waitFor(() => {
      expect(record).toHaveBeenCalledWith({
        name: 'first_drawing_action',
        dimensions: { tool: 'shape' },
      });
    });
    expect(record).toHaveBeenCalledTimes(1);
  });
});
