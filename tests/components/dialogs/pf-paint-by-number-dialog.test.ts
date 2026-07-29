import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const decodeImageFileMock = vi.hoisted(() => vi.fn());
const sampleImageToGridMock = vi.hoisted(() => vi.fn());
const generateNumberedGuideMock = vi.hoisted(() => vi.fn());
const createGuidedProjectMock = vi.hoisted(() => vi.fn());
const loadCustomPalettesOrThrowMock = vi.hoisted(() => vi.fn());
const saveAsNewPaletteMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/paint-by-number/image-file', () => ({
  decodeImageFile: decodeImageFileMock,
}));

vi.mock('../../../src/services/paint-by-number/image-sampling', () => ({
  sampleImageToGrid: sampleImageToGridMock,
}));

vi.mock('../../../src/services/paint-by-number/guide-generator', () => ({
  generateNumberedGuide: generateNumberedGuideMock,
  MAX_GUIDE_COLORS: 255,
}));

vi.mock('../../../src/services/paint-by-number/guided-project', () => ({
  createGuidedProject: createGuidedProjectMock,
}));

vi.mock('../../../src/stores/palette/persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/stores/palette/persistence')>()),
  loadCustomPalettesOrThrow: loadCustomPalettesOrThrowMock,
  saveAsNewPalette: saveAsNewPaletteMock,
}));

import '../../../src/components/dialogs/pf-paint-by-number-dialog';
import type { PFPaintByNumberDialog } from '../../../src/components/dialogs/pf-paint-by-number-dialog';
import { PRESET_PALETTES } from '../../../src/data/preset-palettes';
import { MAX_GUIDE_COLORS } from '../../../src/services/paint-by-number/guide-generator';
import * as projectContext from '../../../src/stores/project-context';
import { MAX_PALETTE_SIZE } from '../../../src/stores/palette/types';
import type { CustomPalette } from '../../../src/types/palette';
import type { PFDialog } from '../../../src/components/ui/pf-dialog';

const sourceImage = {
  width: 4,
  height: 2,
  data: new Uint8ClampedArray(32),
} as ImageData;

const sampledImage = {
  width: 2,
  height: 1,
  data: new Uint8ClampedArray(8),
} as ImageData;

const guide = {
  palette: ['#111111', '#eeeeee'],
  target: new Uint8Array([1, 2]),
  width: 2,
  height: 1,
  complexity: {
    paintableCells: 2,
    paletteSize: 2,
    isolatedCells: 2,
    simplifiedCells: 1,
  },
};

async function settle(element: PFPaintByNumberDialog) {
  await Promise.resolve();
  await element.updateComplete;
  await Promise.resolve();
  await element.updateComplete;
}

async function createDialog() {
  const element = document.createElement(
    'pf-paint-by-number-dialog',
  ) as PFPaintByNumberDialog;
  element.open = true;
  document.body.append(element);
  await settle(element);
  return element;
}

function chooseFile(element: PFPaintByNumberDialog, file: File) {
  const input = element.shadowRoot?.querySelector<HTMLInputElement>(
    '#guided-source-file',
  );
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });
  input?.dispatchEvent(new Event('change'));
}

async function selectPalette(element: PFPaintByNumberDialog, value: string) {
  const select = element.shadowRoot?.querySelector<HTMLSelectElement>(
    '#guided-palette-source',
  );
  if (!select) throw new Error('Palette select is unavailable');
  select.value = value;
  select.dispatchEvent(new Event('change'));
  await settle(element);
}

