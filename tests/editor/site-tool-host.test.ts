import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteToolTransport, type SiteWebMcp } from '../../src/editor/site-tool-transport';
import type { SiteToolFacade } from '../../src/editor/site-tool-host';
import { SiteToolHost } from '../../src/editor/site-tool-host';
import { AutomationSessionManager } from '../../src/editor/automation-session';
import { workspaceStore } from '../../src/stores/workspace';
import { createProjectContext } from '../../src/stores/project-context';
import { creativeRunRecoveryPersistence } from '../../src/services/persistence/indexed-db';
import { autoSaveService } from '../../src/services/auto-save';
import type { CreativeRunController } from '../../src/editor/creative-run';
import { ANIMATION_FRAME_COMMAND_ID } from '../../src/editor/catalog';
import type { SiteToolResult } from '../../src/editor/site-tool-contract';

const input = {
  facadeVersion: '1.0',
  catalogVersion: '1.0',
  clientName: 'Self declared',
  purpose: 'Make an animation',
  observationClasses: ['structure', 'save-state'],
  writeCategories: ['timeline'],
  transactionLimit: 3,
  lifetimeSeconds: 300,
};
const hosts: SiteToolHost[] = [];
const managers: AutomationSessionManager[] = [];
const contexts: ReturnType<typeof createProjectContext>[] = [];
function value(result: SiteToolResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.code);
  return result.result;
}

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  localStorage.removeItem('pixel-forge.site-content-egress.v1');
});
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

async function setup(kind: 'fallback' | 'webmcp') {
  const context = createProjectContext();
  contexts.push(context);
  context.project.name.value = 'Never disclose before approval';
  const manager = new AutomationSessionManager({
    targets: () => [{ id: context.project.id.value, name: context.project.name.value, context }],
  });
  managers.push(manager);
  expect(workspaceStore.addContext(context, { activate: false }).ok).toBe(true);
  let controller: CreativeRunController | undefined;
  const host = new SiteToolHost(manager, (created) => {
    controller = created;
  });
  hosts.push(host);
  const transport = new SiteToolTransport(host.facade);
  const registered = new Map<string, Parameters<SiteWebMcp['registerTool']>[0]>();
  const api: SiteWebMcp = {
    registerTool: async (tool) => {
      registered.set(tool.name, tool);
    },
  };
  if (kind === 'webmcp') expect(await transport.register(api)).toBe('registered');
  const client: SiteToolFacade =
    kind === 'fallback'
      ? transport.fallback
      : {
          invoke: async (name, input, signal = new AbortController().signal) =>
            JSON.parse(await registered.get(`pixel_forge_${name}`)!.execute(input, { signal })),
        };
  return { host, client, transport, manager, context, controller: () => controller! };
}
async function requested(client: SiteToolFacade, request = input) {
  const result = value(await client.invoke('request', request));
  return { requestId: result.requestId, requestSecret: result.requestSecret };
}
async function approved(kind: 'fallback' | 'webmcp') {
  const setupResult = await setup(kind);
  const credential = await requested(setupResult.client);
  expect(
    await setupResult.host.approve(
      credential.requestId as string,
      setupResult.context.project.id.value,
      ['structure', 'save-state'],
      'existing'
    )
  ).toBe(true);
  const request = setupResult.manager.listPendingArtistModeRequests()[0];
  expect(setupResult.manager.approveArtistMode(request.requestId, ['timeline'], 3).ok).toBe(true);
  const controller = setupResult.controller();
  const brief = controller.getState().brief;
  expect(
    controller.approveBrief({
      briefRevision: brief.revision,
      targetId: brief.targetId,
      requestedWriteCategories: brief.requestedWriteCategories,
      transactionLimit: brief.transactionLimit,
      durationSeconds: brief.durationSeconds,
      contentEgress: brief.contentEgress,
    }).ok
  ).toBe(true);
  return { ...setupResult, credential, controller, latestController: setupResult.controller };
}
async function observation(
  client: SiteToolFacade,
  credential: Record<string, unknown>,
  expectedRevision?: number
) {
  const handle = value(
    await client.invoke('observe', {
      ...credential,
      observationClass: 'structure',
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    })
  );
  const chunk = value(
    await client.invoke('result', {
      ...credential,
      handle: handle.handle,
      offset: 0,
      maxBytes: 49152,
    })
  );
  return JSON.parse(atob(chunk.data as string));
}

