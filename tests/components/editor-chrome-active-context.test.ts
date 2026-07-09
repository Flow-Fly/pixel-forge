import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../src/components/canvas/pf-guides-overlay';
import '../../src/components/preview/pf-preview-overlay';
import '../../src/components/status/pf-status-bar';
import '../../src/components/toolbar/pf-context-bar';
import type { PFGuidesOverlay } from '../../src/components/canvas/pf-guides-overlay';
import type { PFPreviewOverlay } from '../../src/components/preview/pf-preview-overlay';
import type { PFStatusBar } from '../../src/components/status/pf-status-bar';
import type { PFContextBar } from '../../src/components/toolbar/pf-context-bar';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';

const createdContexts: ProjectContext[] = [];

function createContext() {
  const context = createProjectContext();
  createdContexts.push(context);
  return context;
}

async function waitForContextRender(element: { updateComplete: Promise<unknown> }) {
  await Promise.resolve();
  await Promise.resolve();
  await element.updateComplete;
}

async function createStatusBar() {
  const statusBar = document.createElement('pf-status-bar') as PFStatusBar;
  document.body.append(statusBar);
  await statusBar.updateComplete;
  return statusBar;
}

async function createPreviewOverlay() {
  const preview = document.createElement('pf-preview-overlay') as PFPreviewOverlay;
  document.body.append(preview);
  await preview.updateComplete;
  return preview;
}

async function createGuidesOverlay() {
  const guides = document.createElement('pf-guides-overlay') as PFGuidesOverlay;
  document.body.append(guides);
  await guides.updateComplete;
  return guides;
}

async function createContextBar() {
  const contextBar = document.createElement('pf-context-bar') as PFContextBar;
  document.body.append(contextBar);
  await contextBar.updateComplete;
  return contextBar;
}

function previewCanvas(preview: PFPreviewOverlay) {
  const canvas = preview.shadowRoot?.querySelector('canvas');
  expect(canvas).toBeTruthy();
  return canvas as HTMLCanvasElement;
}

function horizontalGuide(guides: PFGuidesOverlay) {
  const guide = guides.shadowRoot?.querySelector<HTMLElement>('.guide.horizontal');
  expect(guide).toBeTruthy();
  return guide as HTMLElement;
}

function selectFirstCel(context: ProjectContext, opacity: number) {
  const layer = context.layers.layers.value[0];
  const frameId = context.animation.currentFrameId.value;
  const key = context.animation.getCelKey(layer.id, frameId);
  const cels = new Map(context.animation.cels.value);
  const cel = cels.get(key);
  expect(cel).toBeTruthy();
  cels.set(key, {
    ...cel!,
    opacity,
  });
  context.animation.cels.value = cels;
  context.animation.selectedCelKeys.value = new Set([key]);
  return key;
}

function getCelOpacity(context: ProjectContext, key: string) {
  return context.animation.cels.value.get(key)?.opacity ?? 100;
}

describe('editor chrome active project context binding', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          clearRect: vi.fn(),
          drawImage: vi.fn(),
          fillRect: vi.fn(),
          getImageData: vi.fn(() => ({
            data: new Uint8ClampedArray(4),
            width: 1,
            height: 1,
          })),
          putImageData: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          beginPath: vi.fn(),
          rect: vi.fn(),
          clip: vi.fn(),
          stroke: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          setLineDash: vi.fn(),
        }) as unknown as CanvasRenderingContext2D
    );
  });

  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
    vi.restoreAllMocks();
  });

  it('rerenders the status bar after the active context changes', async () => {
    const contextA = createContext();
    const contextB = createContext();
    contextA.viewport.setZoom(2);
    contextB.viewport.setZoom(0.5);
    setActiveProjectContext(contextA);

    const statusBar = await createStatusBar();

    expect(statusBar.shadowRoot?.textContent).toContain('200%');

    setActiveProjectContext(contextB);
    await waitForContextRender(statusBar);

    expect(statusBar.shadowRoot?.textContent).toContain('50%');
  });

  it('rerenders the preview after the active context changes', async () => {
    const contextA = createContext();
    const contextB = createContext();
    contextA.project.width.value = 32;
    contextA.project.height.value = 16;
    contextB.project.width.value = 80;
    contextB.project.height.value = 80;
    setActiveProjectContext(contextA);

    const preview = await createPreviewOverlay();

    expect(previewCanvas(preview).width).toBe(32);
    expect(previewCanvas(preview).height).toBe(16);

    setActiveProjectContext(contextB);
    await waitForContextRender(preview);

    expect(previewCanvas(preview).width).toBe(80);
    expect(previewCanvas(preview).height).toBe(80);
  });

  it('rerenders canvas guide positions after the active context changes', async () => {
    const contextA = createContext();
    const contextB = createContext();
    contextA.guides.setHorizontalGuide(5);
    contextA.viewport.setZoom(2);
    contextA.viewport.panY.value = 3;
    contextB.guides.setHorizontalGuide(8);
    contextB.viewport.setZoom(4);
    contextB.viewport.panY.value = 1;
    setActiveProjectContext(contextA);

    const guides = await createGuidesOverlay();

    expect(horizontalGuide(guides).getAttribute('style')).toBe('top: 13px');

    setActiveProjectContext(contextB);
    await waitForContextRender(guides);

    expect(horizontalGuide(guides).getAttribute('style')).toBe('top: 33px');
  });

  it('commits context bar cel opacity changes to the context where dragging started', async () => {
    const contextA = createContext();
    const contextB = createContext();
    const celA = selectFirstCel(contextA, 20);
    const celB = selectFirstCel(contextB, 80);
    setActiveProjectContext(contextA);
    const contextBar = await createContextBar();

    (contextBar as any)._handleCelScrubStart(
      new MouseEvent('mousedown', { clientX: 0 }),
      20,
      contextA
    );
    setActiveProjectContext(contextB);
    await waitForContextRender(contextBar);
    (contextBar as any)._handleCelScrubMove(new MouseEvent('mousemove', { clientX: 40 }));
    (contextBar as any)._handleCelScrubEnd();
    await Promise.resolve();

    expect(getCelOpacity(contextA, celA)).toBe(40);
    expect(getCelOpacity(contextB, celB)).toBe(80);
    expect(contextA.history.undoStack.value).toHaveLength(1);
    expect(contextB.history.undoStack.value).toHaveLength(0);

    await contextA.history.undo();

    expect(getCelOpacity(contextA, celA)).toBe(20);
  });
});
