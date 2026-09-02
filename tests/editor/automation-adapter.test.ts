import { afterEach, describe, expect, it } from 'vitest';
import {
  createAutomationAdapter,
  type AutomationAdapter,
} from '../../src/editor/automation-adapter';
import { editorCatalog } from '../../src/editor/catalog';
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
  return createAutomationAdapter({ targets });
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
  });

  it('captures one explicit context even when the active tab changes', () => {
    const first = createContext('project-a');
    const second = createContext('project-b');
    const adapter = createAdapter(['project-a', first], ['project-b', second]);
    expect(adapter.negotiate({ version: '1.0' }).ok).toBe(true);

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
    expect(adapter.negotiate({ version: '1.0' }).ok).toBe(true);

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
    context.dispose();
    expect(adapter.observeProject({
      target: { projectId: 'project-a' },
      expectedRevision: 0,
    })).toMatchObject({ ok: false, error: { code: 'target_not_found' } });
    expect(context.project.revision.value).toBe(0);
  });
});
