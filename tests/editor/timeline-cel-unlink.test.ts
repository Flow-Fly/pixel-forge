import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCelUnlinkRequest,
  executeTimelineProjectState,
} from '../../src/editor/timeline-project-state';
import { autoSaveService } from '../../src/services/auto-save';
import { createProjectContext, type ProjectContext } from '../../src/stores/project-context';
import type { Cel, Frame } from '../../src/types/animation';

const contexts: ProjectContext[] = [];

function createHardLinkedContext() {
  const context = createProjectContext();
  contexts.push(context);
  const layer = context.layers.layers.value[0];
  if (!layer) throw new Error('Expected a layer');

  context.animation.addFrame(false);
  context.animation.addFrame(false);
  const frames = context.animation.frames.value;
  const middleFrame = frames[1];
  if (!middleFrame) throw new Error('Expected three frames');

  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const indexBuffer = Uint8Array.from([1, 2, 3, 4]);
  const linkId = 'shared-cel-group';
  const cels = new Map(context.animation.cels.value);
  for (const frame of frames) {
    const key = context.animation.getCelKey(layer.id, frame.id);
    cels.set(key, {
      id: `cel-${frame.id}`,
      layerId: layer.id,
      frameId: frame.id,
      canvas,
      indexBuffer,
      linkedCelId: linkId,
      linkType: 'hard',
      opacity: 47,
      textCelData: { content: 'Shared note', x: 2, y: 3 },
    });
  }
  context.animation.cels.value = cels;
  context.animation.goToFrame(middleFrame.id);

  const middleKey = context.animation.getCelKey(layer.id, middleFrame.id);
  const middleCel = context.animation.cels.value.get(middleKey);
  if (!middleCel) throw new Error('Expected a middle cel');

  return { context, layer, frames, canvas, indexBuffer, linkId, middleKey, middleCel };
}

function snapshot(context: ProjectContext) {
  return {
    cels: context.animation.cels.value,
    history: context.history.undoStack.value,
    revision: context.project.revision.value,
  };
}

function expectUnlinkedCel(
  context: ProjectContext,
  middleKey: string,
  middleCel: Cel,
  canvas: HTMLCanvasElement,
  indexBuffer: Uint8Array,
) {
  const unlinked = context.animation.cels.value.get(middleKey);
  expect(unlinked).toMatchObject({
    id: middleCel.id,
    opacity: 47,
    textCelData: { content: 'Shared note', x: 2, y: 3 },
    linkedCelId: undefined,
    linkType: undefined,
  });
  expect(unlinked?.canvas).not.toBe(canvas);
  expect(unlinked?.indexBuffer).not.toBe(indexBuffer);
  expect(unlinked?.indexBuffer).toEqual(indexBuffer);
  return unlinked;
}

function expectRemainingGroup(
  context: ProjectContext,
  layerId: string,
  frames: Frame[],
  linkId: string,
  canvas: HTMLCanvasElement,
  indexBuffer: Uint8Array,
) {
  for (const frame of [frames[0], frames[2]]) {
    if (!frame) throw new Error('Expected linked frame');
    const cel = context.animation.cels.value.get(context.animation.getCelKey(layerId, frame.id));
    expect(cel).toMatchObject({ linkedCelId: linkId, linkType: 'hard' });
    expect(cel?.canvas).toBe(canvas);
    expect(cel?.indexBuffer).toBe(indexBuffer);
  }
}

describe('timeline cel unlink transaction', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingEnabled: false,
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const context of contexts.splice(0)) {
      autoSaveService.stop(context);
      context.dispose();
    }
  });

  it('unlinks only the captured cel and restores the exact snapshots through Undo and Redo', async () => {
    vi.useFakeTimers();
    const { context, layer, frames, canvas, indexBuffer, linkId, middleKey, middleCel } =
      createHardLinkedContext();
    autoSaveService.start(context);
    const events: unknown[] = [];
    context.projectChangeEvents.addEventListener('project-change', (event) => {
      events.push((event as CustomEvent).detail);
    });

    const result = await executeTimelineProjectState(
      context,
      createCelUnlinkRequest(context, layer.id, middleCel.frameId),
    );

    expect(result).toMatchObject({ ok: true, revision: 1 });
    const unlinked = expectUnlinkedCel(context, middleKey, middleCel, canvas, indexBuffer);
    expect(context.layers.layers.value[0]?.canvas).toBe(unlinked?.canvas);
    expect(context.history.undoStack.value).toHaveLength(1);
    expect(context.project.revision.value).toBe(1);
    expect(events).toHaveLength(1);
    expect((events[0] as { domains: string[] }).domains).toEqual(['timeline', 'raster-content']);
    expect(autoSaveService.isDirty(context)).toBe(true);

    expectRemainingGroup(context, layer.id, frames, linkId, canvas, indexBuffer);

    await context.history.undo();
    expect(context.animation.cels.value.get(middleKey)).toBe(middleCel);
    expect(context.layers.layers.value[0]?.canvas).toBe(canvas);
    expect(context.project.revision.value).toBe(2);

    await context.history.redo();
    expect(context.animation.cels.value.get(middleKey)).toBe(unlinked);
    expect(context.project.revision.value).toBe(3);
    expect(events).toHaveLength(3);
    vi.useRealTimers();
  });

  it('leaves the project untouched when cloning the active cel cannot allocate a canvas context', async () => {
    const { context, layer, middleCel } = createHardLinkedContext();
    const before = snapshot(context);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const result = await executeTimelineProjectState(
      context,
      createCelUnlinkRequest(context, layer.id, middleCel.frameId),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: 'internal', retryable: true, details: { reason: 'canvas_allocation' } },
    });
    expect(snapshot(context)).toEqual(before);
  });

  it('keeps a captured project target isolated after the active project changes', async () => {
    const source = createHardLinkedContext();
    const other = createHardLinkedContext();
    const request = createCelUnlinkRequest(source.context, source.layer.id, source.middleCel.frameId);
    const otherBefore = snapshot(other.context);

    const result = await executeTimelineProjectState(source.context, request);

    expect(result.ok).toBe(true);
    expect(source.context.animation.cels.value.get(source.middleKey)?.linkedCelId).toBeUndefined();
    expect(snapshot(other.context)).toEqual(otherBefore);
  });

  it('rejects a stale request without changing cels, history, or revision', async () => {
    const { context, layer, middleCel } = createHardLinkedContext();
    const request = createCelUnlinkRequest(context, layer.id, middleCel.frameId);
    context.project.commitChange('other-timeline-change', ['timeline']);
    const before = snapshot(context);

    const result = await executeTimelineProjectState(context, request);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'revision_conflict',
        retryable: true,
        details: { expectedRevision: 0, currentRevision: 1 },
      },
    });
    expect(snapshot(context)).toEqual(before);
  });
});
