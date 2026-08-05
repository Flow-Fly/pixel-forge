import type {
  NormalizedProjectFileInput,
  NormalizedProjectLayerFileInput,
  ProjectFile,
  ProjectFileDecodeResult,
  ProjectLayerFile,
} from './project.js';

export function migrateProjectFileForLoad(file: NormalizedProjectFileInput): ProjectFile {
  return migrateProjectFileForLoadWithDiagnostics(file).project;
}

export function migrateProjectFileForLoadWithDiagnostics(
  file: NormalizedProjectFileInput
): ProjectFileDecodeResult {
  const fileWithoutEphemeral = stripEphemeralPalette(file);
  const fileWithPalette = shouldFoldEphemeralPalette(file)
    ? foldLegacyEphemeralPalette(file, fileWithoutEphemeral)
    : fileWithoutEphemeral;
  const { layers, repairedParentLayerIds } = normalizeProjectLayers(fileWithPalette.layers);

  return {
    project: {
      ...fileWithPalette,
      layers,
      frames: fileWithPalette.frames.map((frame) => ({
        ...frame,
        cels: frame.cels.map((cel) => ({
          ...cel,
          opacity: cel.opacity ?? 100,
        })),
      })),
    },
    compatibility: { repairedParentLayerIds },
  };
}

function shouldFoldEphemeralPalette(file: NormalizedProjectFileInput): boolean {
  return (
    compareVersions(file.version, '4.0.0') < 0 &&
    Array.isArray(file.ephemeralPalette) &&
    file.ephemeralPalette.length > 0
  );
}

function stripEphemeralPalette(
  file: NormalizedProjectFileInput
): Omit<NormalizedProjectFileInput, 'ephemeralPalette'> {
  const { ephemeralPalette: _ephemeralPalette, ...currentFile } = file;
  return currentFile;
}

function foldLegacyEphemeralPalette(
  file: NormalizedProjectFileInput,
  fileWithoutEphemeral: Omit<NormalizedProjectFileInput, 'ephemeralPalette'>
): Omit<NormalizedProjectFileInput, 'ephemeralPalette'> {
  const basePalette = Array.isArray(file.palette) ? file.palette : [];
  const legacyPalette = file.ephemeralPalette ?? [];
  const { palette, oldIndexToNewIndex } = foldEphemeralPalette(basePalette, legacyPalette);

  return {
    ...fileWithoutEphemeral,
    palette,
    frames: remapLegacyEphemeralIndices(file.frames, oldIndexToNewIndex),
  };
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
  frames: NormalizedProjectFileInput['frames'],
  oldIndexToNewIndex: Map<number, number>
): NormalizedProjectFileInput['frames'] {
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

function normalizeProjectLayers(
  layers: NormalizedProjectLayerFileInput[]
): { layers: ProjectLayerFile[]; repairedParentLayerIds: string[] } {
  const layersById = new Map(layers.map((layer) => [layer.id, layer]));
  const acceptedParentIds = new Map<string, string | null>();
  const repairedParentLayerIds: string[] = [];

  const normalizedLayers = layers.map((layer) => {
    const parentId = normalizeParentId(layer, layersById, acceptedParentIds);
    if (parentId === null && layer.parentId !== undefined && layer.parentId !== null) {
      repairedParentLayerIds.push(layer.id);
    }
    acceptedParentIds.set(layer.id, parentId);

    return {
      ...layer,
      type: layer.type ?? 'image',
      locked: layer.locked ?? false,
      parentId,
    };
  });

  return { layers: normalizedLayers, repairedParentLayerIds };
}

function normalizeParentId(
  layer: NormalizedProjectLayerFileInput,
  layersById: Map<string, NormalizedProjectLayerFileInput>,
  acceptedParentIds: Map<string, string | null>
): string | null {
  const parentId = layer.parentId;
  if (parentId === undefined || parentId === null) return null;

  const parent = layersById.get(parentId);
  if (!parent || parent.type !== 'group' || parentId === layer.id) return null;
  if (wouldCloseParentCycle(layer.id, parentId, acceptedParentIds)) return null;

  return parentId;
}

function wouldCloseParentCycle(
  layerId: string,
  parentId: string,
  acceptedParentIds: Map<string, string | null>
): boolean {
  let currentParentId: string | null = parentId;

  while (currentParentId) {
    if (currentParentId === layerId) return true;
    currentParentId = acceptedParentIds.get(currentParentId) ?? null;
  }

  return false;
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
