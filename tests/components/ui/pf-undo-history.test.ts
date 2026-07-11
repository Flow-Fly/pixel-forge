import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/services/persistence/indexed-db', () => ({
  projectRepository: {
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    getLastOpenedProjectId: vi.fn(async () => null),
    setLastOpenedProjectId: vi.fn(async () => {}),
    getWorkspaceState: vi.fn(async () => null),
    setWorkspaceState: vi.fn(async () => {}),
  },
}));

vi.mock('../../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

vi.mock('../../../src/utils/canvas-binary', () => ({
  canvasToPngBytes: vi.fn(async () => new Uint8Array([1])),
  loadImageDataToCanvas: vi.fn(async () => {}),
}));

import '../../../src/components/ui/pf-undo-history';
import type { PFUndoHistory } from '../../../src/components/ui/pf-undo-history';
import type { DrawableCommand } from '../../../src/commands';
import type { Command } from '../../../src/stores/history-store';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';

const createdContexts: ProjectContext[] = [];

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number
  ) {}
}

vi.stubGlobal('ImageData', FakeImageData);

function createTestContext(): ProjectContext {
  const context = createProjectContext();
  createdContexts.push(context);
  return context;
}

function trackedCommand(id: string, name: string, state: { value: number }): Command {
  return {
    id,
    name,
    execute() {
      state.value++;
    },
    undo() {
      state.value--;
    },
  };
}

function drawableCommand(
  layerId: string,
  frameId: string,
  before: Uint8ClampedArray,
  after: Uint8ClampedArray
): DrawableCommand {
  return {
    id: 'target-drawing',
    name: 'Target drawing',
    drawBounds: { x: 0, y: 0, width: 1, height: 1 },
    drawLayerId: layerId,
    drawFrameId: frameId,
    drawPreviousData: before,
    drawNewData: after,
    execute() {},
    undo() {},
  };
}

function pixelCanvas(initialPixel: Uint8ClampedArray) {
  let pixel = new Uint8ClampedArray(initialPixel);
  let writeCount = 0;
  const context = {
    getImageData: () => ({ data: new Uint8ClampedArray(pixel) }),
    putImageData: (imageData: { data: Uint8ClampedArray }) => {
      pixel = new Uint8ClampedArray(imageData.data);
      writeCount++;
    },
  };
  const canvas = {
    width: 1,
    height: 1,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    pixel: () => [...pixel],
    writeCount: () => writeCount,
  };
}

function useTwoFrames(
  context: ProjectContext,
  layerId: string,
  firstFrameId: string,
  firstCanvas: HTMLCanvasElement,
  secondFrameId: string,
  secondCanvas: HTMLCanvasElement
) {
  const layer = context.layers.layers.value[0];
  context.layers.layers.value = [{ ...layer, id: layerId, canvas: firstCanvas }];
  context.layers.activeLayerId.value = layerId;
  context.animation.frames.value = [
    { id: firstFrameId, order: 0, duration: 100 },
    { id: secondFrameId, order: 1, duration: 100 },
  ];
  context.animation.cels.value = new Map([
    [
      context.animation.getCelKey(layerId, firstFrameId),
      {
        id: `${context.project.id.value}-first-cel`,
        layerId,
        frameId: firstFrameId,
        canvas: firstCanvas,
      },
    ],
    [
      context.animation.getCelKey(layerId, secondFrameId),
      {
        id: `${context.project.id.value}-second-cel`,
        layerId,
        frameId: secondFrameId,
        canvas: secondCanvas,
      },
    ],
  ]);
  context.animation.goToFrame(firstFrameId);
}

async function createHistoryPanel(context: ProjectContext): Promise<PFUndoHistory> {
  setActiveProjectContext(context);
  const panel = document.createElement('pf-undo-history') as PFUndoHistory;
  document.body.append(panel);
  await Promise.resolve();
  await panel.updateComplete;
  return panel;
}

async function switchHistoryPanel(panel: PFUndoHistory, context: ProjectContext) {
  setActiveProjectContext(context);
  await Promise.resolve();
  await panel.updateComplete;
}

function buttonWithText(panel: PFUndoHistory, text: string): HTMLElement | undefined {
  return [...(panel.shadowRoot?.querySelectorAll<HTMLElement>('pf-button') ?? [])].find(
    (button) => button.textContent?.trim() === text
  );
}