describe.each(['fallback', 'webmcp'] as const)('%s public site conformance', (kind) => {
  it('reveals no project data before approval and cannot exchange credentials with an equal caller name', async () => {
    const { host, client } = await setup(kind);
    const first = await requested(client);
    const second = await requested(client, {
      ...input,
      purpose: 'Another purpose',
      lifetimeSeconds: 299,
    });
    const pending = await client.invoke('status', first);
    expect(value(pending)).toEqual({ type: 'session.status', status: 'pending' });
    expect(JSON.stringify(pending)).not.toContain('Never disclose');
    expect(
      await client.invoke('status', {
        requestId: first.requestId,
        requestSecret: second.requestSecret,
      })
    ).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
    expect(
      await client.invoke('observe', { ...first, observationClass: 'structure' })
    ).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
    expect(Object.keys(host.facade)).toEqual(['invoke']);
  });

  it('routes one observed proposal through the real run and refuses replay, stale revisions and ungranted content', async () => {
    const { client, controller, credential } = await approved(kind);
    const initial = await observation(client, credential);
    const otherTarget = createProjectContext();
    contexts.push(otherTarget);
    expect(workspaceStore.addContext(otherTarget, { activate: true }).ok).toBe(true);
    const running = controller.start();
    await vi.waitFor(() => expect(controller.getState().inFlight).toBe('step'));
    const proposal = {
      ...credential,
      operationId: 'one-animation-frame',
      expectedRevision: initial.revision,
      transaction: {
        profile: 'animation',
        children: [
          {
            command: ANIMATION_FRAME_COMMAND_ID,
            input: { kind: 'frame.duration', frameId: initial.frames[0].id, duration: 120 },
          },
        ],
      },
    };
    const committed = await client.invoke('propose', proposal);
    expect(value(committed).code).toBeUndefined();
    expect(committed).toMatchObject({
      ok: true,
      result: { outcome: 'committed', revision: initial.revision + 1 },
    });
    expect(await client.invoke('propose', proposal)).toEqual(committed);
    await vi.waitFor(() => expect(controller.getState().transactionsUsed).toBe(1));
    await vi.waitFor(() => expect(controller.getState().inFlight).toBe('step'));
    expect(
      controller.getState().timeline.filter((entry) => entry.kind === 'transaction')
    ).toHaveLength(1);
    expect(await client.invoke('propose', { ...proposal, operationId: 'stale' })).toMatchObject({
      ok: false,
      error: { code: 'revision_conflict' },
    });
    expect(
      await client.invoke('observe', { ...credential, observationClass: 'raster' })
    ).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
    value(await client.invoke('control', { ...credential, action: 'pause' }));
    await running;
    expect(controller.getState().phase).toBe('paused');
    const current = await observation(client, credential, initial.revision + 1);
    expect(current.frames[0].duration).toBe(120);
    expect(otherTarget.project.revision.value).toBe(0);
  });

  it('ends result access and pending step work on revocation without moving to another target', async () => {
    const { client, controller, credential, context } = await approved(kind);
    const handle = value(
      await client.invoke('observe', { ...credential, observationClass: 'structure' })
    );
    const running = controller.start();
    await vi.waitFor(() => expect(controller.getState().inFlight).toBe('step'));
    value(await client.invoke('control', { ...credential, action: 'revoke' }));
    await running;
    expect(
      await client.invoke('result', {
        ...credential,
        handle: handle.handle,
        offset: 0,
        maxBytes: 49152,
      })
    ).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
    expect(context.project.revision.value).toBe(0);
    expect(controller.getState().transactionsUsed).toBe(0);
  });
  it('refuses expired handles and withholds chunks when the local audit record cannot be saved', async () => {
    const { client, credential } = await approved(kind);
    const handle = value(
      await client.invoke('observe', { ...credential, observationClass: 'structure' })
    );
    const chunk = { ...credential, handle: handle.handle, offset: 0, maxBytes: 49152 };
    localStorage.setItem('pixel-forge.site-content-egress.v1', 'unreadable');
    expect(await client.invoke('result', chunk)).toMatchObject({ ok: false });
    localStorage.removeItem('pixel-forge.site-content-egress.v1');
    expect(value(await client.invoke('result', chunk)).type).toBe('result.chunk');
    const later = Date.now() + 60_001;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    expect(await client.invoke('result', chunk)).toMatchObject({
      ok: false,
      error: { code: 'capability_denied' },
    });
  });

  it('cancels a delayed checkpoint proposal and cannot replay it after ordinary resume', async () => {
    const { client, controller, credential } = await approved(kind);
    const initial = await observation(client, credential);
    const running = controller.start();
    await vi.waitFor(() => expect(controller.getState().inFlight).toBe('step'));
    let checkpointStarted = false;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = creativeRunRecoveryPersistence.save.bind(creativeRunRecoveryPersistence);
    vi.spyOn(creativeRunRecoveryPersistence, 'save').mockImplementationOnce(async (record) => {
      await save(record);
      checkpointStarted = true;
      await held;
    });
    const cancellation = new AbortController();
    const proposal = {
      ...credential,
      operationId: 'cancelled-checkpoint',
      expectedRevision: initial.revision,
      transaction: {
        profile: 'animation',
        children: [
          {
            command: ANIMATION_FRAME_COMMAND_ID,
            input: { kind: 'frame.duration', frameId: initial.frames[0].id, duration: 150 },
          },
        ],
      },
    };
    const pending = client.invoke('propose', proposal, cancellation.signal);
    await vi.waitFor(() => expect(checkpointStarted).toBe(true));
    cancellation.abort();
    expect(await pending).toMatchObject({ ok: true, result: { outcome: 'cancelled' } });
    release();
    await running;
    expect(controller.getState().phase).toBe('paused');
    expect(controller.getState().transactionsUsed).toBe(0);
    const resumed = controller.resume();
    await vi.waitFor(() => expect(controller.getState().inFlight).toBe('step'));
    expect(await client.invoke('propose', proposal)).toMatchObject({
      ok: true,
      result: { outcome: 'cancelled' },
    });
    controller.pause();
    await resumed;
    expect((await observation(client, credential, initial.revision)).frames[0].duration).toBe(
      initial.frames[0].duration
    );
  });
});

