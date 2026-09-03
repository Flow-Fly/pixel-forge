import type { ProjectContext } from '../stores/project-context';
import type { ProjectChangeDomain } from '../stores/project-store';
import type { ProjectPaletteSnapshot } from '../stores/palette/store';
import type { Cel } from '../types/animation';
import type { BlendMode, Layer } from '../types/layer';
import { rebuildCanvasFromIndices } from '../utils/indexed-color';
import { hexToRgb, normalizeHex } from '../stores/palette/color-utils';
import { estimateCelPayloadBytes } from './payload-memory';
import {
  STATIC_LAYER_TREE_COMMAND_ID,
  STATIC_PALETTE_COMMAND_ID,
  STATIC_STRUCTURE_MAX_CELS,
  STATIC_STRUCTURE_MAX_FRAMES,
  STATIC_STRUCTURE_MAX_LAYERS,
  STATIC_STRUCTURE_MAX_PALETTE_ENTRIES,
  STATIC_STRUCTURE_MAX_PREPARATION_BYTES,
  STATIC_STRUCTURE_SELECTION_ERROR_REASON,
  PROJECT_OBSERVATION_LIMITS,
} from './catalog';
import {
  hasOnlyKeys,
  isRecord,
  type EditorError,
  type ProjectTarget,
} from './contracts';

const STATIC_STRUCTURE_DOMAINS: readonly ProjectChangeDomain[] = Object.freeze([
  'palette',
  'layer-state',
]);

const STATIC_PALETTE_KIND = 'palette.declaration';
const STATIC_LAYER_TREE_KIND = 'layer-tree.declaration';

export interface StaticPaletteDeclaration {
  readonly kind: typeof STATIC_PALETTE_KIND;
  readonly entries: readonly StaticPaletteEntry[];
}

export interface StaticPaletteEntry {
  readonly id: string;
  readonly color: string;
}

export interface StaticLayerTreeDeclaration {
  readonly kind: typeof STATIC_LAYER_TREE_KIND;
  readonly layers: readonly StaticLayerDeclaration[];
}

export interface StaticLayerDeclaration {
  readonly id: string;
  readonly name: string;
  readonly type: 'image' | 'group';
  readonly parentId: string | null;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: BlendMode;
  readonly continuous?: boolean;
}

export interface StaticStructureChildInput {
  readonly command: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface StaticStructurePreparationOptions {
  readonly entityIdFactory?: () => string;
}

export interface StaticStructureRequest {
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly palette: StaticPaletteDeclaration;
  readonly layerTree: StaticLayerTreeDeclaration;
}

interface StaticStructureSnapshot {
  readonly layers: readonly Layer[];
  readonly cels: ReadonlyMap<string, Cel>;
  readonly palette: ProjectPaletteSnapshot;
  readonly activeLayerId: string | null;
  readonly groupData: ReadonlyMap<string, Uint8Array>;
}

export interface PreparedStaticStructureChange {
  readonly request: StaticStructureRequest;
  readonly before: StaticStructureSnapshot;
  readonly after: StaticStructureSnapshot;
  readonly domains: readonly ProjectChangeDomain[];
  readonly snapshotBytes: number;
}

class StaticStructureError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'StaticStructureError';
    this.editorError = editorError;
  }
}

/**
 * Prepare the one palette declaration and one ordered layer tree together.
 * No project store is assigned until every identity, hierarchy, payload, and
 * destructive-safety check below has succeeded.
 */
