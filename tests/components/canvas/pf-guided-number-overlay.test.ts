import { afterEach, describe, expect, it } from 'vitest';
import {
  collectVisibleGuidedNumberCells,
  collectVisibleGuidedTargetCells,
  getGuidedNumberLabelStyle,
  type PFGuidedNumberOverlay,
} from '../../../src/components/canvas/pf-guided-number-overlay';
import '../../../src/components/canvas/pf-canvas-viewport';
import { createProjectContext, restoreDefaultProjectContext, setActiveProjectContext } from '../../../src/stores/project-context';
import { GUIDED_DRAWING_VERSION } from '../../../src/types/guided-drawing';

describe('guided number overlay', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    restoreDefaultProjectContext();
  });

  it('plans every visible unpainted numbered cell at readable zoom', () => {
    const cells = collectVisibleGuidedNumberCells(
      Uint8Array.from([1, 2, 3, 4]),
      new Uint8ClampedArray([
        0, 0, 0, 0,
        20, 30, 40, 255,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ]),
      2,
      {
        zoom: 16,
        panX: 0,
        panY: 0,
        viewportWidth: 32,
        viewportHeight: 16,
      },
    );

    expect(cells.map((cell) => cell.guideNumber)).toEqual([1, 3, 4]);
  });

  it('does not plan illegible or off-screen numbers', () => {
    const target = Uint8Array.from([1, 2]);
    const pixels = new Uint8ClampedArray(8);

    expect(collectVisibleGuidedNumberCells(target, pixels, 2, {
      zoom: 8,
      panX: 0,
      panY: 0,
      viewportWidth: 100,
      viewportHeight: 100,
    })).toEqual([]);

    expect(collectVisibleGuidedNumberCells(target, pixels, 2, {
      zoom: 16,
      panX: -40,
      panY: 0,
      viewportWidth: 16,
      viewportHeight: 16,
    })).toEqual([]);
  });

  it('keeps number labels restrained at the readable zoom threshold', () => {
    const singleDigit = getGuidedNumberLabelStyle(16, 1);
    const doubleDigit = getGuidedNumberLabelStyle(16, 2);

    expect(singleDigit.fontWeight).toBe(500);
    expect(singleDigit.fontSize).toBeLessThan(9);
    expect(doubleDigit.fontSize).toBeLessThan(singleDigit.fontSize);
    expect(singleDigit.fillStyle).toContain('0.62');
    expect(singleDigit.strokeStyle).toContain('0.46');
    expect(singleDigit.lineWidth).toBe(1);
  });

  it('plans a target preview at any zoom without reading painted pixels', () => {
    const cells = collectVisibleGuidedTargetCells(
      Uint8Array.from([1, 0, 2]),
      3,
      {
        zoom: 4,
        panX: 0,
        panY: 0,
        viewportWidth: 12,
        viewportHeight: 4,
      },
    );

    expect(cells.map((cell) => cell.guideNumber)).toEqual([1, 2]);
  });

  it('shows a DOM hint below the number threshold', async () => {
    const context = createProjectContext();
    context.guidedDrawing.start({
      version: GUIDED_DRAWING_VERSION,
      width: 1,
      height: 1,
      target: Uint8Array.from([1]),
      settings: {
        longSide: 1,
        paletteSource: 'generated',
        maxColors: 1,
        mapping: 'color',
        simplifyIsolatedPixels: false,
      },
      createdAt: 1,
    });
    context.viewport.setZoom(8);
    setActiveProjectContext(context);

    const element = document.createElement('pf-guided-number-overlay') as PFGuidedNumberOverlay;
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.textContent).toContain('Zoom in to see guide numbers');

    context.viewport.setZoom(16);
    await element.updateComplete;
    expect(element.shadowRoot?.textContent).not.toContain('Zoom in to see guide numbers');

    context.viewport.setZoom(8);
    context.guidedDrawing.toggleNumbers();
    await element.updateComplete;
    expect(element.shadowRoot?.textContent).not.toContain('Zoom in to see guide numbers');

    context.dispose();
  });

  it('mounts the guidance layer inside the shared canvas viewport', async () => {
    const viewport = document.createElement('pf-canvas-viewport');
    document.body.append(viewport);
    await viewport.updateComplete;

    expect(viewport.shadowRoot?.querySelector('pf-guided-number-overlay')).not.toBeNull();
  });
});