it('keeps local recovery usable and continues only through a newly approved ordinary request', async () => {
  const { client, host, manager, context, controller, credential, latestController } =
    await approved('fallback');
  const initial = await observation(client, credential);
  const running = controller.start();
  await vi.waitFor(() => expect(controller.getState().inFlight).toBe('step'));
  const transaction = {
    profile: 'animation',
    children: [
      {
        command: ANIMATION_FRAME_COMMAND_ID,
        input: { kind: 'frame.duration', frameId: initial.frames[0].id, duration: 150 },
      },
    ],
  };
  expect(
    await client.invoke('propose', {
      ...credential,
      operationId: 'before-hide',
      expectedRevision: initial.revision,
      transaction,
    })
  ).toMatchObject({ ok: true, result: { outcome: 'committed' } });
  host.endAuthority();
  await running;
  await vi.waitFor(() => expect(controller.getState().recovery?.interrupted).toBe(true));
  expect(controller.supportsSessionReplacement).toBe(false);
  expect(await controller.createRecoveryCopy()).toMatchObject({ ok: true });
  expect(controller.getState().recovery?.recoveryCopyId).toEqual(expect.any(String));

  const nextCredential = await requested(client);
  expect(
    await host.approve(
      nextCredential.requestId as string,
      context.project.id.value,
      ['structure', 'save-state'],
      'existing'
    )
  ).toBe(true);
  const pending = manager.listPendingArtistModeRequests()[0];
  expect(manager.approveArtistMode(pending.requestId, ['timeline'], 3).ok).toBe(true);
  const next = latestController();
  expect(next.getState().sessionId).not.toBe(controller.getState().sessionId);
  expect(next.getState().runId).not.toBe(controller.getState().runId);
  const brief = next.getState().brief;
  expect(
    next.approveBrief({
      briefRevision: brief.revision,
      targetId: brief.targetId,
      requestedWriteCategories: brief.requestedWriteCategories,
      transactionLimit: brief.transactionLimit,
      durationSeconds: brief.durationSeconds,
      contentEgress: brief.contentEgress,
    }).ok
  ).toBe(true);
  const continuing = next.start();
  await vi.waitFor(() => expect(next.getState().inFlight).toBe('step'));
  const proposal = {
    ...nextCredential,
    operationId: 'after-new-consent',
    expectedRevision: initial.revision + 1,
    transaction,
  };
  expect(await client.invoke('propose', proposal)).toMatchObject({
    ok: false,
    error: { code: 'revision_conflict' },
  });
  const fresh = await observation(client, nextCredential);
  expect(fresh.revision).toBe(initial.revision + 1);
  const updated = {
    ...proposal,
    transaction: {
      profile: 'animation',
      children: [
        {
          command: ANIMATION_FRAME_COMMAND_ID,
          input: { kind: 'frame.duration', frameId: fresh.frames[0].id, duration: 170 },
        },
      ],
    },
  };
  expect(await client.invoke('propose', updated)).toMatchObject({
    ok: true,
    result: { outcome: 'committed', revision: initial.revision + 2 },
  });
  expect(
    await client.invoke('propose', { ...updated, ...credential, operationId: 'old-caller' })
  ).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
  expect(
    await client.invoke('observe', {
      ...credential,
      observationClass: 'structure',
      expectedRevision: initial.revision + 2,
    })
  ).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
  next.pause();
  await continuing;
});

it('refuses resume while a paused run prepares its package', async () => {
  const { client, controller, credential } = await approved('fallback');
  await observation(client, credential);
  const running = controller.start();
  await vi.waitFor(() => expect(controller.getState().inFlight).toBe('step'));
  controller.pause();
  await running;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const saveStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const save = autoSaveService.saveNow.bind(autoSaveService);
  vi.spyOn(autoSaveService, 'saveNow').mockImplementationOnce(async (context) => {
    started();
    await held;
    await save(context);
  });
  const preparing = controller.preparePackageForReview();
  await saveStarted;
  const resumed = await controller.resume();
  release();
  await preparing;
  expect(resumed).toMatchObject({ ok: false, error: { code: 'in_flight' } });
  expect(controller.getState().phase).toBe('paused');
});