export function prepareStaticStructureChange(
  context: ProjectContext,
  children: readonly StaticStructureChildInput[],
  target: ProjectTarget,
  expectedRevision: number,
  options: StaticStructurePreparationOptions = {},
): PreparedStaticStructureChange {
  validateTargetAndRevision(context, target, expectedRevision);
  const request = normalizeStaticStructureRequest(children, target, expectedRevision);
  const before = captureSnapshot(context, false);
  validateExistingLayerTypes(before.layers);
  validatePaletteDeclaration(before.palette, request.palette);
  validateLayerDeclaration(before.layers, request.layerTree.layers);
  validateLayerRemovals(context, before, request.layerTree.layers);

  const paletteChanged = !samePalette(before.palette, request.palette);
  const snapshotBytes = validatePreparationBounds(
    context,
    before,
    request.layerTree.layers,
    paletteChanged,
  );
  const beforeWithGroupData: StaticStructureSnapshot = {
    ...before,
    groupData: context.project.captureLoadedGroupLayerData(),
  };
  const afterPalette = createAfterPalette(before.palette, request.palette, paletteChanged);
  const afterCels = createAfterCels(
    context,
    beforeWithGroupData,
    request.layerTree.layers,
    afterPalette,
    paletteChanged,
    options.entityIdFactory,
  );
  const afterLayers = createAfterLayers(
    context,
    beforeWithGroupData.layers,
    request.layerTree.layers,
    afterCels,
  );
  const afterGroupData = createAfterGroupData(beforeWithGroupData.groupData, request.layerTree.layers);
  const after: StaticStructureSnapshot = {
    layers: afterLayers,
    cels: afterCels,
    palette: afterPalette,
    activeLayerId: chooseActiveLayerId(before.activeLayerId, afterLayers),
    groupData: afterGroupData,
  };

  if (sameSnapshot(beforeWithGroupData, after)) {
    throw staticError('invalid_request', false, { reason: 'no_change' });
  }

  return {
    request,
    before: beforeWithGroupData,
    after,
    domains: STATIC_STRUCTURE_DOMAINS,
    snapshotBytes,
  };
}

export function applyPreparedStaticStructureChange(
  context: ProjectContext,
  prepared: PreparedStaticStructureChange,
  phase: 'before' | 'after',
): void {
  const snapshot = phase === 'after' ? prepared.after : prepared.before;
  context.project.applyStaticStructureState(
    snapshot.layers,
    new Map(snapshot.cels),
    snapshot.palette,
    snapshot.activeLayerId,
    snapshot.groupData,
  );
}

export function assertPreparedStaticStructureChange(
  context: ProjectContext,
  prepared: PreparedStaticStructureChange,
  phase: 'before' | 'after',
): void {
  const expected = phase === 'after' ? prepared.after : prepared.before;
  if (!sameSnapshot(captureSnapshot(context), expected)) {
    throw staticError('revision_conflict', true, { reason: 'history_structure_changed' });
  }
}

function validateTargetAndRevision(
  context: ProjectContext,
  target: ProjectTarget,
  expectedRevision: number,
): void {
  if (context.isDisposed || context.project.id.value !== target.projectId) {
    throw staticError('target_not_found', true);
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw staticError('invalid_request', false, { reason: 'expected_revision' });
  }
  if (context.project.revision.value !== expectedRevision) {
    throw staticError('revision_conflict', true, {
      expectedRevision,
      currentRevision: context.project.revision.value,
    });
  }
  if (context.guidedDrawing.active) {
    throw staticError('unsupported', false, { feature: 'guided-drawing-static-structure' });
  }
  const selectionType = context.selection.state.value.type;
  if (selectionType === 'floating' || selectionType === 'transforming') {
    throw staticError('invalid_state', false, { reason: STATIC_STRUCTURE_SELECTION_ERROR_REASON });
  }
}

// fallow-ignore-next-line complexity -- The bounded two-child structure schema keeps command-family validation explicit.
function normalizeStaticStructureRequest(
  children: readonly StaticStructureChildInput[],
  target: ProjectTarget,
  expectedRevision: number,
): StaticStructureRequest {
  if (children.length !== 2) {
    throw staticError('invalid_request', false, { reason: 'static_children_count' });
  }

  let palette: StaticPaletteDeclaration | undefined;
  let layerTree: StaticLayerTreeDeclaration | undefined;
  for (const child of children) {
    if (!isRecord(child) || typeof child.command !== 'string' || !isRecord(child.input)) {
      throw staticError('invalid_request', false, { reason: 'static_child' });
    }
    if (child.command === STATIC_PALETTE_COMMAND_ID) {
      if (palette) throw staticError('invalid_request', false, { reason: 'static_child_family' });
      palette = normalizePaletteDeclaration(child.input);
      continue;
    }
    if (child.command === STATIC_LAYER_TREE_COMMAND_ID) {
      if (layerTree) throw staticError('invalid_request', false, { reason: 'static_child_family' });
      layerTree = normalizeLayerTreeDeclaration(child.input);
      continue;
    }
    throw staticError('unsupported', false, { reason: 'static_child_command' });
  }

  if (!palette || !layerTree) {
    throw staticError('invalid_request', false, { reason: 'static_child_family' });
  }
  return { target, expectedRevision, palette, layerTree };
}

