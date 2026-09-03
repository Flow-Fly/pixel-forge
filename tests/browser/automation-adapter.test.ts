import { afterEach, describe, expect, it } from 'vitest';
import pako from 'pako';
import {
  createFixtureSession,
  FixtureProjectRepository,
  type FixtureSession,
} from '../../src/editor/fixture-session';
import type {
  AutomationAdapter,
  AutomationResult,
  HistoryTransitionResult,
  ProjectCreateResult,
  ReloadResult,
  SaveResult,
} from '../../src/editor/automation-adapter';
import type { ProjectObservation, RenderObservation } from '../../src/editor/observations';
import type { EditorTransactionResult } from '../../src/editor/transaction';
import { createAutomationAdapter } from '../../src/editor/automation-adapter';
import { createAutoSaveService, type AutoSaveService } from '../../src/services/auto-save';
import {
  STATIC_STRUCTURE_MAX_CELS,
  STATIC_STRUCTURE_MAX_FRAMES,
} from '../../src/editor/catalog';
import {
  decodeProjectFileWithDiagnostics,
  type ProjectFile,
  type ProjectFileInput,
} from '../../src/types/project';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';

const sessions: FixtureSession[] = [];
const contexts: ProjectContext[] = [];
const saveServices: AutoSaveService[] = [];

afterEach(() => {
  restoreDefaultProjectContext();
  for (const session of sessions.splice(0)) session.dispose();
  for (const saveService of saveServices.splice(0)) saveService.stop();
  for (const context of contexts.splice(0)) context.dispose();
});

