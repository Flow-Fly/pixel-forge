import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_SIZE_COMMAND_ID,
  CANVAS_SIZE_MAX_DIMENSION,
  canvasSizeCatalog,
  createCanvasSizeRequest,
  executeCanvasSize,
  previewCanvasSize,
  type CanvasSizeRequest,
} from '../../src/editor/canvas-size';
import { AddFrameCommand } from '../../src/commands/animation-commands';
import { createProjectThumbnail } from '../../src/services/project-thumbnail';
import { autoSaveService } from '../../src/services/auto-save';
import { compositeFrame } from '../../src/utils/canvas-utils';
import { composeExportFrame } from '../../src/services/export-composition';
import { loadImageDataToCanvas } from '../../src/utils/canvas-binary';
import { renderFrameToCanvas } from '../../src/utils/preview-renderer';
import { createProjectContext, type ProjectContext } from '../../src/stores/project-context';
import type { Cel } from '../../src/types/animation';

const contexts: ProjectContext[] = [];

function createContext() {
  const context = createProjectContext();
  contexts.push(context);
  context.project.setSize(4, 4);
  const layer = context.layers.layers.value[0];
  const frameId = context.animation.currentFrameId.value;
  const cel = context.animation.cels.value.get(
    context.animation.getCelKey(layer.id, frameId)
  );
  if (!cel) throw new Error('Expected an initial cel');
  cel.canvas.width = 4;
  cel.canvas.height = 4;
  layer.canvas = cel.canvas;
  return { context, layer, frameId, cel };
}

function pixel(canvas: HTMLCanvasElement, x: number, y: number) {
  return [...getCanvasContext(canvas).getImageData(x, y, 1, 1).data];
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Chromium did not provide a 2D canvas context');
  return context;
}

function rgbaPixels(canvas: HTMLCanvasElement): number[] {
  return Array.from(
    getCanvasContext(canvas).getImageData(0, 0, canvas.width, canvas.height).data,
  );
}

function renderPreview(context: ProjectContext): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = context.project.width.value;
  canvas.height = context.project.height.value;
  renderFrameToCanvas(
    getCanvasContext(canvas),
    context.animation.currentFrameId.value,
    context.layers.layers.value,
    context.animation.cels.value,
    context.animation,
  );
  return canvas;
}

function getCel(context: ProjectContext, layerId: string, frameId: string): Cel {
  const cel = context.animation.cels.value.get(context.animation.getCelKey(layerId, frameId));
  if (!cel) throw new Error('Expected a raster cel');
  return cel;
}

function prepareLinkedPayloads(context: ProjectContext, cel: Cel): {
  linkedFrameId: string;
  linkedId: string;
} {
  context.palette.setPalette(['#000000', '#ff0000']);
  const canvasContext = getCanvasContext(cel.canvas);
  canvasContext.fillStyle = '#ff0000';
  canvasContext.fillRect(1, 1, 1, 1);
  const indexBuffer = new Uint8Array(16);
  indexBuffer[5] = 2;
  context.animation.updateCelIndexBuffer(cel.layerId, cel.frameId, indexBuffer);
  canvasContext.fillStyle = '#ff0000';
  canvasContext.fillRect(1, 1, 1, 1);

  context.animation.addFrame(false);
  const linkedFrameId = context.animation.currentFrameId.value;
  const linkedKey = context.animation.getCelKey(cel.layerId, linkedFrameId);
  const sourceKey = context.animation.getCelKey(cel.layerId, cel.frameId);
  const linkedId = context.animation.linkCels([sourceKey, linkedKey], 'soft');
  if (!linkedId) throw new Error('Expected linked cels');
  expect(context.animation.cels.value.get(linkedKey)?.canvas)
    .toBe(context.animation.cels.value.get(sourceKey)?.canvas);
  expect(context.animation.cels.value.get(linkedKey)?.indexBuffer)
    .toBe(context.animation.cels.value.get(sourceKey)?.indexBuffer);
  return { linkedFrameId, linkedId };
}