function normalizePaletteDeclaration(input: Record<string, unknown>): StaticPaletteDeclaration {
  assertExactKeys(input, ['kind', 'entries'], 'palette_input');
  if (input.kind !== STATIC_PALETTE_KIND || !Array.isArray(input.entries)) {
    throw staticError('invalid_request', false, { reason: 'palette_input' });
  }
  return {
    kind: STATIC_PALETTE_KIND,
    entries: input.entries.map(normalizePaletteEntry),
  };
}

function normalizePaletteEntry(value: unknown): StaticPaletteEntry {
  if (!isRecord(value)) throw staticError('invalid_request', false, { reason: 'palette_entry' });
  assertExactKeys(value, ['id', 'color'], 'palette_entry');
  return {
    id: requiredBoundedString(value.id, 'palette_entry_id'),
    color: requiredColor(value.color),
  };
}

function normalizeLayerTreeDeclaration(input: Record<string, unknown>): StaticLayerTreeDeclaration {
  assertExactKeys(input, ['kind', 'layers'], 'layer_tree_input');
  if (input.kind !== STATIC_LAYER_TREE_KIND || !Array.isArray(input.layers)) {
    throw staticError('invalid_request', false, { reason: 'layer_tree_input' });
  }
  return {
    kind: STATIC_LAYER_TREE_KIND,
    layers: input.layers.map(normalizeLayerDeclaration),
  };
}

// fallow-ignore-next-line complexity -- Layer declarations validate every persisted structural field before mutation.
function normalizeLayerDeclaration(value: unknown): StaticLayerDeclaration {
  if (!isRecord(value)) throw staticError('invalid_request', false, { reason: 'layer_declaration' });
  assertExactKeys(value, [
    'id',
    'name',
    'type',
    'parentId',
    'visible',
    'locked',
    'opacity',
    'blendMode',
    'continuous',
  ], 'layer_declaration');
  if (value.type !== 'image' && value.type !== 'group') {
    throw staticError('unsupported', false, { reason: 'layer_type' });
  }
  if (value.parentId !== null && typeof value.parentId !== 'string') {
    throw staticError('invalid_request', false, { reason: 'parent_id' });
  }
  if (typeof value.visible !== 'boolean' || typeof value.locked !== 'boolean') {
    throw staticError('invalid_request', false, { reason: 'layer_state' });
  }
  const opacity = value.opacity;
  if (typeof opacity !== 'number' || !Number.isSafeInteger(opacity) || opacity < 0 || opacity > 255) {
    throw staticError('invalid_request', false, { reason: 'opacity' });
  }
  if (!isBlendMode(value.blendMode)) {
    throw staticError('invalid_request', false, { reason: 'blend_mode' });
  }
  return {
    id: requiredBoundedString(value.id, 'layer_id'),
    name: requiredName(value.name),
    type: value.type,
    parentId: value.parentId,
    visible: value.visible,
    locked: value.locked,
    opacity,
    blendMode: value.blendMode,
    ...(value.continuous === undefined
      ? {}
      : { continuous: requiredBoolean(value.continuous, 'continuous') }),
  };
}

function validateExistingLayerTypes(layers: readonly Layer[]): void {
  if (layers.some((layer) => layer.type !== 'image' && layer.type !== 'group')) {
    throw staticError('unsupported', false, { reason: 'existing_layer_type' });
  }
}

