import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const autoSaveServiceMock = vi.hoisted(() => ({
  saveNow: vi.fn(),
}));

vi.mock('../../../src/services/auto-save', () => ({
  autoSaveService: autoSaveServiceMock,
}));
import type { PFGuidedPalette } from '../../../src/components/color/palette-panel/pf-guided-palette';
import '../../../src/components/color/palette-panel/pf-guided-palette';
import '../../../src/components/color/pf-palette-panel';
import { createProjectContext, restoreDefaultProjectContext, setActiveProjectContext } from '../../../src/stores/project-context';
import { GUIDED_DRAWING_VERSION } from '../../../src/types/guided-drawing';

describe('guided palette', () => {
  const originalHidePopover = HTMLElement.prototype.hidePopover;

  beforeAll(() => {
    HTMLElement.prototype.hidePopover = () => {};
  });

  beforeEach(() => {
    autoSaveServiceMock.saveNow.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (originalHidePopover) {
      HTMLElement.prototype.hidePopover = originalHidePopover;
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
    }
  });

  afterEach(() => {
    document.body.innerHTML = '';
    restoreDefaultProjectContext();
  });

  it('shows numbered semantic colors and creative coverage', async () => {
    const context = createGuidedContext();
    setActiveProjectContext(context);
    const element = document.createElement('pf-guided-palette') as PFGuidedPalette;
    document.body.append(element);
    await element.updateComplete;

    const buttons = [...element.shadowRoot!.querySelectorAll<HTMLButtonElement>('.guide-color')];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('aria-label')).toContain(
      'Guide color 1, #111111, 0 cells remaining',
    );
    expect(buttons[1].getAttribute('aria-label')).toContain(
      'Guide color 2, #eeeeee, 1 cells remaining, number key 2',
    );
    expect(
      [...element.shadowRoot!.querySelectorAll<HTMLElement>('.shortcut-hint')].map(
        (hint) => hint.textContent?.trim(),
      ),
    ).toEqual(['Key 1', 'Key 2']);
    expect(element.shadowRoot?.textContent).toContain('1 of 2 cells covered');
    expect(element.shadowRoot?.textContent).toContain('1 remaining · 50%');
    expect(element.shadowRoot?.textContent).toContain(
      'Canvas, palette, layers, and frames stay fixed',
    );

    const viewButtons = [
      ...element.shadowRoot!.querySelectorAll<HTMLButtonElement>('.view-controls button'),
    ];
    expect(viewButtons.map((button) => button.textContent?.trim()))
      .toEqual(['Hide numbers', 'Preview target']);
    viewButtons[0].click();
    viewButtons[1].click();
    await element.updateComplete;
    expect(context.guidedDrawing.numbersVisible.value).toBe(false);
    expect(context.guidedDrawing.targetPreviewVisible.value).toBe(true);
    expect(viewButtons.map((button) => button.textContent?.trim()))
      .toEqual(['Show numbers', 'Hide target']);

    buttons[1].click();
    await element.updateComplete;
    expect(context.colors.primaryColor.value).toBe('#eeeeee');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');

    context.dispose();
  });

  it('limits number-key hints to guide colors 1 through 9', async () => {
    const context = createGuidedContext(10);
    setActiveProjectContext(context);
    const element = document.createElement('pf-guided-palette') as PFGuidedPalette;
    document.body.append(element);
    await element.updateComplete;

    const buttons = [...element.shadowRoot!.querySelectorAll<HTMLButtonElement>('.guide-color')];
    const hints = [...element.shadowRoot!.querySelectorAll<HTMLElement>('.shortcut-hint')];

    expect(buttons).toHaveLength(10);
    expect(hints.map((hint) => hint.textContent?.trim())).toEqual(
      Array.from({ length: 9 }, (_, index) => `Key ${index + 1}`),
    );
    expect(buttons[8].getAttribute('aria-label')).toContain('number key 9');
    expect(buttons[9].getAttribute('aria-label')).not.toContain('number key');

    buttons[9].click();
    await element.updateComplete;
    expect(context.colors.primaryColor.value).toBe('#aaaaaa');
    expect(buttons[9].getAttribute('aria-pressed')).toBe('true');

    context.dispose();
  });

  it('keeps off-guide artist colors selectable without numbering them', async () => {
    const context = createGuidedContext();
    context.palette.mainColors.value = ['#111111', '#eeeeee', '#ff00ff'];
    context.palette.rebuildColorMap();
    setActiveProjectContext(context);

    const element = document.createElement('pf-guided-palette') as PFGuidedPalette;
    document.body.append(element);
    await element.updateComplete;

    const artistColor = element.shadowRoot?.querySelector<HTMLButtonElement>('.artist-color');
    expect(artistColor?.getAttribute('aria-label')).toBe('Artist color #ff00ff');
    artistColor?.click();
    await element.updateComplete;
    expect(context.colors.primaryColor.value).toBe('#ff00ff');

    context.dispose();
  });

  it('replaces normal palette editing only for guided projects', async () => {
    const guidedContext = createGuidedContext();
    setActiveProjectContext(guidedContext);
    const panel = document.createElement('pf-palette-panel');
    document.body.append(panel);
    await panel.updateComplete;

    expect(panel.shadowRoot?.querySelector('pf-guided-palette')).not.toBeNull();
    expect(panel.shadowRoot?.querySelector('pf-palette-toolbar')).toBeNull();

    const normalContext = createProjectContext();
    setActiveProjectContext(normalContext);
    await panel.updateComplete;
    expect(panel.shadowRoot?.querySelector('pf-guided-palette')).toBeNull();
    expect(panel.shadowRoot?.querySelector('pf-palette-toolbar')).not.toBeNull();

    guidedContext.dispose();
    normalContext.dispose();
  });

  it('finishes guidance at partial coverage without touching art or history', async () => {
    const context = createGuidedContext();
    const historyEntry = {
      id: 'stroke',
      name: 'Pencil',
      execute: vi.fn(),
      undo: vi.fn(),
    };
    context.history.undoStack.value = [historyEntry];
    const resetView = vi.spyOn(context.viewport, 'resetView');
    setActiveProjectContext(context);
    const element = document.createElement('pf-guided-palette') as PFGuidedPalette;
    document.body.append(element);
    await element.updateComplete;

    const pixelsBefore = getPaintingPixels(context);
    element.shadowRoot?.querySelector<HTMLButtonElement>('.finish-guidance')?.click();
    await element.updateComplete;
    expect(element.shadowRoot?.textContent).toContain('Your drawing is 50% covered');

    element.shadowRoot?.querySelector<HTMLButtonElement>('.finish-confirm')?.click();
    await settle(element);

    expect(autoSaveServiceMock.saveNow).toHaveBeenCalledWith(context);
    expect(context.guidedDrawing.active).toBe(false);
    expect(context.history.undoStack.value).toEqual([historyEntry]);
    expect(getPaintingPixels(context)).toEqual(pixelsBefore);
    expect(resetView).toHaveBeenCalledTimes(1);

    context.dispose();
  });

  it('keeps guidance active when the finish save fails', async () => {
    const context = createGuidedContext();
    setActiveProjectContext(context);
    autoSaveServiceMock.saveNow.mockRejectedValueOnce(new Error('storage failed'));
    const element = document.createElement('pf-guided-palette') as PFGuidedPalette;
    document.body.append(element);
    await element.updateComplete;

    element.shadowRoot?.querySelector<HTMLButtonElement>('.finish-guidance')?.click();
    await element.updateComplete;
    element.shadowRoot?.querySelector<HTMLButtonElement>('.finish-confirm')?.click();
    await settle(element);

    expect(context.guidedDrawing.active).toBe(true);
    expect(context.guidedDrawing.finishPending.value).toBe(false);
    expect(element.shadowRoot?.textContent).toContain('Your guide is still active');

    context.dispose();
  });
});

