/**
 * Palette persistence (localStorage and IndexedDB).
 */

import { palettePersistence } from '../../services/persistence/palette-persistence';
import type { CustomPalette } from '../../types/palette';
import { PALETTE_BY_ID } from './types';

// ==========================================
// LocalStorage Keys
// ==========================================

const STORAGE_KEYS = {
  COLORS: 'pf-palette-colors',
  PRESET_ID: 'pf-palette-preset-id',
  CUSTOM_ID: 'pf-palette-custom-id',
  NAME: 'pf-palette-name',
} as const;

// ==========================================
// LocalStorage Operations
// ==========================================

export interface StoredPaletteState {
  colors: string[];
  presetId: string | null;
  customId: string | null;
  cachedName: string | null;
}

/**
 * Load palette state from localStorage.
 */
export function loadFromStorage(): StoredPaletteState {
  let colors: string[] = [];

  const saved = localStorage.getItem(STORAGE_KEYS.COLORS);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        colors = parsed;
      }
    } catch {
      // Invalid JSON, use defaults
    }
  }

  const presetId = localStorage.getItem(STORAGE_KEYS.PRESET_ID) || null;
  const customId = localStorage.getItem(STORAGE_KEYS.CUSTOM_ID) || null;
  const cachedName = localStorage.getItem(STORAGE_KEYS.NAME) || null;

  return {
    colors,
    presetId: presetId || null,
    customId: customId || null,
    cachedName,
  };
}

/**
 * Save palette state to localStorage.
 */
export function saveToStorage(
  colors: string[],
  presetId: string | null,
  customId: string | null,
  paletteName: string
): void {
  localStorage.setItem(STORAGE_KEYS.COLORS, JSON.stringify(colors));
  localStorage.setItem(STORAGE_KEYS.PRESET_ID, presetId ?? '');
  localStorage.setItem(STORAGE_KEYS.CUSTOM_ID, customId ?? '');
  localStorage.setItem(STORAGE_KEYS.NAME, paletteName);
}

// ==========================================
// Custom Palette CRUD (IndexedDB)
// ==========================================

/**
 * Load all custom palettes from IndexedDB.
 */
export async function loadCustomPalettes(): Promise<CustomPalette[]> {
  return palettePersistence.getAllPalettes();
}

/**
 * Save current palette as a new custom palette.
 */
export async function saveAsNewPalette(
  name: string,
  colors: string[]
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const palette: CustomPalette = {
    id,
    name: name.trim() || 'Untitled Palette',
    colors: [...colors],
    createdAt: now,
    updatedAt: now,
  };

  await palettePersistence.savePalette(palette);
  return id;
}

/**
 * Update an existing custom palette.
 */
export async function updatePalette(
  id: string,
  updates: Partial<Pick<CustomPalette, 'name' | 'colors'>>
): Promise<void> {
  await palettePersistence.updatePalette(id, updates);
}

/**
 * Delete a custom palette.
 */
export async function deletePalette(id: string): Promise<void> {
  await palettePersistence.deletePalette(id);
}

/**
 * Rename a custom palette.
 */
export async function renamePalette(id: string, newName: string): Promise<void> {
  await palettePersistence.updatePalette(id, { name: newName.trim() });
}

// ==========================================
// Palette Name Resolution
// ==========================================

/**
 * Get the display name for a palette.
 */
export function getPaletteName(
  presetId: string | null,
  customId: string | null,
  customPalettes: CustomPalette[],
  cachedName: string | null
): string {
  if (customId) {
    const palette = customPalettes.find(p => p.id === customId);
    if (palette) {
      return palette.name;
    }
    // Custom palettes not loaded yet - use cached name from localStorage
    if (cachedName) {
      return cachedName;
    }
    return 'Loading...';
  }

  if (presetId) {
    const preset = PALETTE_BY_ID.get(presetId);
    if (preset) {
      return preset.name;
    }
    // Fallback to cached name if preset lookup fails
    if (cachedName) {
      return cachedName;
    }
    return 'Unknown Palette';
  }

  // No palette selected - use cached name or default
  if (cachedName) {
    return cachedName;
  }
  return 'Untitled Palette';
}