function validatePaletteDeclaration(
  before: ProjectPaletteSnapshot,
  declaration: StaticPaletteDeclaration,
): void {
  if (declaration.entries.length === 0 || declaration.entries.length > STATIC_STRUCTURE_MAX_PALETTE_ENTRIES) {
    throw staticError('limit_exceeded', false, {
      reason: 'palette_entries',
      max: STATIC_STRUCTURE_MAX_PALETTE_ENTRIES,
    });
  }
  const ids = new Set<string>();
  for (const entry of declaration.entries) {
    if (ids.has(entry.id)) throw staticError('invalid_request', false, { reason: 'palette_identity' });
    ids.add(entry.id);
  }
  for (const entry of before.entries) {
    if (entry.id === '') throw staticError('invalid_state', false, { reason: 'palette_identity' });
    if (entry.color !== normalizeHex(entry.color)) {
      throw staticError('invalid_state', false, { reason: 'palette_color' });
    }
  }
  // A used entry may not be removed or recolored. The pixel check itself is
  // performed against every cel before creating the after snapshot.
}

function validateLayerDeclaration(
  before: readonly Layer[],
  declaration: readonly StaticLayerDeclaration[],
): void {
  if (declaration.length === 0 || declaration.length > STATIC_STRUCTURE_MAX_LAYERS) {
    throw staticError('limit_exceeded', false, {
      reason: 'layers',
      max: STATIC_STRUCTURE_MAX_LAYERS,
    });
  }
  if (!declaration.some((layer) => layer.type === 'image')) {
    throw staticError('invalid_state', false, { reason: 'image_layer_required' });
  }

  const ids = new Set<string>();
  const existingById = new Map(before.map((layer) => [layer.id, layer]));
  const groups = new Set(declaration.filter((layer) => layer.type === 'group').map((layer) => layer.id));
  declaration.forEach((layer, index) => {
    if (ids.has(layer.id)) throw staticError('invalid_request', false, { reason: 'layer_identity' });
    ids.add(layer.id);
    if (layer.parentId !== null) {
      if (!groups.has(layer.parentId)) {
        throw staticError('invalid_request', false, { reason: 'parent_id' });
      }
      const parentIndex = declaration.findIndex((candidate) => candidate.id === layer.parentId);
      if (parentIndex < 0 || parentIndex >= index) {
        throw staticError('invalid_request', false, { reason: 'parent_order' });
      }
    }
    const existing = existingById.get(layer.id);
    if (existing && existing.type !== layer.type) {
      throw staticError('invalid_state', false, { reason: 'layer_type_change' });
    }
  });
}

// fallow-ignore-next-line complexity -- Removal safety keeps child, payload, and compatibility checks in one preflight.
function validateLayerRemovals(
  context: ProjectContext,
  before: StaticStructureSnapshot,
  declaration: readonly StaticLayerDeclaration[],
): void {
  const retained = new Set(declaration.map((layer) => layer.id));
  for (const layer of before.layers) {
    if (retained.has(layer.id)) continue;
    if (layer.type === 'group') {
      if (before.layers.some((candidate) => candidate.parentId === layer.id && retained.has(candidate.id))) {
        throw staticError('invalid_state', false, { reason: 'non_empty_layer_removal' });
      }
      if (!isLayerEmpty(before, layer.id)) {
        throw staticError('invalid_state', false, { reason: 'non_empty_layer_removal' });
      }
      if (context.project.getLoadedGroupLayerDataByteLength(layer.id) > 0) {
        throw staticError('invalid_state', false, { reason: 'non_empty_layer_removal' });
      }
      continue;
    }
    if (!isLayerEmpty(before, layer.id)) {
      throw staticError('invalid_state', false, { reason: 'non_empty_layer_removal' });
    }
  }
}

