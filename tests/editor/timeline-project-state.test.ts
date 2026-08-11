import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFrameTagRequest,
  createLayerDirectionRequest,
  createLayerDropRequest,
  createLayerContinuityRequest,
  createLayerLockRequest,
  createLayerVisibilityRequest,
  executeTimelineProjectState,
} from '../../src/editor/timeline-project-state';
import { autoSaveService } from '../../src/services/auto-save';
import { createProjectContext, type ProjectContext } from '../../src/stores/project-context';

const contexts: ProjectContext[] = [];

function createContext(): ProjectContext {
  const context = createProjectContext();
  contexts.push(context);
  context.layers.addLayer('Second');
  return context;
}

describe('timeline project-state transactions', () => {
  afterEach(() => {
    vi.useRealTimers();
    for (const context of contexts.splice(0)) {
      autoSaveService.stop(context);
      context.dispose();
    }
  });

  it('commits a targeted layer change once and replays it exactly', async () => {
    vi.useFakeTimers();
    const context = createContext();
    autoSaveService.start(context);
    const layer = context.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');
    const events: unknown[] = [];
    context.projectChangeEvents.addEventListener('project-change', (event) => {
      events.push((event as CustomEvent).detail);
    });

    const result = await executeTimelineProjectState(
      context,
      createLayerVisibilityRequest(context, layer.id, false),
    );

    expect(result).toMatchObject({ ok: true, revision: 1 });
    expect(layer.visible).toBe(true);
    expect(context.layers.layers.value.find((item) => item.id === layer.id)?.visible).toBe(false);
    expect(context.history.undoStack.value).toHaveLength(1);
    expect(context.history.version.value).toBe(1);
    expect(context.project.revision.value).toBe(1);
    expect(events).toHaveLength(1);
    expect((events[0] as { domains: string[] }).domains).toEqual(['layer-state']);
    expect(autoSaveService.isDirty(context)).toBe(true);

    await context.history.undo();
    expect(context.layers.layers.value.find((item) => item.id === layer.id)?.visible).toBe(true);
    expect(context.project.revision.value).toBe(2);
    expect(context.history.version.value).toBe(2);

    await context.history.redo();
    expect(context.layers.layers.value.find((item) => item.id === layer.id)?.visible).toBe(false);
    expect(context.project.revision.value).toBe(3);
    expect(context.history.version.value).toBe(3);
    expect(events).toHaveLength(3);
  });

  it('preserves toolbar and flat drag reorder semantics', async () => {
    const context = createContext();
    const [first, second] = context.layers.layers.value;
    if (!first || !second) throw new Error('Expected two layers');

    await executeTimelineProjectState(context, createLayerDirectionRequest(context, first.id, 'up'));
    expect(context.layers.layers.value.map((layer) => layer.id)).toEqual([second.id, first.id]);
    await context.history.undo();
    expect(context.layers.layers.value.map((layer) => layer.id)).toEqual([first.id, second.id]);

    await executeTimelineProjectState(
      context,
      createLayerDropRequest(context, second.id, first.id),
    );
    expect(context.layers.layers.value.map((layer) => layer.id)).toEqual([second.id, first.id]);
  });

  it('reproduces the first Undo revision conflict after the complete layer-action sequence', async () => {
    vi.useFakeTimers();
    const context = createContext();
    autoSaveService.start(context);
    const [first, second] = context.layers.layers.value;
    if (!first || !second) throw new Error('Expected two layers');
    const events: unknown[] = [];
    context.projectChangeEvents.addEventListener('project-change', (event) => {
      events.push((event as CustomEvent).detail);
    });

    const actionFactories = [
      () => createLayerVisibilityRequest(context, first.id, false),
      () => createLayerLockRequest(context, first.id, true),
      () => createLayerContinuityRequest(context, first.id, true),
      () => createLayerDirectionRequest(context, first.id, 'up'),
      () => createLayerDropRequest(context, second.id, first.id),
    ];
    for (const createAction of actionFactories) {
      const result = await executeTimelineProjectState(context, createAction());
      expect(result.ok).toBe(true);
      await context.history.undo();
      await context.history.redo();
    }
    expect(context.history.undoStack.value).toHaveLength(5);
    expect(autoSaveService.isDirty(context)).toBe(true);
    const revisionBeforeSync = context.project.revision.value;
    const historyVersionBeforeSync = context.history.version.value;
    const eventCountBeforeSync = events.length;
    context.animation.syncLayerCanvases();
    const layersAfterSync = new Map(
      context.layers.layers.value.map((layer) => [layer.id, layer.canvas]),
    );
    const celsAfterSync = context.animation.cels.value;

    await context.history.undo();
    expect(context.layers.layers.value.map((layer) => layer.id)).toEqual([second.id, first.id]);
    expect(context.layers.layers.value.find((layer) => layer.id === first.id)).toMatchObject({
      visible: false,
      locked: true,
      continuous: true,
    });
    expect(context.history.undoStack.value).toHaveLength(4);
    expect(context.history.redoStack.value).toHaveLength(1);
    expect(context.history.version.value).toBe(historyVersionBeforeSync + 1);
    expect(context.project.revision.value).toBe(revisionBeforeSync + 1);
    expect(events).toHaveLength(eventCountBeforeSync + 1);
    expect((events.at(-1) as { domains: string[] }).domains).toEqual(['layer-state']);
    expect(autoSaveService.isDirty(context)).toBe(true);
    expect(context.animation.cels.value).toBe(celsAfterSync);
    for (const layer of context.layers.layers.value) {
      expect(layer.canvas).toBe(layersAfterSync.get(layer.id));
    }
    for (const [key, cel] of celsAfterSync) {
      expect(context.animation.cels.value.get(key)).toBe(cel);
    }
  });

  it('allows current-frame cel materialization between a layer command and Undo', async () => {
    const context = createContext();
    const [first, second] = context.layers.layers.value;
    if (!first || !second) throw new Error('Expected two layers');

    const result = await executeTimelineProjectState(
      context,
      createLayerVisibilityRequest(context, first.id, false),
    );
    expect(result.ok).toBe(true);
    const secondKey = context.animation.getCelKey(second.id, context.animation.currentFrameId.value);
    expect(context.animation.cels.value.has(secondKey)).toBe(false);

    context.animation.syncLayerCanvases();
    const materializedCel = context.animation.cels.value.get(secondKey);
    if (!materializedCel) throw new Error('Expected current-frame cel materialization');

    await context.history.undo();
    expect(context.layers.layers.value.find((layer) => layer.id === first.id)?.visible).toBe(true);
    expect(context.layers.layers.value.find((layer) => layer.id === second.id)?.canvas)
      .toBe(materializedCel.canvas);
    expect(context.animation.cels.value.get(secondKey)).toBe(materializedCel);
  });

  it('allows current-frame cel rebinding between a layer command and Undo', async () => {
    const context = createContext();
    const layer = context.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');
    context.animation.syncLayerCanvases();
    const key = context.animation.getCelKey(layer.id, context.animation.currentFrameId.value);
    const cel = context.animation.cels.value.get(key);
    if (!cel) throw new Error('Expected a current-frame cel');
    const staleCanvas = document.createElement('canvas');
    staleCanvas.width = 64;
    staleCanvas.height = 64;
    context.layers.updateLayer(layer.id, { canvas: staleCanvas });

    const result = await executeTimelineProjectState(
      context,
      createLayerVisibilityRequest(context, layer.id, false),
    );
    expect(result.ok).toBe(true);
    context.animation.syncLayerCanvases();

    await context.history.undo();
    expect(context.layers.layers.value.find((item) => item.id === layer.id)?.visible).toBe(true);
    expect(context.layers.layers.value.find((item) => item.id === layer.id)?.canvas)
      .toBe(cel.canvas);
    expect(context.animation.cels.value.get(key)).toBe(cel);
  });

  it('rejects layer identity divergence without mutating history or revision', async () => {
    const context = createContext();
    const layer = context.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');
    const events: unknown[] = [];
    context.projectChangeEvents.addEventListener('project-change', (event) => {
      events.push((event as CustomEvent).detail);
    });

    const result = await executeTimelineProjectState(
      context,
      createLayerVisibilityRequest(context, layer.id, false),
    );
    expect(result.ok).toBe(true);
    const undoStackBefore = context.history.undoStack.value;
    const redoStackBefore = context.history.redoStack.value;
    const historyVersionBefore = context.history.version.value;
    const revisionBefore = context.project.revision.value;
    const eventCountBefore = events.length;
    const dirtyBefore = autoSaveService.isDirty(context);
    context.layers.updateLayer(layer.id, { name: 'Renamed externally' });

    await expect(context.history.undo()).rejects.toMatchObject({
      editorError: {
        code: 'revision_conflict',
        details: { reason: 'history_structure_changed' },
      },
    });
    expect(context.layers.layers.value.find((item) => item.id === layer.id)?.name)
      .toBe('Renamed externally');
    expect(context.history.undoStack.value).toBe(undoStackBefore);
    expect(context.history.redoStack.value).toBe(redoStackBefore);
    expect(context.history.version.value).toBe(historyVersionBefore);
    expect(context.project.revision.value).toBe(revisionBefore);
    expect(events).toHaveLength(eventCountBefore);
    expect(autoSaveService.isDirty(context)).toBe(dirtyBefore);
  });

  it('preserves equivalent and semantic cel replacements through layer Undo', async () => {
    const run = async (semanticChange: boolean) => {
      const context = createContext();
      const [first, second] = context.layers.layers.value;
      if (!first || !second) throw new Error('Expected two layers');
      const result = await executeTimelineProjectState(
        context,
        createLayerDirectionRequest(context, first.id, 'up'),
      );
      expect(result.ok).toBe(true);
      expect(context.layers.layers.value.map((layer) => layer.id)).toEqual([second.id, first.id]);

      const key = context.animation.getCelKey(first.id, context.animation.currentFrameId.value);
      const cel = context.animation.cels.value.get(key);
      if (!cel) throw new Error('Expected a cel');
      const replacement = {
        ...cel,
        ...(semanticChange ? { opacity: 37 } : {}),
      };
      context.animation.cels.value = new Map(context.animation.cels.value).set(key, replacement);

      await context.history.undo();
      expect(context.layers.layers.value.map((layer) => layer.id)).toEqual([first.id, second.id]);
      expect(context.animation.cels.value.get(key)).toBe(replacement);
      expect(context.animation.cels.value.get(key)?.opacity).toBe(semanticChange ? 37 : undefined);
    };

    await run(false);
    await run(true);
  });

  it('rejects frame and tag divergence during tag Undo without mutation', async () => {
    const expectRejected = async (mutate: (context: ProjectContext) => void) => {
      const context = createContext();
      const events: unknown[] = [];
      context.projectChangeEvents.addEventListener('project-change', (event) => {
        events.push((event as CustomEvent).detail);
      });
      const result = await executeTimelineProjectState(
        context,
        createFrameTagRequest(context, {
          kind: 'tag.create',
          name: 'Replay',
          color: '#123456',
          startFrameIndex: 0,
          endFrameIndex: 0,
        }),
      );
      expect(result.ok).toBe(true);
      const undoStackBefore = context.history.undoStack.value;
      const redoStackBefore = context.history.redoStack.value;
      const historyVersionBefore = context.history.version.value;
      const revisionBefore = context.project.revision.value;
      const eventCountBefore = events.length;
      mutate(context);

      await expect(context.history.undo()).rejects.toMatchObject({
        editorError: {
          code: 'revision_conflict',
          details: { reason: 'history_structure_changed' },
        },
      });
      expect(context.history.undoStack.value).toBe(undoStackBefore);
      expect(context.history.redoStack.value).toBe(redoStackBefore);
      expect(context.history.version.value).toBe(historyVersionBefore);
      expect(context.project.revision.value).toBe(revisionBefore);
      expect(events).toHaveLength(eventCountBefore);
    };

    await expectRejected((context) => {
      context.animation.frames.value = context.animation.frames.value.map((frame) => ({
        ...frame,
        duration: frame.duration + 1,
      }));
    });
    await expectRejected((context) => {
      context.animation.tags.value = context.animation.tags.value.map((tag) => ({
        ...tag,
        name: 'Changed externally',
      }));
    });
  });

  it('rejects stale, wrong-project, and unavailable requests without mutation', async () => {
    const context = createContext();
    const layer = context.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');
    const stale = createLayerVisibilityRequest(context, layer.id, false);
    context.project.commitChange('external-change', ['layer-state']);

    const historyBefore = context.history.undoStack.value;
    const revisionBefore = context.project.revision.value;
    const staleResult = await executeTimelineProjectState(context, stale);
    expect(staleResult).toMatchObject({ ok: false, error: { code: 'revision_conflict' } });
    expect(context.layers.layers.value[0]?.visible).toBe(true);
    expect(context.history.undoStack.value).toBe(historyBefore);
    expect(context.project.revision.value).toBe(revisionBefore);

    const wrongProject = await executeTimelineProjectState(context, {
      ...createLayerVisibilityRequest(context, layer.id, false),
      target: { projectId: 'other-project' },
    });
    expect(wrongProject).toMatchObject({ ok: false, error: { code: 'target_not_found' } });
    expect(context.layers.layers.value[0]?.visible).toBe(true);
    expect(context.project.revision.value).toBe(revisionBefore);

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
    const unavailable = await executeTimelineProjectState(
      context,
      createLayerVisibilityRequest(context, layer.id, false),
    );
    expect(unavailable).toMatchObject({ ok: false, error: { code: 'unsupported' } });
    expect(context.layers.layers.value[0]?.visible).toBe(true);
    expect(context.project.revision.value).toBe(revisionBefore);
  });

  it('keeps frame-tag lifecycle atomic, stable, and durable through history', async () => {
    const context = createContext();
    context.animation.addFrame(false);
    const create = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, {
        kind: 'tag.create',
        name: 'Walk',
        color: '#ff0000',
        startFrameIndex: 0,
        endFrameIndex: 1,
      }),
    );
    expect(create.ok).toBe(true);
    if (!create.ok || !create.tagId) throw new Error('Expected created tag');
    const tagId = create.tagId;
    expect(context.animation.tags.value).toEqual([
      expect.objectContaining({ id: tagId, name: 'Walk', startFrameIndex: 0, endFrameIndex: 1 }),
    ]);

    const rename = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, { kind: 'tag.rename', tagId, name: 'Run' }),
    );
    expect(rename.ok).toBe(true);
    const color = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, { kind: 'tag.recolor', tagId, color: '#00ff00' }),
    );
    expect(color.ok).toBe(true);
    const collapse = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, { kind: 'tag.collapse', tagId, collapsed: true }),
    );
    expect(collapse.ok).toBe(true);
    expect(context.history.undoStack.value).toHaveLength(4);
    expect(context.project.revision.value).toBe(4);

    await context.history.undo();
    expect(context.animation.tags.value[0]).toMatchObject({ id: tagId, collapsed: false });
    await context.history.redo();
    expect(context.animation.tags.value[0]).toMatchObject({ id: tagId, collapsed: true });

    const invalidRange = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, {
        kind: 'tag.range',
        tagId,
        startFrameIndex: 1,
        endFrameIndex: 4,
      }),
    );
    expect(invalidRange).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(context.animation.tags.value[0]).toMatchObject({
      id: tagId,
      startFrameIndex: 0,
      endFrameIndex: 1,
      collapsed: true,
    });

    const removeEnd = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, {
        kind: 'tag.remove-frame',
        tagId,
        frameIndex: 1,
      }),
    );
    expect(removeEnd.ok).toBe(true);
    expect(context.animation.tags.value[0]).toMatchObject({ id: tagId, startFrameIndex: 0, endFrameIndex: 0 });
    await context.history.undo();
    expect(context.animation.tags.value[0]).toMatchObject({ id: tagId, startFrameIndex: 0, endFrameIndex: 1 });

    const deleted = await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, { kind: 'tag.delete', tagId }),
    );
    expect(deleted.ok).toBe(true);
    expect(context.animation.tags.value).toHaveLength(0);
    await context.history.undo();
    expect(context.animation.tags.value).toEqual([
      expect.objectContaining({ id: tagId, name: 'Run', color: '#00ff00' }),
    ]);
  });

  it('preserves layer and tag state across save and reload', async () => {
    const context = createContext();
    const [first, second] = context.layers.layers.value;
    if (!first || !second) throw new Error('Expected two layers');

    await executeTimelineProjectState(context, createLayerVisibilityRequest(context, first.id, false));
    await executeTimelineProjectState(context, createLayerLockRequest(context, first.id, true));
    await executeTimelineProjectState(context, createLayerContinuityRequest(context, first.id, true));
    await executeTimelineProjectState(context, createLayerDropRequest(context, second.id, first.id));
    await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, {
        kind: 'tag.create',
        name: 'Persisted',
        color: '#abcdef',
        startFrameIndex: 0,
        endFrameIndex: 0,
      }),
    );
    const persistedTag = context.animation.tags.value[0];
    if (!persistedTag) throw new Error('Expected persisted tag');
    await executeTimelineProjectState(
      context,
      createFrameTagRequest(context, {
        kind: 'tag.collapse',
        tagId: persistedTag.id,
        collapsed: true,
      }),
    );

    const saved = await context.project.saveProject();
    const reloaded = createContext();
    await reloaded.project.loadProject(saved);

    expect(reloaded.layers.layers.value.map((layer) => layer.id)).toEqual([second.id, first.id]);
    expect(reloaded.layers.layers.value.find((layer) => layer.id === first.id)).toMatchObject({
      visible: false,
      locked: true,
      continuous: true,
      parentId: first.parentId,
    });
    expect(reloaded.animation.tags.value).toEqual([
      expect.objectContaining({
        id: persistedTag.id,
        name: 'Persisted',
        color: '#abcdef',
        startFrameIndex: 0,
        endFrameIndex: 0,
        collapsed: true,
      }),
    ]);
  });

  it('restores exact tag ranges when Add Frame and Delete Frame replay', async () => {
    const context = createContext();
    const firstFrameId = context.animation.currentFrameId.value;
    context.animation.addFrame(false);
    const secondFrameId = context.animation.currentFrameId.value;
    context.animation.tags.value = [{
      id: 'stable-tag',
      name: 'Range',
      color: '#123456',
      startFrameIndex: 0,
      endFrameIndex: 1,
      collapsed: false,
    }];

    const { AddFrameCommand, DeleteFrameCommand } = await import('../../src/commands/animation-commands');
    const add = new AddFrameCommand(false, firstFrameId, context);
    await context.history.execute(add);
    const addedTags = context.animation.tags.value.map((tag) => ({ ...tag }));
    await context.history.undo();
    expect(context.animation.tags.value).toEqual([
      expect.objectContaining({ id: 'stable-tag', startFrameIndex: 0, endFrameIndex: 1 }),
    ]);
    await context.history.redo();
    expect(context.animation.tags.value).toEqual(addedTags);

    const remove = new DeleteFrameCommand(secondFrameId, context);
    await context.history.execute(remove);
    const deletedTags = context.animation.tags.value.map((tag) => ({ ...tag }));
    await context.history.undo();
    expect(context.animation.tags.value).toEqual(addedTags);
    await context.history.redo();
    expect(context.animation.tags.value).toEqual(deletedTags);
  });

  it('duplicates a non-final frame and replays its exact identity, cels, and tags', async () => {
    const context = createContext();
    const firstFrameId = context.animation.currentFrameId.value;
    context.animation.addFrame(false);
    const middleFrameId = context.animation.currentFrameId.value;
    context.animation.addFrame(false);
    const finalFrameId = context.animation.currentFrameId.value;
    context.animation.tags.value = [{
      id: 'middle-duplicate-tag',
      name: 'All Frames',
      color: '#123456',
      startFrameIndex: 0,
      endFrameIndex: 2,
      collapsed: false,
    }];

    const { AddFrameCommand } = await import('../../src/commands/animation-commands');
    const add = new AddFrameCommand(true, middleFrameId, context);
    await context.history.execute(add);

    const framesAfterExecute = context.animation.frames.value;
    expect(framesAfterExecute.map((frame) => frame.id)).toEqual([
      firstFrameId,
      middleFrameId,
      expect.any(String),
      finalFrameId,
    ]);
    const duplicateFrameId = framesAfterExecute[2]?.id;
    if (!duplicateFrameId) throw new Error('Expected duplicated frame');
    expect(duplicateFrameId).not.toBe(finalFrameId);
    expect([...context.animation.cels.value.values()].some((cel) => cel.frameId === duplicateFrameId)).toBe(true);
    expect(context.animation.tags.value).toEqual([expect.objectContaining({
      id: 'middle-duplicate-tag',
      startFrameIndex: 0,
      endFrameIndex: 3,
    })]);

    await context.history.undo();
    expect(context.animation.frames.value.map((frame) => frame.id)).toEqual([
      firstFrameId,
      middleFrameId,
      finalFrameId,
    ]);
    expect([...context.animation.cels.value.values()].some((cel) => cel.frameId === duplicateFrameId)).toBe(false);
    expect(context.animation.tags.value).toEqual([expect.objectContaining({
      id: 'middle-duplicate-tag',
      startFrameIndex: 0,
      endFrameIndex: 2,
    })]);

    await context.history.redo();
    expect(context.animation.frames.value.map((frame) => frame.id)).toEqual([
      firstFrameId,
      middleFrameId,
      duplicateFrameId,
      finalFrameId,
    ]);
    expect(context.animation.tags.value).toEqual([expect.objectContaining({
      id: 'middle-duplicate-tag',
      startFrameIndex: 0,
      endFrameIndex: 3,
    })]);
  });

  it('removes a final single-frame active tag without orphaning playback state', async () => {
    const context = createContext();
    context.animation.addFrame(false);
    const finalFrameId = context.animation.currentFrameId.value;
    const tag = {
      id: 'final-frame-tag',
      name: 'Final',
      color: '#abcdef',
      startFrameIndex: 1,
      endFrameIndex: 1,
      collapsed: false,
    };
    context.animation.tags.value = [tag];
    context.animation.setPlaybackMode('tag', tag.id);

    const { DeleteFrameCommand } = await import('../../src/commands/animation-commands');
    const remove = new DeleteFrameCommand(finalFrameId, context);
    await context.history.execute(remove);

    expect(context.animation.tags.value).toEqual([]);
    expect(context.animation.activeTagId.value).toBeNull();
    expect(context.animation.playbackMode.value).toBe('all');

    await context.history.undo();
    expect(context.animation.tags.value).toEqual([tag]);
    expect(context.animation.activeTagId.value).toBeNull();
    expect(context.animation.playbackMode.value).toBe('all');

    await context.history.redo();
    expect(context.animation.tags.value).toEqual([]);
    expect(context.animation.activeTagId.value).toBeNull();
    expect(context.animation.playbackMode.value).toBe('all');
  });
});
