import { afterEach, describe, expect, it } from 'vitest';
import {
  createAutomationAdapter,
  type AutomationAdapter,
} from '../../src/editor/automation-adapter';
import {
  editorCatalog,
  PROJECT_OBSERVATION_LIMITS,
  RENDER_OBSERVATION_MAX_BYTES,
} from '../../src/editor/catalog';
import { FixtureProjectRepository } from '../../src/editor/fixture-session';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';
import {
  autoSaveService,
  createAutoSaveService,
  type AutoSaveService,
} from '../../src/services/auto-save';

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

function createAdapter(
  ...entries: Array<[string, ProjectContext]>
): AutomationAdapter {
  const targets = new Map(entries);
  return createAutomationAdapter({ targetRegistry: targets });
}

function createContext(projectId: string): ProjectContext {
  const context = createProjectContext();
  context.project.id.value = projectId;
  contexts.push(context);
  return context;
}

describe('AutomationAdapter', () => {
  it('requires catalog negotiation and returns a cloned versioned catalog', () => {
    const context = createContext('project-a');
    const adapter = createAdapter(['project-a', context]);

    const beforeNegotiation = adapter.observeProject({
      target: { projectId: 'project-a' },
      expectedRevision: 0,
    });
    expect(beforeNegotiation).toEqual({
      ok: false,
      error: {
        code: 'unsupported',
        retryable: false,
        details: { reason: 'catalog_negotiation_required' },
      },
    });

    const incompatible = adapter.negotiateCatalog({ version: '2.0' });
    expect(incompatible).toEqual({
      ok: false,
      error: {
        code: 'unsupported',
        retryable: false,
        details: { reason: 'catalog_major', requestedVersion: '2.0' },
      },
    });
    expect(context.project.revision.value).toBe(0);

    const negotiated = adapter.negotiateCatalog({ version: '1.8' });
    expect(negotiated.ok).toBe(true);
    if (!negotiated.ok) return;
    expect(negotiated.result.version).toBe('1.0');
    expect(negotiated.result.catalog).not.toBe(editorCatalog);
    expect(editorCatalog.operations[0]?.id).toBe('catalog.negotiate');
    expect(negotiated.result.catalog.observations.map((item) => item.id)).toEqual([
      'project.save-safety',
      'project.observe',
      'project.render.observe',
    ]);
    expect(negotiated.result.catalog.operations.map((operation) => operation.id)).toEqual([
      'catalog.negotiate',
      'project.create',
      'project.target',
      'project.observe',
      'project.render.observe',
      'project.canvas.resize',
      'project.transaction.execute',
      'project.history.undo',
      'project.history.redo',
      'project.save',
      'project.reload',
    ]);
    (negotiated.result.catalog.operations as Array<{ id: string }>)[0]!.id = 'mutated';
    expect(editorCatalog.operations[0]?.id).toBe('catalog.negotiate');

    const operations = negotiated.result.catalog.operations;
    for (const operation of operations) {
      expect(operation).toHaveProperty('request');
      expect(operation).toHaveProperty('result');
      expect(operation).toHaveProperty('errors');
      expect(operation).toHaveProperty('limits');
      expect(operation).toHaveProperty('target');
      expect(operation).toHaveProperty('requiresRevision');
      expect(operation).toHaveProperty('revision');
    }
    expect(operations.find((operation) => operation.id === 'project.observe')).toMatchObject({
      target: 'project',
      requiresRevision: true,
      limits: PROJECT_OBSERVATION_LIMITS,
      result: { type: 'project.observation' },
      errors: expect.arrayContaining(['revision_conflict', 'limit_exceeded']),
    });
    expect(operations.find((operation) => operation.id === 'project.render.observe')).toMatchObject({
      limits: { maxBytes: RENDER_OBSERVATION_MAX_BYTES },
      result: { type: 'render.observation', format: 'rgba8' },
    });
    expect(operations.find((operation) => operation.id === 'project.transaction.execute')).toMatchObject({
      target: 'project',
      requiresRevision: true,
      request: {
        expectedRevision: 'integer >= 0',
        profile: {
          default: 'layer-and-tag',
          oneOf: ['layer-and-tag', 'static-structure', 'structure-refinement', 'animation'],
        },
        provenance: expect.objectContaining({
          clientId: 'non-empty bounded string',
        }),
        children: expect.objectContaining({
          order: 'either',
          profiles: expect.objectContaining({
            'layer-and-tag': {
              exact: 2,
              oneOfEach: ['project.layer.state', 'project.animation.frame-tag'],
            },
            'static-structure': expect.objectContaining({
              exact: 2,
              oneOfEach: ['project.palette.declaration', 'project.layer.tree'],
            }),
            animation: expect.objectContaining({
              exact: 1,
              oneOf: [
                'project.animation.frame',
                'project.animation.cel.link',
                'project.animation.cel.unlink',
                'project.animation.frame-tag',
              ],
            }),
          }),
        }),
      },
      limits: {
        children: {
          order: 'either',
          profiles: expect.objectContaining({
            'layer-and-tag': {
              exact: 2,
              oneOfEach: ['project.layer.state', 'project.animation.frame-tag'],
            },
            'static-structure': expect.objectContaining({
              exact: 2,
              oneOfEach: ['project.palette.declaration', 'project.layer.tree'],
            }),
            animation: expect.objectContaining({
              exact: 1,
              oneOf: [
                'project.animation.frame',
                'project.animation.cel.link',
                'project.animation.cel.unlink',
                'project.animation.frame-tag',
              ],
            }),
          }),
        },
        provenance: {
          stringLength: { min: 1, max: 256 },
          transitions: { max: 16 },
        },
        profiles: expect.objectContaining({
          'layer-and-tag': {},
          'static-structure': expect.objectContaining({
            frames: { max: 16 },
            cels: { max: 256 },
            preparationBytes: { max: 32 * 1024 * 1024 },
          }),
          animation: expect.objectContaining({
            frames: { max: 16 },
            layers: { max: 16 },
            cels: { max: 256 },
            duration: { min: 10, max: 2000 },
            linkMembers: { min: 2, max: 16 },
            unlinkGroup: { min: 2, max: 16 },
            requestString: { min: 1, max: 256 },
            preparationBytes: { max: 32 * 1024 * 1024 },
          }),
        }),
      },
      availability: {
        profiles: expect.objectContaining({
          'layer-and-tag': {
            guidedDrawing: { layerState: 'unsupported', frameTag: 'supported' },
          },
          'static-structure': {
            guidedDrawing: 'unsupported',
            selection: 'none | selected; floating and transforming are rejected',
          },
          animation: {
            guidedDrawing: 'unsupported',
            selection: 'none | selected; floating and transforming are rejected',
            layers: 'supported non-reference layers only',
          },
        }),
      },
      result: { type: 'project.transaction.execute' },
      errors: expect.arrayContaining(['revision_conflict', 'bounds_exceeded', 'limit_exceeded', 'internal']),
    });
    expect(operations.find((operation) => operation.id === 'project.transaction.execute')?.request.children)
      .not.toHaveProperty('exact');
    expect(operations.find((operation) => operation.id === 'project.transaction.execute')?.limits.children)
      .not.toHaveProperty('exact');
    for (const commandId of [
      'project.animation.frame',
      'project.animation.cel.link',
      'project.animation.cel.unlink',
    ]) {
      expect(negotiated.result.catalog.commands.find((command) => command.id === commandId)?.errors)
        .toEqual(expect.arrayContaining(['bounds_exceeded']));
    }
    expect(operations.find((operation) => operation.id === 'project.reload')).toMatchObject({
      target: 'project',
      requiresRevision: true,
      preconditions: {
        exactSave: {
          operation: 'project.save',
          revision: 'same expectedRevision',
          saveSafety: { status: 'saved', persistedRevision: 'same expectedRevision' },
        },
      },
      errors: expect.arrayContaining(['invalid_state']),
    });
  });

  it('captures one explicit context even when the active tab changes', () => {
    const first = createContext('project-a');
    const second = createContext('project-b');
    const adapter = createAdapter(['project-a', first], ['project-b', second]);
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);

    setActiveProjectContext(first);
    const firstObservation = adapter.observeProject({
      target: { projectId: 'project-a' },
      expectedRevision: 0,
    });
    setActiveProjectContext(second);

    expect(firstObservation.ok).toBe(true);
    if (!firstObservation.ok) return;
    expect(firstObservation.result.target).toEqual({ projectId: 'project-a' });
    expect(firstObservation.result.canvas).toEqual({ width: 64, height: 64 });
    expect(first.project.revision.value).toBe(0);
    expect(second.project.revision.value).toBe(0);
  });

  it('rejects malformed, stale, unknown, disposed, and invalid requests without writing', async () => {
    const context = createContext('project-a');
    const adapter = createAdapter(['project-a', context]);
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);

    await expect(adapter.request({
      operation: 'project.target',
      target: { projectId: 'project-a' },
    })).resolves.toEqual({
      ok: true,
      result: { type: 'project.target', target: { projectId: 'project-a' }, revision: 0 },
    });
    await expect(adapter.request({
      operation: 'render.observe',
      target: { projectId: 'project-a' },
      expectedRevision: 0,
      frameId: 'missing',
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'unsupported' },
    });

    await expect(adapter.request({ operation: 'project.observe' })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid_request', retryable: false, details: { reason: 'target' } },
    });
    await expect(adapter.request({
      operation: 'project.canvas.resize',
      target: { projectId: 'project-a' },
      expectedRevision: 1,
      width: 63,
      height: 63,
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'revision_conflict',
        details: { expectedRevision: 1, currentRevision: 0 },
      },
    });
    await expect(adapter.request({
      operation: 'project.canvas.resize',
      target: { projectId: 'missing' },
      expectedRevision: 0,
      width: 63,
      height: 63,
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'target_not_found' },
    });
    await expect(adapter.request({
      operation: 'project.canvas.resize',
      target: { projectId: 'project-a' },
      expectedRevision: 0,
      width: 0,
      height: 64,
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    await expect(adapter.request({
      operation: 'project.canvas.resize',
      action: 'other',
      target: { projectId: 'project-a' },
      expectedRevision: 0,
      width: 63,
      height: 63,
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_request', details: { reason: 'action' } },
    });
    context.dispose();
    expect(adapter.observeProject({
      target: { projectId: 'project-a' },
      expectedRevision: 0,
    })).toMatchObject({ ok: false, error: { code: 'target_not_found' } });
    expect(context.project.revision.value).toBe(0);
  });

  it('rejects observation collections and strings beyond the discoverable limits', () => {
    const layersContext = createContext('layers');
    const layers = layersContext.layers.layers.value;
    layersContext.layers.layers.value = Array.from(
      { length: PROJECT_OBSERVATION_LIMITS.maxLayers + 1 },
      (_, index) => ({ ...(layers[0] ?? {}), id: `layer-${index}` }),
    ) as typeof layers;
    const layersAdapter = createAdapter(['layers', layersContext]);
    expect(layersAdapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    expectObservationLimit(layersAdapter.observeProject({
      target: { projectId: 'layers' },
      expectedRevision: 0,
    }), 'project-layers', PROJECT_OBSERVATION_LIMITS.maxLayers);

    const framesContext = createContext('frames');
    const _frames = framesContext.animation.frames.value;
    framesContext.animation.frames.value = Array.from(
      { length: PROJECT_OBSERVATION_LIMITS.maxFrames + 1 },
      (_, index) => ({ id: `frame-${index}` }),
    ) as typeof _frames;
    const framesAdapter = createAdapter(['frames', framesContext]);
    expect(framesAdapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    expectObservationLimit(framesAdapter.observeProject({
      target: { projectId: 'frames' },
      expectedRevision: 0,
    }), 'project-frames', PROJECT_OBSERVATION_LIMITS.maxFrames);

    const celsContext = createContext('cels');
    const _cels = celsContext.animation.cels.value;
    celsContext.animation.cels.value = new Map(
      Array.from(
        { length: PROJECT_OBSERVATION_LIMITS.maxCels + 1 },
        (_, index) => [`cel-${index}`, {}],
      ),
    ) as typeof _cels;
    const celsAdapter = createAdapter(['cels', celsContext]);
    expect(celsAdapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    expectObservationLimit(celsAdapter.observeProject({
      target: { projectId: 'cels' },
      expectedRevision: 0,
    }), 'project-cels', PROJECT_OBSERVATION_LIMITS.maxCels);

    const tagsContext = createContext('tags');
    const _tags = tagsContext.animation.tags.value;
    tagsContext.animation.tags.value = Array.from(
      { length: PROJECT_OBSERVATION_LIMITS.maxTags + 1 },
      (_, index) => ({ id: `tag-${index}` }),
    ) as typeof _tags;
    const tagsAdapter = createAdapter(['tags', tagsContext]);
    expect(tagsAdapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    expectObservationLimit(tagsAdapter.observeProject({
      target: { projectId: 'tags' },
      expectedRevision: 0,
    }), 'project-tags', PROJECT_OBSERVATION_LIMITS.maxTags);

    const paletteContext = createContext('palette');
    paletteContext.palette.mainColors.value = Array.from(
      { length: PROJECT_OBSERVATION_LIMITS.maxPaletteEntries + 1 },
      () => '#000000',
    );
    const paletteAdapter = createAdapter(['palette', paletteContext]);
    expect(paletteAdapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    expectObservationLimit(paletteAdapter.observeProject({
      target: { projectId: 'palette' },
      expectedRevision: 0,
    }), 'project-palette-entries', PROJECT_OBSERVATION_LIMITS.maxPaletteEntries);

    const historyContext = createContext('history');
    historyContext.history.undoStack.value = Array.from(
      { length: PROJECT_OBSERVATION_LIMITS.maxHistoryEntries + 1 },
      (_, index) => ({
        id: `history-${index}`,
        name: 'History entry',
        execute() {},
        undo() {},
      }),
    );
    const historyAdapter = createAdapter(['history', historyContext]);
    expect(historyAdapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    expectObservationLimit(historyAdapter.observeProject({
      target: { projectId: 'history' },
      expectedRevision: 0,
    }), 'project-history-entries', PROJECT_OBSERVATION_LIMITS.maxHistoryEntries);

    const stringContext = createContext('strings');
    stringContext.project.name.value = 'x'.repeat(PROJECT_OBSERVATION_LIMITS.maxStringLength + 1);
    const stringAdapter = createAdapter(['strings', stringContext]);
    expect(stringAdapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    expectObservationLimit(stringAdapter.observeProject({
      target: { projectId: 'strings' },
      expectedRevision: 0,
    }), 'project-string-length', PROJECT_OBSERVATION_LIMITS.maxStringLength);
  });

  it('keeps invalid render byte configuration bounded', () => {
    const context = createContext('render');
    context.animation.frames.value = [{ id: 'frame-1', order: 0, duration: 100 }];
    context.project.width.value = 2049;
    context.project.height.value = 2049;
    const target = { projectId: 'render' };

    for (const maxRenderBytes of [Number.POSITIVE_INFINITY, Number.NaN, 0, -1, Number.MAX_SAFE_INTEGER]) {
      const adapter = createAutomationAdapter({
        targetRegistry: new Map([['render', context]]),
        maxRenderBytes,
      });
      expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
      expect(adapter.observeRender({
        target,
        expectedRevision: 0,
        frameId: 'frame-1',
      })).toMatchObject({
        ok: false,
        error: {
          code: 'limit_exceeded',
          details: { limitId: 'render-bytes', max: RENDER_OBSERVATION_MAX_BYTES },
        },
      });
    }
  });

  it('rejects reload without an exact adapter save proof before reading storage', async () => {
    const context = createContext('project-a');
    context.project.width.value = 9;
    const repository = new DeferredProjectRepository();
    const adapter = createAutomationAdapter({
      targetRegistry: new Map([['project-a', context]]),
      repository,
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);

    await expect(adapter.request({
      operation: 'project.reload',
      target: { projectId: 'project-a' },
      expectedRevision: 0,
    })).resolves.toEqual({
      ok: false,
      error: {
        code: 'invalid_state',
        retryable: false,
        details: { reason: 'reload_save_required' },
      },
    });
    expect(repository.loadCount).toBe(0);
    expect(context.project.width.value).toBe(9);
    expect(context.project.revision.value).toBe(0);
  });

  it('reloads the captured target after an active-tab switch', async () => {
    const { context, repository, adapter } = await createDeferredReloadFixture();
    const second = createContext('project-b');
    second.project.width.value = 7;

    setActiveProjectContext(context);
    const pending = adapter.request({
      operation: 'project.reload',
      target: { projectId: 'project-a' },
      expectedRevision: 1,
    });
    await repository.loadStarted;
    setActiveProjectContext(second);
    repository.releaseLoad();

    await expect(pending).resolves.toMatchObject({
      ok: true,
      result: { type: 'project.reload', target: { projectId: 'project-a' } },
    });
    expect(context.project.width.value).toBe(9);
    expect(context.project.revision.value).toBe(1);
    expect(second.project.width.value).toBe(7);
  });

  it('rejects reload when the captured revision drifts while storage is pending', async () => {
    const { context, repository, adapter } = await createDeferredReloadFixture();

    const pending = adapter.request({
      operation: 'project.reload',
      target: { projectId: 'project-a' },
      expectedRevision: 1,
    });
    await repository.loadStarted;
    context.project.width.value = 10;
    context.project.advanceRevision();
    repository.releaseLoad();

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'revision_conflict',
        details: { expectedRevision: 1, currentRevision: 2 },
      },
    });
    expect(context.project.width.value).toBe(10);
    expect(context.project.revision.value).toBe(2);
  });

  it('rejects reload when the registry rebinds or disposes the captured target', async () => {
    const reboundFixture = await createDeferredReloadFixture();
    const rebound = createContext('project-rebound');
    const reboundPending = reboundFixture.adapter.request({
      operation: 'project.reload',
      target: { projectId: 'project-a' },
      expectedRevision: 1,
    });
    await reboundFixture.repository.loadStarted;
    reboundFixture.registry.set('project-a', rebound);
    reboundFixture.repository.releaseLoad();
    await expect(reboundPending).resolves.toMatchObject({
      ok: false,
      error: { code: 'target_not_found', details: { reason: 'target_rebound' } },
    });
    expect(reboundFixture.context.project.width.value).toBe(9);

    const disposedFixture = await createDeferredReloadFixture();
    const disposedPending = disposedFixture.adapter.request({
      operation: 'project.reload',
      target: { projectId: 'project-a' },
      expectedRevision: 1,
    });
    await disposedFixture.repository.loadStarted;
    disposedFixture.context.dispose();
    disposedFixture.repository.releaseLoad();
    await expect(disposedPending).resolves.toMatchObject({
      ok: false,
      error: { code: 'target_not_found', details: { reason: 'disposed' } },
    });
  });

  it('creates a bounded blank target and applies one static structure transaction with undo and redo', async () => {
    const source = createContext('source');
    const registry = new Map<string, ProjectContext>([['source', source]]);
    const repository = new FixtureProjectRepository();
    const saveService = createAutoSaveService({ repository });
    saveServices.push(saveService);
    const adapter = createAutomationAdapter({
      targetRegistry: registry,
      repository,
      saveService,
      projectIdFactory: () => 'created-project',
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);

    const created = await adapter.request({
      operation: 'project.create',
      kind: 'blank',
      name: 'Structured asset',
      width: 16,
      height: 16,
    });
    expect(created).toEqual({
      ok: true,
      result: {
        type: 'project.create',
        kind: 'blank',
        target: { projectId: 'created-project' },
        revision: 0,
      },
    });
    expect(registry.has('created-project')).toBe(true);
  });

  it('safe-copies an explicit source without overwriting a fresh-id collision', async () => {
    const source = createContext('source-copy');
    source.project.name.value = 'Source Project';
    const registry = new Map<string, ProjectContext>([['source-copy', source]]);
    const repository = new FixtureProjectRepository();
    const sourceDocument = structuredClone(await source.project.saveProject({ rebuildIndexBuffers: false }));
    await repository.save('source-copy', sourceDocument);
    const saveService = createAutoSaveService({ repository });
    saveServices.push(saveService);
    const adapter = createAutomationAdapter({
      targetRegistry: registry,
      repository,
      saveService,
      projectIdFactory: () => 'copy-project',
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);

    const copied = await adapter.request({
      operation: 'project.create',
      kind: 'safe-copy',
      source: { target: { projectId: 'source-copy' }, expectedRevision: 0 },
    });
    expect(copied).toMatchObject({
      ok: true,
      result: {
        kind: 'safe-copy',
        target: { projectId: 'copy-project' },
        revision: 0,
      },
    });
    expect((await repository.load('source-copy'))).toEqual(sourceDocument);
    expect(source.project.revision.value).toBe(0);
    expect(source.history.undoStack.value).toHaveLength(0);
    expect(source.project.name.value).toBe('Source Project');
    expect((await repository.load('copy-project'))?.name).toBe('Copy of Source Project');

    const collision = await adapter.request({
      operation: 'project.create',
      kind: 'safe-copy',
      source: { target: { projectId: 'source-copy' }, expectedRevision: 0 },
    });
    expect(collision).toEqual({
      ok: false,
      error: {
        code: 'invalid_state',
        retryable: false,
        details: { reason: 'project_id_collision' },
      },
    });
    expect((await repository.list()).map((project) => project.id).sort()).toEqual([
      'copy-project',
      'source-copy',
    ]);
  });

  it('releases a reserved target when fresh persistence fails without changing repository state', async () => {
    const source = createContext('source-failure');
    const registry = new Map<string, ProjectContext>([['source-failure', source]]);
    const repository = new FailingCreateRepository();
    const saveService = createAutoSaveService({ repository });
    saveServices.push(saveService);
    const adapter = createAutomationAdapter({
      targetRegistry: registry,
      repository,
      saveService,
      projectIdFactory: () => 'failed-project',
      entityIdFactory: (() => {
        let sequence = 0;
        return () => `entity-${++sequence}`;
      })(),
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    const beforeRegistry = [...registry.entries()];
    const beforeProjects = await repository.list();

    await expect(adapter.request({
      operation: 'project.create',
      kind: 'blank',
      name: 'Failed project',
      width: 16,
      height: 16,
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'internal' },
    });
    expect([...registry.entries()]).toEqual(beforeRegistry);
    expect(await repository.list()).toEqual(beforeProjects);
    await expect(adapter.request({
      operation: 'project.observe',
      target: { projectId: 'failed-project' },
      expectedRevision: 0,
    })).resolves.toMatchObject({ ok: false, error: { code: 'target_not_found' } });
  });

  it('keeps a late repository and registry collision intact while releasing only its own reservation', async () => {
    const source = createContext('source-late-collision');
    const registry = new Map<string, ProjectContext>([['source-late-collision', source]]);
    const repository = new DeferredCreateRepository();
    const saveService = createAutoSaveService({ repository });
    saveServices.push(saveService);
    const adapter = createAutomationAdapter({
      targetRegistry: registry,
      repository,
      saveService,
      projectIdFactory: () => 'late-project',
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);

    const pending = adapter.request({
      operation: 'project.create',
      kind: 'blank',
      name: 'Late project',
      width: 16,
      height: 16,
    });
    await repository.createStarted;

    const lateContext = createContext('late-project');
    registry.set('late-project', lateContext);
    const existing = structuredClone(await source.project.saveProject({ rebuildIndexBuffers: false }));
    await repository.save('late-project', existing);
    repository.releaseCreate();

    await expect(pending).resolves.toEqual({
      ok: false,
      error: {
        code: 'invalid_state',
        retryable: false,
        details: { reason: 'project_id_collision' },
      },
    });
    expect(registry.get('late-project')).toBe(lateContext);
    expect(await repository.load('late-project')).toEqual(existing);
  });

});

function expectObservationLimit(
  result: ReturnType<AutomationAdapter['observeProject']>,
  limitId: string,
  max: number,
): void {
  expect(result).toMatchObject({
    ok: false,
    error: { code: 'limit_exceeded', details: { limitId, max } },
  });
}

async function createDeferredReloadFixture(): Promise<{
  readonly context: ProjectContext;
  readonly repository: DeferredProjectRepository;
  readonly registry: Map<string, ProjectContext>;
  readonly adapter: AutomationAdapter;
}> {
  const context = createContext('project-a');
  context.project.width.value = 9;
  context.project.advanceRevision();
  const repository = new DeferredProjectRepository();
  const registry = new Map([['project-a', context]]);
  const saveService = createAutoSaveService({ repository });
  saveServices.push(saveService);
  const adapter = createAutomationAdapter({ targetRegistry: registry, repository, saveService });
  expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
  await expect(adapter.request({
    operation: 'project.save',
    target: { projectId: 'project-a' },
    expectedRevision: 1,
  })).resolves.toMatchObject({
    ok: true,
    result: {
      revision: 1,
      saveSafety: {
        target: { projectId: 'project-a' },
        currentRevision: 1,
        persistedRevision: 1,
        status: 'saved',
      },
    },
  });
  return { context, repository, registry, adapter };
}

class DeferredProjectRepository extends FixtureProjectRepository {
  loadCount = 0;
  readonly loadStarted: Promise<void>;
  private readonly loadBarrier: Promise<void>;
  private resolveLoadStarted!: () => void;
  private releaseLoadBarrier!: () => void;

  constructor() {
    super();
    this.loadStarted = new Promise((resolve) => {
      this.resolveLoadStarted = resolve;
    });
    this.loadBarrier = new Promise((resolve) => {
      this.releaseLoadBarrier = resolve;
    });
  }

  override async load(id: string) {
    this.loadCount++;
    this.resolveLoadStarted();
    await this.loadBarrier;
    return super.load(id);
  }

  releaseLoad(): void {
    this.releaseLoadBarrier();
  }
}

class FailingCreateRepository extends FixtureProjectRepository {
  override async create(): Promise<void> {
    throw new Error('injected create failure');
  }
}

class DeferredCreateRepository extends FixtureProjectRepository {
  readonly createStarted: Promise<void>;
  private readonly createBarrier: Promise<void>;
  private resolveCreateStarted!: () => void;
  private releaseCreateBarrier!: () => void;

  constructor() {
    super();
    this.createStarted = new Promise((resolve) => {
      this.resolveCreateStarted = resolve;
    });
    this.createBarrier = new Promise((resolve) => {
      this.releaseCreateBarrier = resolve;
    });
  }

  override async create(id: string, project: Parameters<FixtureProjectRepository['create']>[1]): Promise<void> {
    this.resolveCreateStarted();
    await this.createBarrier;
    return super.create(id, project);
  }

  releaseCreate(): void {
    this.releaseCreateBarrier();
  }
}