describe('Automation Adapter Fixture Session', () => {
  it('proves the catalog, explicit target, render, resize, recovery, and persistence journey', async () => {
    const session = createFixtureSession();
    sessions.push(session);

    const journey = await session.run();

    expect(journey.negotiation.version).toBe('1.0');
    expect(journey.initial.observation.target).toEqual({ projectId: 'fixture-project' });
    expect(journey.initial.observation.revision).toBe(0);
    expect(journey.initial.observation.canvas).toEqual({ width: 4, height: 4 });
    expect(journey.initial.render).toMatchObject({
      width: 4,
      height: 4,
      format: 'rgba8',
      stride: 16,
    });
    expect(journey.resize.preview.preview.requiresConfirmation).toBe(false);
    expect(journey.resize.execution.revision).toBe(1);
    expect(journey.afterResize.observation.canvas).toEqual({ width: 6, height: 5 });
    expect(journey.afterResize.observation.history.undoCount).toBe(1);
    expect(journey.afterResize.observation.lastEvent?.domains).toEqual([
      'canvas-bounds',
      'raster-content',
    ]);
    expect(journey.afterResize.observation.saveSafety.status).toBe('dirty');
    expect(journey.afterUndo.observation.canvas).toEqual({ width: 4, height: 4 });
    expect(journey.afterRedo.observation.canvas).toEqual({ width: 6, height: 5 });
    expect(journey.save.saveSafety.status).toBe('saved');
    expect(journey.reload.observation.saveSafety.status).toBe('saved');
    expect(journey.reload.revision).toBe(journey.afterRedo.observation.revision);
    expect(journey.exact).toEqual({ document: true, render: true });
  });

  it('proves one atomic layer-and-tag transaction through undo, redo, and reload', async () => {
    const session = createFixtureSession();
    sessions.push(session);

    const journey = await session.runTransaction();

    expect(journey.negotiation.version).toBe('1.0');
    expect(journey.initial.observation.revision).toBe(0);
    expect(journey.transaction.type).toBe('project.transaction.execute');
    expect(journey.transaction.fromRevision).toBe(0);
    expect(journey.transaction.revision).toBe(1);
    expect(journey.transaction.event.domains).toEqual(['layer-state', 'timeline']);
    expect(journey.transaction.event).toMatchObject({
      type: 'project-change',
      target: 'fixture-project',
      fromRevision: 0,
      toRevision: 1,
      transactionId: 'fixture-transaction-1',
      domains: ['layer-state', 'timeline'],
    });
    expect(journey.transaction.provenance).toMatchObject({
      source: 'automation',
      transactionId: 'fixture-transaction-1',
      clientId: 'fixture-client',
      sessionId: 'fixture-session',
      runId: 'fixture-run',
      operationId: 'fixture-transaction',
      target: { projectId: 'fixture-project' },
      fromRevision: 0,
      toRevision: 1,
      transitionCount: 1,
      transitionsTruncated: false,
      transitions: [{ phase: 'execute', fromRevision: 0, toRevision: 1 }],
      children: [
        { commandId: 'project.layer.state', operation: 'layer.visibility' },
        { commandId: 'project.animation.frame-tag', operation: 'tag.create' },
      ],
    });
    expect(journey.afterTransaction.observation.history.undoCount).toBe(1);
    expect(journey.afterTransaction.observation.tags).toEqual([{
      id: 'fixture-tag-1',
      name: 'Fixture Tag',
      color: '#123456',
      startFrameIndex: 0,
      endFrameIndex: 0,
      collapsed: false,
    }]);
    expect(journey.afterTransaction.observation.history.undo[0]?.provenance)
      .toEqual(journey.transaction.provenance);
    expect(journey.afterTransaction.observation.lastEvent?.domains)
      .toEqual(['layer-state', 'timeline']);
    expect(journey.afterTransaction.observation.saveSafety.status).toBe('dirty');
    expect(journey.afterUndo.observation.revision).toBe(2);
    expect(journey.afterRedo.observation.revision).toBe(3);
    expect(journey.afterUndo.observation.history.redo[0]?.provenance).toMatchObject({
      transactionId: 'fixture-transaction-1',
      fromRevision: 0,
      toRevision: 2,
      transitionCount: 2,
      transitionsTruncated: false,
      transitions: [
        { phase: 'execute', fromRevision: 0, toRevision: 1 },
        { phase: 'undo', fromRevision: 1, toRevision: 2 },
      ],
    });
    expect(journey.afterRedo.observation.history.undo[0]?.provenance).toMatchObject({
      transactionId: 'fixture-transaction-1',
      fromRevision: 0,
      toRevision: 3,
      transitionCount: 3,
      transitionsTruncated: false,
      transitions: [
        { phase: 'execute', fromRevision: 0, toRevision: 1 },
        { phase: 'undo', fromRevision: 1, toRevision: 2 },
        { phase: 'redo', fromRevision: 2, toRevision: 3 },
      ],
    });
    expect(journey.afterRedo.document.tags).toEqual(journey.afterTransaction.document.tags);
    expect(journey.afterRedo.document.tags?.[0]?.id).toBe('fixture-tag-1');
    expect(journey.save.saveSafety.status).toBe('saved');
    expect(journey.reload.observation.saveSafety.status).toBe('saved');
    expect(journey.reload.revision).toBe(journey.afterRedo.observation.revision);
    expect(journey.exact).toEqual({ document: true, render: true });
  });

  // fallow-ignore-next-line complexity -- The browser fixture proves the complete public animation lifecycle.
  it('proves the bounded one-child animation journey through canvas sharing and reopen', async () => {
    const session = createFixtureSession();
    sessions.push(session);

    const journey = await session.runAnimation();

    expect(journey.negotiation.version).toBe('1.0');
    expect(journey.initial.observation.frames).toHaveLength(1);
    expect(journey.operations.create.revision).toBe(1);
    expect(journey.operations.duplicate.revision).toBe(2);
    expect(journey.operations.duration.revision).toBe(3);
    expect(journey.operations.reorder.revision).toBe(4);
    expect(journey.operations.link.revision).toBe(5);
    expect(journey.operations.unlink.revision).toBe(6);
    expect(journey.operations.firstTag.revision).toBe(7);
    expect(journey.operations.secondTag.revision).toBe(8);
    expect(journey.afterOperations.observation.frames).toHaveLength(3);
    const initialFrame = journey.initial.observation.frames[0];
    const createdFrame = journey.checkpoints.afterCreate.observation.frames.find((frame) =>
      frame.id !== initialFrame?.id);
    const duplicateFrame = journey.checkpoints.afterDuplicate.observation.frames.find((frame) =>
      frame.id !== initialFrame?.id && frame.id !== createdFrame?.id);
    expect(initialFrame).toBeDefined();
    expect(createdFrame).toMatchObject({ id: expect.any(String), order: 1, duration: 180 });
    expect(duplicateFrame).toMatchObject({ id: expect.any(String), order: 2, duration: 100 });
    expect(duplicateFrame?.id).not.toBe(createdFrame?.id);
    expect(journey.checkpoints.afterDuplicate.renders[0]?.pixels)
      .toEqual(journey.checkpoints.afterDuplicate.renders[2]?.pixels);
    expect(journey.checkpoints.afterDuration.observation.frames.find((frame) => frame.id === duplicateFrame?.id))
      .toMatchObject({ order: 2, duration: 420 });
    expect(journey.checkpoints.afterReorder.observation.frames.map((frame) => ({
      id: frame.id,
      order: frame.order,
      duration: frame.duration,
    }))).toEqual([
      { id: duplicateFrame?.id, order: 0, duration: 420 },
      { id: initialFrame?.id, order: 1, duration: 100 },
      { id: createdFrame?.id, order: 2, duration: 180 },
    ]);
    const linkedFrames = journey.checkpoints.afterLink.observation.frames.filter((frame) =>
      frame.id === initialFrame?.id || frame.id === duplicateFrame?.id);
    expect(linkedFrames).toHaveLength(2);
    expect(linkedFrames.flatMap((frame) => frame.cels).filter((cel) => cel.linkedCelId)).toEqual([
      expect.objectContaining({ linkType: 'hard' }),
      expect.objectContaining({ linkType: 'hard' }),
    ]);
    const unlinkedFrames = journey.checkpoints.afterUnlink.observation.frames;
    const unlinkedFirst = unlinkedFrames.find((frame) => frame.id === initialFrame?.id)?.cels[0];
    const unlinkedDuplicate = unlinkedFrames.find((frame) => frame.id === duplicateFrame?.id)?.cels[0];
    expect(unlinkedFirst?.linkedCelId).toBeUndefined();
    expect(unlinkedFirst?.linkType).toBeUndefined();
    expect(unlinkedDuplicate).toMatchObject({ linkType: 'hard', linkedCelId: expect.any(String) });
    expect(journey.afterOperations.observation.tags.map((tag) => tag.name)).toEqual([
      'Fixture Intro',
      'Fixture Motion',
    ]);
    expect(journey.afterOperations.renders).toHaveLength(3);
    expect(journey.afterUndo.transition.revision).toBe(9);
    expect(journey.afterRedo.transition.revision).toBe(10);
    expect(journey.reopened.reload.revision).toBe(10);
    expect(journey.reopened.renders).toHaveLength(3);
    expect(journey.exact).toEqual({ document: true, render: true, structure: true });
  });

  // fallow-ignore-next-line complexity -- The browser regression proves payload independence and target isolation together.
  it('creates independent blank cels across layers while another registered tab is active', async () => {
    const targetContext = createProjectContext();
    const otherContext = createProjectContext();
    contexts.push(targetContext, otherContext);
    const projectId = 'animation-multilayer';
    const otherProjectId = 'animation-other-tab';
    targetContext.project.id.value = projectId;
    otherContext.project.id.value = otherProjectId;

    const firstFrame = targetContext.animation.frames.value[0];
    const firstLayer = targetContext.layers.layers.value[0];
    if (!firstFrame || !firstLayer) throw new Error('Expected the target animation fixture state.');
    const { width, height } = targetContext.project;
    const secondLayer = targetContext.layers.addLayer('Second artwork', width.value, height.value);
    const secondCanvas = document.createElement('canvas');
    secondCanvas.width = width.value;
    secondCanvas.height = height.value;
    const cels = new Map(targetContext.animation.cels.value);
    cels.set(targetContext.animation.getCelKey(secondLayer.id, firstFrame.id), {
      id: 'animation-second-cel',
      layerId: secondLayer.id,
      frameId: firstFrame.id,
      canvas: secondCanvas,
    });
    targetContext.animation.cels.value = cels;
    targetContext.animation.syncLayerCanvases();

    let entitySequence = 0;
    const adapter = createAutomationAdapter({
      targetRegistry: new Map([
        [projectId, targetContext],
        [otherProjectId, otherContext],
      ]),
      entityIdFactory: () => `multilayer-entity-${++entitySequence}`,
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    setActiveProjectContext(otherContext);

    const created = await adapter.request({
      operation: 'project.transaction.execute',
      profile: 'animation',
      target: { projectId },
      expectedRevision: 0,
      provenance: {
        clientId: 'multilayer-client',
        sessionId: 'multilayer-session',
        runId: 'multilayer-run',
        operationId: 'multilayer-create',
      },
      children: [{
        command: 'project.animation.frame',
        input: { kind: 'frame.create', position: 'end', duration: 160 },
      }],
    });
    expect(created).toMatchObject({ ok: true, result: { revision: 1 } });
    if (!created.ok) return;

    const observationResult = await adapter.request({
      operation: 'project.observe',
      target: { projectId },
      expectedRevision: created.result.revision,
    });
    expect(observationResult).toMatchObject({ ok: true });
    if (!observationResult.ok) return;
    const createdFrame = observationResult.result.frames.find((frame) => frame.id !== firstFrame.id);
    expect(createdFrame).toMatchObject({ order: 1, duration: 160 });
    if (!createdFrame) return;
    const createdCels = createdFrame.cels.filter((cel) => cel.layerId === firstLayer.id || cel.layerId === secondLayer.id);
    expect(createdCels).toHaveLength(2);
    expect(createdCels.every((cel) => !cel.hasNonTransparentPixels)).toBe(true);

    const firstCreatedCel = targetContext.animation.cels.value.get(
      targetContext.animation.getCelKey(firstLayer.id, createdFrame.id),
    );
    const secondCreatedCel = targetContext.animation.cels.value.get(
      targetContext.animation.getCelKey(secondLayer.id, createdFrame.id),
    );
    expect(firstCreatedCel?.canvas).toBeDefined();
    expect(secondCreatedCel?.canvas).toBeDefined();
    expect(firstCreatedCel?.canvas).not.toBe(secondCreatedCel?.canvas);
    const firstDrawing = firstCreatedCel?.canvas.getContext('2d');
    const secondDrawing = secondCreatedCel?.canvas.getContext('2d');
    if (!firstDrawing || !secondDrawing || !firstCreatedCel || !secondCreatedCel) {
      throw new Error('Expected independent animation canvas payloads.');
    }
    firstDrawing.fillStyle = '#00ff00';
    firstDrawing.fillRect(0, 0, 1, 1);
    expect(Array.from(secondDrawing.getImageData(0, 0, 1, 1).data)).toEqual([0, 0, 0, 0]);
    expect(otherContext.project.revision.value).toBe(0);
    expect(otherContext.animation.frames.value).toHaveLength(1);
  });

  // fallow-ignore-next-line complexity -- The public transaction journey covers each supported frame-tag operation.
  it('runs every frame-tag operation as one animation child', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const projectId = 'animation-tags';
    context.project.id.value = projectId;
    let entitySequence = 0;
    const adapter = createAutomationAdapter({
      targetRegistry: new Map([[projectId, context]]),
      transactionTagIdFactory: () => 'animation-tag-1',
      entityIdFactory: () => `animation-tag-entity-${++entitySequence}`,
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    const target = { projectId };
    let revision = 0;
    const execute = async (
      input: Record<string, unknown>,
      command = 'project.animation.frame-tag',
    ): Promise<EditorTransactionResult> => {
      const result = await adapter.request({
        operation: 'project.transaction.execute',
        profile: 'animation',
        target,
        expectedRevision: revision,
        provenance: {
          clientId: 'tag-client',
          sessionId: 'tag-session',
          runId: 'tag-run',
          operationId: String(input.kind),
        },
        children: [{ command, input }],
      });
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error(`Animation tag operation failed: ${result.error.code}`);
      revision = result.result.revision;
      expect(result.result.provenance.children).toHaveLength(1);
      return result.result as EditorTransactionResult;
    };
    const observe = async (): Promise<ProjectObservation> => {
      const result = await adapter.request({ operation: 'project.observe', target, expectedRevision: revision });
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error(`Animation tag observation failed: ${result.error.code}`);
      return result.result as ProjectObservation;
    };

    const created = await execute({ kind: 'tag.create', name: 'Draft', color: '#123456', startFrameIndex: 0, endFrameIndex: 0 });
    let observation = await observe();
    const tagId = observation.tags[0]?.id;
    expect(created.provenance.children[0]?.operation).toBe('tag.create');
    if (!tagId) throw new Error('Expected a public tag identity.');

    const renamed = await execute({ kind: 'tag.rename', tagId, name: 'Renamed' });
    expect(renamed.provenance.children[0]?.operation).toBe('tag.rename');
    const recolored = await execute({ kind: 'tag.recolor', tagId, color: '#654321' });
    expect(recolored.provenance.children[0]?.operation).toBe('tag.recolor');
    const frameCreated = await execute(
      { kind: 'frame.create', position: 'end', duration: 120 },
      'project.animation.frame',
    );
    expect(frameCreated.provenance.children[0]?.operation).toBe('frame.create');
    observation = await observe();
    expect(observation.frames.map((frame) => ({ id: frame.id, order: frame.order, duration: frame.duration }))).toEqual([
      { id: observation.frames[0]?.id, order: 0, duration: 100 },
      { id: observation.frames[1]?.id, order: 1, duration: 120 },
    ]);

    const ranged = await execute({ kind: 'tag.range', tagId, startFrameIndex: 0, endFrameIndex: 1 });
    expect(ranged.provenance.children[0]?.operation).toBe('tag.range');
    observation = await observe();
    expect(observation.tags[0]).toMatchObject({ id: tagId, startFrameIndex: 0, endFrameIndex: 1 });
    const collapsed = await execute({ kind: 'tag.collapse', tagId, collapsed: true });
    expect(collapsed.provenance.children[0]?.operation).toBe('tag.collapse');
    observation = await observe();
    expect(observation.tags[0]).toMatchObject({ id: tagId, collapsed: true });
    const removed = await execute({ kind: 'tag.remove-frame', tagId, frameIndex: 1 });
    expect(removed.provenance.children[0]?.operation).toBe('tag.remove-frame');
    observation = await observe();
    expect(observation.tags[0]).toMatchObject({ id: tagId, startFrameIndex: 0, endFrameIndex: 0 });
    const deleted = await execute({ kind: 'tag.delete', tagId });
    expect(deleted.provenance.children[0]?.operation).toBe('tag.delete');
    observation = await observe();
    expect(observation.tags).toEqual([]);
    expect(revision).toBe(8);
  });

  it('reports stable bounds errors before cel member normalization', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const projectId = 'animation-bounds';
    context.project.id.value = projectId;
    const adapter = createAutomationAdapter({ targetRegistry: new Map([[projectId, context]]) });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    const provenance = { clientId: 'bounds-client', sessionId: 'bounds-session', runId: 'bounds-run', operationId: 'bounds' };
    const base = { operation: 'project.transaction.execute', profile: 'animation', target: { projectId }, expectedRevision: 0, provenance };
    const link = await adapter.request({
      ...base,
      children: [{ command: 'project.animation.cel.link', input: { kind: 'cel.link', layerId: 'layer', members: [{}] } }],
    });
    expect(link).toMatchObject({ ok: false, error: { code: 'bounds_exceeded', details: { min: 2, max: 16 } } });
    const unlink = await adapter.request({
      ...base,
      children: [{ command: 'project.animation.cel.unlink', input: {
        kind: 'cel.unlink', layerId: 'layer', frameId: 'frame', celId: 'cel', linkedCelId: 'link', linkGroup: [],
      } }],
    });
    expect(unlink).toMatchObject({ ok: false, error: { code: 'bounds_exceeded', details: { min: 2, max: 16 } } });
    const duration = await adapter.request({
      ...base,
      children: [{ command: 'project.animation.frame', input: { kind: 'frame.duration', frameId: 'missing', duration: 2001 } }],
    });
    expect(duration).toMatchObject({ ok: false, error: { code: 'bounds_exceeded' } });
    expect(context.project.revision.value).toBe(0);
  });

  it('rejects unequal cel payloads, last-frame deletion, and wrong animation targets atomically', async () => {
    const context = createProjectContext();
    contexts.push(context);
    context.project.id.value = 'animation-rejections';
    const saveService = createAutoSaveService({ repository: new FixtureProjectRepository() });
    saveServices.push(saveService);
    const adapter = createAutomationAdapter({
      targetRegistry: new Map([['animation-rejections', context]]),
      saveService,
      entityIdFactory: (() => {
        let index = 0;
        return () => `rejection-entity-${++index}`;
      })(),
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    const frame = context.animation.frames.value[0];
    const layer = context.layers.layers.value.find((candidate) => candidate.type !== 'reference');
    if (!frame || !layer) throw new Error('Expected animation fixture state.');
    const beforeCels = context.animation.cels.value;

    const lastFrame = await adapter.request({
      operation: 'project.transaction.execute', profile: 'animation',
      target: { projectId: 'animation-rejections' }, expectedRevision: 0,
      provenance: { clientId: 'c', sessionId: 's', runId: 'r', operationId: 'last-frame' },
      children: [{ command: 'project.animation.frame', input: { kind: 'frame.delete', frameId: frame.id } }],
    });
    expect(lastFrame).toMatchObject({ ok: false, error: { code: 'invalid_state' } });
    expect(context.project.revision.value).toBe(0);
    expect(context.animation.cels.value).toBe(beforeCels);

    const created = await adapter.request({
      operation: 'project.transaction.execute', profile: 'animation',
      target: { projectId: 'animation-rejections' }, expectedRevision: 0,
      provenance: { clientId: 'c', sessionId: 's', runId: 'r', operationId: 'create' },
      children: [{ command: 'project.animation.frame', input: { kind: 'frame.create', position: 'end', duration: 100 } }],
    });
    expect(created).toMatchObject({ ok: true, result: { revision: 1 } });
    const secondFrame = context.animation.frames.value[1];
    if (!secondFrame) throw new Error('Expected second frame.');
    const secondCel = context.animation.cels.value.get(context.animation.getCelKey(layer.id, secondFrame.id));
    if (!secondCel) throw new Error('Expected second cel.');
    const drawing = secondCel.canvas.getContext('2d');
    if (!drawing) throw new Error('Expected second cel drawing context.');
    drawing.fillStyle = '#00ff00';
    drawing.fillRect(0, 0, 1, 1);
    const firstCel = context.animation.cels.value.get(context.animation.getCelKey(layer.id, frame.id));
    if (!firstCel) throw new Error('Expected first cel.');
    const members = [firstCel, secondCel].map((cel) => ({
      key: context.animation.getCelKey(cel.layerId, cel.frameId),
      celId: cel.id,
      layerId: cel.layerId,
      frameId: cel.frameId,
    }));
    const unequal = await adapter.request({
      operation: 'project.transaction.execute', profile: 'animation',
      target: { projectId: 'animation-rejections' }, expectedRevision: 1,
      provenance: { clientId: 'c', sessionId: 's', runId: 'r', operationId: 'unequal' },
      children: [{ command: 'project.animation.cel.link', input: { kind: 'cel.link', layerId: layer.id, members } }],
    });
    expect(unequal).toMatchObject({ ok: false, error: { code: 'invalid_state' } });
    expect(context.project.revision.value).toBe(1);
    expect(firstCel.linkedCelId).toBeUndefined();
    expect(secondCel.linkedCelId).toBeUndefined();

    const wrongTarget = await adapter.request({
      operation: 'project.transaction.execute', profile: 'animation',
      target: { projectId: 'other-animation-project' }, expectedRevision: 1,
      provenance: { clientId: 'c', sessionId: 's', runId: 'r', operationId: 'wrong-target' },
      children: [{ command: 'project.animation.frame', input: { kind: 'frame.create', position: 'end', duration: 100 } }],
    });
    expect(wrongTarget).toMatchObject({ ok: false, error: { code: 'target_not_found' } });
    expect(context.project.revision.value).toBe(1);
  });

  it('proves a static structure transaction preserves pixels through palette reorder, undo, redo, save, and reload', async () => {
    const session = createFixtureSession();
    sessions.push(session);
    const otherTab = createProjectContext();
    contexts.push(otherTab);
    setActiveProjectContext(otherTab);

    const baseline = await session.runTransaction();
    const target = session.target;
    const initial = baseline.afterRedo.observation;
    const artwork = initial.layers[0];
    if (!artwork) throw new Error('Fixture project has no artwork layer.');
    const paletteEntries = initial.palette.map(({ id, color }) => ({ id, color }));
    const red = paletteEntries.find((entry) => entry.id === 'fixture-palette-red');
    const black = paletteEntries.find((entry) => entry.id === 'fixture-palette-transparent');
    if (!red || !black) throw new Error('Fixture palette identities are incomplete.');

    const transaction = await session.adapter.request({
      operation: 'project.transaction.execute',
      profile: 'static-structure',
      target,
      expectedRevision: initial.revision,
      provenance: {
        clientId: 'static-client',
        sessionId: 'static-session',
        runId: 'static-run',
        operationId: 'static-structure',
      },
      children: [
        {
          command: 'project.palette.declaration',
          input: {
            kind: 'palette.declaration',
            entries: [red, black, ...paletteEntries.filter((entry) => entry !== red && entry !== black)],
          },
        },
        {
          command: 'project.layer.tree',
          input: {
            kind: 'layer-tree.declaration',
            layers: [
              {
                id: 'fixture-group',
                name: 'Fixture Artwork',
                type: 'group',
                parentId: null,
                visible: true,
                locked: false,
                opacity: 255,
                blendMode: 'normal',
                continuous: false,
              },
              {
                id: artwork.id,
                name: 'Artwork Renamed',
                type: 'image',
                parentId: 'fixture-group',
                visible: true,
                locked: true,
                opacity: artwork.opacity,
                blendMode: artwork.blendMode,
                continuous: artwork.continuous,
              },
              {
                id: 'fixture-highlight',
                name: 'Highlight',
                type: 'image',
                parentId: 'fixture-group',
                visible: true,
                locked: false,
                opacity: 255,
                blendMode: 'normal',
                continuous: false,
              },
            ],
          },
        },
      ],
    }) as AutomationResult<EditorTransactionResult>;
    expect(transaction).toMatchObject({
      ok: true,
      result: {
        fromRevision: initial.revision,
        revision: initial.revision + 1,
        event: { domains: ['palette', 'layer-state'] },
        provenance: {
          children: [
            { commandId: 'project.palette.declaration', operation: 'palette.declaration' },
            { commandId: 'project.layer.tree', operation: 'layer-tree.declaration' },
          ],
        },
      },
    });
    expect(otherTab.project.revision.value).toBe(0);
    if (!transaction.ok) return;

    const after = await requestSuccess<ProjectObservation>(session, {
      operation: 'project.observe',
      target,
      expectedRevision: transaction.result.revision,
    });
    expect(after.layers.map((layer) => layer.id)).toEqual([
      'fixture-group',
      artwork.id,
      'fixture-highlight',
    ]);
    expect(after.layers[1]).toMatchObject({
      name: 'Artwork Renamed',
      parentId: 'fixture-group',
      locked: true,
    });
    expect(after.palette[0]).toEqual({
      id: red.id,
      color: red.color,
      index: 0,
    });
    expect(after.history.undoCount).toBe(1);
    expect(after.saveSafety.status).toBe('dirty');

    const afterRender = await requestRender(session, target, after);
    const undo = await requestSuccess<HistoryTransitionResult>(session, {
      operation: 'project.history.undo',
      target,
      expectedRevision: after.revision,
    });
    const undone = await requestSuccess<ProjectObservation>(session, {
      operation: 'project.observe',
      target,
      expectedRevision: undo.revision,
    });
    expect(undone.layers.map((layer) => layer.id)).toEqual([artwork.id]);
    expect(undone.palette.map((entry) => entry.id)).toEqual(initial.palette.map((entry) => entry.id));

    const redo = await requestSuccess<HistoryTransitionResult>(session, {
      operation: 'project.history.redo',
      target,
      expectedRevision: undone.revision,
    });
    const redone = await requestSuccess<ProjectObservation>(session, {
      operation: 'project.observe',
      target,
      expectedRevision: redo.revision,
    });
    const redoneRender = await requestRender(session, target, redone);
    expect(redone.layers.map((layer) => layer.id)).toEqual(after.layers.map((layer) => layer.id));
    expect(redoneRender.pixels).toEqual(afterRender.pixels);

    const save = await requestSuccess<SaveResult>(session, {
      operation: 'project.save',
      target,
      expectedRevision: redone.revision,
    });
    expect(save.saveSafety.status).toBe('saved');
    const reload = await requestSuccess<ReloadResult>(session, {
      operation: 'project.reload',
      target,
      expectedRevision: redone.revision,
    });
    expect(reload.observation.layers.map((layer) => layer.id)).toEqual(redone.layers.map((layer) => layer.id));
    expect(reload.observation.palette).toEqual(redone.palette);
    const reloadedRender = await requestRender(session, target, reload.observation);
    expect(reloadedRender.pixels).toEqual(afterRender.pixels);
  });

  it('rolls back a static structure apply failure without publishing any project transition', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const session = createFixtureSession({ context });
    sessions.push(session);

    const baseline = await session.runTransaction();
    const before = baseline.reload.observation;
    const beforeDocument = structuredClone(await context.project.saveProject());
    const beforeHistory = {
      undo: context.history.undoStack.value,
      redo: context.history.redoStack.value,
      version: context.history.version.value,
    };
    const beforeSaveSafety = before.saveSafety;
    const events: unknown[] = [];
    context.projectChangeEvents.addEventListener('project-change', (event) => {
      events.push((event as CustomEvent).detail);
    });

    const originalApply = context.project.applyStaticStructureState;
    let injected = false;
    context.project.applyStaticStructureState = (...args) => {
      originalApply.apply(context.project, args);
      if (!injected) {
        injected = true;
        throw new Error('injected static apply failure');
      }
    };

    const result = await session.adapter.request(makeStaticStructureRequest(
      session.target,
      before,
      {
        operationId: 'static-rollback',
        paletteEntries: [before.palette[1], before.palette[0]],
        layers: before.layers.map((layer, index) => ({
          ...layer,
          name: index === 0 ? 'Changed before injected failure' : layer.name,
        })),
      },
    ));
    context.project.applyStaticStructureState = originalApply;

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'internal' },
    });
    expect(injected).toBe(true);
    expect(await context.project.saveProject()).toEqual(beforeDocument);
    expect(context.project.revision.value).toBe(before.revision);
    expect(context.history.undoStack.value).toBe(beforeHistory.undo);
    expect(context.history.redoStack.value).toBe(beforeHistory.redo);
    expect(context.history.version.value).toBe(beforeHistory.version);
    expect(events).toEqual([]);

    const after = await requestSuccess<ProjectObservation>(session, {
      operation: 'project.observe',
      target: session.target,
      expectedRevision: before.revision,
    });
    expect(after.saveSafety).toEqual(beforeSaveSafety);
    expect(after.layers).toEqual(before.layers);
    expect(after.palette).toEqual(before.palette);
  });

  it('proves Fixture Session blank creation registers an isolated target before static editing and reload', async () => {
    const session = createFixtureSession({
      projectIdFactory: () => 'fixture-structured-blank',
    });
    sessions.push(session);

    const created = await session.createBlankProject('Structured blank', 16, 16);
    expect(created.creation).toMatchObject({
      type: 'project.create',
      kind: 'blank',
      target: { projectId: 'fixture-structured-blank' },
      revision: 0,
    } satisfies Partial<ProjectCreateResult>);
    expect(created.observation.canvas).toEqual({ width: 16, height: 16 });
    const layer = created.observation.layers[0];
    if (!layer) throw new Error('Created blank has no layer.');

    const transaction = await requestSuccess<EditorTransactionResult>(session, {
      operation: 'project.transaction.execute',
      profile: 'static-structure',
      target: created.creation.target,
      expectedRevision: created.observation.revision,
      provenance: {
        clientId: 'fixture-create-client',
        sessionId: 'fixture-create-session',
        runId: 'fixture-create-run',
        operationId: 'fixture-create-structure',
      },
      children: [
        {
          command: 'project.palette.declaration',
          input: {
            kind: 'palette.declaration',
            entries: created.observation.palette.map(({ id, color }) => ({ id, color })),
          },
        },
        {
          command: 'project.layer.tree',
          input: {
            kind: 'layer-tree.declaration',
            layers: [
              {
                id: 'created-group',
                name: 'Created Artwork',
                type: 'group',
                parentId: null,
                visible: true,
                locked: false,
                opacity: 255,
                blendMode: 'normal',
                continuous: false,
              },
              {
                id: layer.id,
                name: 'Base',
                type: 'image',
                parentId: 'created-group',
                visible: true,
                locked: false,
                opacity: layer.opacity,
                blendMode: layer.blendMode,
                continuous: layer.continuous,
              },
            ],
          },
        },
      ],
    });
    expect(transaction).toMatchObject({
      fromRevision: 0,
      revision: 1,
      event: { domains: ['palette', 'layer-state'] },
    });

    const saved = await requestSuccess<SaveResult>(session, {
      operation: 'project.save',
      target: created.creation.target,
      expectedRevision: transaction.revision,
    });
    expect(saved.saveSafety.status).toBe('saved');
    const reloaded = await requestSuccess<ReloadResult>(session, {
      operation: 'project.reload',
      target: created.creation.target,
      expectedRevision: transaction.revision,
    });
    expect(reloaded.revision).toBe(1);
    expect(reloaded.observation.layers.map((item) => item.id)).toEqual([
      'created-group',
      layer.id,
    ]);
    expect(reloaded.observation.canvas).toEqual({ width: 16, height: 16 });
  });

  it('proves a lossless structure refinement through every frame and persisted lifecycle', async () => {
    const session = createFixtureSession();
    sessions.push(session);

    const journey = await session.runStructureRefinement();

    expect(journey.negotiation.version).toBe('1.0');
    expect(journey.transaction.revision).toBe(1);
    expect(journey.transaction.event.domains).toEqual(['layer-state', 'raster-content']);
    expect(journey.transaction.compositeEquality).toMatchObject({
      type: 'project.composite-equality',
      allEqual: true,
      frameCount: 2,
    });
    expect(journey.transaction.compositeEquality?.frames).toHaveLength(2);
    expect(journey.afterTransaction.observation.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      type: layer.type,
      parentId: layer.parentId,
    }))).toEqual([
      { id: 'fixture-refinement-group', name: 'Grouped', type: 'group', parentId: null },
      { id: 'fixture-refinement-target', name: 'Merged target', type: 'image', parentId: null },
      { id: 'fixture-refinement-bottom', name: 'Bottom renamed', type: 'image', parentId: 'fixture-refinement-group' },
    ]);
    expect(journey.afterTransaction.observation.history.undoCount).toBe(1);
    expect(journey.afterUndo.transition.revision).toBe(2);
    expect(journey.afterRedo.transition.revision).toBe(3);
    expect(journey.save.saveSafety.status).toBe('saved');
    expect(journey.reopened.reload.revision).toBe(3);
    expect(journey.exact).toEqual({ document: true, render: true, structure: true });
  });

  it('rejects non-empty removal before changing the refinement document', async () => {
    const session = createFixtureSession();
    sessions.push(session);
    const journey = await session.runStructureRefinement();
    const before = journey.reopened.observation;
    const bottom = before.layers.find((layer) => layer.id === 'fixture-refinement-bottom');
    if (!bottom) throw new Error('Refinement fixture lost its retained image.');

    const result = await session.adapter.request({
      operation: 'project.transaction.execute',
      profile: 'structure-refinement',
      target: session.target,
      expectedRevision: before.revision,
      provenance: {
        clientId: 'fixture-refinement-failure-client',
        sessionId: 'fixture-refinement-failure-session',
        runId: 'fixture-refinement-failure-run',
        operationId: 'fixture-refinement-non-empty-removal',
      },
      children: [{
        command: 'project.layer.structure.refine',
        input: {
          kind: 'structure.refine',
          layers: [{ id: bottom.id, name: bottom.name, type: 'image', parentId: null }],
          mergePairs: [],
        },
      }],
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid_state', retryable: false, details: { reason: 'non_empty_layer_removal' } },
    });
    const after = await requestSuccess<ProjectObservation>(session, {
      operation: 'project.observe',
      target: session.target,
      expectedRevision: before.revision,
    });
    expect(after.layers).toEqual(before.layers);
    expect(after.history).toEqual(before.history);
  });

  it('preserves the checked-in cup compatibility payload through structure-only refinement and reload', async () => {
    const fixtureResponse = await fetch('/tests/fixtures/project-files/cup-compatibility.pf');
    expect(fixtureResponse.ok).toBe(true);
    const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
    const fixtureDigest = await digestBytes(fixtureBytes);
    const input = JSON.parse(pako.inflate(fixtureBytes, { to: 'string' })) as ProjectFileInput;
    const source = decodeProjectFileWithDiagnostics(input).project;
    const textSource = source.layers.find((layer) => layer.type === 'text');
    if (!textSource) throw new Error('Cup fixture lost its text compatibility layer.');

    const context = createProjectContext();
    contexts.push(context);
    const repository = new FixtureProjectRepository();
    const saveService = createAutoSaveService({ repository });
    saveServices.push(saveService);
    const projectId = 'cup-compatibility-refinement';
    await saveService.runWithoutSaving(async () => {
      await context.project.loadProject(input);
      context.project.id.value = projectId;
    }, context);
    const initialProject = await context.project.saveProject({ rebuildIndexBuffers: false });
    await repository.create(projectId, initialProject);
    const adapter = createAutomationAdapter({
      targetRegistry: new Map([[projectId, context]]),
      repository,
      saveService,
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    const initialObservationResult = await adapter.request({
      operation: 'project.observe',
      target: { projectId },
      expectedRevision: 0,
    });
    if (!initialObservationResult.ok) throw new Error('Cup fixture observation failed.');
    const initialObservation = initialObservationResult.result as ProjectObservation;
    const refinementLayers = initialObservation.layers.filter((layer) => layer.type !== 'reference');
    const initialRenders = await captureAdapterRenders(adapter, projectId, initialObservation);
    const result = await adapter.request(makeStructureRefinementRequest(
      { projectId },
      initialObservation.revision,
      refinementLayers.map((layer, index) => ({
        id: layer.id,
        name: index === 0 ? 'Coupe (refined)' : layer.name,
        type: layer.type,
        parentId: layer.parentId,
      })),
      [],
      'cup-compatibility-refinement',
    ));

    expect(result).toMatchObject({
      ok: true,
      result: {
        revision: 1,
        compositeEquality: { type: 'project.composite-equality', allEqual: true, frameCount: 15 },
      },
    });
    if (!result.ok) return;
    expect(result.result.compositeEquality?.frames).toHaveLength(15);
    const afterObservationResult = await adapter.request({
      operation: 'project.observe',
      target: { projectId },
      expectedRevision: result.result.revision,
    });
    if (!afterObservationResult.ok) throw new Error('Cup refinement observation failed.');
    const afterObservation = afterObservationResult.result as ProjectObservation;
    const afterRenders = await captureAdapterRenders(adapter, projectId, afterObservation);
    expect(renderPixelBytes(afterRenders)).toEqual(renderPixelBytes(initialRenders));
    expect(afterObservation.layers.map((layer) => layer.type)).toEqual(['image', 'image', 'image', 'text']);
    expect(afterObservation.layers[3]?.id).toBe(textSource.id);

    const textRemoval = await adapter.request(makeStructureRefinementRequest(
      { projectId },
      result.result.revision,
      refinementLayers
        .filter((layer) => layer.id !== textSource.id)
        .map((layer) => ({
          id: layer.id,
          name: layer.name,
          type: layer.type,
          parentId: layer.parentId,
        })),
      [],
      'cup-compatibility-text-removal',
    ));
    expect(textRemoval).toEqual({
      ok: false,
      error: { code: 'unsupported', retryable: false, details: { reason: 'text_layer_removal' } },
    });
    expect(context.project.revision.value).toBe(result.result.revision);

    const persistedText = await context.project.saveProject({ rebuildIndexBuffers: false });
    expect(persistedText.layers.find((layer) => layer.id === textSource.id)).toMatchObject({
      type: 'text',
      textData: textSource.textData,
    });
    expect(textCelPayloads(persistedText, textSource.id)).toEqual(textCelPayloads(initialProject, textSource.id));

    const saved = await adapter.request({
      operation: 'project.save',
      target: { projectId },
      expectedRevision: result.result.revision,
    });
    expect(saved).toMatchObject({ ok: true, result: { saveSafety: { status: 'saved' } } });
    const reloaded = await adapter.request({
      operation: 'project.reload',
      target: { projectId },
      expectedRevision: result.result.revision,
    });
    expect(reloaded).toMatchObject({ ok: true, result: { revision: 1 } });
    if (!reloaded.ok) return;
    const reloadedRenders = await captureAdapterRenders(adapter, projectId, reloaded.result.observation);
    expect(renderPixelBytes(reloadedRenders)).toEqual(renderPixelBytes(afterRenders));
    const reloadedProject = await context.project.saveProject({ rebuildIndexBuffers: false });
    expect(reloadedProject.layers.find((layer) => layer.id === textSource.id)).toMatchObject({
      type: 'text',
      textData: textSource.textData,
    });
    expect(textCelPayloads(reloadedProject, textSource.id)).toEqual(textCelPayloads(initialProject, textSource.id));

    const fixtureResponseAfter = await fetch('/tests/fixtures/project-files/cup-compatibility.pf');
    expect(await digestBytes(new Uint8Array(await fixtureResponseAfter.arrayBuffer()))).toBe(fixtureDigest);
  });

  it('rejects floating selection before structure-refinement mutation', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const session = createFixtureSession({ context });
    sessions.push(session);
    const baseline = await session.runTransaction();
    const before = baseline.afterRedo.observation;
    const beforeDocument = structuredClone(await context.project.saveProject({ rebuildIndexBuffers: false }));
    const layer = before.layers[0];
    if (!layer) throw new Error('Refinement selection fixture lost its layer.');
    context.selection.setFloating(
      new ImageData(1, 1),
      { x: 0, y: 0, width: 1, height: 1 },
      'rectangle',
    );

    const result = await session.adapter.request(makeStructureRefinementRequest(
      session.target,
      before.revision,
      [{ id: layer.id, name: 'Rejected rename', type: 'image', parentId: null }],
      [],
      'fixture-refinement-selection',
    ));

    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid_state', retryable: false, details: { reason: 'selection_in_progress' } },
    });
    expect(context.project.revision.value).toBe(before.revision);
    expect(await context.project.saveProject({ rebuildIndexBuffers: false })).toEqual(beforeDocument);
  });

  it('refines an explicitly registered inactive target without touching the active project', async () => {
    const targetContext = createProjectContext();
    const otherContext = createProjectContext();
    contexts.push(targetContext, otherContext);
    const targetId = 'refinement-target-tab';
    const otherId = 'refinement-other-tab';
    targetContext.project.id.value = targetId;
    otherContext.project.id.value = otherId;
    const targetLayer = targetContext.layers.layers.value[0];
    const otherLayer = otherContext.layers.layers.value[0];
    if (!targetLayer || !otherLayer) throw new Error('Registered refinement tabs lost their layers.');
    const adapter = createAutomationAdapter({
      targetRegistry: new Map([
        [targetId, targetContext],
        [otherId, otherContext],
      ]),
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    setActiveProjectContext(otherContext);

    const result = await adapter.request(makeStructureRefinementRequest(
      { projectId: targetId },
      0,
      [{ id: targetLayer.id, name: 'Inactive target renamed', type: 'image', parentId: null }],
      [],
      'fixture-refinement-inactive-target',
    ));

    expect(result).toMatchObject({ ok: true, result: { revision: 1 } });
    expect(targetContext.layers.layers.value[0]?.name).toBe('Inactive target renamed');
    expect(targetContext.project.revision.value).toBe(1);
    expect(otherContext.layers.layers.value[0]?.name).toBe(otherLayer.name);
    expect(otherContext.project.revision.value).toBe(0);
  });

  it('rejects opacity, blend, link, and index merge hazards before mutation', async () => {
    const cases: readonly {
      readonly name: string;
      readonly mutate: (context: ProjectContext, sourceId: string, targetId: string) => void;
      readonly reason: string;
    }[] = [
      {
        name: 'opacity',
        mutate: (context, _sourceId, targetId) => context.layers.updateLayer(targetId, { opacity: 128 }),
        reason: 'merge_layer_state',
      },
      {
        name: 'blend',
        mutate: (context, _sourceId, targetId) => context.layers.updateLayer(targetId, { blendMode: 'multiply' }),
        reason: 'merge_layer_state',
      },
      {
        name: 'link',
        mutate: (context, sourceId, _targetId) => {
          const frame = context.animation.frames.value[0];
          const cel = frame && context.animation.cels.value.get(context.animation.getCelKey(sourceId, frame.id));
          if (!cel) throw new Error('Merge fixture lost its source cel.');
          cel.linkedCelId = 'ineligible-link';
          cel.linkType = 'hard';
        },
        reason: 'merge_cel_payload',
      },
      {
        name: 'index',
        mutate: (context, sourceId, _targetId) => {
          const frame = context.animation.frames.value[0];
          const cel = frame && context.animation.cels.value.get(context.animation.getCelKey(sourceId, frame.id));
          if (!cel) throw new Error('Merge fixture lost its indexed source cel.');
          cel.indexBuffer = new Uint8Array(cel.canvas.width * cel.canvas.height);
          cel.indexBuffer[0] = 255;
        },
        reason: 'merge_index_payload',
      },
    ];

    for (const mergeCase of cases) {
      const context = createProjectContext();
      contexts.push(context);
      const projectId = `refinement-merge-${mergeCase.name}`;
      context.project.id.value = projectId;
      const source = context.layers.layers.value[0];
      const target = context.layers.addLayer('Merge target', context.project.width.value, context.project.height.value);
      context.animation.syncLayerCanvases();
      if (!source || !target) throw new Error('Merge fixture lost its adjacent image layers.');
      mergeCase.mutate(context, source.id, target.id);
      const adapter = createAutomationAdapter({ targetRegistry: new Map([[projectId, context]]) });
      expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);

      const result = await adapter.request(makeStructureRefinementRequest(
        { projectId },
        0,
        [{ id: target.id, name: target.name, type: 'image', parentId: null }],
        [{ sourceLayerId: source.id, targetLayerId: target.id }],
        `fixture-refinement-merge-${mergeCase.name}`,
      ));

      expect(result).toEqual({
        ok: false,
        error: { code: mergeCase.name === 'index' ? 'invalid_state' : 'unsupported', retryable: false, details: { reason: mergeCase.reason } },
      });
      expect(context.project.revision.value).toBe(0);
      expect(context.layers.layers.value.map((layer) => layer.id)).toEqual([source.id, target.id]);
    }
  });

  it('rejects a prepared payload over the byte limit before allocating new cels', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const projectId = 'refinement-byte-limit';
    context.project.id.value = projectId;
    const layer = context.layers.layers.value[0];
    const frame = context.animation.frames.value[0];
    if (!layer || !frame) throw new Error('Byte-limit fixture lost its initial layer.');
    const cel = context.animation.cels.value.get(context.animation.getCelKey(layer.id, frame.id));
    if (!cel) throw new Error('Byte-limit fixture lost its initial cel.');
    context.project.width.value = 2048;
    context.project.height.value = 2048;
    cel.canvas.width = 2048;
    cel.canvas.height = 2048;
    layer.canvas = cel.canvas;
    const adapter = createAutomationAdapter({ targetRegistry: new Map([[projectId, context]]) });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);

    const result = await adapter.request(makeStructureRefinementRequest(
      { projectId },
      0,
      [
        { id: 'refinement-byte-group', name: 'Too large', type: 'group', parentId: null },
        { id: layer.id, name: layer.name, type: 'image', parentId: 'refinement-byte-group' },
      ],
      [],
      'fixture-refinement-byte-limit',
    ));

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'limit_exceeded', details: { reason: 'structure_preparation_bytes' } },
    });
    expect(context.project.revision.value).toBe(0);
    expect(context.layers.layers.value).toEqual([layer]);
  });

  it('rejects a visually changing reorder after exact composite preflight', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const projectId = 'refinement-visual-reorder';
    context.project.id.value = projectId;
    const bottom = context.layers.layers.value[0];
    const frame = context.animation.frames.value[0];
    if (!bottom || !frame) throw new Error('Reorder fixture lost its initial layer.');
    const top = context.layers.addLayer('Top', context.project.width.value, context.project.height.value);
    context.animation.syncLayerCanvases();
    const bottomCel = context.animation.cels.value.get(context.animation.getCelKey(bottom.id, frame.id));
    const topCel = context.animation.cels.value.get(context.animation.getCelKey(top.id, frame.id));
    if (!bottomCel || !topCel) throw new Error('Reorder fixture lost its cels.');
    const bottomDrawing = bottomCel.canvas.getContext('2d');
    const topDrawing = topCel.canvas.getContext('2d');
    if (!bottomDrawing || !topDrawing) throw new Error('Reorder fixture could not draw its cels.');
    bottomDrawing.fillStyle = '#000000';
    bottomDrawing.fillRect(0, 0, 1, 1);
    topDrawing.fillStyle = '#ff0000';
    topDrawing.fillRect(0, 0, 1, 1);
    bottomCel.indexBuffer = new Uint8Array(bottomCel.canvas.width * bottomCel.canvas.height);
    topCel.indexBuffer = new Uint8Array(topCel.canvas.width * topCel.canvas.height);
    bottomCel.indexBuffer[0] = 1;
    topCel.indexBuffer[0] = 2;
    const beforeDocument = structuredClone(await context.project.saveProject({ rebuildIndexBuffers: false }));
    const adapter = createAutomationAdapter({ targetRegistry: new Map([[projectId, context]]) });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);

    const result = await adapter.request(makeStructureRefinementRequest(
      { projectId },
      0,
      [
        { id: top.id, name: top.name, type: 'image', parentId: null },
        { id: bottom.id, name: bottom.name, type: 'image', parentId: null },
      ],
      [],
      'fixture-refinement-visual-reorder',
    ));

    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid_state', retryable: false, details: { reason: 'composite_changed' } },
    });
    expect(context.project.revision.value).toBe(0);
    expect(context.layers.layers.value.map((layer) => layer.id)).toEqual([bottom.id, top.id]);
    expect(await context.project.saveProject({ rebuildIndexBuffers: false })).toEqual(beforeDocument);
  });

  it('proves deterministic static creation through close, repository reopen, and reload', async () => {
    const session = createFixtureSession({
      projectIdFactory: () => 'fixture-static-lifecycle',
    });
    sessions.push(session);

    const journey = await session.runStaticStructure();

    expect(journey.negotiation.version).toBe('1.0');
    expect(journey.creation.creation.target).toEqual({ projectId: 'fixture-static-lifecycle' });
    expect(journey.creation.observation.layers[0]?.id).toBe('fixture-entity-1');
    expect(journey.creation.observation.frames[0]?.id).toBe('fixture-entity-2');
    expect(journey.creation.observation.palette[0]?.id).toBe('fixture-entity-3');
    expect(journey.creation.observation.palette.at(-1)?.id).toBe('fixture-entity-34');
    expect(journey.transaction.revision).toBe(1);
    expect(journey.transaction.event.domains).toEqual(['palette', 'layer-state']);
    expect(journey.afterTransaction.observation.layers.map((layer) => layer.id)).toEqual([
      'fixture-static-group',
      'fixture-entity-1',
      'fixture-static-added',
    ]);
    expect(journey.afterTransaction.observation.history.undoCount).toBe(1);
    expect(journey.afterTransaction.document.frames[0]?.cels.map((cel) => cel.id)).toEqual([
      'fixture-entity-36',
      'fixture-entity-35',
      'fixture-entity-37',
    ]);
    expect(journey.afterUndo.observation.revision).toBe(2);
    expect(journey.afterRedo.observation.revision).toBe(3);
    expect(journey.save.saveSafety.status).toBe('saved');
    expect(journey.reopened.save.saveSafety.status).toBe('saved');
    expect(journey.reopened.reload.revision).toBe(journey.afterRedo.observation.revision);
    expect(journey.reopened.observation.layers).toEqual(journey.afterRedo.observation.layers);
    expect(journey.reopened.observation.palette).toEqual(journey.afterRedo.observation.palette);
    expect(journey.exact).toEqual({ document: true, render: true, structure: true });
  });

  it('rejects floating and transforming selection state before static mutation', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const session = createFixtureSession({ context });
    sessions.push(session);
    const baseline = await session.runTransaction();
    const observation = baseline.afterRedo.observation;
    const changedLayers = observation.layers.map((layer, index) => ({
      ...layer,
      name: index === 0 ? 'Selection-safe rename' : layer.name,
    }));
    const beforeDocument = structuredClone(await context.project.saveProject({ rebuildIndexBuffers: false }));
    const beforeRevision = context.project.revision.value;
    const beforeHistory = {
      undo: context.history.undoStack.value,
      redo: context.history.redoStack.value,
      version: context.history.version.value,
    };
    const beforeSaveSafety = (await requestSuccess<ProjectObservation>(session, {
      operation: 'project.observe',
      target: session.target,
      expectedRevision: observation.revision,
    })).saveSafety;

    context.selection.setFloating(
      new ImageData(1, 1),
      { x: 0, y: 0, width: 1, height: 1 },
      'rectangle',
    );
    const floating = await session.adapter.request(makeStaticStructureRequest(
      session.target,
      observation,
      { operationId: 'selection-floating', layers: changedLayers },
    ));
    expect(floating).toEqual({
      ok: false,
      error: {
        code: 'invalid_state',
        retryable: false,
        details: { reason: 'selection_in_progress' },
      },
    });

    context.selection.startTransform(
      new ImageData(1, 1),
      { x: 0, y: 0, width: 1, height: 1 },
      'rectangle',
      undefined,
      observation.layers[0]?.id ?? null,
      observation.currentFrameId,
    );
    const transforming = await session.adapter.request(makeStaticStructureRequest(
      session.target,
      observation,
      { operationId: 'selection-transforming', layers: changedLayers },
    ));
    expect(transforming).toMatchObject({
      ok: false,
      error: { code: 'invalid_state', details: { reason: 'selection_in_progress' } },
    });

    expect(context.project.revision.value).toBe(beforeRevision);
    expect(context.history.undoStack.value).toBe(beforeHistory.undo);
    expect(context.history.redoStack.value).toBe(beforeHistory.redo);
    expect(context.history.version.value).toBe(beforeHistory.version);
    expect(await context.project.saveProject({ rebuildIndexBuffers: false })).toEqual(beforeDocument);
    const after = await requestSuccess<ProjectObservation>(session, {
      operation: 'project.observe',
      target: session.target,
      expectedRevision: beforeRevision,
    });
    expect(after.saveSafety).toEqual(beforeSaveSafety);
  });

  it('enforces the static frame, cel, and preparation-byte bounds before allocation', async () => {
    const frameContext = createProjectContext();
    contexts.push(frameContext);
    const frameSession = createFixtureSession({ context: frameContext });
    sessions.push(frameSession);
    const frameBaseline = await frameSession.runTransaction();
    const frameObservation = frameBaseline.afterRedo.observation;
    const frame = frameContext.animation.frames.value[0];
    if (!frame) throw new Error('Fixture project has no frame.');
    frameContext.animation.frames.value = Array.from(
      { length: STATIC_STRUCTURE_MAX_FRAMES + 1 },
      (_, index) => ({ ...frame, id: `frame-over-limit-${index}`, order: index }),
    );
    const frameResult = await frameSession.adapter.request(makeStaticStructureRequest(
      frameSession.target,
      frameObservation,
      { operationId: 'frame-bound', layers: frameObservation.layers },
    ));
    expect(frameResult).toMatchObject({
      ok: false,
      error: {
        code: 'limit_exceeded',
        details: { reason: 'static_preparation_frames', max: STATIC_STRUCTURE_MAX_FRAMES },
      },
    });

    const celContext = createProjectContext();
    contexts.push(celContext);
    const celSession = createFixtureSession({ context: celContext });
    sessions.push(celSession);
    const celBaseline = await celSession.runTransaction();
    const celObservation = celBaseline.afterRedo.observation;
    const firstCel = celContext.animation.cels.value.values().next().value;
    if (!firstCel) throw new Error('Fixture project has no cel.');
    celContext.animation.cels.value = new Map(Array.from(
      { length: STATIC_STRUCTURE_MAX_CELS + 1 },
      (_, index) => [`cel-over-limit-${index}`, { ...firstCel, id: `cel-over-limit-${index}` }],
    ));
    const celResult = await celSession.adapter.request(makeStaticStructureRequest(
      celSession.target,
      celObservation,
      { operationId: 'cel-bound', layers: celObservation.layers },
    ));
    expect(celResult).toMatchObject({
      ok: false,
      error: {
        code: 'limit_exceeded',
        details: { reason: 'static_preparation_cels', max: STATIC_STRUCTURE_MAX_CELS },
      },
    });

    const bytesContext = createProjectContext();
    contexts.push(bytesContext);
    const bytesSession = createFixtureSession({ context: bytesContext });
    sessions.push(bytesSession);
    const bytesBaseline = await bytesSession.runTransaction();
    const bytesObservation = bytesBaseline.afterRedo.observation;
    bytesContext.project.width.value = 2048;
    bytesContext.project.height.value = 2048;
    const byteLayers = [
      ...bytesObservation.layers,
      {
        id: 'byte-bound-one',
        name: 'Byte Bound One',
        type: 'image' as const,
        parentId: null,
        visible: true,
        locked: false,
        opacity: 255,
        blendMode: 'normal' as const,
        continuous: false,
      },
      {
        id: 'byte-bound-two',
        name: 'Byte Bound Two',
        type: 'image' as const,
        parentId: null,
        visible: true,
        locked: false,
        opacity: 255,
        blendMode: 'normal' as const,
        continuous: false,
      },
    ];
    const byteResult = await bytesSession.adapter.request(makeStaticStructureRequest(
      bytesSession.target,
      bytesObservation,
      { operationId: 'byte-bound', layers: byteLayers },
    ));
    expect(byteResult).toMatchObject({
      ok: false,
      error: {
        code: 'limit_exceeded',
        details: { reason: 'static_preparation_bytes' },
      },
    });
  });

  it('accounts static transaction snapshots in history while retaining the layer-tag profile', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const session = createFixtureSession({ context });
    sessions.push(session);
    const baseline = await session.runTransaction();
    const observation = baseline.afterRedo.observation;
    const result = await session.adapter.request(makeStaticStructureRequest(
      session.target,
      observation,
      {
        operationId: 'history-memory',
        layers: observation.layers.map((layer, index) => ({
          ...layer,
          name: index === 0 ? 'Memory snapshot' : layer.name,
        })),
      },
    ));
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    const staticCommand = context.history.undoStack.value.at(-1);
    expect(staticCommand?.memorySize).toBeGreaterThan(0);

    const layer = observation.layers[0];
    if (!layer) throw new Error('Fixture project has no layer.');
    const layerTag = await session.adapter.request({
      operation: 'project.transaction.execute',
      target: session.target,
      expectedRevision: result.result.revision,
      provenance: {
        clientId: 'history-memory-client',
        sessionId: 'history-memory-session',
        runId: 'history-memory-run',
        operationId: 'history-layer-tag',
      },
      children: [
        {
          command: 'project.layer.state',
          input: { kind: 'layer.visibility', layerId: layer.id, visible: !layer.visible },
        },
        {
          command: 'project.animation.frame-tag',
          input: { kind: 'tag.delete', tagId: observation.tags[0]?.id ?? 'missing-tag' },
        },
      ],
    });
    expect(layerTag).toMatchObject({ ok: true });
    expect(context.history.undoStack.value.at(-1)?.memorySize).toBe(0);
    expect(context.history.getMemoryUsage()).toBe(staticCommand?.memorySize);
  });

  it('protects persisted compatibility bytes when removing an otherwise empty loaded group', async () => {
    const context = createProjectContext();
    contexts.push(context);
    const repository = new FixtureProjectRepository();
    const saveService = createAutoSaveService({ repository });
    saveServices.push(saveService);
    const projectId = 'loaded-group-project';
    const groupId = 'loaded-group';
    const imageId = 'loaded-image';
    const project: ProjectFile = {
      version: '4.3.0',
      name: 'Loaded Group',
      width: 4,
      height: 4,
      palette: ['#000000'],
      paletteEntries: [{ id: 'loaded-black', color: '#000000' }],
      layers: [
        {
          id: groupId,
          name: 'Legacy Group',
          type: 'group',
          visible: true,
          locked: false,
          opacity: 255,
          blendMode: 'normal',
          continuous: false,
          parentId: null,
          data: new Uint8Array([7, 8, 9]),
        },
        {
          id: imageId,
          name: 'Loaded Image',
          type: 'image',
          visible: true,
          locked: false,
          opacity: 255,
          blendMode: 'normal',
          continuous: false,
          parentId: groupId,
          data: new Uint8Array(0),
        },
      ],
      frames: [{
        id: 'loaded-frame',
        duration: 100,
        cels: [{
          id: 'loaded-cel',
          layerId: imageId,
          data: new Uint8Array(0),
          opacity: 100,
        }],
      }],
      animation: { fps: 12, currentFrameIndex: 0 },
      tags: [],
    };
    await saveService.runWithoutSaving(async () => {
      await context.project.loadProject(project);
      context.project.id.value = projectId;
    }, context);
    await repository.create(projectId, project);
    const adapter = createAutomationAdapter({
      targetRegistry: new Map([[projectId, context]]),
      repository,
      saveService,
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    const observationResult = await adapter.request({
      operation: 'project.observe',
      target: { projectId },
      expectedRevision: 0,
    });
    if (!observationResult.ok) throw new Error(`Loaded group observation failed: ${observationResult.error.code}`);
    const observation = observationResult.result as ProjectObservation;
    const persistedBefore = await repository.load(projectId);
    const result = await adapter.request(makeStaticStructureRequest(
      { projectId },
      observation,
      {
        operationId: 'loaded-group-removal',
        layers: [{ ...observation.layers[1]!, parentId: null }],
      },
    ));
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalid_state', details: { reason: 'non_empty_layer_removal' } },
    });
    expect(await repository.load(projectId)).toEqual(persistedBefore);
    expect(context.project.revision.value).toBe(0);
    expect(context.history.undoStack.value).toHaveLength(0);
    expect((await context.project.saveProject({ rebuildIndexBuffers: false })).layers[0]?.data)
      .toEqual(new Uint8Array([7, 8, 9]));
  });

  it('rejects non-empty layer removal and used-palette recoloring without a revision or history change', async () => {
    const session = createFixtureSession();
    sessions.push(session);

    const journey = await session.runTransaction();
    const observation = journey.afterRedo.observation;
    const artwork = observation.layers[0];
    if (!artwork) throw new Error('Fixture project has no artwork layer.');
    const requestBase = {
      operation: 'project.transaction.execute',
      profile: 'static-structure',
      target: session.target,
      expectedRevision: observation.revision,
      provenance: {
        clientId: 'failure-client',
        sessionId: 'failure-session',
        runId: 'failure-run',
        operationId: 'failure-operation',
      },
    };
    const recolor = await session.adapter.request({
      ...requestBase,
      children: [
        {
          command: 'project.palette.declaration',
          input: {
            kind: 'palette.declaration',
            entries: observation.palette.map((entry) => ({
              id: entry.id,
              color: entry.id === 'fixture-palette-red' ? '#00ff00' : entry.color,
            })),
          },
        },
        {
          command: 'project.layer.tree',
          input: {
            kind: 'layer-tree.declaration',
            layers: [{
              id: artwork.id,
              name: artwork.name,
              type: 'image',
              parentId: artwork.parentId,
              visible: artwork.visible,
              locked: artwork.locked,
              opacity: artwork.opacity,
              blendMode: artwork.blendMode,
              continuous: artwork.continuous,
            }],
          },
        },
      ],
    });
    expect(recolor).toMatchObject({
      ok: false,
      error: { code: 'invalid_state', details: { reason: 'palette_used_entry' } },
    });

    const removal = await session.adapter.request({
      ...requestBase,
      children: [
        {
          command: 'project.palette.declaration',
          input: {
            kind: 'palette.declaration',
            entries: observation.palette.map(({ id, color }) => ({ id, color })),
          },
        },
        {
          command: 'project.layer.tree',
          input: {
            kind: 'layer-tree.declaration',
            layers: [{
              id: 'replacement',
              name: 'Replacement',
              type: 'image',
              parentId: null,
              visible: true,
              locked: false,
              opacity: 255,
              blendMode: 'normal',
              continuous: false,
            }],
          },
        },
      ],
    });
    expect(removal).toMatchObject({
      ok: false,
      error: { code: 'invalid_state', details: { reason: 'non_empty_layer_removal' } },
    });
    expect((await requestSuccess<{ readonly revision: number }>(session, {
      operation: 'project.target',
      target: session.target,
    })).revision).toBe(observation.revision);
  });
});

