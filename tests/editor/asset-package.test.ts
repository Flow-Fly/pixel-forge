import { afterEach, describe, expect, it } from 'vitest';
import {
  createAutomationAdapter,
  type AutomationAdapter,
} from '../../src/editor/automation-adapter';
import {
  normalizeAssetPackageRequest,
} from '../../src/editor/asset-package';
import { createProjectContext, type ProjectContext } from '../../src/stores/project-context';
import { createAutoSaveService, type AutoSaveService } from '../../src/services/auto-save';

const contexts: ProjectContext[] = [];
const saveServices: AutoSaveService[] = [];

afterEach(() => {
  for (const saveService of saveServices.splice(0)) saveService.stop();
  for (const context of contexts.splice(0)) context.dispose();
});

function createAdapter(projectId = 'asset-package-test'): {
  readonly adapter: AutomationAdapter;
  readonly context: ProjectContext;
  readonly saveService: AutoSaveService;
} {
  const context = createProjectContext();
  context.project.id.value = projectId;
  const saveService = createAutoSaveService();
  saveServices.push(saveService);
  contexts.push(context);
  return {
    adapter: createAutomationAdapter({
      targetRegistry: new Map([[projectId, context]]),
      saveService,
    }),
    context,
    saveService,
  };
}

describe('asset package contract', () => {
  it('accepts only the explicit target, revision, and save-safety proof', () => {
    const request = normalizeAssetPackageRequest({
      operation: 'project.asset-package.prepare',
      target: { projectId: 'asset-package-test' },
      expectedRevision: 7,
      expectedSaveSafety: {
        type: 'project.save-safety',
        target: { projectId: 'asset-package-test' },
        currentRevision: 7,
        persistedRevision: 7,
        status: 'saved',
      },
      expectedPackageDigest: null,
    });
    expect(request).toEqual({
      target: { projectId: 'asset-package-test' },
      expectedRevision: 7,
      expectedSaveSafety: {
        type: 'project.save-safety',
        target: { projectId: 'asset-package-test' },
        currentRevision: 7,
        persistedRevision: 7,
        status: 'saved',
      },
      expectedPackageDigest: null,
    });

    expect(() => normalizeAssetPackageRequest({
      operation: 'project.asset-package.prepare',
      target: { projectId: 'asset-package-test' },
      expectedRevision: 7,
      expectedSaveSafety: request.expectedSaveSafety,
      expectedPackageDigest: null,
      provenance: 'caller-authored',
    })).toThrow();

    expect(() => normalizeAssetPackageRequest({
      operation: 'project.asset-package.prepare',
      target: { projectId: 'asset-package-test' },
      expectedRevision: 7,
      expectedSaveSafety: request.expectedSaveSafety,
    })).toThrow();
    expect(() => normalizeAssetPackageRequest({
      operation: 'project.asset-package.prepare',
      target: { projectId: 'asset-package-test' },
      expectedRevision: 7,
      expectedSaveSafety: request.expectedSaveSafety,
      expectedPackageDigest: 'A'.repeat(64),
    })).toThrow();
  });

  it('rejects a package request whose proof is not the exact saved revision', async () => {
    const { adapter, context } = createAdapter();
    const negotiation = adapter.negotiateCatalog({ version: '1.0' });
    expect(negotiation.ok).toBe(true);
    const result = await adapter.request({
      operation: 'project.asset-package.prepare',
      target: { projectId: 'asset-package-test' },
      expectedRevision: context.project.revision.value,
      expectedSaveSafety: {
        type: 'project.save-safety',
        target: { projectId: 'asset-package-test' },
        currentRevision: context.project.revision.value,
        persistedRevision: 0,
        status: 'dirty',
      },
      expectedPackageDigest: null,
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid_state',
        retryable: false,
        details: { reason: 'save_safety' },
      },
    });
  });

  it('does not accept caller-authored provenance at the adapter boundary', async () => {
    const { adapter, context } = createAdapter();
    adapter.negotiateCatalog({ version: '1.0' });
    const result = await adapter.request({
      operation: 'project.asset-package.prepare',
      target: { projectId: 'asset-package-test' },
      expectedRevision: context.project.revision.value,
      expectedSaveSafety: {
        type: 'project.save-safety',
        target: { projectId: 'asset-package-test' },
        currentRevision: 0,
        persistedRevision: 0,
        status: 'saved',
      },
      expectedPackageDigest: null,
      provenance: { approved: true },
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid_request',
        retryable: false,
        details: { reason: 'asset_package_request' },
      },
    });
  });
});
