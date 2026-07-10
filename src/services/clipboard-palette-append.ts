import { normalizeHex } from '../stores/palette/color-utils';

interface PaletteSignal<T> {
  value: T;
}

export interface ClipboardPaletteAppendTarget {
  mainColors: PaletteSignal<string[]>;
  addColor(color: string, options?: { flagNew?: boolean }): number;
}

export interface ClipboardPaletteAppendResult {
  targetColors: string[];
  appendedColors: string[];
  appendedIndices: number[];
}

function normalizedPaletteSet(colors: string[]): Set<string> {
  return new Set(colors.map(normalizeHex));
}

export function applyClipboardPaletteAppendPlan(
  target: ClipboardPaletteAppendTarget,
  colorsToAppend: string[]
): ClipboardPaletteAppendResult {
  const existingColors = normalizedPaletteSet(target.mainColors.value);
  const appendedColors: string[] = [];
  const appendedIndices: number[] = [];

  for (const color of colorsToAppend) {
    const normalized = normalizeHex(color);
    if (existingColors.has(normalized)) continue;

    const beforeLength = target.mainColors.value.length;
    const targetIndex = target.addColor(normalized, { flagNew: true });
    if (target.mainColors.value.length === beforeLength) continue;

    existingColors.add(normalized);
    appendedColors.push(normalized);
    appendedIndices.push(targetIndex);
  }

  return {
    targetColors: [...target.mainColors.value],
    appendedColors,
    appendedIndices,
  };
}