async function requestSuccess<T>(
  session: FixtureSession,
  input: Record<string, unknown>,
): Promise<T> {
  const result = await session.adapter.request(input);
  if (!result.ok) throw new Error(`Fixture adapter request failed: ${result.error.code}`);
  return result.result as T;
}

async function requestRender(
  session: FixtureSession,
  target: { readonly projectId: string },
  observation: { readonly revision: number; readonly currentFrameId: string },
) {
  return await requestSuccess<{ readonly pixels: Uint8Array }>(session, {
    operation: 'project.render.observe',
    target,
    expectedRevision: observation.revision,
    frameId: observation.currentFrameId,
  });
}

async function captureAdapterRenders(
  adapter: AutomationAdapter,
  projectId: string,
  observation: ProjectObservation,
): Promise<readonly RenderObservation[]> {
  const renders: RenderObservation[] = [];
  for (const frame of observation.frames) {
    const result = await adapter.request({
      operation: 'project.render.observe',
      target: { projectId },
      expectedRevision: observation.revision,
      frameId: frame.id,
    });
    if (!result.ok) throw new Error(`Fixture render failed: ${result.error.code}`);
    renders.push(result.result as RenderObservation);
  }
  return renders;
}

function renderPixelBytes(renders: readonly RenderObservation[]): readonly number[][] {
  return renders.map((render) => Array.from(render.pixels));
}

