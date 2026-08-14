import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import '../../src/components/toolbar/pf-context-bar';
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
  context.project.setSize(4, 2);
  context.palette.setColorsDirect(['#ff0000']);

  const layer = context.layers.layers.value[0];
  const frameId = context.animation.currentFrameId.value;
  const editableCanvas = context.animation.getEditableCelCanvas(layer.id, frameId);
  const cel = context.animation.cels.value.get(context.animation.getCelKey(layer.id, frameId));
  if (!cel) throw new Error('Expected an initial cel');
  if (!editableCanvas) throw new Error('Expected an editable cel canvas');
  editableCanvas.width = 4;
  editableCanvas.height = 2;
  layer.canvas = editableCanvas;
  const canvasContext = editableCanvas.getContext('2d');
  if (!canvasContext) throw new Error('Chromium did not provide a 2D canvas context');
  canvasContext.fillStyle = '#ff0000';
  canvasContext.fillRect(0, 0, 1, 1);
  cel.indexBuffer = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]);
  context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
  return { context, cel };
}

afterEach(() => {
  document.body.replaceChildren();
  restoreDefaultProjectContext();
  for (const context of contexts.splice(0)) context.dispose();
});

async function mountContextBar(context: ProjectContext) {
  setActiveProjectContext(context);
  const initiator = document.createElement('button');
  initiator.type = 'button';
  initiator.textContent = 'Transform initiator';
  document.body.append(initiator);
  initiator.focus();

  const bar = document.createElement('pf-context-bar');
  document.body.append(bar);
  await (bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
  return { bar, initiator };
}

describe('selection transform in Chromium', () => {
  it('exposes labelled controls and commits keyboard input atomically', async () => {
    const { context } = createContext();
    const { bar } = await mountContextBar(context);

    await expect.element(page.getByRole('button', { name: 'Transform selection' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Transform selection' }));
    await (bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;

    const x = page.getByRole('spinbutton', { name: 'X position' });
    const y = page.getByRole('spinbutton', { name: 'Y position' });
    const width = page.getByRole('spinbutton', { name: 'Width' });
    const height = page.getByRole('spinbutton', { name: 'Height' });
    const angle = page.getByRole('spinbutton', { name: 'Angle degrees' });
    await expect.element(x).toBeVisible();
    await expect.element(y).toBeVisible();
    await expect.element(width).toBeVisible();
    await expect.element(height).toBeVisible();
    await expect.element(angle).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Lock aspect ratio' })).toBeVisible();
    await expect.element(page.getByRole('status')).toHaveTextContent('preview active');

    const xInput = x.element() as HTMLInputElement;
    xInput.value = '1';
    xInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await (bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    expect(context.selection.state.value.type).toBe('transforming');
    await userEvent.click(page.getByRole('button', { name: 'Apply', exact: true }));
    await expect.poll(() => context.history.undoStack.value.length).toBe(1);

    expect(context.project.revision.value).toBe(1);
    const layer = context.layers.layers.value[0];
    const cel = context.animation.cels.value.get(
      context.animation.getCelKey(layer.id, context.animation.currentFrameId.value),
    );
    if (!cel) throw new Error('Expected the committed cel');
    expect([...cel.canvas.getContext('2d')!.getImageData(0, 0, 4, 2).data]).toEqual([
      0, 0, 0, 0,
      255, 0, 0, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    expect([...cel.indexBuffer!]).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('cancels through Escape without a history or revision transition', async () => {
    const { context } = createContext();
    const { bar } = await mountContextBar(context);

    await userEvent.click(page.getByRole('button', { name: 'Transform selection' }));
    await (bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    (page.getByRole('spinbutton', { name: 'X position' }).element() as HTMLInputElement).focus();
    await userEvent.keyboard('{Escape}');
    await (bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;

    expect(context.history.undoStack.value).toHaveLength(0);
    expect(context.project.revision.value).toBe(0);
    expect(context.selection.state.value.type).toBe('selected');
  });
});
