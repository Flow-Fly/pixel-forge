import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const decodeImageFileMock = vi.hoisted(() => vi.fn());
const sampleImageToGridMock = vi.hoisted(() => vi.fn());
const generateNumberedGuideMock = vi.hoisted(() => vi.fn());
const createGuidedProjectMock = vi.hoisted(() => vi.fn());
const loadCustomPalettesMock = vi.hoisted(() => vi.fn());
const saveAsNewPaletteMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/paint-by-number/image-file', () => ({
  decodeImageFile: decodeImageFileMock,
}));

vi.mock('../../../src/services/paint-by-number/image-sampling', () => ({
  sampleImageToGrid: sampleImageToGridMock,
}));

vi.mock('../../../src/services/paint-by-number/guide-generator', () => ({
  generateNumberedGuide: generateNumberedGuideMock,
}));

vi.mock('../../../src/services/paint-by-number/guided-project', () => ({
  createGuidedProject: createGuidedProjectMock,
}));

vi.mock('../../../src/stores/palette/persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/stores/palette/persistence')>()),
  loadCustomPalettes: loadCustomPalettesMock,
  saveAsNewPalette: saveAsNewPaletteMock,
}));

import '../../../src/components/dialogs/pf-paint-by-number-dialog';
import type { PFPaintByNumberDialog } from '../../../src/components/dialogs/pf-paint-by-number-dialog';
import { PRESET_PALETTES } from '../../../src/data/preset-palettes';
import type { CustomPalette } from '../../../src/types/palette';

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
    loadCustomPalettesMock.mockResolvedValue([]);
    saveAsNewPaletteMock.mockResolvedValue('new-palette');
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
    const saved = customPalette('night', 'Night colors', ['#101020', '#f0f0ff']);
    loadCustomPalettesMock.mockResolvedValue([saved]);
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
  });

  it('creates, edits, reorders, removes, saves, and selects a custom palette inline', async () => {
    const created = customPalette('new-palette', 'Forest', ['#0000ff', '#00ff00']);
    loadCustomPalettesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([created]);
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

  it('cancels inline creation with Escape and restores the previous selection and focus', async () => {
    const element = await createDialog();
    await selectPalette(element, 'preset:pico8');
    const callsBeforeCreation = generateNumberedGuideMock.mock.calls.length;
    await selectPalette(element, 'create');
    const name = element.shadowRoot?.querySelector<HTMLInputElement>('#guided-palette-name');

    name?.dispatchEvent(new KeyboardEvent('keydown', {
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

  it('shows a recoverable persistence error without losing source or setup state', async () => {
    loadCustomPalettesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        customPalette('new-palette', 'Retry palette', ['#000000']),
      ]);
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
    expect(element.shadowRoot?.querySelector('#source-preview')).toBeTruthy();
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