async function settle(element: PFGuidedPalette) {
  await Promise.resolve();
  await element.updateComplete;
  await Promise.resolve();
  await element.updateComplete;
}

function getPaintingPixels(context: ReturnType<typeof createProjectContext>) {
  const layer = context.layers.layers.value.find((item) => item.type === 'image');
  return [...(layer?.canvas?.getContext('2d')?.getImageData(0, 0, 2, 1).data ?? [])];
}

function createGuidedContext(guideColorCount = 2) {
  const context = createProjectContext();
  const layer = context.layers.layers.value.find((item) => item.type === 'image');
  const pixels = new Uint8ClampedArray(guideColorCount * 4);
  pixels.set([12, 12, 12, 255]);
  const canvas = {
    width: guideColorCount,
    height: 1,
    getContext: () => ({ getImageData: () => ({ data: pixels }) }),
  } as unknown as HTMLCanvasElement;
  if (layer) context.layers.updateLayer(layer.id, { canvas });

  context.palette.mainColors.value = Array.from(
    { length: guideColorCount },
    (_, index) => `#${(index + 1).toString(16).repeat(6)}`,
  );
  if (guideColorCount === 2) context.palette.mainColors.value[1] = '#eeeeee';
  context.palette.rebuildColorMap();
  context.guidedDrawing.start({
    version: GUIDED_DRAWING_VERSION,
    width: guideColorCount,
    height: 1,
    target: Uint8Array.from({ length: guideColorCount }, (_, index) => index + 1),
    guideColorCount,
    settings: {
      longSide: guideColorCount,
      paletteSource: 'generated',
      maxColors: guideColorCount,
      mapping: 'color',
      simplifyIsolatedPixels: false,
    },
    createdAt: 1,
  });
  return context;
}
