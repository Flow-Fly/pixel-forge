import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteToolHost } from '../../src/editor/site-tool-host';
import { AutomationSessionManager } from '../../src/editor/automation-session';
import { workspaceStore } from '../../src/stores/workspace';
import { createProjectContext } from '../../src/stores/project-context';
import { autoSaveService } from '../../src/services/auto-save';
import type { CreativeRunController } from '../../src/editor/creative-run';
import { ANIMATION_FRAME_COMMAND_ID } from '../../src/editor/catalog';
import type { SiteToolResult } from '../../src/editor/site-tool-contract';

const input = { facadeVersion: '1.0', catalogVersion: '1.0', clientName: 'Self declared', purpose: 'Make an animation', observationClasses: ['structure', 'save-state'], writeCategories: ['timeline'], transactionLimit: 3, lifetimeSeconds: 300 };
const hosts: SiteToolHost[] = [];
const managers: AutomationSessionManager[] = [];
const contexts: ReturnType<typeof createProjectContext>[] = [];
function value(result: SiteToolResult) { expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.error.code); return result.result; }

beforeEach(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
afterEach(async () => {
  hosts.splice(0).forEach((host) => host.dispose());
  managers.splice(0).forEach((manager) => manager.dispose());
  for (const context of contexts.splice(0)) {
    autoSaveService.stop(context);
    const item = workspaceStore.items.value.find((item) => item.context === context);
    if (item) await workspaceStore.close(item.id);
    context.dispose();
  }
  vi.restoreAllMocks();
});

function setup() {
  const context = createProjectContext();
  contexts.push(context);
  context.project.name.value = 'Never disclose before approval';
  const manager = new AutomationSessionManager({ targets: () => [{ id: context.project.id.value, name: context.project.name.value, context }] });
  managers.push(manager);
  expect(workspaceStore.addContext(context, { activate: false }).ok).toBe(true);
  let controller: CreativeRunController | undefined;
  const host = new SiteToolHost(manager, (created) => { controller = created; });
  hosts.push(host);
  return { host, manager, context, controller: () => controller! };
}
async function requested(host: SiteToolHost, request = input) {
  const result = value(await host.facade.invoke('request', request));
  return { requestId: result.requestId, requestSecret: result.requestSecret };
}
async function approved() {
  const setupResult = setup();
  const credential = await requested(setupResult.host);
  expect(await setupResult.host.approve(credential.requestId as string, setupResult.context.project.id.value, ['structure', 'save-state'], 'existing')).toBe(true);
  const request = setupResult.manager.listPendingArtistModeRequests()[0];
  expect(setupResult.manager.approveArtistMode(request.requestId, ['timeline'], 3).ok).toBe(true);
  const controller = setupResult.controller();
  const brief = controller.getState().brief;
  expect(controller.approveBrief({ briefRevision: brief.revision, targetId: brief.targetId, requestedWriteCategories: brief.requestedWriteCategories, transactionLimit: brief.transactionLimit, durationSeconds: brief.durationSeconds, contentEgress: brief.contentEgress }).ok).toBe(true);
  return { ...setupResult, credential, controller };
}
async function observation(host: SiteToolHost, credential: Record<string, unknown>, expectedRevision?: number) {
  const handle = value(await host.facade.invoke('observe', { ...credential, observationClass: 'structure', ...(expectedRevision === undefined ? {} : { expectedRevision }) }));
  const chunk = value(await host.facade.invoke('result', { ...credential, handle: handle.handle, offset: 0, maxBytes: 49152 }));
  return JSON.parse(atob(chunk.data as string));
}

describe('caller-scoped browser site tools', () => {
  it('reveals no project data before approval and cannot exchange credentials with an equal caller name', async () => {
    const { host } = setup();
    const first = await requested(host);
    const second = await requested(host, { ...input, purpose: 'Another purpose', lifetimeSeconds: 299 });
    const pending = await host.facade.invoke('status', first);
    expect(value(pending)).toEqual({ type: 'session.status', status: 'pending' });
    expect(JSON.stringify(pending)).not.toContain('Never disclose');
    expect(await host.facade.invoke('status', { requestId: first.requestId, requestSecret: second.requestSecret })).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
    expect(await host.facade.invoke('observe', { ...first, observationClass: 'structure' })).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
    expect(Object.keys(host.facade)).toEqual(['invoke']);
  });

  it('routes one observed proposal through the real run and refuses replay, stale revisions and ungranted content', async () => {
    const { host, controller, credential } = await approved();
    const initial = await observation(host, credential);
    const running = controller.start();
    await vi.waitFor(() => expect(controller.getState().inFlight).toBe('step'));
    const proposal = { ...credential, operationId: 'one-animation-frame', expectedRevision: initial.revision, transaction: { profile: 'animation', children: [{ command: ANIMATION_FRAME_COMMAND_ID, input: { kind: 'frame.duration', frameId: initial.frames[0].id, duration: 120 } }] } };
    const committed = await host.facade.invoke('propose', proposal);
    expect(value(committed).code).toBeUndefined();
    expect(committed).toMatchObject({ ok: true, result: { outcome: 'committed', revision: initial.revision + 1 } });
    expect(await host.facade.invoke('propose', proposal)).toEqual(committed);
    await vi.waitFor(() => expect(controller.getState().transactionsUsed).toBe(1));
    await vi.waitFor(() => expect(controller.getState().inFlight).toBe('step'));
    expect(controller.getState().timeline.filter((entry) => entry.kind === 'transaction')).toHaveLength(1);
    expect(await host.facade.invoke('propose', { ...proposal, operationId: 'stale' })).toMatchObject({ ok: false, error: { code: 'revision_conflict' } });
    expect(await host.facade.invoke('observe', { ...credential, observationClass: 'raster' })).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
    value(await host.facade.invoke('control', { ...credential, action: 'pause' }));
    await running;
    expect(controller.getState().phase).toBe('paused');
    const current = await observation(host, credential, initial.revision + 1);
    expect(current.frames[0].duration).toBe(120);
  });

  it('ends result access and pending step work on revocation without moving to another target', async () => {
    const { host, controller, credential, context } = await approved();
    const handle = value(await host.facade.invoke('observe', { ...credential, observationClass: 'structure' }));
    const running = controller.start();
    await vi.waitFor(() => expect(controller.getState().inFlight).toBe('step'));
    value(await host.facade.invoke('control', { ...credential, action: 'revoke' }));
    await running;
    expect(await host.facade.invoke('result', { ...credential, handle: handle.handle, offset: 0, maxBytes: 49152 })).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
    expect(context.project.revision.value).toBe(0);
    expect(controller.getState().transactionsUsed).toBe(0);
  });
});
