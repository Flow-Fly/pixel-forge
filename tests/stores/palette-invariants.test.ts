import { describe, it, expect, vi, beforeEach } from 'vitest';

// happy-dom has neither IndexedDB nor canvas encoding — mock the boundaries.
vi.mock('../../src/services/persistence/indexed-db', () => ({
  projectRepository: {
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    getLastOpenedProjectId: vi.fn(async () => null),
    setLastOpenedProjectId: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    savePalette: vi.fn(async () => {}),
    getAllPalettes: vi.fn(async () => []),
    deletePalette: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/utils/canvas-binary', () => ({
  canvasToPngBytes: vi.fn(async () => new Uint8Array([1])),
  loadImageDataToCanvas: vi.fn(async () => {}),
}));

import { paletteStore } from '../../src/stores/palette';

const BASE = ['#000000', '#ff0000', '#00ff00', '#0000ff'];

describe('PaletteStore invariants', () => {
  beforeEach(() => {
    paletteStore.clearAllNewFlags();
    paletteStore.setPalette([...BASE]);
  });

  it('index <-> color mapping is a bijection over the main palette', () => {
    for (const color of BASE) {
      const index = paletteStore.getColorIndex(color);
      expect(index).toBeGreaterThan(0); // 0 is reserved for transparent
      expect(paletteStore.getColorByIndex(index)).toBe(color);
    }
  });

  it('color lookup is case-insensitive (normalized hex)', () => {
    expect(paletteStore.getColorIndex('#FF0000')).toBe(
      paletteStore.getColorIndex('#ff0000')
    );
  });

  it('drawing with a main-palette color returns its existing index', () => {
    const before = paletteStore.mainColors.value.length;
    const index = paletteStore.getOrAddColorForDrawing('#ff0000');

    expect(index).toBe(paletteStore.getColorIndex('#ff0000'));
    expect(paletteStore.mainColors.value).toHaveLength(before);
    expect(paletteStore.isNewColor('#ff0000')).toBe(false);
  });

  it('drawing with an unknown color appends it to the palette and flags it new', () => {
    const index = paletteStore.getOrAddColorForDrawing('#123456');

    expect(index).toBe(BASE.length + 1);
    expect(paletteStore.mainColors.value).toEqual([...BASE, '#123456']);
    expect(paletteStore.isNewColor('#123456')).toBe(true);
    expect(paletteStore.isMainPaletteColor('#123456')).toBe(true);
    expect(paletteStore.getColorByIndex(index)).toBe('#123456');
  });

  it('adding an existing color is a no-op and returns the existing index', () => {
    const existingIndex = paletteStore.getColorIndex('#ff0000');

    const addedIndex = paletteStore.addColor('#FF0000', { flagNew: true });

    expect(addedIndex).toBe(existingIndex);
    expect(paletteStore.mainColors.value).toEqual(BASE);
    expect(paletteStore.isNewColor('#ff0000')).toBe(false);
  });

  it('drawing twice with the same unknown color reuses the palette entry', () => {
    const first = paletteStore.getOrAddColorForDrawing('#123456');
    const second = paletteStore.getOrAddColorForDrawing('#123456');

    expect(second).toBe(first);
    expect(
      paletteStore.mainColors.value.filter((c) => c === '#123456')
    ).toHaveLength(1);
  });

  it('appending a drawing color keeps existing palette indices stable', () => {
    const redIndex = paletteStore.getColorIndex('#ff0000');
    const greenIndex = paletteStore.getColorIndex('#00ff00');

    paletteStore.getOrAddColorForDrawing('#123456');

    expect(paletteStore.getColorIndex('#ff0000')).toBe(redIndex);
    expect(paletteStore.getColorIndex('#00ff00')).toBe(greenIndex);
    expect(paletteStore.getColorByIndex(redIndex)).toBe('#ff0000');
    expect(paletteStore.getColorByIndex(greenIndex)).toBe('#00ff00');
  });

  it('new color flags are session UI state cleared explicitly, not by drawing undo', () => {
    paletteStore.getOrAddColorForDrawing('#123456');

    // Drawing undo restores pixels through drawing commands only. The palette
    // entry remains real, so the UI badge stays attached until the UI clears it.
    expect(paletteStore.isNewColor('#123456')).toBe(true);

    paletteStore.clearNewFlag('#123456');

    expect(paletteStore.isNewColor('#123456')).toBe(false);
    expect(paletteStore.mainColors.value).toContain('#123456');
  });

  it('setPalette rebuilds the color map (stale indices do not survive)', () => {
    const redBefore = paletteStore.getColorIndex('#ff0000');
    expect(redBefore).toBeGreaterThan(0);

    paletteStore.setPalette(['#ffffff', '#ff0000']);

    const redAfter = paletteStore.getColorIndex('#ff0000');
    expect(paletteStore.getColorByIndex(redAfter)).toBe('#ff0000');
    expect(paletteStore.getColorIndex('#00ff00')).toBeLessThanOrEqual(0);
  });

  it('addColor appends; removeColorByIndex removes and keeps mapping coherent', () => {
    paletteStore.addColor('#abcdef');
    expect(paletteStore.mainColors.value).toContain('#abcdef');
    const idx = paletteStore.getColorIndex('#abcdef');
    expect(paletteStore.getColorByIndex(idx)).toBe('#abcdef');

    // removeColorByIndex takes a 1-based palette index (0 = transparent)
    paletteStore.removeColorByIndex(paletteStore.getColorIndex('#ff0000'));
    expect(paletteStore.mainColors.value).not.toContain('#ff0000');
    for (const color of paletteStore.mainColors.value) {
      expect(paletteStore.getColorByIndex(paletteStore.getColorIndex(color))).toBe(color);
    }
  });
});
