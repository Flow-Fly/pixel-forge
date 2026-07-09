import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../src/components/canvas/pf-reference-transform-handles';
import type { PFReferenceTransformHandles } from '../../../src/components/canvas/pf-reference-transform-handles';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../../src/stores/project-context';
import type { ReferenceLayerData } from '../../../src/types/reference';

const createdContexts: ProjectContext[] = [];
let createImageBitmapMock: ReturnType<typeof vi.fn>;

function createContext() {
  const context = createProjectContext();
  createdContexts.push(context);
  return context;
}

function referenceData(overrides: Partial<ReferenceLayerData> = {}): ReferenceLayerData {
  return {
    bytes: Uint8Array.from([1, 2, 3]),
    mimeType: 'image/png',
    x: 4,
    y: 8,
    scale: 2,
    ...overrides,
  };
}

async function createReferenceTransformHandles() {
  const element = document.createElement(
    'pf-reference-transform-handles'
  ) as PFReferenceTransformHandles;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

async function waitForContextRender(element: PFReferenceTransformHandles) {
  await Promise.resolve();
  await Promise.resolve();
  await element.updateComplete;
}

async function waitForBitmapRender(element: PFReferenceTransformHandles) {
  await waitForContextRender(element);
  await waitForContextRender(element);
}

function visibleBox(element: PFReferenceTransformHandles) {
  return element.shadowRoot?.querySelector<HTMLElement>('.reference-box') ?? null;
}

function visibleHandles(element: PFReferenceTransformHandles) {
  return [...(element.shadowRoot?.querySelectorAll<HTMLElement>('.reference-handle') ?? [])];
}

function visibleHandle(element: PFReferenceTransformHandles, position: string) {
  return element.shadowRoot?.querySelector<HTMLElement>(
    `.reference-handle[data-position="${position}"]`
  ) ?? null;
}

function referenceTransform(context: ProjectContext, layerId: string) {
  const data = context.layers.layers.value.find((layer) => layer.id === layerId)?.referenceData;
  return data ? { x: data.x, y: data.y, scale: data.scale } : null;
}

function dispatchDocumentMouseMove(clientX: number, clientY: number) {
  document.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY }));
}

function dispatchDocumentMouseUp() {
  document.dispatchEvent(new MouseEvent('mouseup'));
}

function expectReferenceTransform(
  context: ProjectContext,
  layerId: string,
  expected: { x: number; y: number; scale: number }
) {
  const actual = referenceTransform(context, layerId);

  expect(actual?.x).toBeCloseTo(expected.x);
  expect(actual?.y).toBeCloseTo(expected.y);
  expect(actual?.scale).toBeCloseTo(expected.scale);
}

