import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const decodeImageFileMock = vi.hoisted(() => vi.fn());
const sampleImageToGridMock = vi.hoisted(() => vi.fn());
const generateNumberedGuideMock = vi.hoisted(() => vi.fn());
const createGuidedProjectMock = vi.hoisted(() => vi.fn());

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

import '../../../src/components/dialogs/pf-paint-by-number-dialog';
import type { PFPaintByNumberDialog } from '../../../src/components/dialogs/pf-paint-by-number-dialog';

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