describe('pf-undo-history active project context', () => {
  afterEach(() => {
    document.body.replaceChildren();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    vi.restoreAllMocks();
  });

  it('shows and reverts only the active project history', async () => {
    const contextA = createTestContext();
    const contextB = createTestContext();
    const stateA = { value: 0 };
    const stateB = { value: 0 };

    await contextA.history.execute(trackedCommand('a-1', 'Project A action', stateA));
    await contextB.history.execute(trackedCommand('b-1', 'Project B first', stateB));
    await contextB.history.execute(trackedCommand('b-2', 'Project B second', stateB));

    const panel = await createHistoryPanel(contextA);
    expect(panel.shadowRoot?.textContent).toContain('Project A action');
    expect(panel.shadowRoot?.textContent).not.toContain('Project B first');

    await switchHistoryPanel(panel, contextB);
    expect(panel.shadowRoot?.textContent).toContain('Project B first');
    expect(panel.shadowRoot?.textContent).not.toContain('Project A action');

    panel.shadowRoot?.querySelector<HTMLElement>('.item.active')?.click();
    await panel.updateComplete;
    buttonWithText(panel, 'Revert to here')?.click();

    await vi.waitFor(() => expect(stateB.value).toBe(1));
    expect(stateA.value).toBe(1);
    expect(contextA.history.undoStack.value.map((command) => command.id)).toEqual(['a-1']);
    expect(contextB.history.undoStack.value.map((command) => command.id)).toEqual(['b-1']);

    await panel.updateComplete;
    panel.shadowRoot?.querySelector<HTMLElement>('.item.future')?.click();
    await panel.updateComplete;
    buttonWithText(panel, 'Revert to here')?.click();

    await vi.waitFor(() => expect(stateB.value).toBe(2));
    expect(stateA.value).toBe(1);
    expect(contextB.history.undoStack.value.map((command) => command.id)).toEqual(['b-1', 'b-2']);
  });

  it('patches the initiating project and frame once, then keeps undo and redo on that frame', async () => {
    const contextA = createTestContext();
    const contextB = createTestContext();
    const layerId = 'shared-layer';
    const firstFrameId = 'shared-frame-1';
    const secondFrameId = 'shared-frame-2';
    const transparent = new Uint8ClampedArray([0, 0, 0, 0]);
    const drawn = new Uint8ClampedArray([40, 80, 120, 255]);
    const untouched = new Uint8ClampedArray([5, 10, 15, 255]);
    const aFirst = pixelCanvas(untouched);
    const aSecond = pixelCanvas(untouched);
    const bFirst = pixelCanvas(drawn);
    const bSecond = pixelCanvas(untouched);

    useTwoFrames(contextA, layerId, firstFrameId, aFirst.canvas, secondFrameId, aSecond.canvas);
    useTwoFrames(contextB, layerId, firstFrameId, bFirst.canvas, secondFrameId, bSecond.canvas);
    await contextB.history.execute(
      drawableCommand(layerId, firstFrameId, transparent, drawn)
    );

    const panel = await createHistoryPanel(contextB);
    panel.shadowRoot?.querySelector<HTMLElement>('.item.active')?.click();
    await panel.updateComplete;
    buttonWithText(panel, 'Patch this out')?.click();

    contextB.animation.goToFrame(secondFrameId);
    setActiveProjectContext(contextA);

    await vi.waitFor(() => expect(contextB.history.undoStack.value).toHaveLength(2));
    expect(bFirst.pixel()).toEqual([...transparent]);
    expect(bFirst.writeCount()).toBe(1);
    expect(bSecond.pixel()).toEqual([...untouched]);
    expect(aFirst.pixel()).toEqual([...untouched]);
    expect(aSecond.pixel()).toEqual([...untouched]);

    await contextB.history.undo();
    expect(bFirst.pixel()).toEqual([...drawn]);
    expect(bSecond.pixel()).toEqual([...untouched]);

    await contextB.history.redo();
    expect(bFirst.pixel()).toEqual([...transparent]);
    expect(bFirst.writeCount()).toBe(3);
    expect(bSecond.pixel()).toEqual([...untouched]);
  });
});
