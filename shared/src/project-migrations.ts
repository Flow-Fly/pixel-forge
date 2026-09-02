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
  const {
    palette,
    paletteEntries,
    repairedPaletteEntryIds,
  } = normalizePaletteEntries(fileWithPalette);
  const { layers, repairedParentLayerIds } = normalizeProjectLayers(fileWithPalette.layers);
  const { frames, repairedCelIds } = normalizeCelIds(fileWithPalette.frames);

  const projectWithoutPaletteEntries = {
    ...fileWithPalette,
    layers,
    frames,
  };
  const projectWithIdentities = {
    ...projectWithoutPaletteEntries,
    ...(palette === undefined ? {} : { palette }),
    paletteEntries: paletteEntries ?? [],
  };
  const project: ProjectFile = {
    ...projectWithIdentities,
    frames: projectWithIdentities.frames.map((frame) => ({
      ...frame,
      cels: frame.cels.map((cel) => ({
        ...cel,
        opacity: cel.opacity ?? 100,
      })),
    })),
  };

  return {
    project,
    compatibility: {
      repairedParentLayerIds,
      repairedCelIds,
      repairedPaletteEntryIds,
    },
  };
}

type NormalizedPalette = {
  palette?: string[];
  paletteEntries?: NonNullable<ProjectFile['paletteEntries']>;
  repairedPaletteEntryIds: string[];
};

type NormalizedCelWithIdentity = Omit<
  NormalizedProjectFileInput['frames'][number]['cels'][number],
  'id'
> & {
  id: string;
};

type NormalizedFrameWithIdentities = Omit<
  NormalizedProjectFileInput['frames'][number],
  'cels'
> & {
  cels: NormalizedCelWithIdentity[];
};

function normalizePaletteEntries(file: NormalizedProjectFileInput): NormalizedPalette {
  const sourcePalette = Array.isArray(file.palette) ? file.palette : undefined;
  const sourceEntries = file.paletteEntries;

  if (sourcePalette === undefined && sourceEntries === undefined) {
    return { repairedPaletteEntryIds: [] };
  }

  const palette = sourcePalette ?? sourceEntries!.map((entry) => entry.color);
  if (sourceEntries && sourcePalette && sourceEntries.length !== sourcePalette.length) {
    throw new Error('Invalid project file: palette entries must match palette colors');
  }

  const reservedIds = new Set(
    palette
      .map((_color, index) => sourceEntries?.[index]?.id)
      .filter(isUsableIdentity)
  );
  const usedIds = new Set<string>();
  const repairedPaletteEntryIds: string[] = [];
  const paletteEntries = palette.map((color, index) => {
    const sourceEntry = sourceEntries?.[index];
    if (sourceEntry && sourceEntry.color !== color) {
      throw new Error('Invalid project file: palette entry color does not match palette');
    }

    const sourceId = sourceEntry?.id;
    const id = isUsableIdentity(sourceId) && !usedIds.has(sourceId)
      ? sourceId
      : createDeterministicIdentity(
          'palette',
          `${index}:${color}`,
          new Set([...usedIds, ...reservedIds])
        );
    if (id !== sourceEntry?.id) repairedPaletteEntryIds.push(id);
    usedIds.add(id);

    return {
      ...sourceEntry,
      id,
      color,
    };
  });

  return { palette, paletteEntries, repairedPaletteEntryIds };
}

function normalizeCelIds(
  frames: NormalizedProjectFileInput['frames']
): { frames: NormalizedFrameWithIdentities[]; repairedCelIds: string[] } {
  const reservedIds = new Set(
    frames.flatMap((frame) => frame.cels.map((cel) => cel.id)).filter(isUsableIdentity)
  );
  const usedIds = new Set<string>();
  const repairedCelIds: string[] = [];
  const normalizedFrames: NormalizedFrameWithIdentities[] = frames.map((frame) => ({
    ...frame,
    cels: frame.cels.map((cel, celIndex) => {
      const id = isUsableIdentity(cel.id) && !usedIds.has(cel.id)
        ? cel.id
        : createDeterministicIdentity(
            'cel',
            `${frame.id}:${cel.layerId}:${celIndex}`,
            new Set([...usedIds, ...reservedIds])
          );
      if (id !== cel.id) repairedCelIds.push(id);
      usedIds.add(id);
      return { ...cel, id };
    }),
  }));

  return { frames: normalizedFrames, repairedCelIds };
}

function isUsableIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function createDeterministicIdentity(
  kind: string,
  source: string,
  usedIds: ReadonlySet<string>
): string {
  const base = `pf-${kind}-${hashIdentitySource(`${kind}:${source}`)}`;
  let candidate = base;
  let suffix = 1;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function hashIdentitySource(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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
  const existingEntries = fileWithoutEphemeral.paletteEntries ?? [];

  return {
    ...fileWithoutEphemeral,
    palette,
    paletteEntries: palette.map((color, index) => ({
      ...existingEntries[index],
      color,
    })),
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

function normalizeProjectLayers(layers: NormalizedProjectLayerFileInput[]): {
  layers: ProjectLayerFile[];
  repairedParentLayerIds: string[];
} {
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
