import { afterEach, describe, expect, it } from 'vitest';
import {
  captureRasterTarget,
  executeFill,
  executeGradient,
  renderGradientPreview,
  type FillRequest,
  type GradientRequest,
} from '../../src/editor/raster-tools';
import { autoSaveService } from '../../src/services/auto-save';
import { createProjectContext, type ProjectContext } from '../../src/stores/project-context';

const contexts: ProjectContext[] = [];

function createRasterContext(): {
  context: ProjectContext;
  layerId: string;
  frameId: string;
  canvas: HTMLCanvasElement;
} {
  const context = createProjectContext();
  contexts.push(context);
  const width = 4;
  const height = 2;
  context.project.setSize(width, height);
  context.palette.setPalette(['#000000', '#ff0000', '#00ff00', '#0000ff']);

  const layer = context.layers.layers.value[0];
  if (!layer) throw new Error('Expected an image layer');
  const frameId = context.animation.currentFrameId.value;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const cel = context.animation.cels.value.get(context.animation.getCelKey(layer.id, frameId));
  if (!cel) throw new Error('Expected an initial cel');

  context.layers.updateLayer(layer.id, { canvas });
  context.animation.cels.value = new Map([
    [context.animation.getCelKey(layer.id, frameId), {
      ...cel,
      canvas,
      indexBuffer: new Uint8Array(width * height),
    }],
  ]);

  return { context, layerId: layer.id, frameId, canvas };
}

function getCelIndices(context: ProjectContext, layerId: string, frameId: string): number[] {
  const indexBuffer = context.animation.getCelIndexBuffer(layerId, frameId);
  if (!indexBuffer) throw new Error('Expected indexed cel data');
  return Array.from(indexBuffer);
}

function setCelIndices(
  context: ProjectContext,
  layerId: string,
  frameId: string,
  indices: number[],
): void {
  context.animation.updateCelIndexBuffer(layerId, frameId, Uint8Array.from(indices));
}

function rgbaPixels(canvas: HTMLCanvasElement): number[] {
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) throw new Error('Chromium did not provide a 2D context');
  return Array.from(canvasContext.getImageData(0, 0, canvas.width, canvas.height).data);
}

