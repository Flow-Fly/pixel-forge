import { expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { createFixtureSession } from '../../src/editor/fixture-session';
import { runGoldenAutomationJourney } from '../../src/editor/golden-automation-journey';
import type { SiteToolResult } from '../../src/editor/site-tool-contract';
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

it('loads the normal entry and controls a safe copy of the Golden asset through shipped tools and local UI', async () => {
  const fixture = createFixtureSession();
  const golden = await runGoldenAutomationJourney({ fixture });
  const source = golden.package.assetPackage.artifacts.find(
    (artifact) => artifact.role === 'source'
  )!;
  const file = new File([source.bytes.slice().buffer], source.filename, { type: source.mediaType });
  fixture.dispose();
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
  const requested = result(
    await window.pixelForgeSiteTools.invoke('request', {
      facadeVersion: '1.0',
      catalogVersion: '1.0',
      clientName: 'Deterministic Golden client',
      purpose: 'Refine the Golden animation timing',
      observationClasses: ['structure', 'palette', 'timeline', 'raster', 'render', 'save-state'],
      writeCategories: ['timeline'],
      transactionLimit: 3,
      lifetimeSeconds: 300,
    })
  );
  const credential = { requestId: requested.requestId, requestSecret: requested.requestSecret };
  await expect.poll(() => dialogRoot().querySelector('select option:nth-child(2)')).toBeTruthy();
  const target = [
    ...dialogRoot().querySelectorAll<HTMLOptionElement>('#automation-session-target option'),
  ].find((option) => option.textContent?.includes('Golden Automation Journey'))!;
  expect(target).toBeTruthy();
  select('#automation-session-target', target.value);
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
