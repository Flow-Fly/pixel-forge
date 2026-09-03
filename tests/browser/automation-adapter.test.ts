import { afterEach, describe, expect, it } from 'vitest';
import {
  createFixtureSession,
  FixtureProjectRepository,
  type FixtureSession,
} from '../../src/editor/fixture-session';
import type {
  AutomationResult,
  HistoryTransitionResult,
  ProjectCreateResult,
  ReloadResult,
  SaveResult,
} from '../../src/editor/automation-adapter';
import type { ProjectObservation } from '../../src/editor/observations';
import type { EditorTransactionResult } from '../../src/editor/transaction';
import { createAutomationAdapter } from '../../src/editor/automation-adapter';
import { createAutoSaveService, type AutoSaveService } from '../../src/services/auto-save';
import {
  STATIC_STRUCTURE_MAX_CELS,
  STATIC_STRUCTURE_MAX_FRAMES,
} from '../../src/editor/catalog';
import type { ProjectFile } from '../../src/types/project';
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
