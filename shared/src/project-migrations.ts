import type { LegacyProjectFile, ProjectFile, ProjectFrameFile } from './project';

export function migrateProjectFileForLoad(file: LegacyProjectFile): ProjectFile {
  const fileWithoutEphemeral = stripEphemeralPalette(file);
  if (!shouldFoldEphemeralPalette(file)) return fileWithoutEphemeral;

  const basePalette = Array.isArray(file.palette) ? file.palette : [];
  const legacyPalette = file.ephemeralPalette ?? [];
  const { palette, oldIndexToNewIndex } = foldEphemeralPalette(basePalette, legacyPalette);

  return {
    ...fileWithoutEphemeral,
    palette,
    frames: remapLegacyEphemeralIndices(file.frames, oldIndexToNewIndex),
  };
}

function shouldFoldEphemeralPalette(file: LegacyProjectFile): boolean {
  return (
    compareVersions(file.version, '4.0.0') < 0 &&
    Array.isArray(file.ephemeralPalette) &&
    file.ephemeralPalette.length > 0
  );
}

function stripEphemeralPalette(file: LegacyProjectFile): ProjectFile {
  const currentFile = { ...file };
  delete currentFile.ephemeralPalette;
  return currentFile;
}

function foldEphemeralPalette(
  basePalette: string[],
  legacyPalette: string[]
): { palette: string[]; oldIndexToNewIndex: Map<number, number> } {
  const palette = basePalette.map(normalizeHex);
  const colorToIndex = new Map<string, number>();
  const oldIndexToNewIndex = new Map<number, number>();

  palette.forEach((color, index) => {
    if (!colorToIndex.has(color)) colorToIndex.set(color, index + 1);
  });

  legacyPalette.forEach((color, index) => {
    const oldIndex = basePalette.length + index + 1;
    const normalized = normalizeHex(color);
    const existingIndex = colorToIndex.get(normalized);

    if (existingIndex !== undefined) {
      oldIndexToNewIndex.set(oldIndex, existingIndex);
      return;
    }

    palette.push(normalized);
    const newIndex = palette.length;
    colorToIndex.set(normalized, newIndex);
    oldIndexToNewIndex.set(oldIndex, newIndex);
  });

  return { palette, oldIndexToNewIndex };
}

function remapLegacyEphemeralIndices(
  frames: ProjectFrameFile[],
  oldIndexToNewIndex: Map<number, number>
): ProjectFrameFile[] {
  if (oldIndexToNewIndex.size === 0) return frames;

  return frames.map((frame) => ({
    ...frame,
    cels: frame.cels.map((cel) => ({
      ...cel,
      indexData: cel.indexData
        ? cel.indexData.map((index) => oldIndexToNewIndex.get(index) ?? index)
        : cel.indexData,
    })),
  }));
}

function normalizeHex(hex: string): string {
  const clean = hex.replace('#', '').toLowerCase();
  if (clean.length === 3) {
    return `#${clean
      .split('')
      .map((character) => character + character)
      .join('')}`;
  }
  return `#${clean}`;
}

function compareVersions(a: string, b: string): number {
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);

  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    const difference = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

function parseVersion(version: string): number[] {
  return version
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}