function validatePreparationBounds(
  context: ProjectContext,
  before: StaticStructureSnapshot,
  declaration: readonly StaticLayerDeclaration[],
  paletteChanged: boolean,
): number {
  const frameCount = context.animation.frames.value.length;
  if (frameCount > STATIC_STRUCTURE_MAX_FRAMES) {
    throw staticError('limit_exceeded', false, {
      reason: 'static_preparation_frames',
      max: STATIC_STRUCTURE_MAX_FRAMES,
    });
  }

  const existingLayerIds = new Set(before.layers.map((layer) => layer.id));
  const newLayerCount = declaration.filter((layer) => !existingLayerIds.has(layer.id)).length;
  const preparationCelCount = before.cels.size + (newLayerCount * frameCount);
  if (preparationCelCount > STATIC_STRUCTURE_MAX_CELS) {
    throw staticError('limit_exceeded', false, {
      reason: 'static_preparation_cels',
      max: STATIC_STRUCTURE_MAX_CELS,
    });
  }

  const canvasBytes = context.project.width.value * context.project.height.value * 4;
  if (!Number.isSafeInteger(canvasBytes) || canvasBytes < 0) {
    throw staticError('limit_exceeded', false, {
      reason: 'static_preparation_bytes',
      max: STATIC_STRUCTURE_MAX_PREPARATION_BYTES,
    });
  }
  const celBytes = estimateCelPayloadBytes(before.cels);
  const groupBytes = context.project.getLoadedGroupLayerDataByteLength();
  const newCelBytes = newLayerCount * frameCount * canvasBytes;
  const afterPayloadBytes = (paletteChanged ? celBytes : 0) + groupBytes + newCelBytes;
  const snapshotBytes = celBytes + groupBytes + afterPayloadBytes;
  if (!Number.isSafeInteger(snapshotBytes) || snapshotBytes > STATIC_STRUCTURE_MAX_PREPARATION_BYTES) {
    throw staticError('limit_exceeded', false, {
      reason: 'static_preparation_bytes',
      max: STATIC_STRUCTURE_MAX_PREPARATION_BYTES,
    });
  }
  return snapshotBytes;
}

function createAfterPalette(
  before: ProjectPaletteSnapshot,
  declaration: StaticPaletteDeclaration,
  changed: boolean,
): ProjectPaletteSnapshot {
  if (!changed) return before;
  const entries = declaration.entries.map((entry) => ({ ...entry }));
  return {
    colors: entries.map((entry) => entry.color),
    entries,
    currentPresetId: null,
    currentCustomPaletteId: null,
    isDirty: true,
    newColorFlags: [],
  };
}

// fallow-ignore-next-line complexity -- Bounded cel creation keeps identity validation and allocation atomic.
function createAfterCels(
  context: ProjectContext,
  before: StaticStructureSnapshot,
  declaration: readonly StaticLayerDeclaration[],
  afterPalette: ProjectPaletteSnapshot,
  paletteChanged: boolean,
  entityIdFactory: () => string = () => crypto.randomUUID(),
): Map<string, Cel> {
  const retained = new Set(declaration.map((layer) => layer.id));
  const after = paletteChanged
    ? cloneAndRemapCels(before.cels, before.palette, afterPalette)
    : new Map(before.cels);

  for (const key of [...after.keys()]) {
    const cel = after.get(key);
    if (cel && !retained.has(cel.layerId)) after.delete(key);
  }

  const existing = new Set(before.layers.map((layer) => layer.id));
  const celIds = new Set([...before.cels.values()].map((cel) => cel.id));
  for (const layer of declaration) {
    if (existing.has(layer.id)) continue;
    for (const frame of context.animation.frames.value) {
      const celId = entityIdFactory();
      if (typeof celId !== 'string' || celId.length === 0 || celIds.has(celId)) {
        throw staticError('invalid_state', false, { reason: 'cel_identity' });
      }
      celIds.add(celId);
      const canvas = createBlankCanvas(context.project.width.value, context.project.height.value);
      const cel: Cel = {
        id: celId,
        layerId: layer.id,
        frameId: frame.id,
        canvas,
      };
      after.set(context.animation.getCelKey(layer.id, frame.id), cel);
    }
  }
  return after;
}

function createAfterGroupData(
  before: ReadonlyMap<string, Uint8Array>,
  declaration: readonly StaticLayerDeclaration[],
): Map<string, Uint8Array> {
  const retainedGroups = new Set(
    declaration.filter((layer) => layer.type === 'group').map((layer) => layer.id),
  );
  const after = new Map<string, Uint8Array>();
  for (const [layerId, bytes] of before) {
    if (retainedGroups.has(layerId)) after.set(layerId, new Uint8Array(bytes));
  }
  return after;
}

