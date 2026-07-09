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
});
