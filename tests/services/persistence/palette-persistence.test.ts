import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  getAllFromIndex: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
}));
const openDatabase = vi.hoisted(() => vi.fn(() => Promise.resolve(database)));
const logError = vi.hoisted(() => vi.fn());

vi.mock('idb', () => ({
  openDB: openDatabase,
}));

vi.mock('../../../src/utils/log', () => ({
  log: {
    error: logError,
  },
}));

import { palettePersistence } from '../../../src/services/persistence/palette-persistence';
import type { StoredCustomPalette } from '../../../src/types/palette';

const palette: StoredCustomPalette = {
  id: 'saved-palette',
  name: 'Saved palette',
  colors: ['#112233'],
  createdAt: 1,
  updatedAt: 1,
};

describe('palettePersistence.savePalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true after IndexedDB accepts the palette', async () => {
    database.put.mockResolvedValueOnce('saved-palette');

    await expect(palettePersistence.savePalette(palette)).resolves.toBe(true);
    expect(database.put).toHaveBeenCalledWith('palettes', palette);
  });

  it('returns false when IndexedDB rejects the write', async () => {
    const error = new Error('IndexedDB unavailable');
    database.put.mockRejectedValueOnce(error);

    await expect(palettePersistence.savePalette(palette)).resolves.toBe(false);
    expect(logError).toHaveBeenCalledWith(
      'Failed to save palette to IndexedDB:',
      error,
    );
  });
});

describe('palettePersistence.updatePalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true after IndexedDB updates an existing palette', async () => {
    database.get.mockResolvedValueOnce(palette);
    database.put.mockResolvedValueOnce('saved-palette');

    await expect(
      palettePersistence.updatePalette('saved-palette', { name: 'Renamed palette' }),
    ).resolves.toBe(true);
    expect(database.put).toHaveBeenCalledWith('palettes', {
      ...palette,
      name: 'Renamed palette',
      updatedAt: expect.any(Number),
    });
  });

  it('returns false when IndexedDB rejects the update', async () => {
    const error = new Error('IndexedDB unavailable');
    database.get.mockResolvedValueOnce(palette);
    database.put.mockRejectedValueOnce(error);

    await expect(
      palettePersistence.updatePalette('saved-palette', { name: 'Renamed palette' }),
    ).resolves.toBe(false);
    expect(logError).toHaveBeenCalledWith(
      'Failed to update palette in IndexedDB:',
      error,
    );
  });
});

describe('palettePersistence palette loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes IndexedDB failures to failure-aware callers', async () => {
    const error = new Error('IndexedDB unavailable');
    database.getAllFromIndex.mockRejectedValueOnce(error);

    await expect(palettePersistence.getAllPalettesOrThrow()).rejects.toBe(error);
  });

  it('preserves the safe empty fallback for existing callers', async () => {
    const error = new Error('IndexedDB unavailable');
    database.getAllFromIndex.mockRejectedValueOnce(error);

    await expect(palettePersistence.getAllPalettes()).resolves.toEqual([]);
    expect(logError).toHaveBeenCalledWith(
      'Failed to load palettes from IndexedDB:',
      error,
    );
  });
});