function customPalette(id: string, name: string, colors: string[]): CustomPalette {
  return {
    id,
    name,
    colors,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('pf-paint-by-number-dialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    decodeImageFileMock.mockResolvedValue(sourceImage);
    sampleImageToGridMock.mockReturnValue(sampledImage);
    generateNumberedGuideMock.mockReturnValue(guide);
    createGuidedProjectMock.mockResolvedValue({
      ok: true,
      item: {},
      projectId: 'guided-project',
    });
    loadCustomPalettesOrThrowMock.mockResolvedValue([]);
    saveAsNewPaletteMock.mockImplementation(async (name: string, colors: string[]) => (
      customPalette('new-palette', name, [...colors])
    ));
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('generates a balanced preview and creates a separate guided project', async () => {
    const element = await createDialog();
    const file = new File(['pixels'], 'portrait.png', { type: 'image/png' });
    let createdProjectId = '';
    element.addEventListener('project-created', (event) => {
      createdProjectId = (event as CustomEvent<{ id: string }>).detail.id;
    });

    chooseFile(element, file);
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await settle(element);

    expect(sampleImageToGridMock).toHaveBeenCalledWith(sourceImage, {
      longSide: 24,
    });
    expect(generateNumberedGuideMock).toHaveBeenCalledWith(sampledImage, {
      maxColors: 8,
      palette: undefined,
      mapping: 'color',
      simplifyIsolatedPixels: true,
    });

    element.shadowRoot?.querySelector<HTMLButtonElement>('button.primary')?.click();
    await settle(element);

    expect(createGuidedProjectMock).toHaveBeenCalledWith({
      guide,
      settings: {
        longSide: 24,
        paletteSource: 'generated',
        maxColors: 8,
        restrictedPalette: undefined,
        mapping: 'color',
        simplifyIsolatedPixels: true,
      },
      sourceName: 'portrait.png',
    });
    expect(createdProjectId).toBe('guided-project');
    expect(element.open).toBe(false);
  });

  it('keeps the simplify option as a native labeled checkbox', async () => {
    const element = await createDialog();
    const input = element.shadowRoot?.querySelector<HTMLInputElement>(
      '#guided-simplify',
    );
    const label = input?.closest('label');

    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input?.type).toBe('checkbox');
    expect(input?.checked).toBe(true);
    expect(label?.textContent).toContain('Simplify isolated single pixels');

    input?.click();
    await settle(element);

    expect(input?.checked).toBe(false);
  });

  it('selects preset and saved palettes without reading an active project palette', async () => {
    const activeProjectPaletteSpy = vi.spyOn(projectContext, 'getActiveProjectContext');
    const saved = customPalette('night', 'Night colors', ['#101020', '#f0f0ff']);
    loadCustomPalettesOrThrowMock.mockResolvedValue([saved]);
    const element = await createDialog();
    const select = element.shadowRoot?.querySelector<HTMLSelectElement>(
      '#guided-palette-source',
    );

    expect(select?.options[0].textContent).toBe('Generate from image');
    expect(Array.from(select?.options ?? []).map((option) => option.textContent)).toEqual(
      expect.arrayContaining(['DB32', 'PICO-8', 'Night colors', 'Create palette…']),
    );

    chooseFile(element, new File(['pixels'], 'portrait.png', { type: 'image/png' }));
    await Promise.resolve();
    await vi.runAllTimersAsync();

    const preset = PRESET_PALETTES.find((palette) => palette.id === 'gameboy')!;
    await selectPalette(element, 'preset:gameboy');
    await vi.runAllTimersAsync();
    expect(generateNumberedGuideMock).toHaveBeenLastCalledWith(sampledImage, {
      maxColors: undefined,
      palette: preset.colors,
      mapping: 'color',
      simplifyIsolatedPixels: true,
    });
    expect(generateNumberedGuideMock.mock.lastCall?.[1].palette).not.toBe(preset.colors);

    await selectPalette(element, 'custom:night');
    await vi.runAllTimersAsync();
    expect(generateNumberedGuideMock).toHaveBeenLastCalledWith(sampledImage, {
      maxColors: undefined,
      palette: ['#101020', '#f0f0ff'],
      mapping: 'color',
      simplifyIsolatedPixels: true,
    });
    expect(generateNumberedGuideMock.mock.lastCall?.[1].palette).not.toBe(saved.colors);
    expect(element.shadowRoot?.querySelector('#guided-palette-status')?.textContent).not.toContain(
      'omits',
    );

    element.shadowRoot?.querySelector<HTMLButtonElement>('button.primary')?.click();
    await settle(element);
    expect(createGuidedProjectMock).toHaveBeenCalledWith({
      guide,
      settings: {
        longSide: 24,
        paletteSource: 'restricted',
        maxColors: undefined,
        restrictedPalette: ['#101020', '#f0f0ff'],
        mapping: 'color',
        simplifyIsolatedPixels: true,
      },
      sourceName: 'portrait.png',
    });
    expect(activeProjectPaletteSpy).not.toHaveBeenCalled();
  });

  it('uses the first 255 colors from an oversized selected palette', async () => {
    const colors = Array.from(
      { length: MAX_GUIDE_COLORS + 1 },
      (_, index) => `#${index.toString(16).padStart(6, '0')}`,
    );
    const saved = customPalette('oversized', 'Oversized', colors);
    loadCustomPalettesOrThrowMock.mockResolvedValueOnce([saved]);
    const element = await createDialog();
    chooseFile(element, new File(['pixels'], 'portrait.png', { type: 'image/png' }));
    await Promise.resolve();
    await vi.runAllTimersAsync();

    await selectPalette(element, 'custom:oversized');
    await vi.runAllTimersAsync();

    const adaptedColors = colors.slice(0, MAX_GUIDE_COLORS);
    expect(generateNumberedGuideMock).toHaveBeenLastCalledWith(sampledImage, {
      maxColors: undefined,
      palette: adaptedColors,
      mapping: 'color',
      simplifyIsolatedPixels: true,
    });
    const status = element.shadowRoot?.querySelector('#guided-palette-status');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.textContent).toContain('uses the first 255 colors');
    expect(status?.textContent).toContain('omits 1 additional color');

    element.shadowRoot?.querySelector<HTMLButtonElement>('button.primary')?.click();
    await settle(element);

    expect(createGuidedProjectMock).toHaveBeenCalledWith({
      guide,
      settings: {
        longSide: 24,
        paletteSource: 'restricted',
        maxColors: undefined,
        restrictedPalette: adaptedColors,
        mapping: 'color',
        simplifyIsolatedPixels: true,
      },
      sourceName: 'portrait.png',
    });
  });

  it('creates, edits, reorders, removes, saves, and selects a custom palette inline', async () => {
    const created = customPalette('new-palette', 'Forest', ['#0000ff', '#00ff00']);
    loadCustomPalettesOrThrowMock.mockResolvedValueOnce([]);
    saveAsNewPaletteMock.mockResolvedValueOnce(created);
    const element = await createDialog();
    chooseFile(element, new File(['pixels'], 'forest.png', { type: 'image/png' }));
    await Promise.resolve();
    await vi.runAllTimersAsync();

    const longSide = element.shadowRoot?.querySelector<HTMLInputElement>('#guided-long-side');
    if (longSide) {
      longSide.value = '32';
      longSide.dispatchEvent(new Event('change'));
    }
    await selectPalette(element, 'create');

    const name = element.shadowRoot?.querySelector<HTMLInputElement>('#guided-palette-name');
    expect(element.shadowRoot?.activeElement).toBe(name);
    if (name) {
      name.value = 'Forest';
      name.dispatchEvent(new Event('input'));
    }

    const firstColor = element.shadowRoot?.querySelector<HTMLInputElement>(
      'input[aria-label="Color 1"]',
    );
    if (firstColor) {
      firstColor.value = '#ff0000';
      firstColor.dispatchEvent(new Event('input'));
    }
    element.shadowRoot?.querySelector<HTMLButtonElement>('.palette-create-actions button')?.click();
    await settle(element);
    const secondColor = element.shadowRoot?.querySelector<HTMLInputElement>(
      'input[aria-label="Color 2"]',
    );
    if (secondColor) {
      secondColor.value = '#00ff00';
      secondColor.dispatchEvent(new Event('input'));
    }
    element.shadowRoot?.querySelector<HTMLButtonElement>('.palette-create-actions button')?.click();
    await settle(element);
    const thirdColor = element.shadowRoot?.querySelector<HTMLInputElement>(
      'input[aria-label="Color 3"]',
    );
    if (thirdColor) {
      thirdColor.value = '#0000ff';
      thirdColor.dispatchEvent(new Event('input'));
    }
    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[aria-label="Move color 3 up"]')
      ?.click();
    await settle(element);
    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[aria-label="Remove color 1"]')
      ?.click();
    await settle(element);

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[form="palette-creation-form"]')
      ?.click();
    await settle(element);
    await vi.runAllTimersAsync();

    expect(saveAsNewPaletteMock).toHaveBeenCalledWith('Forest', ['#0000ff', '#00ff00']);
    expect(loadCustomPalettesOrThrowMock).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot?.querySelector<HTMLSelectElement>(
      '#guided-palette-source',
    )?.value).toBe('custom:new-palette');
    expect(element.shadowRoot?.querySelector<HTMLInputElement>(
      '#guided-long-side',
    )?.value).toBe('32');
    expect(element.shadowRoot?.querySelector('#source-preview')).toBeTruthy();
    expect(generateNumberedGuideMock).toHaveBeenLastCalledWith(sampledImage, {
      maxColors: undefined,
      palette: ['#0000ff', '#00ff00'],
      mapping: 'color',
      simplifyIsolatedPixels: true,
    });
  });

  it('disables adding colors when a new palette reaches the persisted limit', async () => {
    const element = await createDialog();
    await selectPalette(element, 'create');
    const paletteState = element as unknown as { paletteColors: string[] };
    paletteState.paletteColors = Array.from(
      { length: MAX_PALETTE_SIZE - 1 },
      () => '#000000',
    );
    await settle(element);

    const addColor = element.shadowRoot?.querySelector<HTMLButtonElement>(
      '.palette-create-actions button',
    );
    addColor?.click();
    await settle(element);

    expect(paletteState.paletteColors).toHaveLength(MAX_PALETTE_SIZE);
    expect(addColor?.disabled).toBe(true);
    expect(element.shadowRoot?.querySelector('[role="status"]')?.textContent).toContain(
      '256 colors maximum',
    );

    addColor?.click();
    expect(paletteState.paletteColors).toHaveLength(MAX_PALETTE_SIZE);
  });

  it('rejects an oversized palette before persistence and focuses the error', async () => {
    const element = await createDialog();
    await selectPalette(element, 'create');
    const name = element.shadowRoot?.querySelector<HTMLInputElement>('#guided-palette-name');
    if (name) {
      name.value = 'Too many colors';
      name.dispatchEvent(new Event('input'));
    }
    const paletteState = element as unknown as { paletteColors: string[] };
    paletteState.paletteColors = Array.from(
      { length: MAX_PALETTE_SIZE + 1 },
      () => '#000000',
    );
    await settle(element);

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[form="palette-creation-form"]')
      ?.click();
    await settle(element);

    const error = element.shadowRoot?.querySelector<HTMLElement>(
      '#guided-palette-creation-status',
    );
    expect(saveAsNewPaletteMock).not.toHaveBeenCalled();
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('at most 256 colors');
    expect(error?.textContent).toContain('Remove 1 color');
    expect(element.shadowRoot?.activeElement).toBe(error);
  });

  it('cancels inline creation with Escape and restores the previous selection and focus', async () => {
    const element = await createDialog();
    await selectPalette(element, 'preset:pico8');
    const callsBeforeCreation = generateNumberedGuideMock.mock.calls.length;
    await selectPalette(element, 'create');
    const cancel = Array.from(element.shadowRoot?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.trim() === 'Cancel palette');

    cancel?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      composed: true,
    }));
    await settle(element);

    const select = element.shadowRoot?.querySelector<HTMLSelectElement>(
      '#guided-palette-source',
    );
    expect(element.open).toBe(true);
    expect(select?.value).toBe('preset:pico8');
    expect(element.shadowRoot?.activeElement).toBe(select);
    expect(generateNumberedGuideMock).toHaveBeenCalledTimes(callsBeforeCreation);
    expect(element.shadowRoot?.textContent).toContain('Palette creation cancelled.');
  });

  it('keeps Guided creation open until its explicit cancel action is used', async () => {
    const element = await createDialog();
    await selectPalette(element, 'create');
    const shell = element.shadowRoot?.querySelector<PFDialog>('pf-dialog');
    await shell?.updateComplete;

    expect(shell?.closeOnBackdrop).toBe(false);
    expect(shell?.closeOnEscape).toBe(false);
    expect(shell?.showCloseButton).toBe(false);
    expect(shell?.shadowRoot?.querySelector('.close-btn')).toBeNull();

    shell?.shadowRoot
      ?.querySelector<HTMLElement>('.overlay')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle(element);

    expect(element.open).toBe(true);
    expect(element.shadowRoot?.querySelector('#palette-creation-form')).toBeTruthy();
    expect(element.shadowRoot?.textContent).toContain('Cancel palette');
  });

  it('shows a recoverable save error without losing source or setup state', async () => {
    const saved = customPalette('new-palette', 'Retry palette', ['#000000']);
    loadCustomPalettesOrThrowMock.mockResolvedValueOnce([]);
    saveAsNewPaletteMock
      .mockRejectedValueOnce(new Error('IndexedDB write failed'))
      .mockResolvedValueOnce(saved);
    const element = await createDialog();
    chooseFile(element, new File(['pixels'], 'source.png', { type: 'image/png' }));
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await selectPalette(element, 'create');
    const name = element.shadowRoot?.querySelector<HTMLInputElement>('#guided-palette-name');
    if (name) {
      name.value = 'Retry palette';
      name.dispatchEvent(new Event('input'));
    }

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[form="palette-creation-form"]')
      ?.click();
    await settle(element);

    expect(element.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain(
      'Palette could not be saved',
    );
    expect(element.shadowRoot?.querySelector<HTMLInputElement>(
      '#guided-palette-name',
    )?.value).toBe('Retry palette');
    expect(element.shadowRoot?.querySelector('#palette-creation-form')).toBeTruthy();

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[form="palette-creation-form"]')
      ?.click();
    await settle(element);
    await vi.runAllTimersAsync();

    expect(saveAsNewPaletteMock).toHaveBeenCalledTimes(2);
    expect(loadCustomPalettesOrThrowMock).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot?.querySelector('#source-preview')).toBeTruthy();
    expect(element.shadowRoot?.querySelector<HTMLSelectElement>(
      '#guided-palette-source',
    )?.value).toBe('custom:new-palette');
  });

  it('announces palette loading failures while keeping preset choices available', async () => {
    let rejectLoad: ((reason: Error) => void) | undefined;
    loadCustomPalettesOrThrowMock.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectLoad = reject;
    }));
    const element = await createDialog();
    const select = element.shadowRoot?.querySelector<HTMLSelectElement>(
      '#guided-palette-source',
    );

    expect(select?.disabled).toBe(true);
    expect(element.shadowRoot?.textContent).toContain('Loading saved palettes…');

    rejectLoad?.(new Error('IndexedDB unavailable'));
    await settle(element);

    expect(select?.disabled).toBe(false);
    expect(element.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain(
      'Saved palettes could not be loaded',
    );
    expect(Array.from(select?.options ?? []).map((option) => option.textContent)).toContain(
      'PICO-8',
    );
  });

  it('retains a selected custom palette when a later palette reload fails', async () => {
    const saved = customPalette('night', 'Night colors', ['#101020', '#f0f0ff']);
    loadCustomPalettesOrThrowMock
      .mockResolvedValueOnce([saved])
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    const element = await createDialog();
    chooseFile(element, new File(['pixels'], 'portrait.png', { type: 'image/png' }));
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await selectPalette(element, 'custom:night');
    await vi.runAllTimersAsync();

    element.open = false;
    await settle(element);
    element.open = true;
    await settle(element);

    const select = element.shadowRoot?.querySelector<HTMLSelectElement>(
      '#guided-palette-source',
    );
    expect(select?.value).toBe('custom:night');
    expect(Array.from(select?.options ?? []).map((option) => option.textContent)).toContain(
      'Night colors',
    );
    expect(element.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain(
      'Saved palettes could not be loaded',
    );

    element.shadowRoot?.querySelector<HTMLButtonElement>('button.primary')?.click();
    await settle(element);

    expect(createGuidedProjectMock).toHaveBeenCalledWith({
      guide,
      settings: {
        longSide: 24,
        paletteSource: 'restricted',
        maxColors: undefined,
        restrictedPalette: ['#101020', '#f0f0ff'],
        mapping: 'color',
        simplifyIsolatedPixels: true,
      },
      sourceName: 'portrait.png',
    });
  });

  it('waits for a selected custom palette to reload before creating a project', async () => {
    const saved = customPalette('night', 'Night colors', ['#101020', '#f0f0ff']);
    const updatedColors = Array.from(
      { length: MAX_GUIDE_COLORS + 1 },
      (_, index) => `#${index.toString(16).padStart(6, '0')}`,
    );
    const updated = customPalette('night', 'Updated night colors', updatedColors);
    let resolveReload: ((palettes: CustomPalette[]) => void) | undefined;
    loadCustomPalettesOrThrowMock
      .mockResolvedValueOnce([saved])
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveReload = resolve;
      }));
    const element = await createDialog();
    const file = new File(['pixels'], 'portrait.png', { type: 'image/png' });
    chooseFile(element, file);
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await selectPalette(element, 'custom:night');
    await vi.runAllTimersAsync();

    element.open = false;
    await settle(element);
    element.open = true;
    await settle(element);

    const create = element.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[form="guided-project-form"]',
    );
    expect(create?.disabled).toBe(true);

    create?.click();
    element.shadowRoot?.querySelector<HTMLFormElement>('#guided-project-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle(element);

    expect(createGuidedProjectMock).not.toHaveBeenCalled();

    resolveReload?.([updated]);
    await settle(element);
    await vi.runAllTimersAsync();
    await settle(element);

    const adaptedColors = updatedColors.slice(0, MAX_GUIDE_COLORS);
    const select = element.shadowRoot?.querySelector<HTMLSelectElement>(
      '#guided-palette-source',
    );
    expect(select?.value).toBe('custom:night');
    expect(Array.from(select?.options ?? []).map((option) => option.textContent)).toContain(
      'Updated night colors',
    );
    expect(generateNumberedGuideMock).toHaveBeenLastCalledWith(sampledImage, {
      maxColors: undefined,
      palette: adaptedColors,
      mapping: 'color',
      simplifyIsolatedPixels: true,
    });
    expect(element.shadowRoot?.querySelector('#guided-palette-status')?.textContent).toContain(
      'uses the first 255 colors',
    );
    expect(create?.disabled).toBe(false);

    create?.click();
    await settle(element);

    expect(createGuidedProjectMock).toHaveBeenCalledWith({
      guide,
      settings: {
        longSide: 24,
        paletteSource: 'restricted',
        maxColors: undefined,
        restrictedPalette: adaptedColors,
        mapping: 'color',
        simplifyIsolatedPixels: true,
      },
      sourceName: file.name,
    });
  });

  it('blocks duplicate palette saves while persistence is pending', async () => {
    const pendingPalette = customPalette(
      'new-palette',
      'Pending palette',
      ['#000000'],
    );
    let resolveSave: ((palette: CustomPalette) => void) | undefined;
    saveAsNewPaletteMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    loadCustomPalettesOrThrowMock.mockResolvedValueOnce([]);
    const element = await createDialog();
    await selectPalette(element, 'create');
    const name = element.shadowRoot?.querySelector<HTMLInputElement>('#guided-palette-name');
    if (name) {
      name.value = 'Pending palette';
      name.dispatchEvent(new Event('input'));
    }
    const save = element.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[form="palette-creation-form"]',
    );
    const color = element.shadowRoot?.querySelector<HTMLInputElement>(
      'input[aria-label="Color 1"]',
    );

    save?.click();
    save?.click();
    await settle(element);

    expect(saveAsNewPaletteMock).toHaveBeenCalledTimes(1);
    expect(save?.disabled).toBe(true);
    expect(save?.textContent).toContain('Saving…');
    expect(name?.disabled).toBe(true);
    expect(color?.disabled).toBe(true);

    save?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      composed: true,
    }));
    await settle(element);

    expect(element.shadowRoot?.querySelector('#palette-creation-form')).toBeTruthy();
    expect(saveAsNewPaletteMock).toHaveBeenCalledTimes(1);

    resolveSave?.(pendingPalette);
    await settle(element);
    expect(loadCustomPalettesOrThrowMock).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot?.querySelector<HTMLSelectElement>(
      '#guided-palette-source',
    )?.value).toBe('custom:new-palette');
  });

  it('ignores a stale image decode after a newer file is selected', async () => {
    const element = await createDialog();
    const firstImage = { ...sourceImage, width: 10 } as ImageData;
    const secondImage = { ...sourceImage, width: 20 } as ImageData;
    let resolveFirst: ((image: ImageData) => void) | undefined;
    decodeImageFileMock
      .mockImplementationOnce(() => new Promise<ImageData>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce(secondImage);

    chooseFile(element, new File(['first'], 'first.png', { type: 'image/png' }));
    chooseFile(element, new File(['second'], 'second.png', { type: 'image/png' }));
    await Promise.resolve();
    resolveFirst?.(firstImage);
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(sampleImageToGridMock).toHaveBeenCalledTimes(1);
    expect(sampleImageToGridMock).toHaveBeenCalledWith(secondImage, {
      longSide: 24,
    });
  });

  it('keeps the dialog open when project creation reaches the workspace limit', async () => {
    const element = await createDialog();
    createGuidedProjectMock.mockResolvedValue({
      ok: false,
      reason: 'tab-limit-reached',
      message: 'Workspace limit reached.',
    });

    chooseFile(element, new File(['pixels'], 'portrait.png', { type: 'image/png' }));
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await settle(element);
    element.shadowRoot?.querySelector<HTMLButtonElement>('button.primary')?.click();
    await settle(element);

    expect(element.open).toBe(true);
    expect(element.shadowRoot?.textContent).toContain('Workspace limit reached.');
  });
});
