import { afterEach, describe, expect, it } from 'vitest';
import {
  AutomationSessionManager,
  type AutomationLocalTarget,
  type InspectObservationClass,
} from '../../src/editor/automation-session';
import type { AutomationAdapter } from '../../src/editor/automation-adapter';
import { autoSaveService } from '../../src/services/auto-save';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';

const contexts: ProjectContext[] = [];
const managers: AutomationSessionManager[] = [];

afterEach(() => {
  restoreDefaultProjectContext();
  for (const manager of managers.splice(0)) manager.dispose();
  for (const context of contexts.splice(0)) {
    autoSaveService.stop(context);
    context.dispose();
  }
});

function createTarget(id: string, name: string): AutomationLocalTarget {
  const context = createProjectContext();
  context.project.id.value = id;
  context.project.name.value = name;
  contexts.push(context);
  return { id, name, context };
}

function createManager(
  targets: readonly AutomationLocalTarget[],
  now: { value: number } = { value: 10_000 }
): AutomationSessionManager {
  const manager = new AutomationSessionManager({
    targets: () => targets,
    clock: () => now.value,
    isPageVisible: () => true,
    requestIdFactory: (() => {
      let count = 0;
      return () => `request-${++count}`;
    })(),
    sessionIdFactory: (() => {
      let count = 0;
      return () => `session-${++count}`;
    })(),
  });
  managers.push(manager);
  return manager;
}

function request(
  manager: AutomationSessionManager,
  classes: readonly InspectObservationClass[] = ['structure']
) {
  return manager.requestSession({
    client: { name: 'External Inspector', identity: 'self-declared' },
    compatibility: { minVersion: '1.0', maxVersion: '1.0' },
    observationClasses: classes,
    lifetimeSeconds: 60,
  });
}

function expectTargetFree(value: unknown): void {
  expect(JSON.stringify(value)).not.toContain('"target"');
}

