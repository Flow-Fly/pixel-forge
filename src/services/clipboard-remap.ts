import { normalizeHex } from '../stores/palette/color-utils';
import { findClosestColorIndex } from '../stores/palette/indexed-color';
import { MAX_PALETTE_SIZE } from '../stores/palette/types';

export interface ClipboardPaletteRemapOptions {
  indexData: Uint8Array;
  sourceColors: string[];
  targetColors: string[];
  maxPaletteSize?: number;
}

export interface ClipboardPaletteRemapPlan {
  remappedIndexData: Uint8Array;
  colorsToAppend: string[];
}

interface RemapState {
  targetIndexByColor: Map<string, number>;
  effectiveTargetColors: string[];
  colorsToAppend: string[];
  sourceToTargetIndex: Map<number, number>;
  maxPaletteSize: number;
}

function buildFirstIndexByColor(colors: string[]): Map<string, number> {
  const indexes = new Map<string, number>();

  colors.forEach((color, index) => {
    const normalized = normalizeHex(color);
    if (!indexes.has(normalized)) {
      indexes.set(normalized, index + 1);
    }
  });

  return indexes;
}

function getSourceColor(sourceIndex: number, sourceColors: string[]): string | undefined {
  if (sourceIndex <= 0) return undefined;
  return sourceColors[sourceIndex - 1];
}

function planMissingColor(normalizedColor: string, state: RemapState): number {
  if (state.effectiveTargetColors.length >= state.maxPaletteSize) {
    return state.effectiveTargetColors.length === 0
      ? 0
      : findClosestColorIndex(normalizedColor, state.effectiveTargetColors);
  }

  state.effectiveTargetColors.push(normalizedColor);
  const targetIndex = state.effectiveTargetColors.length;
  state.targetIndexByColor.set(normalizedColor, targetIndex);
  state.colorsToAppend.push(normalizedColor);
  return targetIndex;
}

function getTargetIndex(normalizedColor: string, state: RemapState): number {
  return state.targetIndexByColor.get(normalizedColor) ?? planMissingColor(normalizedColor, state);
}

function mapSourceIndex(sourceIndex: number, sourceColors: string[], state: RemapState): number {
  if (sourceIndex === 0) return 0;

  const cachedTargetIndex = state.sourceToTargetIndex.get(sourceIndex);
  if (cachedTargetIndex !== undefined) return cachedTargetIndex;

  const sourceColor = getSourceColor(sourceIndex, sourceColors);
  const targetIndex = sourceColor ? getTargetIndex(normalizeHex(sourceColor), state) : 0;

  state.sourceToTargetIndex.set(sourceIndex, targetIndex);
  return targetIndex;
}

export function remapClipboardPaletteIndices({
  indexData,
  sourceColors,
  targetColors,
  maxPaletteSize = MAX_PALETTE_SIZE,
}: ClipboardPaletteRemapOptions): ClipboardPaletteRemapPlan {
  const normalizedTargetColors = targetColors.map(normalizeHex);
  const state: RemapState = {
    targetIndexByColor: buildFirstIndexByColor(normalizedTargetColors),
    effectiveTargetColors: [...normalizedTargetColors],
    colorsToAppend: [],
    sourceToTargetIndex: new Map(),
    maxPaletteSize,
  };
  const remappedIndexData = new Uint8Array(indexData.length);

  for (let i = 0; i < indexData.length; i++) {
    remappedIndexData[i] = mapSourceIndex(indexData[i], sourceColors, state);
  }

  return {
    remappedIndexData,
    colorsToAppend: state.colorsToAppend,
  };
}
