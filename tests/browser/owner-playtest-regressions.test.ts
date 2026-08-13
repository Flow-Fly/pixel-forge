import { afterEach, describe, expect, it } from 'vitest';
import {
  captureRasterTarget,
  executeFill,
  executeGradient,
} from '../../src/editor/raster-tools';
import { autoSaveService } from '../../src/services/auto-save';
import { registerShortcuts } from '../../src/services/keyboard/register-shortcuts';
import {
  createProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';
import { toolStore } from '../../src/stores/tools';
import '../../src/components/canvas/pf-drawing-canvas';
import '../../src/components/canvas/pf-canvas-viewport';

const contexts: ProjectContext[] = [];

function createRasterContext(width = 8, height = 4) {
  const context = createProjectContext();
  contexts.push(context);
  context.project.setSize(width, height);
  context.palette.setPalette(['#000000', '#ff0000', '#0000ff']);

  const layer = context.layers.layers.value[0];
  if (!layer) throw new Error('Expected an image layer');
  const frameId = context.animation.currentFrameId.value;
  const celKey = context.animation.getCelKey(layer.id, frameId);
  const currentCel = context.animation.cels.value.get(celKey);
  if (!currentCel) throw new Error('Expected an initial cel');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const cel = {
    ...currentCel,
    canvas,
    indexBuffer: new Uint8Array(width * height),
  };
  layer.canvas = canvas;
  context.animation.cels.value = new Map([[celKey, cel]]);

  return { context, layerId: layer.id, frameId, canvas };
}

function rgbaPixels(canvas: HTMLCanvasElement): number[] {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Chromium did not provide a 2D canvas context');
  return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
}

function celIndices(context: ProjectContext, layerId: string, frameId: string): number[] {
  const indices = context.animation.getCelIndexBuffer(layerId, frameId);
  if (!indices) throw new Error('Expected an indexed cel');
  return Array.from(indices);
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function settleComponent(element: HTMLElement): Promise<void> {
  await (element as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete;
  await nextFrame();
  await nextFrame();
}

afterEach(() => {
  document.body.replaceChildren();
  restoreDefaultProjectContext();
  toolStore.setActiveTool('pencil');
  for (const context of contexts.splice(0)) {
    autoSaveService.stop(context);
    context.dispose();
  }
});

describe('owner playtest regressions', () => {
  it.each(['fill', 'gradient'] as const)(
    'keeps %s Undo/Redo available after real autosave completes',
    async (operation) => {
      const { context, layerId, frameId, canvas } = createRasterContext();
      const beforePixels = rgbaPixels(canvas);
      const beforeIndices = celIndices(context, layerId, frameId);
      autoSaveService.start(context);

      const result = operation === 'fill'
        ? await executeFill(context, {
          ...captureRasterTarget(context, layerId, frameId),
          startX: 0,
          startY: 0,
          hex: '#ff0000',
          contiguous: true,
        })
        : await executeGradient(context, {
          ...captureRasterTarget(context, layerId, frameId),
          startX: 0,
          startY: 0,
          endX: 7,
          endY: 3,
          primaryHex: '#ff0000',
          secondaryHex: '#0000ff',
          type: 'linear',
          shift: false,
        });

      expect(result.ok).toBe(true);
      expect(rgbaPixels(canvas)).not.toEqual(beforePixels);
      expect(celIndices(context, layerId, frameId)).not.toEqual(beforeIndices);

      await autoSaveService.saveUntilClean(context);
      expect(autoSaveService.isDirty(context)).toBe(false);
      expect(context.project.lastSaved.value).not.toBeNull();
      expect(context.history.canUndo.value).toBe(true);

      const committedPixels = rgbaPixels(canvas);
      const committedIndices = celIndices(context, layerId, frameId);
      await context.history.undo();
      expect(context.history.canRedo.value).toBe(true);
      expect(rgbaPixels(canvas)).toEqual(beforePixels);
      expect(celIndices(context, layerId, frameId)).toEqual(beforeIndices);

      await context.history.redo();
      expect(context.history.canUndo.value).toBe(true);
      expect(rgbaPixels(canvas)).toEqual(committedPixels);
      expect(celIndices(context, layerId, frameId)).toEqual(committedIndices);
    },
  );

  it('cancels a real Gradient drag with Escape without changing display or state', async () => {
    const { context, layerId, frameId, canvas } = createRasterContext();
    setActiveProjectContext(context);
    toolStore.setActiveTool('gradient', context);
    const viewport = document.createElement('pf-canvas-viewport') as HTMLElement;
    viewport.style.width = '400px';
    viewport.style.height = '240px';
    const drawing = document.createElement('pf-drawing-canvas') as HTMLElement & {
      width: number;
      height: number;
      canvas: HTMLCanvasElement;
      drawingPreview: unknown;
    };
    drawing.width = canvas.width;
    drawing.height = canvas.height;
    viewport.append(drawing);
    document.body.append(viewport);
    await settleComponent(viewport);
    await settleComponent(drawing);

    const beforePixels = rgbaPixels(canvas);
    const beforeIndices = celIndices(context, layerId, frameId);
    const beforeRevision = context.project.revision.value;
    const beforeHistory = context.history.version.value;
    registerShortcuts();
    const visibleCanvas = drawing.canvas;
    const rect = visibleCanvas.getBoundingClientRect();
    visibleCanvas.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: rect.left + rect.width * 0.15,
      clientY: rect.top + rect.height * 0.5,
    }));
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: rect.left + rect.width * 0.85,
      clientY: rect.top + rect.height * 0.5,
    }));
    await nextFrame();
    await nextFrame();

    expect(drawing.drawingPreview).not.toBeNull();
    expect(rgbaPixels(visibleCanvas)).not.toEqual(beforePixels);
    expect(rgbaPixels(canvas)).toEqual(beforePixels);
    expect(celIndices(context, layerId, frameId)).toEqual(beforeIndices);

    window.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
      code: 'Escape',
    }));
    await nextFrame();
    await nextFrame();

    expect(drawing.drawingPreview).toBeNull();
    expect(rgbaPixels(visibleCanvas)).toEqual(beforePixels);
    expect(rgbaPixels(canvas)).toEqual(beforePixels);
    expect(celIndices(context, layerId, frameId)).toEqual(beforeIndices);
    expect(context.project.revision.value).toBe(beforeRevision);
    expect(context.history.version.value).toBe(beforeHistory);
  });

  it('selects Gradient through the real Shift+G shortcut path', async () => {
    const { context } = createRasterContext();
    setActiveProjectContext(context);
    toolStore.setActiveTool('pencil', context);
    registerShortcuts();

    window.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'G',
      code: 'KeyG',
      shiftKey: true,
    }));

    expect(toolStore.activeTool.value).toBe('gradient');
  });

  it('maps a zoomed display point to the same logical cell without a quarter-cell offset', async () => {
    const { context, canvas } = createRasterContext(8, 8);
    setActiveProjectContext(context);

    const viewport = document.createElement('pf-canvas-viewport') as HTMLElement;
    const drawing = document.createElement('pf-drawing-canvas') as HTMLElement & {
      width: number;
      height: number;
      canvas: HTMLCanvasElement;
    };
    drawing.width = canvas.width;
    drawing.height = canvas.height;
    viewport.style.width = '400px';
    viewport.style.height = '400px';
    viewport.append(drawing);
    document.body.append(viewport);
    await settleComponent(viewport);
    await settleComponent(drawing);
    context.grid.setAutoShowThreshold(5);
    context.viewport.zoom.value = 5.55;
    context.viewport.panX.value = 12.35;
    context.viewport.panY.value = 8.7;
    await settleComponent(viewport);
    await settleComponent(drawing);

    const events: Array<{ x: number; y: number }> = [];
    drawing.addEventListener('canvas-cursor', (event) => {
      events.push((event as CustomEvent<{ x: number; y: number }>).detail);
    });
    const visibleCanvas = drawing.canvas;
    const rect = visibleCanvas.getBoundingClientRect();
    const targetCell = { x: 3, y: 2 };
    visibleCanvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: rect.left + (targetCell.x + 0.5) * (rect.width / visibleCanvas.width),
      clientY: rect.top + (targetCell.y + 0.5) * (rect.height / visibleCanvas.height),
    }));

    expect(events.at(-1)).toEqual(targetCell);

    const overlay = viewport.shadowRoot?.querySelector('pf-brush-cursor-overlay');
    const overlayCanvas = overlay?.shadowRoot?.querySelector('canvas');
    expect(overlayCanvas).toBeTruthy();
    if (!overlayCanvas) return;
    await nextFrame();
    const overlayContext = overlayCanvas.getContext('2d');
    if (!overlayContext) throw new Error('Chromium did not provide an overlay 2D context');
    const expectedScreenX = context.viewport.panX.value + targetCell.x * context.viewport.zoom.value;
    const expectedScreenY = context.viewport.panY.value + targetCell.y * context.viewport.zoom.value;
    const expectedOverlayPixel = overlayContext.getImageData(expectedScreenX + 1, expectedScreenY + 1, 1, 1).data;
    expect(expectedOverlayPixel[3]).toBeGreaterThan(0);
    const gridCanvas = viewport.shadowRoot?.querySelector<HTMLCanvasElement>('#grid-overlay');
    expect(gridCanvas).toBeTruthy();
    if (!gridCanvas) return;
    const gridContext = gridCanvas.getContext('2d');
    if (!gridContext) throw new Error('Chromium did not provide grid 2D context');
    const expectedGridX = Math.round(context.viewport.panX.value + targetCell.x * context.viewport.zoom.value) + 0.5;
    const expectedGridY = Math.round(context.viewport.panY.value + targetCell.y * context.viewport.zoom.value) + 0.5;
    const gridXAlpha = gridContext.getImageData(Math.floor(expectedGridX), Math.floor(expectedScreenY + 1), 1, 1).data[3];
    const gridYAlpha = gridContext.getImageData(Math.floor(expectedScreenX + 1), Math.floor(expectedGridY), 1, 1).data[3];
    expect(gridXAlpha).toBeGreaterThan(0);
    expect(gridYAlpha).toBeGreaterThan(0);
  });
});