function createAfterLayers(
  context: ProjectContext,
  before: readonly Layer[],
  declaration: readonly StaticLayerDeclaration[],
  cels: ReadonlyMap<string, Cel>,
): Layer[] {
  const beforeById = new Map(before.map((layer) => [layer.id, layer]));
  const currentFrameId = context.animation.currentFrameId.value;
  return declaration.map((declared) => {
    const existing = beforeById.get(declared.id);
    const cel = cels.get(context.animation.getCelKey(declared.id, currentFrameId));
    return {
      ...(existing ?? {}),
      id: declared.id,
      name: declared.name,
      type: declared.type,
      parentId: declared.parentId,
      visible: declared.visible,
      locked: declared.locked,
      opacity: declared.opacity,
      blendMode: declared.blendMode,
      continuous: declared.continuous ?? existing?.continuous ?? false,
      ...(cel ? { canvas: cel.canvas } : {}),
    };
  });
}

function chooseActiveLayerId(activeLayerId: string | null, layers: readonly Layer[]): string | null {
  if (activeLayerId && layers.some((layer) => layer.id === activeLayerId)) return activeLayerId;
  return layers.find((layer) => layer.type === 'image')?.id ?? layers[0]?.id ?? null;
}

// fallow-ignore-next-line complexity -- Indexed and RGBA payloads must be cloned and remapped together before commit.
function cloneAndRemapCels(
  cels: ReadonlyMap<string, Cel>,
  beforePalette: ProjectPaletteSnapshot,
  afterPalette: ProjectPaletteSnapshot,
): Map<string, Cel> {
  const after = new Map<string, Cel>();
  const canvasCopies = new Map<HTMLCanvasElement, HTMLCanvasElement>();
  const indexCopies = new Map<Uint8Array, Uint8Array>();
  const newIndexById = new Map(afterPalette.entries.map((entry, index) => [entry.id, index + 1]));
  const oldEntryByIndex = new Map(beforePalette.entries.map((entry, index) => [index + 1, entry]));

  for (const [key, cel] of cels) {
    const copiedCanvas = getCanvasCopy(cel.canvas, canvasCopies);
    let copiedIndex: Uint8Array | undefined;
    if (cel.indexBuffer) {
      copiedIndex = indexCopies.get(cel.indexBuffer);
      if (!copiedIndex) {
        copiedIndex = new Uint8Array(cel.indexBuffer.length);
        for (let index = 0; index < cel.indexBuffer.length; index++) {
          const oldIndex = cel.indexBuffer[index];
          if (oldIndex === 0) continue;
          const oldEntry = oldEntryByIndex.get(oldIndex);
          const nextIndex = oldEntry ? newIndexById.get(oldEntry.id) : undefined;
          if (!oldEntry || !nextIndex) {
            if (oldIndex > 0) {
              throw staticError('invalid_state', false, { reason: 'palette_used_entry' });
            }
            continue;
          }
          if (oldEntry.color !== afterPalette.entries[nextIndex - 1]?.color) {
            throw staticError('invalid_state', false, { reason: 'palette_used_entry' });
          }
          copiedIndex[index] = nextIndex;
        }
        indexCopies.set(cel.indexBuffer, copiedIndex);
      }
      validateCanvasMatchesIndices(cel.canvas, cel.indexBuffer, beforePalette.colors);
      rebuildCanvasFromIndices(copiedCanvas, copiedIndex, afterPalette.colors as string[]);
    } else if (hasOpaquePixels(cel.canvas)) {
      throw staticError('invalid_state', false, { reason: 'palette_unindexed_content' });
    }

    after.set(key, {
      ...cel,
      canvas: copiedCanvas,
      ...(copiedIndex ? { indexBuffer: copiedIndex } : {}),
    });
  }
  return after;
}

function captureSnapshot(context: ProjectContext, includeGroupData = true): StaticStructureSnapshot {
  return {
    layers: context.layers.layers.value.map(cloneLayer),
    cels: new Map(context.animation.cels.value),
    palette: context.palette.captureProjectSnapshot(),
    activeLayerId: context.layers.activeLayerId.value,
    groupData: includeGroupData ? context.project.captureLoadedGroupLayerData() : new Map(),
  };
}

