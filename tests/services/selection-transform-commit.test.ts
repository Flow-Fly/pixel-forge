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
  const palette = {
    mainColors: { value: ['#ff0000'] },
    newColorFlags: { value: new Set<string>() },
    paletteEntryIds: ['palette-1'],
    getPaletteEntryIds() {
      return [...this.paletteEntryIds];
    },
    setColorsDirect(colors: string[], flags: Set<string>, entryIds: string[]) {
      this.mainColors.value = [...colors];
      this.newColorFlags.value = new Set(flags);
      this.paletteEntryIds = [...entryIds];
    },
    getColorIndex: (hex: string) => hex.toLowerCase() === '#ff0000' ? 1 : 0,
    findClosestColorIndex: () => 1,
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
    palette,
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

  it('does not restore over a newer edit when Apply detects a stale revision', async () => {
    const { context, canvas, indices } = createFixture();
    fixtures.push(context);
    context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    expect(beginSelectionTransform(context)).toMatchObject({ ok: true });
    context.selection.moveTransform(1, 0);

    canvas.setPixel(0, 0, [0, 0, 255, 255]);
    indices[0] = 2;
    context.project.revision.value = 1;

    const result = await commitSelectionTransform(context);

    expect(result).toMatchObject({ ok: false, error: { code: 'revision_conflict' } });
    expect(canvas.readPixels().slice(0, 4)).toEqual([0, 0, 255, 255]);
    expect(indices[0]).toBe(2);
    expect(context.history.undoStack.value).toHaveLength(0);
  });

  it('does not restore over a newer edit when Cancel follows an intervening change', () => {
    const { context, canvas, indices } = createFixture();
    fixtures.push(context);
    context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    expect(beginSelectionTransform(context)).toMatchObject({ ok: true });

    canvas.setPixel(0, 0, [0, 0, 255, 255]);
    indices[0] = 2;

    expect(cancelSelectionTransform(context)).toMatchObject({ ok: true });
    expect(canvas.readPixels().slice(0, 4)).toEqual([0, 0, 255, 255]);
    expect(indices[0]).toBe(2);
  });

  it('keeps two project contexts isolated through one transform commit', async () => {
    const first = createFixture();
    const second = createFixture();
    fixtures.push(first.context, second.context);
    first.context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    second.context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');

    expect(beginSelectionTransform(first.context)).toMatchObject({ ok: true });
    first.context.selection.moveTransform(1, 0);
    await expect(commitSelectionTransform(first.context)).resolves.toMatchObject({ ok: true });

    expect(first.context.history.undoStack.value).toHaveLength(1);
    expect(first.context.project.revision.value).toBe(1);
    expect(second.context.history.undoStack.value).toHaveLength(0);
    expect(second.context.project.revision.value).toBe(0);
    expect(second.context.selection.state.value.type).toBe('selected');
  });

  it('keeps repeated Apply attempts to one history transition', async () => {
    const { context } = createFixture();
    fixtures.push(context);
    context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    expect(beginSelectionTransform(context)).toMatchObject({ ok: true });
    context.selection.moveTransform(1, 0);

    const results = await Promise.all([
      commitSelectionTransform(context),
      commitSelectionTransform(context),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(context.history.undoStack.value).toHaveLength(1);
    expect(context.project.revision.value).toBe(1);
  });

  it('rejects a transform that would land completely outside the canvas', async () => {
    const { context, canvas, indices } = createFixture();
    fixtures.push(context);
    context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    expect(beginSelectionTransform(context)).toMatchObject({ ok: true });
    context.selection.moveTransform(-5, 0);

    const result = await commitSelectionTransform(context);

    expect(result).toMatchObject({ ok: false, error: { code: 'limit_exceeded' } });
    expect(canvas.readPixels().slice(0, 4)).toEqual([255, 0, 0, 255]);
    expect(indices[0]).toBe(1);
    expect(context.history.undoStack.value).toHaveLength(0);
  });

  it('returns a stable public failure when begin cannot obtain an editable cel', () => {
    const { context } = createFixture();
    fixtures.push(context);
    context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    context.animation.getEditableCelCanvas = () => {
      throw new Error('disposed target');
    };

    expect(() => beginSelectionTransform(context)).not.toThrow();
    expect(beginSelectionTransform(context)).toMatchObject({
      ok: false,
      error: { code: expect.any(String) },
    });
  });

  it('does not start a floating Pending Edit against a different active target', () => {
    const { context, canvas } = createFixture();
    fixtures.push(context);
    const secondCanvas = createCanvas(4, 2);
    secondCanvas.setPixel(0, 0, [0, 0, 255, 255]);
    const secondKey = context.animation.getCelKey('layer-2', 'frame-1');
    const secondCel = {
      id: 'cel-2',
      layerId: 'layer-2',
      frameId: 'frame-1',
      canvas: secondCanvas.canvas,
      indexBuffer: new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0]),
    };
    context.animation.cels.value = new Map([
      ...context.animation.cels.value,
      [secondKey, secondCel],
    ]);
    context.layers.layers.value = [
      ...context.layers.layers.value,
      { id: 'layer-2', type: 'paint', canvas: secondCanvas.canvas, locked: false, visible: true },
    ];
    context.animation.getEditableCelCanvas = (layerId: string, frameId: string) =>
      context.animation.cels.value.get(context.animation.getCelKey(layerId, frameId))?.canvas;
    context.selection.setFloating(
      new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1),
      { x: 0, y: 0, width: 1, height: 1 },
      'rectangle',
    );
    context.layers.activeLayerId.value = 'layer-2';

    const result = beginSelectionTransform(context);

    expect(result).toMatchObject({ ok: false, error: { code: 'target_not_found' } });
    expect(canvas.readPixels().slice(0, 4)).toEqual([255, 0, 0, 255]);
    expect(secondCanvas.readPixels().slice(0, 4)).toEqual([0, 0, 255, 255]);
  });

  it('keeps linked cel identity, palette, and bytes unchanged through begin and Cancel', () => {
    const { context, canvas, indices } = createFixture();
    fixtures.push(context);
    const targetKey = context.animation.getCelKey('layer-1', 'frame-1');
    const targetBefore = context.animation.cels.value.get(targetKey);
    if (!targetBefore) throw new Error('Expected target cel');
    const linkedCanvas = createCanvas(4, 2);
    linkedCanvas.pixels.set(canvas.pixels);
    const linkedTarget = {
      ...targetBefore,
      canvas: linkedCanvas.canvas,
      linkedCelId: 'link-1',
      linkType: 'soft' as const,
    };
    context.animation.cels.value = new Map([
      [targetKey, linkedTarget],
      ['layer-2:frame-1', {
        ...linkedTarget,
        id: 'cel-2',
        layerId: 'layer-2',
      }],
    ]);
    context.layers.layers.value = [
      ...context.layers.layers.value,
      { id: 'layer-2', type: 'paint', canvas: linkedCanvas.canvas, locked: false, visible: true },
    ];
    const originalGetEditable = context.animation.getEditableCelCanvas;
    context.animation.getEditableCelCanvas = (layerId: string, frameId: string) => {
      const key = context.animation.getCelKey(layerId, frameId);
      const cel = context.animation.cels.value.get(key);
      if (key === targetKey && cel?.canvas === linkedCanvas.canvas) {
        const clone = createCanvas(4, 2);
        clone.pixels.set(linkedCanvas.pixels);
        context.animation.cels.value = new Map(context.animation.cels.value).set(key, {
          ...cel,
          canvas: clone.canvas,
          linkedCelId: undefined,
          linkType: undefined,
          indexBuffer: new Uint8Array(cel.indexBuffer ?? []),
        });
        return clone.canvas;
      }
      return originalGetEditable.call(context.animation, layerId, frameId);
    };
    const colors = ['#ff0000'];
    const flags = new Set(['#ff0000']);
    (context.palette as unknown as { newColorFlags: { value: Set<string> } }).newColorFlags = { value: flags };
    context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');

    const beforeRevision = context.project.revision.value;
    const beforeCanvas = context.animation.cels.value.get(targetKey)?.canvas;
    expect(beginSelectionTransform(context)).toMatchObject({ ok: true });
    expect(cancelSelectionTransform(context)).toMatchObject({ ok: true });

    const restored = context.animation.cels.value.get(targetKey);
    expect(restored?.canvas).toBe(beforeCanvas);
    expect(restored?.linkedCelId).toBe('link-1');
    expect(restored?.linkType).toBe('soft');
    expect(restored?.indexBuffer).toBe(targetBefore.indexBuffer);
    expect([...restored!.indexBuffer!]).toEqual([...indices]);
    expect(context.palette.mainColors.value).toEqual(colors);
    expect((context.palette as unknown as { newColorFlags: { value: Set<string> } }).newColorFlags.value).toEqual(flags);
    expect(context.project.revision.value).toBe(beforeRevision);
    expect(context.history.undoStack.value).toHaveLength(0);
  });
});
