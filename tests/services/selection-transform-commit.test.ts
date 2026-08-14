import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginSelectionTransform,
  cancelSelectionTransform,
  commitSelectionTransform,
} from '../../src/services/selection-transform-commit';
import { createSelectionStore } from '../../src/stores/selection/store';
import type { ProjectContext } from '../../src/stores/project-context';

class TestImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace = 'srgb';

  constructor(width: number, height: number);
  constructor(data: Uint8ClampedArray, width: number, height: number);
  constructor(
    dataOrWidth: Uint8ClampedArray | number,
    widthOrHeight: number,
    height?: number,
  ) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = height ?? 0;
    }
  }
}

vi.stubGlobal('ImageData', TestImageData);

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function createCanvas(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);

  const getImageData = (x: number, y: number, regionWidth: number, regionHeight: number) => {
    const image = new ImageData(regionWidth, regionHeight);
    for (let row = 0; row < regionHeight; row += 1) {
      for (let column = 0; column < regionWidth; column += 1) {
        const source = pixelOffset(width, x + column, y + row);
        const target = pixelOffset(regionWidth, column, row);
        image.data.set(pixels.slice(source, source + 4), target);
      }
    }
    return image;
  };

  const putImageData = (image: ImageData, x: number, y: number) => {
    for (let row = 0; row < image.height; row += 1) {
      for (let column = 0; column < image.width; column += 1) {
        const source = pixelOffset(image.width, column, row);
        const targetX = x + column;
        const targetY = y + row;
        if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue;
        pixels.set(image.data.slice(source, source + 4), pixelOffset(width, targetX, targetY));
      }
    }
  };

  const clearRect = (x: number, y: number, regionWidth: number, regionHeight: number) => {
    for (let row = 0; row < regionHeight; row += 1) {
      for (let column = 0; column < regionWidth; column += 1) {
        const targetX = x + column;
        const targetY = y + row;
        if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue;
        pixels.fill(0, pixelOffset(width, targetX, targetY), pixelOffset(width, targetX, targetY) + 4);
      }
    }
  };

  const context = { getImageData, putImageData, clearRect } as unknown as CanvasRenderingContext2D;
  const canvas = { width, height, getContext: () => context } as unknown as HTMLCanvasElement;

  return {
    canvas,
    pixels,
    setPixel(x: number, y: number, rgba: [number, number, number, number]) {
      pixels.set(rgba, pixelOffset(width, x, y));
    },
    readPixels() {
      return [...pixels];
    },
  };
}

function createFixture(): {
  context: ProjectContext;
  canvas: ReturnType<typeof createCanvas>;
  indices: Uint8Array;
} {
  const canvas = createCanvas(4, 2);
  canvas.setPixel(0, 0, [255, 0, 0, 255]);
  const indices = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]);
  const selection = createSelectionStore();
  const cels = new Map([
    ['layer-1:frame-1', {
      id: 'cel-1',
      layerId: 'layer-1',
      frameId: 'frame-1',
      canvas: canvas.canvas,
      indexBuffer: indices,
    }],
  ]);
  const changeEvents = new EventTarget();
  const project = {
    id: { value: 'project-1' },
    revision: { value: 0 },
    changeEvents,
    commitChange: vi.fn((transactionId: string, domains: readonly string[]) => {
      const fromRevision = project.revision.value;
      const event = {
        type: 'project-change',
        target: project.id.value,
        fromRevision,
        toRevision: fromRevision + 1,
        transactionId,
        domains: [...domains],
      };
      project.revision.value = event.toRevision;
      changeEvents.dispatchEvent(new CustomEvent('project-change', { detail: event }));
      return event;
    }),
  };
  const history = {
    undoStack: { value: [] as Array<{ execute(): void | Promise<void>; undo(): void | Promise<void> }> },
    redoStack: { value: [] as Array<{ execute(): void | Promise<void>; undo(): void | Promise<void> }> },
    version: { value: 0 },
    async execute(command: { execute(): void | Promise<void>; undo(): void | Promise<void> }) {
      await command.execute();
      history.undoStack.value = [...history.undoStack.value, command];
      history.redoStack.value = [];
      history.version.value += 1;
    },
    async undo() {
      const command = history.undoStack.value.at(-1);
      if (!command) return;
      await command.undo();
      history.undoStack.value = history.undoStack.value.slice(0, -1);
      history.redoStack.value = [...history.redoStack.value, command];
      history.version.value += 1;
    },
    async redo() {
      const command = history.redoStack.value.at(-1);
      if (!command) return;
      await command.execute();
      history.redoStack.value = history.redoStack.value.slice(0, -1);
      history.undoStack.value = [...history.undoStack.value, command];
      history.version.value += 1;
    },
  };
  const context = {
    animation: {
      cels: { value: cels },
      currentFrameId: { value: 'frame-1' },
      getCelKey: (layerId: string, frameId: string) => `${layerId}:${frameId}`,
      getEditableCelCanvas: () => canvas.canvas,
      getCelIndexBuffer: (layerId: string, frameId: string) => cels.get(`${layerId}:${frameId}`)?.indexBuffer,
    },
    history,
    layers: {
      activeLayerId: { value: 'layer-1' },
      layers: { value: [{ id: 'layer-1', type: 'paint', canvas: canvas.canvas, locked: false, visible: true }] },
    },
    palette: {
      mainColors: { value: ['#ff0000'] },
      getColorIndex: (hex: string) => hex.toLowerCase() === '#ff0000' ? 1 : 0,
      findClosestColorIndex: () => 1,
    },
    project,
    selection,
  } as unknown as ProjectContext;

  return { context, canvas, indices };
}

