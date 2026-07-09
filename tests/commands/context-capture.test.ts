import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/persistence/indexed-db', () => ({
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

vi.mock('../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/utils/canvas-binary', () => ({
  canvasToPngBytes: vi.fn(async () => new Uint8Array([1])),
  loadImageDataToCanvas: vi.fn(async () => {}),
}));

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number
  ) {}
}

vi.stubGlobal('ImageData', FakeImageData);

import { PatchCommand } from '../../src/commands/patch-command';
import { MoveTextCommand } from '../../src/commands/text-commands';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';
import type { Rect } from '../../src/types/geometry';

const createdContexts: ProjectContext[] = [];

function createTestContext() {
  const context = createProjectContext();
  createdContexts.push(context);
  return context;
}

function textPosition(context: ProjectContext, layerId: string, frameId: string) {
  const textCelData = context.animation.getTextCelData(layerId, frameId);
  return { x: textCelData?.x, y: textCelData?.y };
}

function makeFakeCanvas() {
  const putCalls: Array<{ x: number; y: number; data: Uint8ClampedArray }> = [];
  const fakeCtx = {
    putImageData: (imageData: { data: Uint8ClampedArray }, x: number, y: number) => {
      putCalls.push({ x, y, data: new Uint8ClampedArray(imageData.data) });
    },
  };
  const canvas = {
    width: 4,
    height: 4,
    getContext: () => fakeCtx,
  } as unknown as HTMLCanvasElement;

  return { canvas, putCalls };
}

function useLayerCanvas(context: ProjectContext, layerId: string) {
  const { canvas, putCalls } = makeFakeCanvas();
  const layer = context.layers.layers.value[0];

  context.layers.layers.value = [
    {
      ...layer,
      id: layerId,
      canvas,
    },
  ];
  context.layers.activeLayerId.value = layerId;

  return putCalls;
}

describe('command context capture', () => {
  afterEach(() => {
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    vi.restoreAllMocks();
  });

  it('moves text in the context captured when the command is created', () => {
    const source = createTestContext();
    const other = createTestContext();
    const layerId = 'shared-text-layer';
    const frameId = 'frame-1';

    source.animation.setTextCelData(layerId, frameId, {
      content: 'Source',
      x: 1,
      y: 2,
    });
    other.animation.setTextCelData(layerId, frameId, {
      content: 'Other',
      x: 10,
      y: 20,
    });

    setActiveProjectContext(source);
    const command = new MoveTextCommand(layerId, frameId, { x: 1, y: 2 }, { x: 3, y: 4 });

    setActiveProjectContext(other);
    command.execute();

    expect(textPosition(source, layerId, frameId)).toEqual({ x: 3, y: 4 });
    expect(textPosition(other, layerId, frameId)).toEqual({ x: 10, y: 20 });

    command.undo();

    expect(textPosition(source, layerId, frameId)).toEqual({ x: 1, y: 2 });
    expect(textPosition(other, layerId, frameId)).toEqual({ x: 10, y: 20 });
  });

  it('patches pixels and marks dirty in the context captured when the command is created', () => {
    const source = createTestContext();
    const other = createTestContext();
    const layerId = 'shared-image-layer';
    const bounds: Rect = { x: 1, y: 1, width: 2, height: 2 };
    const beforeData = new Uint8ClampedArray(bounds.width * bounds.height * 4).fill(7);
    const afterData = new Uint8ClampedArray(bounds.width * bounds.height * 4).fill(9);
    const sourcePutCalls = useLayerCanvas(source, layerId);
    const otherPutCalls = useLayerCanvas(other, layerId);

    setActiveProjectContext(source);
    const command = new PatchCommand(layerId, bounds, beforeData, afterData, 'Delayed stroke');

    setActiveProjectContext(other);
    command.execute();
    command.undo();

    expect(sourcePutCalls).toHaveLength(2);
    expect(sourcePutCalls[0]).toMatchObject({ x: bounds.x, y: bounds.y });
    expect(sourcePutCalls[0].data[0]).toBe(9);
    expect(sourcePutCalls[1].data[0]).toBe(7);
    expect(otherPutCalls).toHaveLength(0);
    expect(source.dirtyRect.consumePendingDirty()).toEqual(bounds);
    expect(other.dirtyRect.consumePendingDirty()).toBeNull();
  });
});
