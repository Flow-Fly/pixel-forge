import { afterEach, describe, expect, it } from 'vitest';
import { AddFrameCommand, LinkCelsCommand } from '../../src/commands/animation-commands';
import { createCanvasSizeRequest, executeCanvasSize } from '../../src/editor/canvas-size';
import { createProjectContext, type ProjectContext } from '../../src/stores/project-context';

const contexts: ProjectContext[] = [];

function createContext() {
  const context = createProjectContext();
  contexts.push(context);
  context.project.setSize(4, 4);

  const layer = context.layers.layers.value[0];
  const frameId = context.animation.currentFrameId.value;
  const cel = context.animation.cels.value.get(context.animation.getCelKey(layer.id, frameId));
  if (!cel) throw new Error('Expected an initial cel');

  cel.canvas.width = 4;
  cel.canvas.height = 4;
  layer.canvas = cel.canvas;

  const canvasContext = cel.canvas.getContext('2d');
  if (!canvasContext) throw new Error('Chromium did not provide a 2D canvas context');
  canvasContext.fillStyle = '#ff0000';
  canvasContext.fillRect(1, 1, 1, 1);

  return { context, layer, frameId };
}

function getCel(context: ProjectContext, layerId: string, frameId: string) {
  return context.animation.cels.value.get(context.animation.getCelKey(layerId, frameId));
}

function pixelAt(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Chromium did not provide a 2D canvas context');
  return [...context.getImageData(x, y, 1, 1).data];
}

function orphanCelKeys(context: ProjectContext): string[] {
  const expectedKeys = new Set(
    context.animation.frames.value.flatMap((frame) =>
      context.layers.layers.value
        .filter((layer) => layer.type !== 'reference')
        .map((layer) => context.animation.getCelKey(layer.id, frame.id))
    )
  );
  return [...context.animation.cels.value.keys()].filter((key) => !expectedKeys.has(key)).sort();
}

async function prepareOwnerHistory(
  context: ProjectContext,
  layerId: string,
  frameId: string
): Promise<void> {
  expect((await executeCanvasSize(context, createCanvasSizeRequest(context, 6, 5))).ok).toBe(true);

  await context.history.execute(new AddFrameCommand(false, undefined, context));
  const addedFrameId = context.animation.frames.value.at(-1)?.id;
  if (!addedFrameId) throw new Error('Expected the added frame');

  await context.history.execute(
    new LinkCelsCommand(
      [
        context.animation.getCelKey(layerId, frameId),
        context.animation.getCelKey(layerId, addedFrameId),
      ],
      context
    )
  );

  expect((await executeCanvasSize(context, createCanvasSizeRequest(context, 8, 7))).ok).toBe(true);
}

async function unwindOwnerHistory(context: ProjectContext): Promise<void> {
  await context.history.undo();
  await context.history.redo();
  await context.history.undo();
  await context.history.undo();
  await context.history.undo();
}

async function captureFailure(operation: () => Promise<void>): Promise<unknown> {
  try {
    await operation();
    return null;
  } catch (error) {
    return error;
  }
}

async function replayOwnerHistory(context: ProjectContext): Promise<number> {
  let failures = 0;
  for (let index = 0; index < 4; index += 1) {
    try {
      await context.history.redo();
    } catch {
      failures += 1;
    }
  }
  return failures;
}

function replayObservation(
  context: ProjectContext,
  layerId: string
): {
  orphanCelKeys: string[];
  currentCelShape: { width: number; height: number } | null;
  currentPixel: number[] | null;
  currentLayerShape: { width: number; height: number } | null;
} {
  const currentFrameId = context.animation.currentFrameId.value;
  const currentCel = getCel(context, layerId, currentFrameId);
  const currentLayer = context.layers.layers.value.find(({ id }) => id === layerId);
  return {
    orphanCelKeys: orphanCelKeys(context),
    currentCelShape: currentCel?.canvas
      ? { width: currentCel.canvas.width, height: currentCel.canvas.height }
      : null,
    currentPixel: currentCel ? pixelAt(currentCel.canvas, 1, 1) : null,
    currentLayerShape: currentLayer?.canvas
      ? { width: currentLayer.canvas.width, height: currentLayer.canvas.height }
      : null,
  };
}

describe('Canvas Size history regression in Chromium', () => {
  afterEach(() => {
    for (const context of contexts.splice(0)) context.dispose();
  });

  it('keeps an earlier resize undoable after a later resize undo and redo', async () => {
    const { context } = createContext();

    expect((await executeCanvasSize(context, createCanvasSizeRequest(context, 6, 5))).ok).toBe(
      true
    );
    expect((await executeCanvasSize(context, createCanvasSizeRequest(context, 8, 7))).ok).toBe(
      true
    );

    await context.history.undo();
    await context.history.redo();
    await context.history.undo();

    await expect(context.history.undo()).resolves.toBeUndefined();
    expect(context.project.width.value).toBe(4);
    expect(context.project.height.value).toBe(4);
  });

  it('replays frame and linked-cel history without losing the current canvas', async () => {
    const { context, layer, frameId } = createContext();
    await prepareOwnerHistory(context, layer.id, frameId);
    await unwindOwnerHistory(context);

    const firstResizeUndoError = await captureFailure(() => context.history.undo());
    const redoErrors = await replayOwnerHistory(context);
    const observation = replayObservation(context, layer.id);
    const postRedoResize = await executeCanvasSize(
      context,
      createCanvasSizeRequest(context, 10, 9)
    );

    expect({
      firstResizeUndoError: firstResizeUndoError ? 'error' : null,
      redoErrors,
      ...observation,
      postRedoResize: postRedoResize.ok ? 'ok' : postRedoResize.error.code,
    }).toEqual({
      firstResizeUndoError: null,
      redoErrors: 0,
      orphanCelKeys: [],
      currentCelShape: { width: 8, height: 7 },
      currentPixel: [255, 0, 0, 255],
      currentLayerShape: { width: 8, height: 7 },
      postRedoResize: 'ok',
    });
  });
});
