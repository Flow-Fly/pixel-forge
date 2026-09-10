import pako from 'pako';
import { expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createFixtureSession } from '../../src/editor/fixture-session';
import { runGoldenAutomationJourney } from '../../src/editor/golden-automation-journey';
import type { SiteToolResult } from '../../src/editor/site-tool-contract';
import { createProjectContext } from '../../src/stores/project-context';
import { createProjectRecoveryTarget } from '../../src/editor/creative-run-recovery-boundaries';
import { digestProjectFile } from '../../src/editor/creative-run-recovery';
import { workspaceStore } from '../../src/stores/workspace';
import { projectRepository, creativeRunRecoveryPersistence } from '../../src/services/persistence/indexed-db';
import { siteDigest } from '../../src/editor/site-tool-wire';

vi.mock('../../src/sentry', () => ({}));

function result(response: SiteToolResult) {
  expect(response.ok).toBe(true);
  if (!response.ok) throw new Error(response.error.code);
  return response.result;
}

async function readResult(credential: Record<string, unknown>, handle: Record<string, unknown>) {
  const bytes = new Uint8Array(handle.byteLength as number);
  for (let offset = 0; offset < bytes.length; offset += 49152) {
    const chunk = result(
      await window.pixelForgeSiteTools.invoke('result', {
        ...credential,
        handle: handle.handle,
        offset,
        maxBytes: 49152,
      })
    );
    const decoded = Uint8Array.from(atob(chunk.data as string), (character) =>
      character.charCodeAt(0)
    );
    expect(await siteDigest(decoded)).toBe(chunk.chunkDigest);
    bytes.set(decoded, offset);
  }
  expect(await siteDigest(bytes)).toBe(handle.digest);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function dialogRoot(): ShadowRoot {
  const app = document.querySelector('pixel-forge-app');
  const dialog = app?.shadowRoot?.querySelector('pf-automation-session-dialog');
  if (!dialog?.shadowRoot) throw new Error('The normal app approval dialog is missing.');
  return dialog.shadowRoot;
}
function select(selector: string, value: string) {
  const control = dialogRoot().querySelector<HTMLSelectElement>(selector)!;
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

async function approveLocalSession(targetName: string, mode: 'copy' | 'existing') {
  await expect.poll(() => dialogRoot().querySelector('select option:nth-child(2)')).toBeTruthy();
  const target = [
    ...dialogRoot().querySelectorAll<HTMLOptionElement>('#automation-session-target option'),
  ].find((option) => option.textContent?.includes(targetName))!;
  expect(target).toBeTruthy();
  select('#automation-session-target', target.value);
  select('#site-target-mode', mode);
  for (const checkbox of [
    ...dialogRoot().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ].reverse())
    checkbox.click();
  await userEvent.click(page.getByRole('button', { name: 'Approve selected access', exact: true }));
  await expect.poll(() => dialogRoot().textContent).toContain('Allow Artist Mode');
  for (const checkbox of dialogRoot().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    if (!checkbox.checked) checkbox.click();
  await userEvent.click(page.getByRole('button', { name: 'Approve Artist Mode', exact: true }));
  await userEvent.click(page.getByRole('button', { name: 'Close dialog', exact: true }));
  await userEvent.click(page.getByRole('button', { name: 'Approve Brief', exact: true }));
}

it('captures coherent stale-index pixels without changing live canvas, indices, palette, or history', async () => {
  const context = createProjectContext();
  const restored = createProjectContext();
  try {
    context.project.setSize(2, 1);
    context.palette.setPalette(['#ff0000']);
    const layer = context.layers.layers.value[0];
    const frameId = context.animation.currentFrameId.value;
    const key = context.animation.getCelKey(layer.id, frameId);
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 1;
    const drawing = canvas.getContext('2d')!;
    drawing.putImageData(new ImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), 2, 1), 0, 0);
    const staleIndices = new Uint8Array([0, 0]);
    context.layers.updateLayer(layer.id, { canvas, continuous: false });
    context.animation.cels.value = new Map([[key, {
      ...context.animation.cels.value.get(key)!, canvas, indexBuffer: staleIndices,
    }]]);
    const cels = context.animation.cels.value;
    const palette = context.palette.captureProjectSnapshot();
    const history = [...context.history.undoStack.value];
    const revision = context.project.revision.value;
    const changes = vi.fn();
    context.project.changeEvents.addEventListener('project-change', changes);
    const target = createProjectRecoveryTarget(context, projectRepository);
    const checkpoint = await target.captureProject();
    const repeated = await target.captureProject();
    expect(await digestProjectFile(repeated)).toBe(await digestProjectFile(checkpoint));
    expect(context.animation.cels.value).toBe(cels);
    expect(context.animation.cels.value.get(key)?.indexBuffer).toBe(staleIndices);
    expect([...staleIndices]).toEqual([0, 0]);
    expect([...drawing.getImageData(0, 0, 2, 1).data]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    expect(context.palette.captureProjectSnapshot()).toEqual(palette);
    expect(context.history.undoStack.value).toEqual(history);
    expect(context.project.revision.value).toBe(revision);
    expect(changes).not.toHaveBeenCalled();
    expect(checkpoint.frames[0].cels[0].indexData).toEqual([1, 2]);
    expect(checkpoint.palette).toEqual(['#ff0000', '#0000ff']);
    expect(checkpoint.paletteEntries?.[0]).toEqual(palette.entries[0]);
    await restored.project.loadProject(checkpoint);
    const loaded = restored.animation.cels.value.get(key)!;
    expect([...loaded.canvas.getContext('2d')!.getImageData(0, 0, 2, 1).data])
      .toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    expect([...loaded.indexBuffer!]).toEqual([1, 2]);
    expect(await createProjectRecoveryTarget(restored, projectRepository).captureProject()).toEqual(checkpoint);
  } finally {
    context.dispose();
    restored.dispose();
  }
});

async function verifyFirstRasterWrite() {
  const original = workspaceStore.activeItem.context;
  const originalId = original.project.id.value;
  const originalPixels = [...original.layers.layers.value[0].canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data];
  const requested = result(await window.pixelForgeSiteTools.invoke('request', {
    facadeVersion: '1.0', catalogVersion: '1.0',
    clientName: 'First raster regression', purpose: 'Draw one pixel on a fresh safe copy',
    observationClasses: ['structure', 'palette', 'timeline', 'raster', 'render', 'save-state'], writeCategories: ['raster'],
    transactionLimit: 2, lifetimeSeconds: 300,
  }));
  const credential = { requestId: requested.requestId, requestSecret: requested.requestSecret };
  await approveLocalSession('Untitled', 'copy');
  const observe = async (observationClass: string, input = {}) => readResult(credential, result(
    await window.pixelForgeSiteTools.invoke('observe', { ...credential, observationClass, ...input })
  ));
  const working = workspaceStore.activeItem.context;
  expect(working.project.id.value).not.toBe(originalId);
  const structure = await observe('structure');
  expect(structure.revision).toBe(0);
  const palette = await observe('palette', { expectedRevision: 0 });
  const cel = structure.frames[0].cels[0];
  const region = { x: 0, y: 0, width: 1, height: 1 };
  const source = { kind: 'layer', layerId: cel.layerId, frameId: cel.frameId, celId: cel.id };
  const raster = await observe('raster', { expectedRevision: 0, source, region });
  expect(raster.rows).toEqual(['.']);
  await userEvent.click(page.getByRole('button', { name: 'Start Run', exact: true }));
  await expect.poll(async () => result(await window.pixelForgeSiteTools.invoke('status', credential)).phase)
    .toBe('running');
  const proposal = {
    ...credential, operationId: 'first-raster-write', expectedRevision: 0,
    transaction: { profile: 'raster-patch', children: [{ command: 'project.raster.patch', input: {
      kind: 'raster.patch', layerId: cel.layerId, frameId: cel.frameId, celId: cel.id,
      region, digest: raster.digest,
      legend: [{ symbol: 'A', paletteEntryId: palette.palette.find((entry: { color: string }) => entry.color === '#df7126').id }],
      patches: [{ ...region, rows: ['A'] }],
    } }] },
  };
  const committed = await window.pixelForgeSiteTools.invoke('propose', proposal);
  expect(committed).toMatchObject({ ok: true, result: { outcome: 'committed', revision: 1 } });
  expect(await window.pixelForgeSiteTools.invoke('propose', proposal)).toEqual(committed);
  expect(working.history.undoStack.value).toHaveLength(1);
  const committedCel = working.animation.cels.value.get(working.animation.getCelKey(cel.layerId, cel.frameId))!;
  expect([...committedCel.canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data]).toEqual([223, 113, 38, 255]);
  const saved = await createProjectRecoveryTarget(working, projectRepository).captureProject();
  expect(saved.frames[0].cels[0].indexData?.[0]).toBe(saved.palette!.indexOf('#df7126') + 1);
  expect(result(await window.pixelForgeSiteTools.invoke('status', credential)).phase).toBe('running');
  const after = await observe('raster', { expectedRevision: 1, source, region });
  expect(after.legend.find((entry: { symbol: string }) => entry.symbol === after.rows[0]).color).toBe('#df7126ff');
  await userEvent.click(page.getByRole('button', { name: 'Pause', exact: true }));
  const prepared = await readResult(credential, result(await window.pixelForgeSiteTools.invoke('control', {
    ...credential, action: 'prepare-package',
  })));
  const sourceArtifact = prepared.artifacts.find((artifact: { role: string }) => artifact.role === 'source');
  const sourceBytes = Uint8Array.from(atob(sourceArtifact.bytes.data), (character) => character.charCodeAt(0));
  expect(await siteDigest(sourceBytes)).toBe(sourceArtifact.digest);
  const packaged = JSON.parse(pako.inflate(sourceBytes, { to: 'string' }));
  const ordinary = await working.project.saveProject();
  expect(ordinary.frames[0].cels[0].indexData).toBeUndefined();
  expect(committedCel.indexBuffer).toBeUndefined();
  const reopened = createProjectContext();
  try {
    for (const file of [ordinary, packaged]) {
      await reopened.project.loadProject(file);
      const reopenedCel = reopened.animation.cels.value.get(reopened.animation.getCelKey(cel.layerId, cel.frameId))!;
      expect(reopenedCel.indexBuffer).toBeUndefined();
      expect([...reopenedCel.canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data])
        .toEqual([223, 113, 38, 255]);
    }
  } finally {
    reopened.dispose();
  }
  const runId = working.history.undoStack.value[0]?.provenance?.runId;
  await userEvent.click(page.getByRole('button', { name: 'Reject Run…', exact: true }));
  await userEvent.click(page.getByRole('dialog', { name: 'Confirm reject', exact: true })
    .getByRole('button', { name: 'Reject Run', exact: true }));
  await expect.element(page.getByRole('dialog', { name: 'Confirm reject', exact: true })).not.toBeInTheDocument();
  const rejectedStatus = result(await window.pixelForgeSiteTools.invoke('status', credential));
  const record = await creativeRunRecoveryPersistence.load(runId!);
  const capturedAfterReject = await createProjectRecoveryTarget(working, projectRepository).captureProject();
  expect(capturedAfterReject).toEqual(record!.checkpoint.project);
  expect(rejectedStatus).toMatchObject({ phase: 'rejected' });
  expect(working.project.revision.value).toBe(2);
  const restoredCel = working.animation.cels.value.get(working.animation.getCelKey(cel.layerId, cel.frameId))!;
  expect([...restoredCel.canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data]).toEqual([0, 0, 0, 0]);
  expect(restoredCel.indexBuffer?.[0]).toBe(0);
  expect(original.project.id.value).toBe(originalId);
  expect([...original.layers.layers.value[0].canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data]).toEqual(originalPixels);
  const copy = (await projectRepository.list()).find((entry) => entry.name === 'Rejected Result Recovery Copy')!;
  expect(copy).toBeTruthy();
  const rejected = await projectRepository.load(copy.id);
  expect(rejected!.frames[0].cels[0].indexData?.[0]).toBe(rejected!.palette!.indexOf('#df7126') + 1);
}

it('loads the normal entry and controls a safe copy of the Golden asset through shipped tools and local UI', async () => {
  document.body.innerHTML = '<pixel-forge-app></pixel-forge-app>';
  await import('../../src/main');
  const discovery = result(
    await window.pixelForgeSiteTools.invoke('discover', {
      facade: { minVersion: '1.0', maxVersion: '1.0' },
      catalog: { minVersion: '1.0', maxVersion: '1.0' },
    })
  );
  expect(discovery.tools).toContain('propose');
  expect(['unavailable', 'unsupported', 'registered']).toContain(
    window.pixelForgeSiteTools.availability()
  );
  await expect
    .poll(() =>
      document
        .querySelector('pixel-forge-app')
        ?.shadowRoot?.querySelector('pf-automation-session-dialog')
    )
    .toBeTruthy();

  // The drop handler is installed only after saved-workspace restoration finishes.
  const startupTransfer = new DataTransfer();
  startupTransfer.items.add(new File([], 'startup.pf'));
  await expect.poll(() => {
    const drag = new DragEvent('dragover', { dataTransfer: startupTransfer, cancelable: true });
    window.dispatchEvent(drag);
    return drag.defaultPrevented;
  }).toBe(true);

  const restoredProjectId = workspaceStore.activeItem.context.project.id.value;
  await userEvent.click(page.getByRole('button', { name: 'File', exact: true }));
  await userEvent.click(page.getByText('New Project...', { exact: false }));
  await userEvent.click(page.getByRole('button', { name: 'Create', exact: true }));
  await expect.poll(() => workspaceStore.activeItem.context.project.id.value)
    .not.toBe(restoredProjectId);
  await verifyFirstRasterWrite();

  const fixture = createFixtureSession();
  const golden = await runGoldenAutomationJourney({ fixture });
  const source = golden.package.assetPackage.artifacts.find(
    (artifact) => artifact.role === 'source'
  )!;
  const file = new File([source.bytes.slice().buffer], source.filename, { type: source.mediaType });
  fixture.dispose();


  const imported = new Promise<void>((resolve) =>
    window.addEventListener('project-file-import-report', () => resolve(), { once: true })
  );
  const transfer = new DataTransfer();
  transfer.items.add(file);
  await expect
    .poll(() => {
      const drag = new DragEvent('dragover', { dataTransfer: transfer, cancelable: true });
      window.dispatchEvent(drag);
      return drag.defaultPrevented;
    })
    .toBe(true);
  window.dispatchEvent(
    new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
  );
  await Promise.race([
    imported,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Import UI did not report completion')), 10000)
    ),
  ]);
  const requestInput = {
    facadeVersion: '1.0',
    catalogVersion: '1.0',
    clientName: 'Deterministic Golden client',
    purpose: 'Refine the Golden animation timing',
    observationClasses: ['structure', 'palette', 'timeline', 'raster', 'render', 'save-state'],
    writeCategories: ['timeline'],
    transactionLimit: 3,
    lifetimeSeconds: 300,
  };
  const requested = result(await window.pixelForgeSiteTools.invoke('request', requestInput));
  const credential = { requestId: requested.requestId, requestSecret: requested.requestSecret };
  await approveLocalSession('Golden Automation Journey', 'copy');
  const handle = result(
    await window.pixelForgeSiteTools.invoke('observe', {
      ...credential,
      observationClass: 'structure',
    })
  );
  const initial = await readResult(credential, handle);
  expect(initial.frames.length).toBe(golden.finalObservation.frames.length);
  await userEvent.click(page.getByRole('button', { name: 'Start Run', exact: true }));
  await expect
    .poll(async () => result(await window.pixelForgeSiteTools.invoke('status', credential)).phase)
    .toBe('running');
  const proposal = {
    ...credential,
    operationId: 'golden-timing',
    expectedRevision: initial.revision,
    transaction: {
      profile: 'animation',
      children: [
        {
          command: 'project.animation.frame',
          input: { kind: 'frame.duration', frameId: initial.frames[0].id, duration: 150 },
        },
      ],
    },
  };
  let committed: SiteToolResult | undefined;
  await expect
    .poll(async () => {
      committed = await window.pixelForgeSiteTools.invoke('propose', proposal);
      return committed.ok;
    })
    .toBe(true);
  expect(committed).toMatchObject({
    result: { outcome: 'committed', revision: initial.revision + 1 },
  });
  expect(await window.pixelForgeSiteTools.invoke('propose', proposal)).toEqual(committed);
  await userEvent.click(page.getByRole('button', { name: 'Pause', exact: true }));
  await expect
    .poll(async () => result(await window.pixelForgeSiteTools.invoke('status', credential)).phase)
    .toBe('paused');
  const edited = await readResult(
    credential,
    result(
      await window.pixelForgeSiteTools.invoke('observe', {
        ...credential,
        observationClass: 'structure',
        expectedRevision: initial.revision + 1,
      })
    )
  );
  expect(edited.frames[0].duration).toBe(150);
  const packageHandle = result(
    await window.pixelForgeSiteTools.invoke('control', { ...credential, action: 'prepare-package' })
  );
  const prepared = await readResult(credential, packageHandle);
  for (const artifact of prepared.artifacts) {
    const bytes = Uint8Array.from(atob(artifact.bytes.data), (character) =>
      character.charCodeAt(0)
    );
    expect(bytes.byteLength).toBe(artifact.byteLength);
    expect(artifact.bytes.byteLength).toBe(artifact.byteLength);
    expect(await siteDigest(bytes)).toBe(artifact.digest);
    expect(artifact.bytes.digest).toBe(artifact.digest);
  }
  expect(prepared.artifacts.map((artifact: { role: string }) => artifact.role)).toEqual(
    expect.arrayContaining(['source', 'manifest'])
  );
  await expect
    .element(page.getByRole('button', { name: 'Accept / Prepare Package', exact: true }))
    .toBeEnabled();
  result(await window.pixelForgeSiteTools.invoke('control', { ...credential, action: 'revoke' }));
  expect(
    await window.pixelForgeSiteTools.invoke('propose', {
      ...proposal,
      operationId: 'late-golden-timing',
      expectedRevision: initial.revision + 1,
    })
  ).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
  expect(
    await window.pixelForgeSiteTools.invoke('result', {
      ...credential,
      handle: packageHandle.handle,
      offset: 0,
      maxBytes: 49152,
    })
  ).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
  document.dispatchEvent(new Event('freeze'));
  expect(window.pixelForgeSiteTools.availability()).toBe('suspended');
  await expect
    .element(page.getByText('Ask the external agent to request a new session.', { exact: false }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Resume with New Session…', exact: true }))
    .not.toBeInTheDocument();
  await userEvent.click(page.getByRole('button', { name: 'Create Recovery Copy', exact: true }));
  await expect
    .element(page.getByRole('button', { name: 'Open Recovery Copy', exact: true }))
    .toBeEnabled();

  document.dispatchEvent(new Event('resume'));
  const renewed = result(await window.pixelForgeSiteTools.invoke('request', requestInput));
  const nextCredential = { requestId: renewed.requestId, requestSecret: renewed.requestSecret };
  await approveLocalSession('Copy of Golden Automation Journey', 'existing');
  const fresh = await readResult(
    nextCredential,
    result(
      await window.pixelForgeSiteTools.invoke('observe', {
        ...nextCredential,
        observationClass: 'structure',
      })
    )
  );
  expect(fresh.revision).toBe(initial.revision + 1);
  expect(fresh.frames[0].duration).toBe(150);
  await userEvent.click(page.getByRole('button', { name: 'Start Run', exact: true }));
  const continuation = {
    ...nextCredential,
    operationId: 'new-session-timing',
    expectedRevision: fresh.revision,
    transaction: {
      profile: 'animation',
      children: [
        {
          command: 'project.animation.frame',
          input: { kind: 'frame.duration', frameId: fresh.frames[0].id, duration: 180 },
        },
      ],
    },
  };
  await expect
    .poll(async () => {
      const response = await window.pixelForgeSiteTools.invoke('propose', continuation);
      return response.ok && response.result.outcome;
    })
    .toBe('committed');
  await userEvent.click(page.getByRole('button', { name: 'Pause', exact: true }));
  const continued = await readResult(
    nextCredential,
    result(
      await window.pixelForgeSiteTools.invoke('observe', {
        ...nextCredential,
        observationClass: 'structure',
        expectedRevision: fresh.revision + 1,
      })
    )
  );
  expect(continued.frames[0].duration).toBe(180);
  expect(
    await window.pixelForgeSiteTools.invoke('propose', {
      ...continuation,
      ...credential,
      operationId: 'old-request-after-renewal',
    })
  ).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
  expect(
    await window.pixelForgeSiteTools.invoke('result', {
      ...credential,
      handle: packageHandle.handle,
      offset: 0,
      maxBytes: 49152,
    })
  ).toMatchObject({ ok: false, error: { code: 'capability_denied' } });
  document.dispatchEvent(new Event('freeze'));
}, 60_000);

const native = (
  document as Document & {
    modelContext?: {
      getTools?: () => Promise<Array<{ name: string }>>;
      executeTool?: (
        tool: unknown,
        input: string,
        options: { signal: AbortSignal }
      ) => Promise<string>;
    };
  }
).modelContext;
it.skipIf(!native?.getTools || !native?.executeTool)(
  'reports native invocation compatibility when WebMCP is available (otherwise explicitly skipped)',
  async () => {
    document.dispatchEvent(new Event('resume'));
    const tools = await native!.getTools!();
    const tool = tools.find((entry) => entry.name === 'pixel_forge_discover');
    expect(tool).toBeTruthy();
    const result = JSON.parse(
      await native!.executeTool!(
        tool,
        JSON.stringify({
          facade: { minVersion: '1.0', maxVersion: '1.0' },
          catalog: { minVersion: '1.0', maxVersion: '1.0' },
        }),
        { signal: new AbortController().signal }
      )
    );
    if (result.ok) expect(result.result.type).toBe('site.discovery');
    else {
      expect(result.error.code).toBe('unsupported');
      expect(window.pixelForgeSiteTools.availability()).toBe('unsupported');
    }
  }
);
