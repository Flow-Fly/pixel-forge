import { afterEach, describe, expect, it } from 'vitest';
import {
  createFixtureSession,
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
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';

const sessions: FixtureSession[] = [];
const contexts: ProjectContext[] = [];

afterEach(() => {
  restoreDefaultProjectContext();
  for (const session of sessions.splice(0)) session.dispose();
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
