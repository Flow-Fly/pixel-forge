import { beforeEach, describe, expect, it, vi } from 'vitest';

const savePalette = vi.hoisted(() => vi.fn());
const getAllPalettesOrThrow = vi.hoisted(() => vi.fn());
const updatePalette = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/persistence/palette-persistence', () => ({
  palettePersistence: {
    getAllPalettesOrThrow,
    savePalette,
    updatePalette,
  },
}));

import {
  loadCustomPalettesOrThrow,
  renamePalette,
  saveAsNewPalette,
} from '../../src/stores/palette/persistence';

describe('palette persistence helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the saved record after a confirmed write', async () => {
    const colors = ['#112233', '#abcdef'];
    savePalette.mockResolvedValueOnce(true);

    const palette = await saveAsNewPalette('  Forest  ', colors);

    expect(palette).toMatchObject({
      name: 'Forest',
      colors,
    });
    expect(palette.id).toEqual(expect.any(String));
    expect(palette.createdAt).toEqual(expect.any(Number));
    expect(palette.updatedAt).toBe(palette.createdAt);
    expect(palette.colors).not.toBe(colors);
    expect(savePalette).toHaveBeenCalledWith(palette);
  });

  it('throws when the persistence service reports a failed write', async () => {
    savePalette.mockResolvedValueOnce(false);

    await expect(saveAsNewPalette('Forest', ['#112233'])).rejects.toThrow(
      'Palette could not be saved.',
    );
  });

  it('preserves storage failures for failure-aware callers', async () => {
    const error = new Error('IndexedDB unavailable');
    getAllPalettesOrThrow.mockRejectedValueOnce(error);

    await expect(loadCustomPalettesOrThrow()).rejects.toBe(error);
  });

  it('resolves a rename after the update is persisted', async () => {
    updatePalette.mockResolvedValueOnce(true);

    await expect(renamePalette('saved-palette', '  Forest  ')).resolves.toBeUndefined();
    expect(updatePalette).toHaveBeenCalledWith('saved-palette', { name: 'Forest' });
  });

  it('rejects a rename when the update is not persisted', async () => {
    updatePalette.mockResolvedValueOnce(false);

    await expect(renamePalette('saved-palette', 'Forest')).rejects.toThrow(
      'Palette could not be renamed.',
    );
  });
});