const fixtures: ProjectContext[] = [];

afterEach(() => {
  for (const context of fixtures.splice(0)) {
    if (typeof context.dispose === 'function') context.dispose();
  }
});

describe('selection transform transaction', () => {
  it('keeps preview session-only and commits RGBA/index data once with exact Undo/Redo', async () => {
    const { context, canvas, indices } = createFixture();
    fixtures.push(context);
    context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');

    const started = beginSelectionTransform(context);
    expect(started).toMatchObject({ ok: true });
    expect(context.history.undoStack.value).toHaveLength(0);
    expect(context.project.revision.value).toBe(0);
    expect(canvas.readPixels()).toEqual(new Array(32).fill(0));

    context.selection.moveTransform(1, 0);
    const result = await commitSelectionTransform(context);
    expect(result).toMatchObject({ ok: true, revision: 1 });
    expect(context.history.undoStack.value).toHaveLength(1);
    expect(context.project.revision.value).toBe(1);
    expect(Array.from(indices)).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
    expect(canvas.readPixels().slice(4, 8)).toEqual([255, 0, 0, 255]);

    await context.history.undo();
    expect(canvas.readPixels().slice(0, 4)).toEqual([255, 0, 0, 255]);
    expect(Array.from(indices)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(context.selection.state.value).toMatchObject({ type: 'selected', bounds: { x: 0, y: 0, width: 1, height: 1 } });

    await context.history.redo();
    expect(canvas.readPixels().slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(canvas.readPixels().slice(4, 8)).toEqual([255, 0, 0, 255]);
    expect(Array.from(indices)).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('rejects a stale captured revision without mutating the project and restores Cancel', async () => {
    const { context, canvas, indices } = createFixture();
    fixtures.push(context);
    context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    expect(beginSelectionTransform(context)).toMatchObject({ ok: true });
    context.selection.moveTransform(1, 0);
    context.project.revision.value = 2;

    const result = await commitSelectionTransform(context);
    expect(result).toMatchObject({ ok: false, error: { code: 'revision_conflict' } });
    expect(context.history.undoStack.value).toHaveLength(0);
    expect(canvas.readPixels().slice(0, 4)).toEqual([255, 0, 0, 255]);
    expect(Array.from(indices)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);

    const cancelled = cancelSelectionTransform(context);
    expect(cancelled).toMatchObject({ ok: true });
    expect(canvas.readPixels().slice(0, 4)).toEqual([255, 0, 0, 255]);
    expect(context.selection.state.value).toMatchObject({ type: 'selected', bounds: { x: 0, y: 0, width: 1, height: 1 } });
  });
});
