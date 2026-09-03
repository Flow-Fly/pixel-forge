import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAutomationAdapter,
  type AutomationAdapter,
} from '../../src/editor/automation-adapter';
import { FixtureProjectRepository } from '../../src/editor/fixture-session';
import { autoSaveService, createAutoSaveService, type AutoSaveService } from '../../src/services/auto-save';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';
import {
  TRANSACTION_PROVENANCE_MAX_STRING_LENGTH,
  TRANSACTION_PROVENANCE_MAX_TRANSITIONS,
} from '../../src/editor/catalog';

const contexts: ProjectContext[] = [];
const saveServices: AutoSaveService[] = [];

afterEach(() => {
  restoreDefaultProjectContext();
  for (const saveService of saveServices.splice(0)) saveService.stop();
  for (const context of contexts.splice(0)) {
    autoSaveService.stop(context);
    context.dispose();
  }
});

function createContext(projectId: string): ProjectContext {
  const context = createProjectContext();
  context.project.id.value = projectId;
  contexts.push(context);
  return context;
}

function createAdapter(...entries: Array<[string, ProjectContext]>): AutomationAdapter {
  const saveService = createAutoSaveService({ repository: new FixtureProjectRepository() });
  saveServices.push(saveService);
  const adapter = createAutomationAdapter({
    targetRegistry: new Map(entries),
    saveService,
  });
  expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
  return adapter;
}

function isDirty(context: ProjectContext): boolean {
  return saveServices.at(-1)?.isDirty(context) ?? false;
}

function transactionRequest(
  projectId: string,
  expectedRevision: number,
  layerId: string,
  order: 'layer-first' | 'tag-first' = 'layer-first',
): Record<string, unknown> {
  const layer = {
    command: 'project.layer.state',
    input: {
      kind: 'layer.visibility',
      layerId,
      visible: false,
    },
  };
  const tag = {
    command: 'project.animation.frame-tag',
    input: {
      kind: 'tag.create',
      name: 'Secret Artwork Tag',
      color: '#123456',
      startFrameIndex: 0,
      endFrameIndex: 0,
    },
  };
  return {
    operation: 'project.transaction.execute',
    target: { projectId },
    expectedRevision,
    provenance: {
      clientId: 'client-1',
      sessionId: 'session-1',
      runId: 'run-1',
      operationId: 'operation-1',
    },
    children: order === 'layer-first' ? [layer, tag] : [tag, layer],
  };
}

function captureState(context: ProjectContext) {
  return {
    layers: context.layers.layers.value,
    tags: context.animation.tags.value,
    undo: context.history.undoStack.value,
    redo: context.history.redoStack.value,
    historyVersion: context.history.version.value,
    revision: context.project.revision.value,
  };
}

