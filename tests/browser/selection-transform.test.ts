import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import '../../src/components/toolbar/pf-context-bar';
import '../../src/components/canvas/pf-canvas-viewport';
import { MarqueeRectTool } from '../../src/tools/selection/marquee-rect-tool';
import { beginSelectionTransform } from '../../src/services/selection-transform-commit';
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
    expect(context.history.undoStack.value).toHaveLength(0);
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

  it('focuses the first transform control and binds every numeric label', async () => {
    const { context } = createContext();
    const { bar } = await mountContextBar(context);

    await userEvent.click(page.getByRole('button', { name: 'Transform selection' }));
    await (bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;

    const root = (bar as HTMLElement).shadowRoot;
    expect(root?.activeElement?.id).toBe('transform-x');
    expect(root?.querySelector('label[for="transform-width"]')).not.toBeNull();
    expect(root?.querySelector('label[for="transform-height"]')).not.toBeNull();
    expect(root?.querySelector('label[for="transform-angle"]')).not.toBeNull();
  });

  it('keeps resize, rotate, aspect-lock, and one change event on Apply', async () => {
    const { context } = createContext();
    const { bar } = await mountContextBar(context);
    let changeEvents = 0;
    context.project.changeEvents.addEventListener('project-change', () => {
      changeEvents += 1;
    });

    await userEvent.click(page.getByRole('button', { name: 'Transform selection' }));
    await (bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;

    const width = page.getByRole('spinbutton', { name: 'Width' }).element() as HTMLInputElement;
    width.value = '2';
    width.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await (bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    expect(context.selection.scale).toEqual({ x: 2, y: 2 });

    await userEvent.click(page.getByRole('button', { name: 'Lock aspect ratio' }));
    await expect.element(page.getByRole('button', { name: 'Unlock aspect ratio' })).toBeVisible();
    const height = page.getByRole('spinbutton', { name: 'Height' }).element() as HTMLInputElement;
    height.value = '1';
    height.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    const angle = page.getByRole('spinbutton', { name: 'Angle degrees' }).element() as HTMLInputElement;
    angle.value = '90';
    angle.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await (bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    expect(context.selection.scale).toEqual({ x: 2, y: 1 });
    expect(context.selection.rotation).toBe(90);

    await userEvent.click(page.getByRole('button', { name: 'Apply', exact: true }));
    await expect.poll(() => context.history.undoStack.value.length).toBe(1);
    expect(changeEvents).toBe(1);
    expect(context.project.revision.value).toBe(1);
  });

  it('keeps the BaseSelectionTool pointer preview session-only before one Apply', async () => {
    const { context } = createContext();
    setActiveProjectContext(context);
    const viewport = document.createElement('pf-canvas-viewport');
    document.body.append(viewport);
    await (viewport as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    const tool = new MarqueeRectTool();
    tool.setProjectContext(context);

    const beforeRevision = context.project.revision.value;
    context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    tool.onDown(0, 0, { shift: false, ctrl: false, alt: false, button: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(context.history.undoStack.value).toHaveLength(0);
    expect(context.project.revision.value).toBe(beforeRevision);

    if (context.selection.state.value.type === 'floating') {
      expect(beginSelectionTransform(context)).toMatchObject({ ok: true });
    }
    context.selection.moveTransform(1, 0);
    window.dispatchEvent(new CustomEvent('commit-transform', { detail: { context } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(context.history.undoStack.value).toHaveLength(1);
    expect(context.project.revision.value).toBe(beforeRevision + 1);
  });

  it('commits only the initiating context through the real viewport listener', async () => {
    const first = createContext();
    const second = createContext();
    setActiveProjectContext(first.context);
    const firstViewport = document.createElement('pf-canvas-viewport');
    document.body.append(firstViewport);
    await (firstViewport as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;

    setActiveProjectContext(second.context);
    const secondViewport = document.createElement('pf-canvas-viewport');
    document.body.append(secondViewport);
    await (secondViewport as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;

    first.context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    second.context.selection.setSelected({ x: 0, y: 0, width: 1, height: 1 }, 'rectangle');
    expect(beginSelectionTransform(first.context)).toMatchObject({ ok: true });
    expect(beginSelectionTransform(second.context)).toMatchObject({ ok: true });
    first.context.selection.moveTransform(1, 0);
    second.context.selection.moveTransform(1, 0);

    window.dispatchEvent(new CustomEvent('commit-transform', { detail: { context: first.context } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(first.context.history.undoStack.value).toHaveLength(1);
    expect(first.context.project.revision.value).toBe(1);
    expect(second.context.history.undoStack.value).toHaveLength(0);
    expect(second.context.project.revision.value).toBe(0);
    expect(second.context.selection.state.value.type).toBe('transforming');
  });

  it('exposes bounded invalid width validation without mutating the preview', async () => {
    const fixture = createContext();
    const { context } = fixture;
    const { bar } = await mountContextBar(context);
    const width = page.getByRole('spinbutton', { name: 'Width' });
    await userEvent.click(page.getByRole('button', { name: 'Transform selection' }));
    await (bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;

    const widthInput = width.element() as HTMLInputElement;
    const beforeScale = context.selection.scale;
    const beforeRevision = context.project.revision.value;
    widthInput.value = '0';
    widthInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await (bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;

    expect(widthInput.getAttribute('aria-invalid')).toBe('true');
    const describedBy = widthInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect((bar as HTMLElement).shadowRoot?.getElementById(describedBy ?? '')).not.toBeNull();
    expect(context.selection.scale).toEqual(beforeScale);
    expect(context.history.undoStack.value).toHaveLength(0);
    expect(context.project.revision.value).toBe(beforeRevision);
  });

  it('keeps unavailable begin errors bounded and visible in the context bar', async () => {
    const { context } = createContext();
    context.animation.getEditableCelCanvas = () => {
      throw new Error('disposed target');
    };
    const mounted = await mountContextBar(context);

    const trigger = page.getByRole('button', { name: 'Transform selection' }).element();
    let uncaughtError: unknown = null;
    const captureError = (event: ErrorEvent) => {
      uncaughtError = event.error;
      event.preventDefault();
    };
    window.addEventListener('error', captureError);
    try {
      trigger.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      window.removeEventListener('error', captureError);
    }
    expect(uncaughtError).toBeNull();
    await (mounted.bar as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    await expect.element(page.getByRole('status')).toHaveTextContent(/no longer available|could not be prepared|Transform failed/i);
    expect(context.history.undoStack.value).toHaveLength(0);
    expect(context.project.revision.value).toBe(0);
  });
});
