import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import '../../src/components/dialogs/pf-resize-dialog';
import type { PFResizeDialog } from '../../src/components/dialogs/pf-resize-dialog';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';

const contexts: ProjectContext[] = [];

function createContext() {
  const context = createProjectContext();
  contexts.push(context);
  context.project.setSize(4, 4);
  const layer = context.layers.layers.value[0];
  const frameId = context.animation.currentFrameId.value;
  const cel = context.animation.cels.value.get(
    context.animation.getCelKey(layer.id, frameId)
  );
  if (!cel) throw new Error('Expected an initial cel');
  cel.canvas.width = 4;
  cel.canvas.height = 4;
  layer.canvas = cel.canvas;
  const canvasContext = cel.canvas.getContext('2d');
  if (!canvasContext) throw new Error('Chromium did not provide a 2D canvas context');
  canvasContext.fillStyle = '#ff0000';
  canvasContext.fillRect(3, 3, 1, 1);
  return context;
}

describe('Canvas Size dialog in Chromium', () => {
  afterEach(() => {
    document.body.replaceChildren();
    restoreDefaultProjectContext();
    for (const context of contexts.splice(0)) context.dispose();
  });

  it('shows crop confirmation and completes through labelled keyboard controls', async () => {
    const context = createContext();
    setActiveProjectContext(context);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.textContent = 'Open resize';
    document.body.append(trigger);
    trigger.focus();

    const element = document.createElement('pf-resize-dialog') as PFResizeDialog;
    element.open = true;
    document.body.append(element);
    await element.updateComplete;

    const width = page.getByRole('spinbutton', { name: 'Width (px)' });
    const height = page.getByRole('spinbutton', { name: 'Height (px)' });
    await expect.element(width).toBeVisible();
    await expect.element(height).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Resize', exact: true })).toBeVisible();

    const setInput = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    };
    setInput(width.element() as HTMLInputElement, '2');
    setInput(height.element() as HTMLInputElement, '2');
    await element.updateComplete;

    await userEvent.click(page.getByRole('button', { name: 'Resize', exact: true }));
    await expect.element(page.getByRole('status')).toHaveTextContent('discard');
    await expect.element(page.getByRole('button', { name: 'Confirm Crop' })).toBeVisible();

    await userEvent.keyboard('{Enter}');
    await expect.poll(() => element.open).toBe(false);
    expect(context.project.width.value).toBe(2);
    expect(context.project.height.value).toBe(2);
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps a tab switch from retargeting an open dialog', async () => {
    const source = createContext();
    const other = createContext();
    setActiveProjectContext(source);
    const element = document.createElement('pf-resize-dialog') as PFResizeDialog;
    element.open = true;
    document.body.append(element);
    await element.updateComplete;

    setActiveProjectContext(other);
    const width = page.getByRole('spinbutton', { name: 'Width (px)' });
    const setInput = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    };
    setInput(width.element() as HTMLInputElement, '6');
    await userEvent.click(page.getByRole('button', { name: 'Resize', exact: true }));
    await expect.poll(() => element.open).toBe(false);
    expect(source.project.width.value).toBe(6);
    expect(other.project.width.value).toBe(4);
  });

  it('announces a stale revision and closes with Escape without mutation', async () => {
    const context = createContext();
    setActiveProjectContext(context);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.textContent = 'Open resize';
    document.body.append(trigger);
    trigger.focus();

    const element = document.createElement('pf-resize-dialog') as PFResizeDialog;
    element.open = true;
    document.body.append(element);
    await element.updateComplete;

    context.project.commitChange('external-edit', ['raster-content']);
    await userEvent.click(page.getByRole('button', { name: 'Resize', exact: true }));
    await expect.element(page.getByRole('alert')).toHaveTextContent('changed while the resize was open');
    expect(element.open).toBe(true);
    expect(context.project.width.value).toBe(4);

    await userEvent.keyboard('{Escape}');
    await expect.poll(() => element.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});