async function flushHistoryCommand() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('pf-reference-transform-handles', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    createImageBitmapMock = vi.fn(async () => ({
      width: 20,
      height: 10,
      close: vi.fn(),
    }));
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
  });

  afterEach(() => {
    document.body.replaceChildren();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders transform handles for the active visible reference layer', async () => {
    const context = createContext();
    context.viewport.panX.value = 100;
    context.viewport.panY.value = 50;
    context.viewport.zoom.value = 3;
    context.layers.addReferenceLayer(referenceData(), 'Guide');
    setActiveProjectContext(context);

    const element = await createReferenceTransformHandles();
    await waitForBitmapRender(element);

    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(visibleBox(element)?.style.cssText).toContain(
      'left: 112px; top: 74px; width: 120px; height: 60px;'
    );
    expect(visibleHandles(element).map((handle) => handle.dataset.position)).toEqual([
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]);
    expect(visibleHandles(element).map((handle) => handle.style.cssText)).toEqual([
      'left: 112px; top: 74px; cursor: nwse-resize;',
      'left: 232px; top: 74px; cursor: nesw-resize;',
      'left: 112px; top: 134px; cursor: nesw-resize;',
      'left: 232px; top: 134px; cursor: nwse-resize;',
    ]);
  });

  it('hides handles for locked, hidden, or malformed reference layers', async () => {
    for (const layerPatch of [
      { locked: true },
      { visible: false },
      { referenceData: undefined },
    ]) {
      const context = createContext();
      const layer = context.layers.addReferenceLayer(referenceData(), 'Guide');
      context.layers.updateLayer(layer.id, layerPatch);
      setActiveProjectContext(context);

      const element = await createReferenceTransformHandles();
      await waitForContextRender(element);

      expect(visibleBox(element)).toBeNull();
      expect(visibleHandles(element)).toHaveLength(0);
    }

    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it('does not render handles for active image layers', async () => {
    const context = createContext();
    setActiveProjectContext(context);

    const element = await createReferenceTransformHandles();
    await waitForContextRender(element);

    expect(visibleBox(element)).toBeNull();
    expect(visibleHandles(element)).toHaveLength(0);
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it('moves the active reference layer and commits one undoable command on mouseup', async () => {
    const context = createContext();
    context.viewport.zoom.value = 2;
    const layer = context.layers.addReferenceLayer(referenceData(), 'Guide');
    context.dirtyRect.consumeFullRedraw();
    setActiveProjectContext(context);

    const element = await createReferenceTransformHandles();
    await waitForBitmapRender(element);

    visibleBox(element)?.dispatchEvent(
      new MouseEvent('mousedown', {
        button: 0,
        clientX: 10,
        clientY: 10,
        bubbles: true,
      })
    );
    dispatchDocumentMouseMove(18, 4);
    await waitForContextRender(element);

    expect(referenceTransform(context, layer.id)).toEqual({ x: 8, y: 5, scale: 2 });
    expect(context.dirtyRect.consumeFullRedraw()).toBe(true);
    expect(context.history.undoStack.value).toHaveLength(0);

    dispatchDocumentMouseUp();
    await flushHistoryCommand();

    expect(context.history.undoStack.value).toHaveLength(1);

    await context.history.undo();
    expectReferenceTransform(context, layer.id, { x: 4, y: 8, scale: 2 });

    await context.history.redo();
    expectReferenceTransform(context, layer.id, { x: 8, y: 5, scale: 2 });
  });

  it('scales the active reference layer uniformly from a corner handle', async () => {
    const context = createContext();
    context.viewport.zoom.value = 2;
    const layer = context.layers.addReferenceLayer(referenceData(), 'Guide');
    setActiveProjectContext(context);

    const element = await createReferenceTransformHandles();
    await waitForBitmapRender(element);

    visibleHandle(element, 'top-left')?.dispatchEvent(
      new MouseEvent('mousedown', {
        button: 0,
        clientX: 100,
        clientY: 80,
        bubbles: true,
      })
    );
    dispatchDocumentMouseMove(88, 72);
    await waitForContextRender(element);

    expectReferenceTransform(context, layer.id, { x: -4, y: 4, scale: 2.4 });
    expect(context.history.undoStack.value).toHaveLength(0);

    dispatchDocumentMouseUp();
    await flushHistoryCommand();

    expect(context.history.undoStack.value).toHaveLength(1);

    await context.history.undo();
    expectReferenceTransform(context, layer.id, { x: 4, y: 8, scale: 2 });

    await context.history.redo();
    expectReferenceTransform(context, layer.id, { x: -4, y: 4, scale: 2.4 });
  });

  it('cancels movement if the reference layer is no longer active while dragging', async () => {
    const context = createContext();
    context.viewport.zoom.value = 2;
    const reference = context.layers.addReferenceLayer(referenceData(), 'Guide');
    const paintLayer = context.layers.addLayer('Paint');
    context.layers.setActiveLayer(reference.id);
    setActiveProjectContext(context);

    const element = await createReferenceTransformHandles();
    await waitForBitmapRender(element);

    visibleBox(element)?.dispatchEvent(
      new MouseEvent('mousedown', {
        button: 0,
        clientX: 10,
        clientY: 10,
        bubbles: true,
      })
    );
    context.layers.setActiveLayer(paintLayer.id);
    dispatchDocumentMouseMove(18, 4);
    dispatchDocumentMouseUp();
    await flushHistoryCommand();

    expectReferenceTransform(context, reference.id, { x: 4, y: 8, scale: 2 });
    expect(context.history.undoStack.value).toHaveLength(0);
  });
});