function sameSnapshot(first: StaticStructureSnapshot, second: StaticStructureSnapshot): boolean {
  return sameLayerArrays(first.layers, second.layers)
    && first.activeLayerId === second.activeLayerId
    && samePaletteSnapshots(first.palette, second.palette)
    && sameCels(first.cels, second.cels)
    && sameGroupData(first.groupData, second.groupData);
}

function sameGroupData(
  first: ReadonlyMap<string, Uint8Array>,
  second: ReadonlyMap<string, Uint8Array>,
): boolean {
  if (first.size !== second.size) return false;
  for (const [layerId, bytes] of first) {
    const other = second.get(layerId);
    if (!other || !sameBytes(bytes, other)) return false;
  }
  return true;
}

function samePaletteSnapshots(
  first: ProjectPaletteSnapshot,
  second: ProjectPaletteSnapshot,
): boolean {
  return first.currentPresetId === second.currentPresetId
    && first.currentCustomPaletteId === second.currentCustomPaletteId
    && first.isDirty === second.isDirty
    && sameStrings(first.newColorFlags, second.newColorFlags)
    && first.colors.length === second.colors.length
    && first.colors.every((color, index) => color === second.colors[index])
    && first.entries.length === second.entries.length
    && first.entries.every((entry, index) => {
      const other = second.entries[index];
      return other?.id === entry.id && other.color === entry.color;
    });
}

function samePalette(
  before: ProjectPaletteSnapshot,
  declaration: StaticPaletteDeclaration,
): boolean {
  return before.entries.length === declaration.entries.length
    && before.entries.every((entry, index) => {
      const next = declaration.entries[index];
      return next?.id === entry.id && next.color === entry.color;
    });
}

// fallow-ignore-next-line complexity -- Snapshot equality compares every persisted layer field for rollback exactness.
function sameLayerArrays(first: readonly Layer[], second: readonly Layer[]): boolean {
  // fallow-ignore-next-line complexity -- Field-by-field equality is required for exact rollback snapshots.
  return first.length === second.length && first.every((layer, index) => {
    const other = second[index];
    return !!other
      && layer.id === other.id
      && layer.name === other.name
      && layer.type === other.type
      && layer.visible === other.visible
      && layer.locked === other.locked
      && layer.opacity === other.opacity
      && layer.blendMode === other.blendMode
      && (layer.continuous ?? false) === (other.continuous ?? false)
      && layer.parentId === other.parentId;
  });
}

// fallow-ignore-next-line complexity -- Snapshot equality compares identity, metadata, indices, and rendered pixels.
function sameCels(first: ReadonlyMap<string, Cel>, second: ReadonlyMap<string, Cel>): boolean {
  if (first.size !== second.size) return false;
  for (const [key, cel] of first) {
    const other = second.get(key);
    if (!other || cel.id !== other.id || cel.layerId !== other.layerId || cel.frameId !== other.frameId) {
      return false;
    }
    if (cel.linkedCelId !== other.linkedCelId || cel.linkType !== other.linkType || cel.opacity !== other.opacity) {
      return false;
    }
    if (!sameBytes(cel.indexBuffer, other.indexBuffer) || !sameCanvas(cel.canvas, other.canvas)) return false;
  }
  return true;
}