function textCelPayloads(
  project: ProjectFile,
  layerId: string,
): Readonly<{ readonly textData: ProjectFile['layers'][number]['textData']; readonly cels: readonly unknown[] }> {
  const layer = project.layers.find((candidate) => candidate.id === layerId);
  return {
    textData: layer?.textData,
    cels: project.frames.map((frame) => {
      const cel = frame.cels.find((candidate) => candidate.layerId === layerId);
      return cel ? {
        id: cel.id,
        layerId: cel.layerId,
        data: cel.data,
        opacity: cel.opacity,
        indexData: cel.indexData,
        linkedCelId: cel.linkedCelId,
        linkType: cel.linkType,
        textCelData: cel.textCelData,
      } : undefined;
    }),
  };
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function makeStructureRefinementRequest(
  target: { readonly projectId: string },
  expectedRevision: number,
  layers: readonly Readonly<Record<string, unknown>>[],
  mergePairs: readonly Readonly<Record<string, unknown>>[],
  operationId: string,
): Record<string, unknown> {
  return {
    operation: 'project.transaction.execute',
    profile: 'structure-refinement',
    target,
    expectedRevision,
    provenance: {
      clientId: 'browser-refinement-client',
      sessionId: 'browser-refinement-session',
      runId: 'browser-refinement-run',
      operationId,
    },
    children: [{
      command: 'project.layer.structure.refine',
      input: { kind: 'structure.refine', layers, mergePairs },
    }],
  };
}

function makeStaticStructureRequest(
  target: { readonly projectId: string },
  observation: ProjectObservation,
  options: {
    readonly operationId?: string;
    readonly paletteEntries?: readonly { readonly id: string; readonly color: string }[];
    readonly layers?: readonly ProjectObservation['layers'][number][];
  } = {},
): Record<string, unknown> {
  const layers = options.layers ?? observation.layers;
  const paletteEntries = options.paletteEntries ?? observation.palette;
  return {
    operation: 'project.transaction.execute',
    profile: 'static-structure',
    target,
    expectedRevision: observation.revision,
    provenance: {
      clientId: 'static-client',
      sessionId: 'static-session',
      runId: 'static-run',
      operationId: options.operationId ?? 'static-structure',
    },
    children: [
      {
        command: 'project.palette.declaration',
        input: {
          kind: 'palette.declaration',
          entries: paletteEntries.map(({ id, color }) => ({ id, color })),
        },
      },
      {
        command: 'project.layer.tree',
        input: {
          kind: 'layer-tree.declaration',
          layers: layers.map((layer) => ({
            id: layer.id,
            name: layer.name,
            type: layer.type,
            parentId: layer.parentId,
            visible: layer.visible,
            locked: layer.locked,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            continuous: layer.continuous,
          })),
        },
      },
    ],
  };
}