describe('Fill and Gradient project transactions in Chromium', () => {
  afterEach(() => {
    for (const context of contexts.splice(0)) {
      autoSaveService.stop(context);
      context.dispose();
    }
  });

  it('honors contiguous Fill, then replays one indexed transaction through Undo/Redo', async () => {
    const { context, layerId, frameId, canvas } = createRasterContext();
    setCelIndices(context, layerId, frameId, [1, 1, 2, 1, 2, 2, 2, 1]);
    autoSaveService.start(context);

    const request: FillRequest = {
      ...captureRasterTarget(context, layerId, frameId),
      startX: 0,
      startY: 0,
      hex: '#0000ff',
      contiguous: true,
    };
    const result = await executeFill(context, request);

    expect(result.ok).toBe(true);
    expect(getCelIndices(context, layerId, frameId)).toEqual([4, 4, 2, 1, 2, 2, 2, 1]);
    expect(context.history.undoStack.value).toHaveLength(1);
    expect(context.project.revision.value).toBe(1);
    expect(autoSaveService.isDirty(context)).toBe(true);
    expect(rgbaPixels(canvas).slice(0, 8)).toEqual([0, 0, 255, 255, 0, 0, 255, 255]);

    await context.history.undo();
    expect(getCelIndices(context, layerId, frameId)).toEqual([1, 1, 2, 1, 2, 2, 2, 1]);
    await context.history.redo();
    expect(getCelIndices(context, layerId, frameId)).toEqual([4, 4, 2, 1, 2, 2, 2, 1]);
  });

  it('fills disconnected matches and keeps Gradient preview outside history while committing radial output', async () => {
    const { context, layerId, frameId, canvas } = createRasterContext();
    setCelIndices(context, layerId, frameId, [1, 1, 2, 1, 2, 2, 2, 1]);
    const fillResult = await executeFill(context, {
      ...captureRasterTarget(context, layerId, frameId),
      startX: 0,
      startY: 0,
      hex: '#00ff00',
      contiguous: false,
    });
    expect(fillResult.ok).toBe(true);
    expect(getCelIndices(context, layerId, frameId)).toEqual([3, 3, 2, 3, 2, 2, 2, 3]);

    const beforePreviewPixels = rgbaPixels(canvas);
    const beforePreviewIndices = getCelIndices(context, layerId, frameId);
    const beforePreviewRevision = context.project.revision.value;
    const beforePreviewHistory = context.history.version.value;
    const gradientRequest: GradientRequest = {
      ...captureRasterTarget(context, layerId, frameId),
      startX: 1,
      startY: 1,
      endX: 3,
      endY: 1,
      primaryHex: '#ff0000',
      secondaryHex: '#0000ff',
      type: 'radial',
      shift: true,
    };
    const preview = renderGradientPreview(context, gradientRequest, canvas.width, canvas.height);
    expect(preview.effectiveEnd.y).toBe(1);
    expect(context.project.revision.value).toBe(beforePreviewRevision);
    expect(context.history.version.value).toBe(beforePreviewHistory);
    expect(getCelIndices(context, layerId, frameId)).toEqual(beforePreviewIndices);
    expect(rgbaPixels(canvas)).toEqual(beforePreviewPixels);

    const comparison = createRasterContext();
    comparison.context.palette.setPalette([
      '#ff0000',
      '#bf0040',
      '#800080',
      '#4000bf',
      '#0000ff',
    ]);
    const linear = renderGradientPreview(comparison.context, {
      ...gradientRequest,
      ...captureRasterTarget(comparison.context, comparison.layerId, comparison.frameId),
      startX: 0,
      startY: 0,
      endX: 3,
      endY: 1,
      type: 'linear',
      shift: false,
    }, comparison.canvas.width, comparison.canvas.height);
    const radial = renderGradientPreview(comparison.context, {
      ...gradientRequest,
      ...captureRasterTarget(comparison.context, comparison.layerId, comparison.frameId),
      startX: 0,
      startY: 0,
      endX: 3,
      endY: 1,
      type: 'radial',
      shift: false,
    }, comparison.canvas.width, comparison.canvas.height);
    expect(Array.from(linear.pixels)).not.toEqual(Array.from(radial.pixels));

    const constrained = renderGradientPreview(comparison.context, {
      ...gradientRequest,
      ...captureRasterTarget(comparison.context, comparison.layerId, comparison.frameId),
      startX: 0,
      startY: 0,
      endX: 4,
      endY: 3,
      type: 'linear',
      shift: true,
    }, comparison.canvas.width, comparison.canvas.height);
    const unconstrained = renderGradientPreview(comparison.context, {
      ...gradientRequest,
      ...captureRasterTarget(comparison.context, comparison.layerId, comparison.frameId),
      startX: 0,
      startY: 0,
      endX: 4,
      endY: 3,
      type: 'linear',
      shift: false,
    }, comparison.canvas.width, comparison.canvas.height);
    expect(constrained.effectiveEnd).not.toEqual(unconstrained.effectiveEnd);

    const result = await executeGradient(context, gradientRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.effectivePalettePolicy).toBe('existing-palette');
    expect(result.endpoints.start).toEqual({ index: 2, color: '#ff0000' });
    expect(result.endpoints.end).toEqual({ index: 4, color: '#0000ff' });
    expect(context.history.undoStack.value).toHaveLength(2);
    expect(new Set(getCelIndices(context, layerId, frameId))).toEqual(new Set([2, 4]));

    for (let index = 0; index < getCelIndices(context, layerId, frameId).length; index++) {
      const paletteIndex = getCelIndices(context, layerId, frameId)[index];
      const expected = context.palette.getColorByIndex(paletteIndex);
      const offset = index * 4;
      const pixels = rgbaPixels(canvas);
      expect(expected).not.toBeNull();
      if (!expected) continue;
      const hex = expected.slice(1);
      expect(pixels.slice(offset, offset + 4)).toEqual([
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
        255,
      ]);
    }
  });

  it('rejects stale and wrong-project requests without changing raster state, then survives save/reload', async () => {
    const first = createRasterContext();
    const second = createRasterContext();
    const request: FillRequest = {
      ...captureRasterTarget(first.context, first.layerId, first.frameId),
      startX: 0,
      startY: 0,
      hex: '#00ff00',
      contiguous: true,
    };
    const beforeWrongProject = rgbaPixels(second.canvas);
    const wrongProject = await executeFill(second.context, request);
    expect(wrongProject).toMatchObject({ ok: false, error: { code: 'target_not_found' } });
    expect(rgbaPixels(second.canvas)).toEqual(beforeWrongProject);

    const gradientPreviewRequest: GradientRequest = {
      ...captureRasterTarget(first.context, first.layerId, first.frameId),
      startX: 0,
      startY: 0,
      endX: 3,
      endY: 1,
      primaryHex: '#ff0000',
      secondaryHex: '#0000ff',
      type: 'linear',
      shift: false,
    };
    const secondPalette = [...second.context.palette.mainColors.value];
    expect(() => renderGradientPreview(
      second.context,
      gradientPreviewRequest,
      second.canvas.width,
      second.canvas.height,
    )).toThrow('target_not_found');
    expect(second.context.palette.mainColors.value).toEqual(secondPalette);

    first.context.project.commitChange('external-change', ['raster-content']);
    const beforeStale = rgbaPixels(first.canvas);
    const stale = await executeFill(first.context, request);
    expect(stale).toMatchObject({ ok: false, error: { code: 'revision_conflict' } });
    expect(rgbaPixels(first.canvas)).toEqual(beforeStale);
    expect(first.context.history.undoStack.value).toHaveLength(0);
    const firstPalette = [...first.context.palette.mainColors.value];
    expect(() => renderGradientPreview(
      first.context,
      gradientPreviewRequest,
      first.canvas.width,
      first.canvas.height,
    )).toThrow('revision_conflict');
    expect(first.context.palette.mainColors.value).toEqual(firstPalette);

    const fresh = createRasterContext();
    const committed = await executeFill(fresh.context, {
      ...captureRasterTarget(fresh.context, fresh.layerId, fresh.frameId),
      startX: 0,
      startY: 0,
      hex: '#00ff00',
      contiguous: true,
    });
    expect(committed.ok).toBe(true);
    const saved = await fresh.context.project.saveProject();
    await fresh.context.project.loadProject(structuredClone(saved));
    expect(getCelIndices(fresh.context, fresh.layerId, fresh.context.animation.currentFrameId.value))
      .toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
  });

  it('rejects zero-length gradients and indexed writes beyond 255 atomically', async () => {
    const { context, layerId, frameId, canvas } = createRasterContext();
    setCelIndices(context, layerId, frameId, [1, 1, 1, 1, 1, 1, 1, 1]);
    const beforePixels = rgbaPixels(canvas);
    const beforeIndices = getCelIndices(context, layerId, frameId);
    const zeroLength = await executeGradient(context, {
      ...captureRasterTarget(context, layerId, frameId),
      startX: 1,
      startY: 1,
      endX: 1,
      endY: 1,
      primaryHex: '#ff0000',
      secondaryHex: '#0000ff',
      type: 'linear',
      shift: false,
    });
    expect(zeroLength).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(rgbaPixels(canvas)).toEqual(beforePixels);
    expect(getCelIndices(context, layerId, frameId)).toEqual(beforeIndices);
    expect(context.project.revision.value).toBe(0);
    expect(context.history.undoStack.value).toHaveLength(0);

    const capacityPalette = Array.from({ length: 256 }, (_, index) =>
      `#${index.toString(16).padStart(2, '0')}${((index * 13) % 256).toString(16).padStart(2, '0')}${((index * 29) % 256).toString(16).padStart(2, '0')}`
    );
    capacityPalette[255] = '#ffffff';
    context.palette.setPalette(capacityPalette);
    const beforeCapacityPalette = [...context.palette.mainColors.value];
    const fillAtCapacity = await executeFill(context, {
      ...captureRasterTarget(context, layerId, frameId),
      startX: 0,
      startY: 0,
      hex: '#010101',
      contiguous: true,
    });
    expect(fillAtCapacity).toMatchObject({ ok: false, error: { code: 'limit_exceeded' } });
    expect(context.palette.mainColors.value).toEqual(beforeCapacityPalette);
    expect(context.project.revision.value).toBe(0);

    const gradientAtCapacity = await executeGradient(context, {
      ...captureRasterTarget(context, layerId, frameId),
      startX: 0,
      startY: 0,
      endX: 3,
      endY: 1,
      primaryHex: '#ffffff',
      secondaryHex: '#ffffff',
      type: 'linear',
      shift: false,
    });
    expect(gradientAtCapacity).toMatchObject({ ok: false, error: { code: 'limit_exceeded' } });
    expect(context.palette.mainColors.value).toEqual(beforeCapacityPalette);
    expect(context.project.revision.value).toBe(0);
  });

  it('keeps hard-linked canvas and index payloads coherent through Fill undo/redo and palette restoration', async () => {
    const { context, layerId, frameId, canvas } = createRasterContext();
    setCelIndices(context, layerId, frameId, [1, 1, 1, 1, 1, 1, 1, 1]);
    const firstKey = context.animation.getCelKey(layerId, frameId);
    context.animation.addFrame(false);
    const frames = context.animation.frames.value;
    const lastFrame = frames[frames.length - 1];
    if (!lastFrame) throw new Error('Expected a linked target frame');
    const lastKey = context.animation.getCelKey(layerId, lastFrame.id);
    context.animation.linkCels([firstKey, lastKey], 'hard');
    context.animation.goToFrame(frameId);
    const linkedCel = context.animation.cels.value.get(lastKey);
    const firstCel = context.animation.cels.value.get(firstKey);
    if (!linkedCel || !firstCel?.indexBuffer) throw new Error('Expected hard-linked cels');
    const paletteBefore = [...context.palette.mainColors.value];

    const result = await executeFill(context, {
      ...captureRasterTarget(context, layerId, frameId),
      startX: 0,
      startY: 0,
      hex: '#ffff00',
      contiguous: true,
    });
    expect(result.ok).toBe(true);
    expect(firstCel.canvas).toBe(linkedCel.canvas);
    expect(firstCel.indexBuffer).toBe(linkedCel.indexBuffer);
    expect(getCelIndices(context, layerId, frameId)).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    expect(getCelIndices(context, layerId, lastFrame.id)).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    expect(context.palette.mainColors.value).toEqual([...paletteBefore, '#ffff00']);

    await context.history.undo();
    expect(getCelIndices(context, layerId, frameId)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(getCelIndices(context, layerId, lastFrame.id)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(context.palette.mainColors.value).toEqual(paletteBefore);
    expect(rgbaPixels(canvas).slice(0, 4)).toEqual([0, 0, 0, 255]);

    await context.history.redo();
    expect(getCelIndices(context, layerId, frameId)).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    expect(context.palette.mainColors.value).toEqual([...paletteBefore, '#ffff00']);
  });
});