describe('AutomationSessionManager', () => {
  it('discovers and queues access without reading or returning local project data', () => {
    const target = createTarget('secret-project-id', 'Private project name');
    const manager = createManager([target]);

    const discovery = manager.discover();
    const pending = request(manager);

    expect(JSON.stringify(discovery)).not.toContain('secret-project-id');
    expect(JSON.stringify(discovery)).not.toContain('Private project name');
    expect(JSON.stringify(pending)).not.toContain('secret-project-id');
    expect(JSON.stringify(pending)).not.toContain('Private project name');
    expect(pending).toMatchObject({
      ok: true,
      result: {
        type: 'automation.session.requested',
        client: { name: 'External Inspector', identity: 'self-declared' },
        observationClasses: ['structure'],
      },
    });
    expect(manager.listLocalTargets()).toEqual([{ id: target.id, name: target.name }]);
  });

  it('approves one exact target and exposes only granted observations through the policy gate', async () => {
    const first = createTarget('project-a', 'A private project');
    const second = createTarget('project-b', 'B private project');
    const manager = createManager([first, second]);
    const pending = request(manager, ['structure', 'palette', 'save-state']);
    if (!pending.ok) throw new Error('Expected a pending request.');

    const grant = manager.approveRequest(pending.result.requestId, first.id, [
      'structure',
      'save-state',
    ]);
    expect(grant).toMatchObject({
      ok: true,
      result: {
        type: 'automation.session.granted',
        sessionId: 'session-1',
        observationClasses: ['structure', 'save-state'],
        catalogVersion: '1.0',
      },
    });
    expect(JSON.stringify(grant)).not.toContain('project-a');
    expect(JSON.stringify(grant)).not.toContain('A private project');
    if (!grant.ok) return;

    const observation = await manager.observe(grant.result.sessionId, 'structure', {
      expectedRevision: 0,
    });
    expectTargetFree(observation);
    expect(observation).toMatchObject({
      ok: true,
      result: {
        type: 'project.structure.observation',
        revision: 0,
        canvas: { width: 64, height: 64 },
      },
    });

    const deniedClass = await manager.observe(grant.result.sessionId, 'palette', {
      expectedRevision: 0,
    });
    expect(deniedClass).toEqual({
      ok: false,
      error: {
        code: 'capability_denied',
        retryable: false,
        details: { reason: 'observation_class' },
      },
    });

    const callerTarget = await manager.requestObservation({
      sessionId: grant.result.sessionId,
      operation: 'project.observe',
      observationClass: 'structure',
      expectedRevision: 0,
      target: { projectId: 'project-b' },
    });
    expect(callerTarget).toEqual({
      ok: false,
      error: { code: 'invalid_request', retryable: false, details: { reason: 'target_forbidden' } },
    });
    const writeAttempt = await manager.requestObservation({
      sessionId: grant.result.sessionId,
      operation: 'project.canvas.resize',
      observationClass: 'structure',
      expectedRevision: 0,
      width: 1,
      height: 1,
    });
    expect(writeAttempt).toEqual({
      ok: false,
      error: { code: 'capability_denied', retryable: false, details: { reason: 'inspect_only' } },
    });
    expect(first.context.project.revision.value).toBe(0);
    expect(second.context.project.revision.value).toBe(0);
  });

  it('keeps denial, synchronous revoke, and expiry content-free and non-authoritative', async () => {
    const target = createTarget('project-a', 'Private project');
    const now = { value: 10_000 };
    const manager = createManager([target], now);

    const deniedRequest = request(manager);
    if (!deniedRequest.ok) throw new Error('Expected a pending request.');
    expect(manager.denyRequest(deniedRequest.result.requestId)).toEqual({
      ok: true,
      result: {
        type: 'automation.session.denied',
        requestId: 'request-1',
        reason: 'creator_denied',
      },
    });
    expect(JSON.stringify(manager.listPendingRequests())).not.toContain('project-a');

    const pending = request(manager, ['structure']);
    if (!pending.ok) throw new Error('Expected a pending request.');
    const grant = manager.approveRequest(pending.result.requestId, target.id, ['structure']);
    if (!grant.ok) throw new Error('Expected a grant.');

    expect(manager.revokeSession(grant.result.sessionId)).toEqual({
      ok: true,
      result: { type: 'automation.session.revoked' },
    });
    await expect(
      manager.observe(grant.result.sessionId, 'structure', { expectedRevision: 0 })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'capability_denied',
        retryable: false,
        details: { reason: 'session_revoked' },
      },
    });

    const pendingAfterRevoke = request(manager, ['structure']);
    if (!pendingAfterRevoke.ok) throw new Error('Expected a pending request.');
    const expiringGrant = manager.approveRequest(pendingAfterRevoke.result.requestId, target.id, [
      'structure',
    ]);
    if (!expiringGrant.ok) throw new Error('Expected a grant.');
    now.value += 60_000;
    await expect(
      manager.observe(expiringGrant.result.sessionId, 'structure', { expectedRevision: 0 })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'capability_denied',
        retryable: false,
        details: { reason: 'session_expired' },
      },
    });
  });

  it('rejects incompatible, duplicate, and unbounded requests without queuing authority', () => {
    const target = createTarget('bounded-project', 'Bounded project');
    const manager = createManager([target]);
    const baseRequest = {
      client: { name: 'External Inspector', identity: 'self-declared' },
      compatibility: { minVersion: '1.0', maxVersion: '1.0' },
      observationClasses: ['structure'],
      lifetimeSeconds: 60,
    };

    const first = manager.requestSession(baseRequest);
    expect(first).toMatchObject({ ok: true });
    const duplicate = manager.requestSession({ ...baseRequest });
    expect(duplicate).toEqual({
      ok: false,
      error: {
        code: 'invalid_request',
        retryable: false,
        details: { reason: 'duplicate_request' },
      },
    });
    expect(manager.listPendingRequests()).toHaveLength(1);
    if (first.ok) manager.denyRequest(first.result.requestId);

    for (const input of [
      { ...baseRequest, client: { name: 'Inspector', identity: 'verified' } },
      { ...baseRequest, compatibility: { minVersion: '2.0', maxVersion: '2.0' } },
      { ...baseRequest, observationClasses: ['structure', 'structure'] },
      { ...baseRequest, lifetimeSeconds: 0 },
      { ...baseRequest, lifetimeSeconds: 3_601 },
      { ...baseRequest, unexpected: 'project-derived' },
    ]) {
      expect(manager.requestSession(input)).toMatchObject({ ok: false });
      expect(JSON.stringify(manager.listPendingRequests())).not.toContain('bounded-project');
    }
    expect(manager.listPendingRequests()).toHaveLength(0);
  });

  it('backgrounds grants, rejects rebound targets, and disposes without silent resume', async () => {
    const original = createTarget('lifecycle-project', 'Original project');
    const replacement = createTarget('lifecycle-project', 'Replacement project');
    let visible = true;
    let targets: readonly AutomationLocalTarget[] = [original];
    const manager = new AutomationSessionManager({
      targets: () => targets,
      clock: () => 10_000,
      isPageVisible: () => visible,
      requestIdFactory: (() => {
        let count = 0;
        return () => `lifecycle-request-${++count}`;
      })(),
      sessionIdFactory: (() => {
        let count = 0;
        return () => `lifecycle-session-${++count}`;
      })(),
    });
    managers.push(manager);

    const firstRequest = request(manager);
    if (!firstRequest.ok) throw new Error('Expected a pending request.');
    const firstGrant = manager.approveRequest(firstRequest.result.requestId, original.id, [
      'structure',
    ]);
    if (!firstGrant.ok) throw new Error('Expected a grant.');

    visible = false;
    await expect(
      manager.observe(firstGrant.result.sessionId, 'structure', { expectedRevision: 0 })
    ).resolves.toEqual({
      ok: false,
      error: { code: 'capability_denied', retryable: true, details: { reason: 'page_hidden' } },
    });
    visible = true;
    await expect(
      manager.observe(firstGrant.result.sessionId, 'structure', { expectedRevision: 0 })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'capability_denied',
        retryable: false,
        details: { reason: 'session_backgrounded' },
      },
    });

    const secondRequest = request(manager);
    if (!secondRequest.ok) throw new Error('Expected a fresh pending request.');
    const secondGrant = manager.approveRequest(secondRequest.result.requestId, original.id, [
      'structure',
    ]);
    if (!secondGrant.ok) throw new Error('Expected a fresh grant.');
    targets = [replacement];
    await expect(
      manager.observe(secondGrant.result.sessionId, 'structure', { expectedRevision: 0 })
    ).resolves.toEqual({
      ok: false,
      error: { code: 'target_not_found', retryable: true, details: { reason: 'target_rebound' } },
    });

    manager.dispose();
    await expect(
      manager.observe(secondGrant.result.sessionId, 'structure', { expectedRevision: 0 })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'capability_denied',
        retryable: false,
        details: { reason: 'manager_disposed' },
      },
    });
    expect(
      manager.requestSession({
        client: { name: 'External Inspector', identity: 'self-declared' },
        compatibility: { minVersion: '1.0', maxVersion: '1.0' },
        observationClasses: ['structure'],
        lifetimeSeconds: 10,
      })
    ).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
  });

  it('bootstraps a non-zero revision once and keeps conflicts content-free', async () => {
    const target = createTarget('revision-project', 'Revision project');
    target.context.project.commitChange('external-change', ['timeline']);
    expect(target.context.project.revision.value).toBe(1);
    const manager = createManager([target]);
    const pending = request(manager);
    if (!pending.ok) throw new Error('Expected a pending request.');
    const grant = manager.approveRequest(pending.result.requestId, target.id, ['structure']);
    if (!grant.ok) throw new Error('Expected a grant.');

    const bootstrap = await manager.observe(grant.result.sessionId, 'structure', {});
    expect(bootstrap).toMatchObject({
      ok: true,
      result: { type: 'project.structure.observation', revision: 1 },
    });
    expectTargetFree(bootstrap);
    expect(grant.result).not.toHaveProperty('revision');

    await expect(manager.observe(grant.result.sessionId, 'structure', {})).resolves.toEqual({
      ok: false,
      error: {
        code: 'invalid_request',
        retryable: false,
        details: { reason: 'expected_revision' },
      },
    });

    const explicit = await manager.observe(grant.result.sessionId, 'structure', {
      expectedRevision: 1,
    });
    expect(explicit).toMatchObject({ ok: true, result: { revision: 1 } });

    const conflict = await manager.observe(grant.result.sessionId, 'structure', {
      expectedRevision: 0,
    });
    expect(conflict).toMatchObject({
      ok: false,
      error: { code: 'revision_conflict' },
    });
    expect(JSON.stringify(conflict)).not.toContain('currentRevision');
    expect(JSON.stringify(conflict)).not.toContain('revision-project');
  });

  it('serializes bootstrap attempts and retries a failed bootstrap', async () => {
    const target = createTarget('retry-project', 'Retry project');
    let attempts = 0;
    const adapter = {
      negotiateCatalog: () => ({ ok: true, result: {} }),
      observeProject: (input: unknown) => {
        attempts += 1;
        if (attempts === 1) {
          return {
            ok: false as const,
            error: { code: 'internal' as const, retryable: true, details: { reason: 'temporary' } },
          };
        }
        return {
          ok: true as const,
          result: {
            type: 'test.observation',
            target: { projectId: target.id },
            revision: (input as { expectedRevision: number }).expectedRevision,
          },
        };
      },
    } as unknown as AutomationAdapter;
    const manager = new AutomationSessionManager({
      targets: () => [target],
      adapter,
      isPageVisible: () => true,
      requestIdFactory: () => 'retry-request',
      sessionIdFactory: () => 'retry-session',
    });
    managers.push(manager);
    const pending = request(manager);
    if (!pending.ok) throw new Error('Expected a pending request.');
    const grant = manager.approveRequest(pending.result.requestId, target.id, ['structure']);
    if (!grant.ok) throw new Error('Expected a grant.');

    await expect(manager.observe(grant.result.sessionId, 'structure', {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'internal' },
    });
    const retried = await manager.observe(grant.result.sessionId, 'structure', {});
    expect(retried).toMatchObject({ ok: true, result: { revision: 0 } });
    expectTargetFree(retried);
    expect(attempts).toBe(2);
  });

  it('rejects concurrent omitted revisions while the first bootstrap is in flight', async () => {
    const target = createTarget('concurrent-project', 'Concurrent project');
    let resolveObservation: ((value: unknown) => void) | undefined;
    const observation = new Promise<unknown>((resolve) => {
      resolveObservation = resolve;
    });
    const adapter = {
      negotiateCatalog: () => ({ ok: true, result: {} }),
      observeProject: () => observation,
    } as unknown as AutomationAdapter;
    const manager = new AutomationSessionManager({
      targets: () => [target],
      adapter,
      isPageVisible: () => true,
      requestIdFactory: () => 'concurrent-request',
      sessionIdFactory: () => 'concurrent-session',
    });
    managers.push(manager);
    const pending = request(manager);
    if (!pending.ok) throw new Error('Expected a pending request.');
    const grant = manager.approveRequest(pending.result.requestId, target.id, ['structure']);
    if (!grant.ok) throw new Error('Expected a grant.');

    const first = manager.observe(grant.result.sessionId, 'structure', {});
    const second = await manager.observe(grant.result.sessionId, 'structure', {});
    expect(second).toEqual({
      ok: false,
      error: {
        code: 'capability_denied',
        retryable: true,
        details: { reason: 'revision_bootstrap_in_flight' },
      },
    });
    resolveObservation?.({
      ok: true,
      result: {
        type: 'test.observation',
        target: { projectId: target.id },
        revision: 0,
      },
    });
    await expect(first).resolves.toMatchObject({ ok: true, result: { revision: 0 } });
  });

  it('rejects an approval after the displayed target is replaced', () => {
    const original = createTarget('approval-project', 'Original approval project');
    const replacement = createTarget('approval-project', 'Replacement approval project');
    let targets: readonly AutomationLocalTarget[] = [original];
    const manager = new AutomationSessionManager({
      targets: () => targets,
      isPageVisible: () => true,
      requestIdFactory: () => 'approval-request',
      sessionIdFactory: () => 'approval-session',
    });
    managers.push(manager);
    const pending = request(manager);
    if (!pending.ok) throw new Error('Expected a pending request.');
    expect(manager.captureLocalTargets(pending.result.requestId)).toEqual([
      { id: original.id, name: original.name },
    ]);
    targets = [replacement];

    const approval = manager.approveRequest(pending.result.requestId, original.id, ['structure']);
    expect(approval).toEqual({
      ok: false,
      error: { code: 'target_not_found', retryable: true },
    });
    expect(manager.listPendingRequests()).toHaveLength(1);
    expect(manager.listLocalSessions()).toHaveLength(0);
    expect(JSON.stringify(approval)).not.toContain('approval-project');
  });
});
