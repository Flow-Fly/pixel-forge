import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
  AutomationSessionManager,
  type AutomationLocalTarget,
} from '../../src/editor/automation-session';
import { createFixtureSession, type FixtureSession } from '../../src/editor/fixture-session';
import { autoSaveService } from '../../src/services/auto-save';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';
import '../../src/components/dialogs/pf-automation-session-dialog';
import type { PFAutomationSessionDialog } from '../../src/components/dialogs/pf-automation-session-dialog';

const contexts: ProjectContext[] = [];
const managers: AutomationSessionManager[] = [];
const fixtures: FixtureSession[] = [];

afterEach(() => {
  document.body.replaceChildren();
  restoreDefaultProjectContext();
  for (const manager of managers.splice(0)) manager.dispose();
  for (const fixture of fixtures.splice(0)) fixture.dispose();
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

function createManager(targets: readonly AutomationLocalTarget[]): AutomationSessionManager {
  let requestNumber = 0;
  let sessionNumber = 0;
  const manager = new AutomationSessionManager({
    targets: () => targets,
    isPageVisible: () => true,
    requestIdFactory: () => `browser-request-${++requestNumber}`,
    sessionIdFactory: () => `browser-session-${++sessionNumber}`,
  });
  managers.push(manager);
  return manager;
}

function requestSession(manager: AutomationSessionManager) {
  return manager.requestSession({
    client: { name: 'Chromium Inspector', identity: 'self-declared' },
    compatibility: { minVersion: '1.0', maxVersion: '1.0' },
    observationClasses: ['structure', 'raster'],
    lifetimeSeconds: 30,
  });
}

async function mountDialog(manager: AutomationSessionManager): Promise<PFAutomationSessionDialog> {
  const element = document.createElement(
    'pf-automation-session-dialog'
  ) as PFAutomationSessionDialog;
  element.controller = manager;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

describe('Automation Session approval dialog in Chromium', () => {
  it('shows a semantic local approval surface with no hidden target or class defaults', async () => {
    const target = createTarget('browser-private-project', 'Private browser project');
    const manager = createManager([target]);
    const request = requestSession(manager);
    if (!request.ok) throw new Error('Expected a pending session request.');

    expect(JSON.stringify(request)).not.toContain('browser-private-project');
    expect(JSON.stringify(request)).not.toContain('Private browser project');

    const element = await mountDialog(manager);
    await expect.element(page.getByRole('dialog')).toBeVisible();
    await expect.element(page.getByText('Chromium Inspector')).toBeVisible();
    await expect.element(page.getByText('self-declared')).toBeVisible();
    await expect
      .element(page.getByRole('combobox', { name: 'Choose one project for this session' }))
      .toBeVisible();
    await expect.element(page.getByRole('checkbox', { name: 'Project structure' })).toBeVisible();
    await expect.element(page.getByRole('checkbox', { name: 'Exact raster grid' })).toBeVisible();
    await expect
      .element(page.getByRole('button', { name: 'Approve selected access' }))
      .toBeDisabled();

    const dialog = element.shadowRoot?.querySelector('pf-dialog');
    const surface = dialog?.shadowRoot?.querySelector('[role="dialog"]');
    expect(surface?.getAttribute('aria-modal')).toBe('true');

    const targetSelect = page
      .getByRole('combobox', { name: 'Choose one project for this session' })
      .element() as HTMLSelectElement;
    expect(targetSelect.querySelector(`option[value="${target.id}"]`)?.textContent).toBe(
      target.name
    );
    targetSelect.value = target.id;
    targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await userEvent.click(page.getByRole('checkbox', { name: 'Project structure' }));
    await expect
      .element(page.getByRole('button', { name: 'Approve selected access' }))
      .toBeEnabled();

    await userEvent.click(page.getByRole('button', { name: 'Approve selected access' }));
    await expect.poll(() => manager.listPendingRequests()).toHaveLength(0);
    await expect.poll(() => element.open).toBe(true);
    await expect.element(page.getByText('Active local sessions')).toBeVisible();
    await expect
      .element(page.getByText('Chromium Inspector · Private browser project'))
      .toBeVisible();
    await expect.element(page.getByText('Status: active')).toBeVisible();

    await userEvent.click(page.getByRole('button', { name: 'Close', exact: true }));
    await expect.poll(() => element.open).toBe(false);
    window.dispatchEvent(new CustomEvent('show-automation-session-dialog'));
    await expect.poll(() => element.open).toBe(true);
    await expect.element(page.getByText('Active local sessions')).toBeVisible();

    await userEvent.click(page.getByRole('button', { name: 'Revoke Chromium Inspector session' }));
    await expect.element(page.getByText('Status: revoked')).toBeVisible();

    const grant = await manager.observe('browser-session-1', 'structure', { expectedRevision: 0 });
    expect(grant).toMatchObject({
      ok: false,
      error: { code: 'capability_denied', details: { reason: 'session_revoked' } },
    });
  });

  it('keeps focus in the semantic dialog and denies on Escape without creating authority', async () => {
    const target = createTarget('escape-project', 'Escape project');
    const manager = createManager([target]);
    const request = requestSession(manager);
    if (!request.ok) throw new Error('Expected a pending session request.');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.textContent = 'Open approval';
    document.body.prepend(trigger);
    trigger.focus();

    const element = await mountDialog(manager);
    const dialog = element.shadowRoot?.querySelector('pf-dialog');
    await expect.poll(() => dialog?.shadowRoot?.activeElement).not.toBeNull();
    expect(dialog?.shadowRoot?.activeElement?.tagName).toBe('BUTTON');

    await userEvent.keyboard('{Escape}');
    await expect.poll(() => element.open).toBe(false);
    expect(manager.listPendingRequests()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);
    expect(
      await manager.observe('browser-session-1', 'structure', { expectedRevision: 0 })
    ).toMatchObject({
      ok: false,
      error: { code: 'capability_denied', details: { reason: 'session_missing' } },
    });
  });

  it('keeps separately granted target-free observations across every inspect class', async () => {
    const fixture = createFixtureSession();
    fixtures.push(fixture);
    await fixture.runAnimationObservation();
    const context = fixture.projectContext;
    const target: AutomationLocalTarget = {
      id: fixture.target.projectId,
      name: 'Animation project',
      context,
    };
    const manager = createManager([target]);
    const request = manager.requestSession({
      client: { name: 'Observation client', identity: 'self-declared' },
      compatibility: { minVersion: '1.0', maxVersion: '1.0' },
      observationClasses: ['structure', 'palette', 'save-state', 'raster', 'render', 'timeline'],
      lifetimeSeconds: 60,
    });
    if (!request.ok) throw new Error('Expected a pending session request.');
    manager.captureLocalTargets(request.result.requestId);
    const grant = manager.approveRequest(
      request.result.requestId,
      target.id,
      request.result.observationClasses
    );
    if (!grant.ok) throw new Error('Expected a grant.');
    const expectedRevision = context.project.revision.value;
    const frame = context.animation.frames.value[0];
    const layer = context.layers.layers.value.find((candidate) => candidate.type === 'image');
    if (!frame || !layer) throw new Error('Animation fixture had no drawable frame.');
    const cel = context.animation.cels.value.get(context.animation.getCelKey(layer.id, frame.id));
    if (!cel) throw new Error('Animation fixture had no drawable cel.');
    const source = { kind: 'composite' as const, frameId: frame.id };

    const structure = await manager.observe(grant.result.sessionId, 'structure', {
      expectedRevision,
    });
    expect(JSON.stringify(structure)).not.toContain('"target"');
    expect(structure).toMatchObject({
      ok: true,
      result: {
        type: 'project.structure.observation',
      },
    });
    const saveState = await manager.observe(grant.result.sessionId, 'save-state', {
      expectedRevision,
    });
    expect(JSON.stringify(saveState)).not.toContain('"target"');
    expect(saveState).toMatchObject({
      ok: true,
      result: {
        type: 'project.save-state.observation',
      },
    });
    const raster = await manager.observe(grant.result.sessionId, 'raster', {
      expectedRevision,
      source: { kind: 'layer' as const, layerId: layer.id, frameId: frame.id, celId: cel.id },
      region: { x: 0, y: 0, width: 4, height: 4 },
    });
    expect(JSON.stringify(raster)).not.toContain('"target"');
    expect(raster).toMatchObject({
      ok: true,
      result: {
        type: 'project.raster.observation',
      },
    });
    const render = await manager.observe(grant.result.sessionId, 'render', {
      expectedRevision,
      source,
      background: { kind: 'transparent' as const },
      scale: 1,
      expectedDigest: null,
    });
    expect(JSON.stringify(render)).not.toContain('"target"');
    expect(render).toMatchObject({
      ok: true,
      result: { type: 'render.observation' },
    });
    const palette = await manager.observe(grant.result.sessionId, 'palette', {
      expectedRevision,
    });
    expect(JSON.stringify(palette)).not.toContain('"target"');
    expect(palette).toMatchObject({
      ok: true,
      result: { type: 'project.palette.observation' },
    });

    const timeline = await manager.observe(grant.result.sessionId, 'timeline', {
      expectedRevision,
    });
    expect(JSON.stringify(timeline)).not.toContain('"target"');
    expect(timeline).toMatchObject({
      ok: true,
      result: { type: 'project.timeline.observation' },
    });

    const animation = await manager.requestObservation({
      sessionId: grant.result.sessionId,
      operation: 'project.animation.observe',
      observationClass: 'timeline',
      expectedRevision,
      range: 'all',
      background: { kind: 'transparent' },
      scale: 1,
      keyframes: context.animation.frames.value.slice(0, 2).map((candidate) => candidate.id),
      expectedDigest: null,
    });
    expect(JSON.stringify(animation)).not.toContain('"target"');
    expect(animation).toMatchObject({
      ok: true,
      result: {
        type: 'animation.evaluation.bundle',
      },
    });
  });
});
