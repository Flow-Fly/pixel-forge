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
import { autoSaveService } from '../../src/services/auto-save';

const contexts: ProjectContext[] = [];

afterEach(() => {
  restoreDefaultProjectContext();
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
    expect(negotiated.result.catalog.observations.map((item) => item.id)).toEqual([
      'project.save-safety',
      'project.observe',
      'project.render.observe',
    ]);
    expect(negotiated.result.catalog.operations.map((operation) => operation.id)).toEqual([
      'catalog.negotiate',
      'project.target',
      'project.observe',
      'project.render.observe',
      'project.canvas.resize',
      'project.history.undo',
      'project.history.redo',
      'project.save',
      'project.reload',
    ]);
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

  it('reloads the captured target after an active-tab switch', async () => {
    const { context, repository } = await createDeferredReloadFixture();
    const second = createContext('project-b');
    second.project.width.value = 7;
    const registry = new Map([['project-a', context]]);
    const adapter = createAutomationAdapter({ targetRegistry: registry, repository });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);

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
    expect(context.project.width.value).toBe(8);
    expect(context.project.revision.value).toBe(1);
    expect(second.project.width.value).toBe(7);
  });

  it('rejects reload when the captured revision drifts while storage is pending', async () => {
    const { context, repository } = await createDeferredReloadFixture();
    const adapter = createAutomationAdapter({
      targetRegistry: new Map([['project-a', context]]),
      repository,
    });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);

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
    const registry = new Map([['project-a', reboundFixture.context]]);
    const adapter = createAutomationAdapter({ targetRegistry: registry, repository: reboundFixture.repository });
    expect(adapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    const reboundPending = adapter.request({
      operation: 'project.reload',
      target: { projectId: 'project-a' },
      expectedRevision: 1,
    });
    await reboundFixture.repository.loadStarted;
    registry.set('project-a', rebound);
    reboundFixture.repository.releaseLoad();
    await expect(reboundPending).resolves.toMatchObject({
      ok: false,
      error: { code: 'target_not_found', details: { reason: 'target_rebound' } },
    });
    expect(reboundFixture.context.project.width.value).toBe(9);

    const disposedFixture = await createDeferredReloadFixture();
    const disposedAdapter = createAutomationAdapter({
      targetRegistry: new Map([['project-a', disposedFixture.context]]),
      repository: disposedFixture.repository,
    });
    expect(disposedAdapter.negotiateCatalog({ version: '1.0' }).ok).toBe(true);
    const disposedPending = disposedAdapter.request({
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
}> {
  const context = createContext('project-a');
  context.project.width.value = 8;
  const storedProject = await context.project.saveProject();
  context.project.width.value = 9;
  context.project.advanceRevision();
  const repository = new DeferredProjectRepository();
  await repository.save('project-a', storedProject);
  return { context, repository };
}

class DeferredProjectRepository extends FixtureProjectRepository {
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
    this.resolveLoadStarted();
    await this.loadBarrier;
    return super.load(id);
  }

  releaseLoad(): void {
    this.releaseLoadBarrier();
  }
}
