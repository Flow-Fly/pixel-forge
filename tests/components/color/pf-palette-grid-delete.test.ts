import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// happy-dom has neither IndexedDB nor canvas encoding — mock the boundaries.
vi.mock('../../../src/services/persistence/indexed-db', () => ({
  projectRepository: {
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    getLastOpenedProjectId: vi.fn(async () => null),
    setLastOpenedProjectId: vi.fn(async () => {}),
  },
}));

vi.mock('../../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

vi.mock('../../../src/utils/canvas-binary', () => ({
  canvasToPngBytes: vi.fn(async () => new Uint8Array([1])),
  loadImageDataToCanvas: vi.fn(async () => {}),
}));

import '../../../src/components/color/palette-panel/pf-palette-grid';
import { animationStore } from '../../../src/stores/animation';
import { historyStore } from '../../../src/stores/history';
import { paletteStore } from '../../../src/stores/palette';
import type { Cel } from '../../../src/types/animation';

type PaletteGridElement = HTMLElement & { updateComplete: Promise<void> };

class FakeCanvasContext {
  readonly canvas: HTMLCanvasElement;

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.canvas = {
      width,
      height,
      getContext: () => this,
    } as unknown as HTMLCanvasElement;
  }

  createImageData(width: number, height: number): ImageData {
    return {
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    } as ImageData;
  }

  getImageData(_x: number, _y: number, width: number, height: number): ImageData {
    return {
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    } as ImageData;
  }

  putImageData() {}
}

let showModal: ReturnType<typeof vi.fn>;
let originalShowModal: HTMLDialogElement['showModal'] | undefined;

function makeCanvas(pixelCount: number): HTMLCanvasElement {
  return new FakeCanvasContext(pixelCount, 1).canvas;
}

function setIndexedCel(indexBuffer: Uint8Array) {
  const cels = new Map<string, Cel>();
  cels.set('layer-a:frame-a', {
    id: 'cel-layer-a-frame-a',
    layerId: 'layer-a',
    frameId: 'frame-a',
    canvas: makeCanvas(indexBuffer.length),
    indexBuffer,
  });
  animationStore.cels.value = cels;
}

function createPaletteGrid() {
  const grid = document.createElement('pf-palette-grid') as PaletteGridElement;
  document.body.append(grid);
  return grid;
}

function getDeleteButton(grid: PaletteGridElement, swatchIndex: number) {
  const buttons = grid.shadowRoot?.querySelectorAll<HTMLButtonElement>(
    '.swatch-delete'
  );
  const button = buttons?.[swatchIndex];
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

async function clickDelete(grid: PaletteGridElement, swatchIndex: number) {
  getDeleteButton(grid, swatchIndex).click();
  await Promise.resolve();
  await Promise.resolve();
  await grid.updateComplete;
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

describe('pf-palette-grid delete color flow', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    historyStore.clear();
    paletteStore.clearAllNewFlags();
    paletteStore.setPalette(['#000000', '#111111', '#ffffff']);
    setIndexedCel(new Uint8Array([0]));

    originalShowModal = HTMLDialogElement.prototype.showModal;
    showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.showModal = showModal;
  });

  afterEach(() => {
    if (originalShowModal) {
      HTMLDialogElement.prototype.showModal = originalShowModal;
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('deletes an unused color without opening the replacement dialog', async () => {
    setIndexedCel(new Uint8Array([1, 3, 0]));
    const grid = createPaletteGrid();
    await grid.updateComplete;

    await clickDelete(grid, 1);

    expect(showModal).not.toHaveBeenCalled();
    expect(paletteStore.mainColors.value).toEqual(['#000000', '#ffffff']);
    expect(historyStore.undoStack.value).toHaveLength(1);
  });

  it('opens the replacement dialog when the color is used', async () => {
    setIndexedCel(new Uint8Array([1, 2, 0]));
    const grid = createPaletteGrid();
    await grid.updateComplete;

    await clickDelete(grid, 1);

    const dialogText = normalizeText(
      grid.shadowRoot?.querySelector('dialog')?.textContent ?? ''
    );
    expect(showModal).toHaveBeenCalledOnce();
    expect(dialogText).toContain('Used in 1 pixels across 1 frames.');
    expect(dialogText).toContain('Replace with nearest palette color');
    expect(paletteStore.mainColors.value).toEqual([
      '#000000',
      '#111111',
      '#ffffff',
    ]);
  });
});