function assertResizedPayloads(
  context: ProjectContext,
  cel: Cel,
  linkedFrameId: string,
  linkedId: string
): void {
  expect(cel.canvas.width).toBe(4);
  const resizedCel = getCel(context, cel.layerId, cel.frameId);
  expect(resizedCel.canvas).not.toBe(cel.canvas);
  expect(resizedCel.canvas.width).toBe(6);
  expect(resizedCel.canvas.height).toBe(5);
  expect(pixel(resizedCel.canvas, 1, 1)).toEqual([255, 0, 0, 255]);
  expect(pixel(resizedCel.canvas, 5, 4)).toEqual([0, 0, 0, 0]);
  expect(resizedCel.indexBuffer?.length).toBe(30);
  expect(resizedCel.indexBuffer?.[1 + 1 * 6]).toBe(2);
  expect(resizedCel.indexBuffer?.[5 + 4 * 6]).toBe(0);
  const resizedLinkedCel = getCel(context, cel.layerId, linkedFrameId);
  expect(resizedLinkedCel.canvas).toBe(resizedCel.canvas);
  expect(resizedLinkedCel.indexBuffer).toBe(resizedCel.indexBuffer);
  expect(resizedLinkedCel.linkedCelId).toBe(linkedId);
}

async function assertDurableOutputs(context: ProjectContext, layerId: string): Promise<void> {
  const frameId = context.animation.currentFrameId.value;
  const preview = renderPreview(context);
  const expectedPixels = rgbaPixels(preview);
  const exportCanvas = composeExportFrame({
    frameId,
    width: context.project.width.value,
    height: context.project.height.value,
    scale: 1,
    layers: context.layers.layers.value,
    cels: context.animation.cels.value,
    getCelKey: context.animation.getCelKey.bind(context.animation),
  });
  expect(rgbaPixels(exportCanvas)).toEqual(expectedPixels);

  const thumbnail = await createProjectThumbnail({
    compositeFrame: (previewFrameId, targetContext) =>
      compositeFrame(previewFrameId, targetContext, { context }),
    frameId,
    width: context.project.width.value,
    height: context.project.height.value,
  });
  expect(thumbnail).toBeDefined();
  if (!thumbnail) return;
  const thumbnailCanvas = document.createElement('canvas');
  thumbnailCanvas.width = context.project.width.value;
  thumbnailCanvas.height = context.project.height.value;
  await loadImageDataToCanvas(thumbnail, thumbnailCanvas);
  expect(rgbaPixels(thumbnailCanvas)).toEqual(expectedPixels);

  const saved = await context.project.saveProject();
  await context.project.loadProject(structuredClone(saved));
  expect(context.project.width.value).toBe(preview.width);
  expect(context.project.height.value).toBe(preview.height);
  const reloadedCel = getCel(context, layerId, context.animation.currentFrameId.value);
  expect(reloadedCel.canvas.width).toBe(preview.width);
  expect(reloadedCel.canvas.height).toBe(preview.height);
  const reloadedPreview = renderPreview(context);
  expect(rgbaPixels(reloadedPreview)).toEqual(expectedPixels);

  const reloadedExport = composeExportFrame({
    frameId: context.animation.currentFrameId.value,
    width: context.project.width.value,
    height: context.project.height.value,
    scale: 1,
    layers: context.layers.layers.value,
    cels: context.animation.cels.value,
    getCelKey: context.animation.getCelKey.bind(context.animation),
  });
  expect(rgbaPixels(reloadedExport)).toEqual(expectedPixels);

  const reloadedThumbnail = await createProjectThumbnail({
    compositeFrame: (previewFrameId, targetContext) =>
      compositeFrame(previewFrameId, targetContext, { context }),
    frameId: context.animation.currentFrameId.value,
    width: context.project.width.value,
    height: context.project.height.value,
  });
  expect(reloadedThumbnail).toBeDefined();
  if (!reloadedThumbnail) return;
  const reloadedThumbnailCanvas = document.createElement('canvas');
  reloadedThumbnailCanvas.width = context.project.width.value;
  reloadedThumbnailCanvas.height = context.project.height.value;
  await loadImageDataToCanvas(reloadedThumbnail, reloadedThumbnailCanvas);
  expect(rgbaPixels(reloadedThumbnailCanvas)).toEqual(expectedPixels);

  expect(reloadedCel.indexBuffer?.length).toBe(preview.width * preview.height);
  expect(reloadedCel.indexBuffer?.[1 + 1 * preview.width]).toBe(2);
}

