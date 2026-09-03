import { afterEach, describe, expect, it } from 'vitest';
import {
  createFixtureSession,
  type FixtureSession,
} from '../../src/editor/fixture-session';

const sessions: FixtureSession[] = [];

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
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
});