describe('Automation Adapter editor transactions', () => {
  // fallow-ignore-next-line complexity -- This public journey asserts all durable transaction evidence in one scenario.
  it('commits one layer and tag child as one revision, event, history entry, and provenance', async () => {
    const context = createContext('project-a');
    const adapter = createAdapter(['project-a', context]);
    const layer = context.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');
    const events: unknown[] = [];
    context.projectChangeEvents.addEventListener('project-change', (event) => {
      events.push((event as CustomEvent).detail);
    });

    const result = await adapter.request(transactionRequest('project-a', 0, layer.id));

    expect(result).toMatchObject({
      ok: true,
      result: {
        type: 'project.transaction.execute',
        target: { projectId: 'project-a' },
        fromRevision: 0,
        revision: 1,
        event: {
          fromRevision: 0,
          toRevision: 1,
          domains: ['layer-state', 'timeline'],
        },
        provenance: {
          source: 'automation',
          clientId: 'client-1',
          sessionId: 'session-1',
          runId: 'run-1',
          operationId: 'operation-1',
          target: { projectId: 'project-a' },
          fromRevision: 0,
          toRevision: 1,
          transitionCount: 1,
          transitionsTruncated: false,
          transitions: [{ phase: 'execute', fromRevision: 0, toRevision: 1 }],
          children: [
            { commandId: 'project.layer.state', operation: 'layer.visibility', domains: ['layer-state'] },
            { commandId: 'project.animation.frame-tag', operation: 'tag.create', domains: ['timeline'] },
          ],
        },
      },
    });
    if (!result.ok) return;
    const transaction = result.result as {
      readonly provenance: { readonly transactionId: string };
    };
    expect(context.layers.layers.value[0]?.visible).toBe(false);
    expect(context.animation.tags.value).toHaveLength(1);
    expect(context.history.undoStack.value).toHaveLength(1);
    expect(context.history.undoStack.value[0]?.provenance).toEqual(transaction.provenance);
    expect(context.history.version.value).toBe(1);
    expect(context.project.revision.value).toBe(1);
    expect(events).toHaveLength(1);
    expect(isDirty(context)).toBe(true);
    expect(Object.isFrozen(context.history.undoStack.value[0]?.provenance)).toBe(true);
    expect(Object.isFrozen(context.history.undoStack.value[0]?.provenance?.transitions)).toBe(true);

    const observed = await adapter.request({
      operation: 'project.observe',
      target: { projectId: 'project-a' },
      expectedRevision: 1,
    });
    expect(observed).toMatchObject({
      ok: true,
      result: {
        history: {
          undo: [{ provenance: transaction.provenance }],
        },
      },
    });
    const serializedProvenance = JSON.stringify(transaction.provenance);
    expect(serializedProvenance).not.toContain('Secret Artwork Tag');
    expect(serializedProvenance).not.toContain('#123456');
    expect(serializedProvenance).not.toContain(layer.id);

    const undo = await adapter.request({
      operation: 'project.history.undo',
      target: { projectId: 'project-a' },
      expectedRevision: 1,
    });
    expect(undo).toMatchObject({ ok: true, result: { revision: 2 } });
    expect(context.layers.layers.value[0]?.visible).toBe(true);
    expect(context.animation.tags.value).toEqual([]);
    expect(context.history.redoStack.value[0]?.provenance).toMatchObject({
      transactionId: transaction.provenance.transactionId,
      fromRevision: 0,
      toRevision: 2,
      transitionCount: 2,
      transitionsTruncated: false,
      transitions: [
        { phase: 'execute', fromRevision: 0, toRevision: 1 },
        { phase: 'undo', fromRevision: 1, toRevision: 2 },
      ],
    });

    const redo = await adapter.request({
      operation: 'project.history.redo',
      target: { projectId: 'project-a' },
      expectedRevision: 2,
    });
    expect(redo).toMatchObject({ ok: true, result: { revision: 3 } });
    const retainedProvenance = context.history.undoStack.value[0]?.provenance;
    expect(retainedProvenance).toMatchObject({
      transactionId: transaction.provenance.transactionId,
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
    expect(context.layers.layers.value[0]?.visible).toBe(false);
    expect(context.animation.tags.value).toHaveLength(1);
    expect(events).toHaveLength(3);

    const cloned = structuredClone(retainedProvenance);
    if (!cloned) throw new Error('Expected retained provenance');
    (cloned.transitions as Array<{ phase: string }>)[0].phase = 'tampered';
    (cloned.children as Array<{ operation: string }>)[0].operation = 'tampered';
    expect(context.history.undoStack.value[0]?.provenance?.transitions[0]?.phase).toBe('execute');
    expect(context.history.undoStack.value[0]?.provenance?.children[0]?.operation)
      .toBe('layer.visibility');
  });

  // fallow-ignore-next-line complexity -- This table-driven boundary test covers each distinct prevalidation failure.
  it('prevalidates both children and rejects failures without changing any durable state', async () => {
    const context = createContext('project-a');
    const adapter = createAdapter(['project-a', context]);
    const layer = context.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');
    const validRequest = transactionRequest('project-a', 0, layer.id);
    const validChildren = validRequest.children as Array<Record<string, unknown>>;
    const cases: readonly [string, Record<string, unknown>][] = [
      ['missing', { ...validRequest, children: [] }],
      ['duplicate', {
        ...validRequest,
        children: [
          { command: 'project.layer.state', input: { kind: 'layer.visibility', layerId: layer.id, visible: false } },
          { command: 'project.layer.state', input: { kind: 'layer.lock', layerId: layer.id, locked: true } },
        ],
      }],
      ['child revision', {
        ...validRequest,
        children: [{
          command: 'project.layer.state',
          input: {
            kind: 'layer.visibility',
            target: { projectId: 'project-a' },
            layerId: layer.id,
            visible: false,
          },
        }, validChildren[1] ?? {}],
      }],
      ['stale', { ...validRequest, expectedRevision: 1 }],
      ['invalid tag', {
        ...validRequest,
        children: [
          { command: 'project.layer.state', input: { kind: 'layer.visibility', layerId: layer.id, visible: false } },
          { command: 'project.animation.frame-tag', input: {
            kind: 'tag.create', name: 'Tag', color: '#123456', startFrameIndex: 0, endFrameIndex: 2,
          } },
        ],
      }],
      ['revision alias', { ...validRequest, revision: 0 }],
      ['envelope extra', { ...validRequest, extra: true }],
      ['target extra', {
        ...validRequest,
        target: { projectId: 'project-a', extra: true },
      }],
      ['child command alias', {
        ...validRequest,
        children: [
          { commandId: 'project.layer.state', input: (validChildren[0]?.input as Record<string, unknown>) ?? {} },
          validChildren[1] ?? {},
        ],
      }],
      ['child inline payload', {
        ...validRequest,
        children: [
          { command: 'project.layer.state', kind: 'layer.visibility', layerId: layer.id, visible: false },
          validChildren[1] ?? {},
        ],
      }],
      ['child extra', {
        ...validRequest,
        children: [
          {
            command: 'project.layer.state',
            input: { kind: 'layer.visibility', layerId: layer.id, visible: false, extra: true },
          },
          validChildren[1] ?? {},
        ],
      }],
      ['empty provenance', {
        ...validRequest,
        provenance: { ...validRequest.provenance, clientId: '' },
      }],
      ['wrong provenance type', {
        ...validRequest,
        provenance: { ...validRequest.provenance, clientId: 1 },
      }],
      ['oversized provenance', {
        ...validRequest,
        provenance: {
          ...validRequest.provenance,
          clientId: 'x'.repeat(TRANSACTION_PROVENANCE_MAX_STRING_LENGTH + 1),
        },
      }],
    ];

    for (const [name, input] of cases) {
      const before = captureState(context);
      const result = await adapter.request(input);
      expect(result.ok, name).toBe(false);
      if (name === 'oversized provenance') {
        expect(result).toEqual({
          ok: false,
          error: {
            code: 'limit_exceeded',
            retryable: false,
            details: { reason: 'client_id', max: TRANSACTION_PROVENANCE_MAX_STRING_LENGTH },
          },
        });
      }
      expect(captureState(context), name).toEqual(before);
      expect(context.layers.layers.value[0]?.visible, name).toBe(true);
      expect(context.animation.tags.value, name).toEqual([]);
      expect(isDirty(context), name).toBe(false);
    }
  });

  it('rolls back a real post-first-apply failure without a history, revision, event, or dirty transition', async () => {
    const context = createContext('project-a');
    const adapter = createAdapter(['project-a', context]);
    const layer = context.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');
    const events: unknown[] = [];
    context.projectChangeEvents.addEventListener('project-change', (event) => {
      events.push((event as CustomEvent).detail);
    });
    const originalSet = context.animation.tags.set;
    let shouldFail = true;
    const tagSet = vi.spyOn(context.animation.tags, 'set').mockImplementation((value) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('simulated tag write failure');
      }
      return originalSet.call(context.animation.tags, value);
    });

    const result = await adapter.request(transactionRequest('project-a', 0, layer.id));

    tagSet.mockRestore();
    expect(result).toEqual({
      ok: false,
      error: { code: 'internal', retryable: true, details: { reason: 'execution' } },
    });
    expect(context.layers.layers.value[0]?.visible).toBe(true);
    expect(context.animation.tags.value).toEqual([]);
    expect(context.history.undoStack.value).toEqual([]);
    expect(context.history.redoStack.value).toEqual([]);
    expect(context.history.version.value).toBe(0);
    expect(context.project.revision.value).toBe(0);
    expect(events).toEqual([]);
    expect(isDirty(context)).toBe(false);
  });

  it('keeps existing child validation bounds independent from provenance limits', async () => {
    const context = createContext('project-a');
    const adapter = createAdapter(['project-a', context]);
    const layer = context.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');
    const request = transactionRequest('project-a', 0, layer.id);
    const children = request.children as Array<Record<string, unknown>>;
    const tagChild = children[1];
    if (!tagChild || typeof tagChild.input !== 'object' || tagChild.input === null) {
      throw new Error('Expected tag child');
    }
    const tagInput = tagChild.input as Record<string, unknown>;
    const result = await adapter.request({
      ...request,
      children: [children[0], {
        ...tagChild,
        input: {
          ...tagInput,
          name: 'x'.repeat(TRANSACTION_PROVENANCE_MAX_STRING_LENGTH + 1),
        },
      }],
    });

    expect(result).toMatchObject({ ok: true, result: { revision: 1 } });
    expect(context.animation.tags.value[0]?.name).toHaveLength(
      TRANSACTION_PROVENANCE_MAX_STRING_LENGTH + 1,
    );
  });

  it('rolls back when history bookkeeping fails after the command prepares its commit', async () => {
    const context = createContext('project-a');
    const adapter = createAdapter(['project-a', context]);
    const layer = context.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');
    const events: unknown[] = [];
    context.projectChangeEvents.addEventListener('project-change', (event) => {
      events.push((event as CustomEvent).detail);
    });
    const before = captureState(context);
    const refreshUsedColors = vi.spyOn(context.palette, 'refreshUsedColors')
      .mockImplementationOnce(() => {
        throw new Error('simulated history bookkeeping failure');
      });

    const result = await adapter.request(transactionRequest('project-a', 0, layer.id));

    refreshUsedColors.mockRestore();
    expect(result).toEqual({
      ok: false,
      error: { code: 'internal', retryable: true, details: { reason: 'history_bookkeeping' } },
    });
    expect(captureState(context)).toEqual(before);
    expect(context.layers.layers.value[0]?.visible).toBe(true);
    expect(context.animation.tags.value).toEqual([]);
    expect(events).toEqual([]);
    const observed = await adapter.request({
      operation: 'project.observe',
      target: { projectId: 'project-a' },
      expectedRevision: 0,
    });
    expect(observed).toMatchObject({
      ok: true,
      result: { revision: 0, history: { undoCount: 0, redoCount: 0 } },
    });
    expect(isDirty(context)).toBe(false);
  });

  it('returns a bounded non-retryable internal error when rollback itself cannot restore', async () => {
    const context = createContext('project-a');
    const adapter = createAdapter(['project-a', context]);
    const layer = context.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');
    const tagSet = vi.spyOn(context.animation.tags, 'set').mockImplementation(() => {
      throw new Error('tag store unavailable');
    });

    const result = await adapter.request(transactionRequest('project-a', 0, layer.id));

    tagSet.mockRestore();
    expect(result).toEqual({
      ok: false,
      error: { code: 'internal', retryable: false, details: { reason: 'rollback_failed' } },
    });
    expect(context.history.undoStack.value).toEqual([]);
    expect(context.project.revision.value).toBe(0);
    expect(isDirty(context)).toBe(false);
  });

  it('keeps the explicit target when the active tab changes', async () => {
    const first = createContext('project-a');
    const second = createContext('project-b');
    const adapter = createAdapter(['project-a', first], ['project-b', second]);
    const layer = first.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');
    setActiveProjectContext(first);
    setActiveProjectContext(second);

    const result = await adapter.request(transactionRequest('project-a', 0, layer.id, 'tag-first'));

    expect(result).toMatchObject({ ok: true, result: { target: { projectId: 'project-a' } } });
    expect(first.layers.layers.value[0]?.visible).toBe(false);
    expect(first.animation.tags.value).toHaveLength(1);
    expect(first.project.revision.value).toBe(1);
    expect(second.layers.layers.value[0]?.visible).toBe(true);
    expect(second.animation.tags.value).toEqual([]);
    expect(second.project.revision.value).toBe(0);
  });

  it('bounds retained transition history without changing the transaction origin', async () => {
    const context = createContext('project-a');
    const adapter = createAdapter(['project-a', context]);
    const layer = context.layers.layers.value[0];
    if (!layer) throw new Error('Expected a layer');

    await adapter.request(transactionRequest('project-a', 0, layer.id));
    let revision = 1;
    for (let index = 0; index < 10; index++) {
      await adapter.request({
        operation: 'project.history.undo',
        target: { projectId: 'project-a' },
        expectedRevision: revision,
      });
      revision++;
      await adapter.request({
        operation: 'project.history.redo',
        target: { projectId: 'project-a' },
        expectedRevision: revision,
      });
      revision++;
    }

    const provenance = context.history.undoStack.value[0]?.provenance;
    expect(provenance).toMatchObject({
      fromRevision: 0,
      toRevision: revision,
      transitionCount: 21,
      transitionsTruncated: true,
    });
    expect(provenance?.transitions).toHaveLength(TRANSACTION_PROVENANCE_MAX_TRANSITIONS);
    expect(provenance?.transitions.at(-1)).toEqual({
      phase: 'redo',
      fromRevision: revision - 1,
      toRevision: revision,
    });
  });
});