describe('Canvas Size transaction in Chromium', () => {
  afterEach(() => {
    for (const context of contexts.splice(0)) {
      autoSaveService.stop(context);
      context.dispose();
    }
  });

  it('enlarges every raster payload with transparent indexed extension and one revision', async () => {
    const { context, cel } = createContext();
    expect(context.projectRevision).toBe(context.project.revision);
    expect(context.projectChangeEvents).toBe(context.project.changeEvents);
    expect(canvasSizeCatalog.command.id).toBe(CANVAS_SIZE_COMMAND_ID);
    expect(CANVAS_SIZE_MAX_DIMENSION).toBe(2048);
    autoSaveService.start(context);
    expect(autoSaveService.isDirty(context)).toBe(false);
    const { linkedFrameId, linkedId } = prepareLinkedPayloads(context, cel);

    const events: unknown[] = [];
    context.projectChangeEvents.addEventListener('project-change', (event) => {
      events.push((event as CustomEvent).detail);
    });
    const result = await executeCanvasSize(
      context,
      createCanvasSizeRequest(context, 6, 5)
    );

    expect(result.ok).toBe(true);
    expect(context.project.width.value).toBe(6);
    expect(context.project.height.value).toBe(5);
    assertResizedPayloads(context, cel, linkedFrameId, linkedId);
    expect(context.project.revision.value).toBe(1);
    expect(events).toHaveLength(1);
    expect(context.history.undoStack.value).toHaveLength(1);
    expect(context.history.version.value).toBe(1);
    expect(autoSaveService.isDirty(context)).toBe(true);

    await context.history.undo();
    expect(context.project.width.value).toBe(4);
    expect(context.project.height.value).toBe(4);
    expect(context.project.revision.value).toBe(2);
    expect(context.history.version.value).toBe(2);
    await context.history.redo();
    expect(context.project.width.value).toBe(6);
    expect(context.project.height.value).toBe(5);
    expect(context.project.revision.value).toBe(3);
    expect(context.history.version.value).toBe(3);

    await assertDurableOutputs(context, cel.layerId);
  });

  it('requires crop confirmation for meaningful RGBA or indexed content', async () => {
    const { context, cel } = createContext();
    context.palette.setPalette(['#000000', '#ff0000', '#00ff00', '#0000ff']);
    const canvasContext = cel.canvas.getContext('2d');
    if (!canvasContext) throw new Error('Chromium did not provide a 2D canvas context');
    canvasContext.fillStyle = '#00ff00';
    canvasContext.fillRect(1, 1, 1, 1);
    canvasContext.fillRect(3, 3, 1, 1);
    const indexBuffer = new Uint8Array(16);
    indexBuffer[5] = 2;
    indexBuffer[15] = 4;
    context.animation.updateCelIndexBuffer(cel.layerId, cel.frameId, indexBuffer);
    const request = createCanvasSizeRequest(context, 2, 2);

    const preview = previewCanvasSize(context, request);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.preview.requiresConfirmation).toBe(true);
    expect(preview.preview.crop.rgbaPixels).toBe(1);
    expect(preview.preview.crop.indexedPixels).toBe(1);

    const cancelled = await executeCanvasSize(context, request);
    expect(cancelled).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(context.project.width.value).toBe(4);
    expect(context.history.undoStack.value).toHaveLength(0);

    const missingPreview = await executeCanvasSize(context, request, { confirmed: true });
    expect(missingPreview).toMatchObject({
      ok: false,
      error: { code: 'invalid_request', details: { reason: 'preview_required' } },
    });
    expect(context.project.width.value).toBe(4);
    expect(context.project.height.value).toBe(4);
    expect(context.project.revision.value).toBe(0);
    expect(context.history.undoStack.value).toHaveLength(0);

    const committed = await executeCanvasSize(context, request, {
      confirmed: true,
      preview: preview.preview,
    });
    expect(committed.ok).toBe(true);
    expect(context.project.width.value).toBe(2);
    expect(context.project.height.value).toBe(2);
    expect(pixel(context.animation.cels.value.get(
      context.animation.getCelKey(cel.layerId, cel.frameId)
    )!.canvas, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(getCel(context, cel.layerId, cel.frameId).indexBuffer?.length).toBe(4);
    expect(getCel(context, cel.layerId, cel.frameId).indexBuffer?.[3]).toBe(2);
    await assertDurableOutputs(context, cel.layerId);
  });

  it('advances project revision for real history transitions and rejects captured canvas requests', async () => {
    const { context } = createContext();
    const request = createCanvasSizeRequest(context, 6, 6);
    const initialRevision = context.project.revision.value;

    await context.history.execute(new AddFrameCommand(false, undefined, context));
    expect(context.project.revision.value).toBe(initialRevision + 1);

    const stale = await executeCanvasSize(context, request);
    expect(stale).toMatchObject({ ok: false, error: { code: 'revision_conflict' } });
    expect(context.project.width.value).toBe(4);
    expect(context.history.undoStack.value).toHaveLength(1);

    await context.history.undo();
    expect(context.project.revision.value).toBe(initialRevision + 2);
    await context.history.redo();
    expect(context.project.revision.value).toBe(initialRevision + 3);
  });

  it('rejects stale, wrong-target, and guided requests without mutation', async () => {
    const { context } = createContext();
    const tooLarge = await executeCanvasSize(context, createCanvasSizeRequest(context, 2049, 4));
    expect(tooLarge).toMatchObject({ ok: false, error: { code: 'limit_exceeded' } });
    expect(context.project.width.value).toBe(4);

    const legacyTarget = await executeCanvasSize(context, {
      target: context.project.id.value,
      expectedRevision: 0,
      width: 6,
      height: 6,
    } as unknown as CanvasSizeRequest);
    expect(legacyTarget).toMatchObject({
      ok: false,
      error: { code: 'invalid_request', details: { reason: 'target' } },
    });

    const missingOffset = await executeCanvasSize(context, {
      target: { projectId: context.project.id.value },
      expectedRevision: 0,
      width: 6,
      height: 6,
    } as unknown as CanvasSizeRequest);
    expect(missingOffset).toMatchObject({
      ok: false,
      error: { code: 'invalid_request', details: { reason: 'offset' } },
    });
    expect(context.project.revision.value).toBe(0);
    expect(context.history.undoStack.value).toHaveLength(0);

    const request = createCanvasSizeRequest(context, 6, 6);
    context.project.commitChange('unrelated', ['raster-content']);
    const stale = await executeCanvasSize(context, request);
    expect(stale).toMatchObject({ ok: false, error: { code: 'revision_conflict' } });
    expect(context.project.width.value).toBe(4);

    const wrongTarget = await executeCanvasSize(context, {
      ...createCanvasSizeRequest(context, 6, 6),
      target: { projectId: 'other-project' },
    });
    expect(wrongTarget).toMatchObject({ ok: false, error: { code: 'target_not_found' } });

    context.project.resetRevision();
    context.guidedDrawing.start({
      version: 1,
      width: 1,
      height: 1,
      target: Uint8Array.from([1]),
      guideColorCount: 1,
      settings: {
        longSide: 1,
        paletteSource: 'generated',
        maxColors: 1,
        mapping: 'color',
        simplifyIsolatedPixels: false,
      },
      createdAt: 1,
    });
    const guided = await executeCanvasSize(context, createCanvasSizeRequest(context, 6, 6));
    expect(guided).toMatchObject({ ok: false, error: { code: 'unsupported' } });
    expect(context.project.width.value).toBe(4);
  });

  it('maps allocation refusal to a stable error without partial mutation', async () => {
    const { context } = createContext();
    const createElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement');
    createElementSpy.mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      if (tagName.toLowerCase() === 'canvas') {
        throw new Error('simulated canvas allocation failure');
      }
      return createElement(tagName, options);
    });

    const result = await executeCanvasSize(context, createCanvasSizeRequest(context, 6, 6));
    createElementSpy.mockRestore();

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'limit_exceeded', details: { limitId: 'canvas-size-allocation' } },
    });
    expect(context.project.width.value).toBe(4);
    expect(context.project.height.value).toBe(4);
    expect(context.project.revision.value).toBe(0);
    expect(context.history.undoStack.value).toHaveLength(0);
  });
});