function sameBytes(first: Uint8Array | undefined, second: Uint8Array | undefined): boolean {
  if (!first || !second) return first === second;
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function sameCanvas(first: HTMLCanvasElement, second: HTMLCanvasElement): boolean {
  if (first.width !== second.width || first.height !== second.height) return false;
  const firstContext = first.getContext('2d', { willReadFrequently: true });
  const secondContext = second.getContext('2d', { willReadFrequently: true });
  if (!firstContext || !secondContext) return false;
  const firstPixels = firstContext.getImageData(0, 0, first.width, first.height).data;
  const secondPixels = secondContext.getImageData(0, 0, second.width, second.height).data;
  return firstPixels.length === secondPixels.length
    && firstPixels.every((value, index) => value === secondPixels[index]);
}

function cloneLayer(layer: Layer): Layer {
  return { ...layer };
}

function isLayerEmpty(snapshot: StaticStructureSnapshot, layerId: string): boolean {
  const layer = snapshot.layers.find((candidate) => candidate.id === layerId);
  if (layer?.canvas && hasOpaquePixels(layer.canvas)) return false;
  for (const cel of snapshot.cels.values()) {
    if (cel.layerId !== layerId) continue;
    if (cel.indexBuffer?.some((index) => index !== 0)) return false;
    if (hasOpaquePixels(cel.canvas)) return false;
  }
  return true;
}

function hasOpaquePixels(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw staticError('internal', true, { reason: 'canvas_read' });
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) return true;
  }
  return false;
}

// fallow-ignore-next-line complexity -- Indexed safety checks every pixel before a palette declaration can commit.
function validateCanvasMatchesIndices(
  canvas: HTMLCanvasElement,
  indexes: Uint8Array,
  colors: readonly string[],
): void {
  if (indexes.length !== canvas.width * canvas.height) {
    throw staticError('invalid_state', false, { reason: 'indexed_content_incoherent' });
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw staticError('internal', true, { reason: 'canvas_read' });
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < indexes.length; index++) {
    const paletteIndex = indexes[index];
    const offset = index * 4;
    const color = paletteIndex === 0 ? null : hexToRgb(colors[paletteIndex - 1] ?? '');
    const expectedAlpha = color ? 255 : 0;
    if (pixels[offset + 3] !== expectedAlpha) {
      throw staticError('invalid_state', false, { reason: 'indexed_content_incoherent' });
    }
    if (color && (pixels[offset] !== color.r || pixels[offset + 1] !== color.g || pixels[offset + 2] !== color.b)) {
      throw staticError('invalid_state', false, { reason: 'indexed_content_incoherent' });
    }
  }
}

function getCanvasCopy(
  canvas: HTMLCanvasElement,
  copies: Map<HTMLCanvasElement, HTMLCanvasElement>,
): HTMLCanvasElement {
  const existing = copies.get(canvas);
  if (existing) return existing;
  const copy = createBlankCanvas(canvas.width, canvas.height);
  const context = copy.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) throw staticError('internal', true, { reason: 'canvas_clone' });
  context.drawImage(canvas, 0, 0);
  copies.set(canvas, copy);
  return copy;
}

function createBlankCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) throw staticError('internal', true, { reason: 'canvas_allocation' });
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  return canvas;
}

function requiredBoundedString(value: unknown, reason: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw staticError('invalid_request', false, { reason });
  }
  if (value.length > PROJECT_OBSERVATION_LIMITS.maxStringLength) {
    throw staticError('limit_exceeded', false, {
      reason,
      max: PROJECT_OBSERVATION_LIMITS.maxStringLength,
    });
  }
  return value;
}

function requiredName(value: unknown): string {
  const name = requiredBoundedString(value, 'layer_name');
  if (!name.trim()) throw staticError('invalid_request', false, { reason: 'layer_name' });
  return name;
}

function requiredColor(value: unknown): string {
  if (typeof value !== 'string' || !isValidColor(value)) {
    throw staticError('invalid_request', false, { reason: 'palette_color' });
  }
  return normalizeHex(value);
}

function isValidColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function requiredBoolean(value: unknown, reason: string): boolean {
  if (typeof value !== 'boolean') throw staticError('invalid_request', false, { reason });
  return value;
}

function isBlendMode(value: unknown): value is BlendMode {
  return value === 'normal'
    || value === 'multiply'
    || value === 'screen'
    || value === 'overlay'
    || value === 'darken'
    || value === 'lighten';
}

function assertExactKeys(value: Record<string, unknown>, allowedKeys: readonly string[], reason: string): void {
  if (!hasOnlyKeys(value, allowedKeys)) {
    throw staticError('invalid_request', false, { reason });
  }
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function staticError(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
): StaticStructureError {
  return new StaticStructureError({ code, retryable, ...(details ? { details } : {}) });
}
