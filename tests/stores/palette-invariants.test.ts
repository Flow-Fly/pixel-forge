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
    paletteStore.clearEphemeralColors(true);
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

  it('drawing with a main-palette color does not create ephemeral colors', () => {
    const before = paletteStore.ephemeralColors.value.length;
    const index = paletteStore.getOrAddColorForDrawing('#ff0000');

    expect(index).toBe(paletteStore.getColorIndex('#ff0000'));
    expect(paletteStore.ephemeralColors.value).toHaveLength(before);
  });

  it('drawing with an unknown color adds it as ephemeral, resolvable by index', () => {
    const index = paletteStore.getOrAddColorForDrawing('#123456');

    expect(paletteStore.ephemeralColors.value).toContain('#123456');
    expect(paletteStore.isEphemeralColor('#123456')).toBe(true);
    expect(paletteStore.isMainPaletteColor('#123456')).toBe(false);
    expect(paletteStore.getColorByIndex(index)).toBe('#123456');
  });

  it('drawing twice with the same unknown color reuses the ephemeral entry', () => {
    const first = paletteStore.getOrAddColorForDrawing('#123456');
    const second = paletteStore.getOrAddColorForDrawing('#123456');

    expect(second).toBe(first);
    expect(
      paletteStore.ephemeralColors.value.filter((c) => c === '#123456')
    ).toHaveLength(1);
  });

  it('promoting an ephemeral color moves it into the main palette', () => {
    paletteStore.getOrAddColorForDrawing('#123456');
    const newIndex = paletteStore.promoteEphemeralColor('#123456');

    expect(paletteStore.ephemeralColors.value).not.toContain('#123456');
    expect(paletteStore.mainColors.value).toContain('#123456');
    expect(paletteStore.isMainPaletteColor('#123456')).toBe(true);
    expect(paletteStore.getColorByIndex(newIndex)).toBe('#123456');
  });

  it('promoteAllEphemeralColors empties the ephemeral stack into main', () => {
    paletteStore.getOrAddColorForDrawing('#111111');
    paletteStore.getOrAddColorForDrawing('#222222');

    paletteStore.promoteAllEphemeralColors();

    expect(paletteStore.ephemeralColors.value).toHaveLength(0);
    expect(paletteStore.mainColors.value).toEqual(
      expect.arrayContaining([...BASE, '#111111', '#222222'])
    );
  });

  it('clearEphemeralColors leaves the main palette untouched', () => {
    paletteStore.getOrAddColorForDrawing('#123456');
    paletteStore.clearEphemeralColors(true);

    expect(paletteStore.ephemeralColors.value).toHaveLength(0);
    expect(paletteStore.mainColors.value).toEqual(BASE);
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
