import type { ProjectChangeDomain } from '../stores/project-store';
import type { ProjectContext } from '../stores/project-context';
import type { ProjectPaletteSnapshot } from '../stores/palette/store';
import { isRuntimeEmptyCel, markRuntimeEmptyCanvas } from '../stores/animation/empty-cel';
import type { Cel, Frame, FrameTag } from '../types/animation';
import type { Layer } from '../types/layer';
import { hexToRgb, normalizeHex } from '../stores/palette/color-utils';
import { estimateCelPayloadBytes } from './payload-memory';
import {
  STRUCTURE_REFINEMENT_COMMAND_ID,
  STRUCTURE_REFINEMENT_MAX_CELS,
  STRUCTURE_REFINEMENT_MAX_FRAMES,
  STRUCTURE_REFINEMENT_MAX_LAYERS,
  STRUCTURE_REFINEMENT_MAX_MERGE_PAIRS,
  STRUCTURE_REFINEMENT_MAX_PREPARATION_BYTES,
  STRUCTURE_REFINEMENT_MAX_STRING_LENGTH,
} from './catalog';
import {
  createArtworkCompositionPlan,
  drawArtworkComposition,
} from '../services/export-composition';
import {
  hasOnlyKeys,
  isRecord,
  type EditorError,
  type ProjectCompositeEqualityEvidence,
  type ProjectTarget,
} from './contracts';

const STRUCTURE_REFINEMENT_KIND = 'structure.refine';
const STRUCTURE_REFINEMENT_DOMAINS: readonly ProjectChangeDomain[] = Object.freeze([
  'layer-state',
]);
const STRUCTURE_REFINEMENT_MERGE_DOMAINS: readonly ProjectChangeDomain[] = Object.freeze([
  'layer-state',
  'raster-content',
]);

export interface StructureRefinementLayerDeclaration {
  readonly id: string;
  readonly name: string;
  readonly type: 'image' | 'group' | 'text';
  readonly parentId: string | null;
}

export interface StructureRefinementMergePair {
  readonly sourceLayerId: string;
  readonly targetLayerId: string;
}

export interface StructureRefinementDeclaration {
  readonly kind: typeof STRUCTURE_REFINEMENT_KIND;
  readonly layers: readonly StructureRefinementLayerDeclaration[];
  readonly mergePairs: readonly StructureRefinementMergePair[];
}

export interface StructureRefinementChildInput {
  readonly command: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface StructureRefinementRequest {
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly structure: StructureRefinementDeclaration;
}

export interface StructureRefinementPreparationOptions {
  readonly entityIdFactory?: () => string;
}

interface StructureRefinementSnapshot {
  readonly layers: readonly Layer[];
  readonly cels: ReadonlyMap<string, Cel>;
  readonly frames: readonly Frame[];
  readonly tags: readonly FrameTag[];
  readonly currentFrameId: string;
  readonly palette: ProjectPaletteSnapshot;
  readonly activeLayerId: string | null;
  readonly groupData: ReadonlyMap<string, Uint8Array>;
}

export interface PreparedStructureRefinementChange {
  readonly request: StructureRefinementRequest;
  readonly before: StructureRefinementSnapshot;
  readonly after: StructureRefinementSnapshot;
  readonly domains: readonly ProjectChangeDomain[];
  readonly snapshotBytes: number;
  readonly compositeEquality: ProjectCompositeEqualityEvidence;
}

class StructureRefinementError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'StructureRefinementError';
    this.editorError = editorError;
  }
}

/**
 * Prepare one complete final structure and its optional exact merge pairs.
 * Every allocation that can change a project payload happens after the
 * bounded request and preparation-size gates below.
 */
export function prepareStructureRefinementChange(
  context: ProjectContext,
  child: StructureRefinementChildInput,
  target: ProjectTarget,
  expectedRevision: number,
  options: StructureRefinementPreparationOptions = {},
): PreparedStructureRefinementChange {
  validateTargetAndRevision(context, target, expectedRevision);
  const structure = normalizeStructureRefinementChild(child);
  const base = captureSnapshot(context, false);
  validateExistingDocument(context, base);
  validateFinalDeclaration(base, structure.layers);
  validateMergeShape(base.layers, structure);

  const snapshotBytes = validatePreparationBounds(context, base, structure);
  const before: StructureRefinementSnapshot = {
    ...base,
    groupData: context.project.captureLoadedGroupLayerData(),
  };
  validateLayerRemovals(context, before, structure);
  const paletteIndexes = validateMergePayloads(context, before, structure);
  const afterCels = createAfterCels(
    context,
    before,
    structure,
    paletteIndexes,
    options.entityIdFactory,
  );
  const afterLayers = createAfterLayers(context, before, structure.layers, afterCels);
  const after: StructureRefinementSnapshot = {
    layers: afterLayers,
    cels: afterCels,
    frames: before.frames,
    tags: before.tags,
    currentFrameId: before.currentFrameId,
    palette: before.palette,
    activeLayerId: chooseActiveLayerId(before.activeLayerId, afterLayers),
    groupData: createAfterGroupData(before.groupData, structure.layers),
  };

  if (sameSnapshot(before, after)) {
    throw structureError('invalid_request', false, { reason: 'no_change' });
  }

  const compositeEquality = compareAllFrameComposites(before, after, context);
  return {
    request: { target, expectedRevision, structure },
    before,
    after,
    domains: structure.mergePairs.length > 0
      ? STRUCTURE_REFINEMENT_MERGE_DOMAINS
      : STRUCTURE_REFINEMENT_DOMAINS,
    snapshotBytes,
    compositeEquality,
  };
}

export function applyPreparedStructureRefinementChange(
  context: ProjectContext,
  prepared: PreparedStructureRefinementChange,
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

export function assertPreparedStructureRefinementChange(
  context: ProjectContext,
  prepared: PreparedStructureRefinementChange,
  phase: 'before' | 'after',
): void {
  const expected = phase === 'after' ? prepared.after : prepared.before;
  const current = captureSnapshot(context);
  if (!sameSnapshot(current, expected)) {
    throw structureError('revision_conflict', true, { reason: 'history_structure_changed' });
  }
}

function validateTargetAndRevision(
  context: ProjectContext,
  target: ProjectTarget,
  expectedRevision: number,
): void {
  if (context.isDisposed || context.project.id.value !== target.projectId) {
    throw structureError('target_not_found', true);
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw structureError('invalid_request', false, { reason: 'expected_revision' });
  }
  if (context.project.revision.value !== expectedRevision) {
    throw structureError('revision_conflict', true, {
      expectedRevision,
      currentRevision: context.project.revision.value,
    });
  }
  if (context.guidedDrawing.active) {
    throw structureError('unsupported', false, { feature: 'guided-drawing-structure-refinement' });
  }
  const selectionType = context.selection.state.value.type;
  if (selectionType === 'floating' || selectionType === 'transforming') {
    throw structureError('invalid_state', false, { reason: 'selection_in_progress' });
  }
}

function normalizeStructureRefinementChild(
  child: StructureRefinementChildInput,
): StructureRefinementDeclaration {
  if (!isRecord(child) || child.command !== STRUCTURE_REFINEMENT_COMMAND_ID || !isRecord(child.input)) {
    throw structureError('invalid_request', false, { reason: 'structure_child' });
  }
  const input = child.input;
  assertExactKeys(input, ['kind', 'layers', 'mergePairs'], 'structure_input');
  if (input.kind !== STRUCTURE_REFINEMENT_KIND || !Array.isArray(input.layers) || !Array.isArray(input.mergePairs)) {
    throw structureError('invalid_request', false, { reason: 'structure_input' });
  }
  if (input.layers.length === 0 || input.layers.length > STRUCTURE_REFINEMENT_MAX_LAYERS) {
    throw structureError('limit_exceeded', false, {
      reason: 'structure_layers',
      max: STRUCTURE_REFINEMENT_MAX_LAYERS,
    });
  }
  if (input.mergePairs.length > STRUCTURE_REFINEMENT_MAX_MERGE_PAIRS) {
    throw structureError('limit_exceeded', false, {
      reason: 'structure_merge_pairs',
      max: STRUCTURE_REFINEMENT_MAX_MERGE_PAIRS,
    });
  }

  return {
    kind: STRUCTURE_REFINEMENT_KIND,
    layers: input.layers.map(normalizeLayerDeclaration),
    mergePairs: input.mergePairs.map(normalizeMergePair),
  };
}

function normalizeLayerDeclaration(value: unknown): StructureRefinementLayerDeclaration {
  if (!isRecord(value)) throw structureError('invalid_request', false, { reason: 'layer_declaration' });
  assertExactKeys(value, ['id', 'name', 'type', 'parentId'], 'layer_declaration');
  if (value.type !== 'image' && value.type !== 'group' && value.type !== 'text') {
    throw structureError('unsupported', false, { reason: 'layer_type' });
  }
  if (value.parentId !== null && typeof value.parentId !== 'string') {
    throw structureError('invalid_request', false, { reason: 'parent_id' });
  }
  return {
    id: requiredIdentity(value.id, 'layer_id'),
    name: requiredName(value.name),
    type: value.type,
    parentId: value.parentId === null ? null : requiredIdentity(value.parentId, 'parent_id'),
  };
}

function normalizeMergePair(value: unknown): StructureRefinementMergePair {
  if (!isRecord(value)) throw structureError('invalid_request', false, { reason: 'merge_pair' });
  assertExactKeys(value, ['sourceLayerId', 'targetLayerId'], 'merge_pair');
  return {
    sourceLayerId: requiredIdentity(value.sourceLayerId, 'merge_source'),
    targetLayerId: requiredIdentity(value.targetLayerId, 'merge_target'),
  };
}

function validateExistingDocument(
  context: ProjectContext,
  snapshot: StructureRefinementSnapshot,
): void {
  if (snapshot.layers.length === 0 || snapshot.layers.length > STRUCTURE_REFINEMENT_MAX_LAYERS) {
    throw structureError('limit_exceeded', false, {
      reason: 'existing_layers',
      max: STRUCTURE_REFINEMENT_MAX_LAYERS,
    });
  }
  if (snapshot.frames.length === 0 || snapshot.frames.length > STRUCTURE_REFINEMENT_MAX_FRAMES) {
    throw structureError('limit_exceeded', false, {
      reason: 'structure_frames',
      max: STRUCTURE_REFINEMENT_MAX_FRAMES,
    });
  }
  if (snapshot.cels.size > STRUCTURE_REFINEMENT_MAX_CELS) {
    throw structureError('limit_exceeded', false, {
      reason: 'structure_cels',
      max: STRUCTURE_REFINEMENT_MAX_CELS,
    });
  }
  const layerIds = new Set<string>();
  const frameIds = new Set<string>();
  for (const frame of snapshot.frames) {
    if (typeof frame.id !== 'string' || frame.id.length === 0 || frameIds.has(frame.id)) {
      throw structureError('invalid_state', false, { reason: 'existing_frame_identity' });
    }
    frameIds.add(frame.id);
  }
  for (const layer of snapshot.layers) {
    if (layerIds.has(layer.id)) {
      throw structureError('invalid_state', false, { reason: 'existing_layer_identity' });
    }
    layerIds.add(layer.id);
    if (layer.type !== 'image' && layer.type !== 'group' && layer.type !== 'text' && layer.type !== 'reference') {
      throw structureError('unsupported', false, { reason: 'existing_layer_type' });
    }
    if (layer.type === 'reference') {
      throw structureError('unsupported', false, { reason: 'existing_layer_type' });
    }
    if (layer.type === 'text' && (!layer.textData || layer.referenceData)) {
      throw structureError('unsupported', false, { reason: 'existing_text_payload' });
    }
    if ((layer.type === 'image' || layer.type === 'group') && (layer.textData || layer.referenceData)) {
      throw structureError('unsupported', false, { reason: 'existing_layer_payload' });
    }
  }
  const celIds = new Set<string>();
  for (const [key, cel] of snapshot.cels) {
    if (!layerIds.has(cel.layerId) || !frameIds.has(cel.frameId)) {
      throw structureError('invalid_state', false, { reason: 'orphan_cel' });
    }
    if (key !== `${cel.layerId}:${cel.frameId}`) {
      throw structureError('invalid_state', false, { reason: 'cel_key' });
    }
    if (cel.canvas.width <= 0 || cel.canvas.height <= 0) {
      throw structureError('invalid_state', false, { reason: 'cel_shape' });
    }
    if (typeof cel.id !== 'string' || cel.id.length === 0 || celIds.has(cel.id)) {
      throw structureError('invalid_state', false, { reason: 'existing_cel_identity' });
    }
    celIds.add(cel.id);
  }
  if (!frameIds.has(snapshot.currentFrameId)) {
    throw structureError('invalid_state', false, { reason: 'current_frame' });
  }
  for (const layer of snapshot.layers) {
    if (layer.type === 'reference') continue;
    for (const frame of snapshot.frames) {
      if (!snapshot.cels.has(context.animation.getCelKey(layer.id, frame.id))) {
        throw structureError('invalid_state', false, { reason: 'cel_matrix' });
      }
    }
  }
}

function validateFinalDeclaration(
  before: StructureRefinementSnapshot,
  declaration: readonly StructureRefinementLayerDeclaration[],
): void {
  if (!declaration.some((layer) => layer.type === 'image')) {
    throw structureError('invalid_state', false, { reason: 'image_layer_required' });
  }
  const beforeById = new Map(before.layers.map((layer) => [layer.id, layer]));
  const declaredIds = new Set<string>();
  const declaredGroups = new Set(
    declaration.filter((layer) => layer.type === 'group').map((layer) => layer.id),
  );
  const allExistingIds = collectProjectEntityIds(before);
  declaration.forEach((layer, index) => {
    if (declaredIds.has(layer.id)) {
      throw structureError('invalid_request', false, { reason: 'layer_identity' });
    }
    declaredIds.add(layer.id);
    const existing = beforeById.get(layer.id);
    if (!existing && layer.type !== 'group') {
      throw structureError('unsupported', false, { reason: 'new_image_layer' });
    }
    if (existing && existing.type !== layer.type) {
      throw structureError('invalid_state', false, { reason: 'layer_type_change' });
    }
    if (!existing && allExistingIds.has(layer.id)) {
      throw structureError('invalid_request', false, { reason: 'entity_identity_collision' });
    }
    if (layer.parentId !== null) {
      if (!declaredGroups.has(layer.parentId)) {
        throw structureError('invalid_request', false, { reason: 'parent_id' });
      }
      const parentIndex = declaration.findIndex((candidate) => candidate.id === layer.parentId);
      if (parentIndex < 0 || parentIndex >= index) {
        throw structureError('invalid_request', false, { reason: 'parent_order' });
      }
    }
  });
  for (const existing of before.layers) {
    if (existing.type === 'text' && !declaredIds.has(existing.id)) {
      throw structureError('unsupported', false, { reason: 'text_layer_removal' });
    }
  }
}

function validateMergeShape(
  before: readonly Layer[],
  structure: StructureRefinementDeclaration,
): void {
  const beforeById = new Map(before.map((layer) => [layer.id, layer]));
  const declaredIds = new Set(structure.layers.map((layer) => layer.id));
  const usedIds = new Set<string>();
  const sourceIds = new Set<string>();
  for (const pair of structure.mergePairs) {
    if (pair.sourceLayerId === pair.targetLayerId) {
      throw structureError('invalid_request', false, { reason: 'merge_overlap' });
    }
    if (usedIds.has(pair.sourceLayerId) || usedIds.has(pair.targetLayerId)) {
      throw structureError('invalid_request', false, { reason: 'merge_overlap' });
    }
    usedIds.add(pair.sourceLayerId);
    usedIds.add(pair.targetLayerId);
    sourceIds.add(pair.sourceLayerId);

    const source = beforeById.get(pair.sourceLayerId);
    const target = beforeById.get(pair.targetLayerId);
    if (!source || !target) {
      throw structureError('target_not_found', true, { resource: 'merge_layer' });
    }
    if (source.type !== 'image' || target.type !== 'image') {
      throw structureError('unsupported', false, { reason: 'merge_layer_type' });
    }
    if (declaredIds.has(pair.sourceLayerId)) {
      throw structureError('invalid_request', false, { reason: 'merge_source_retained' });
    }
    if (!declaredIds.has(pair.targetLayerId)) {
      throw structureError('invalid_request', false, { reason: 'merge_target_removed' });
    }
    const sourceIndex = before.findIndex((layer) => layer.id === source.id);
    const targetIndex = before.findIndex((layer) => layer.id === target.id);
    if (Math.abs(sourceIndex - targetIndex) !== 1 || source.parentId !== target.parentId) {
      throw structureError('unsupported', false, { reason: 'merge_adjacency' });
    }
    validateMergeLayerState(source);
    validateMergeLayerState(target);
  }
}

function validateMergeLayerState(layer: Layer): void {
  if (!layer.visible || layer.opacity !== 255 || layer.blendMode !== 'normal') {
    throw structureError('unsupported', false, { reason: 'merge_layer_state' });
  }
}

function validatePreparationBounds(
  context: ProjectContext,
  before: StructureRefinementSnapshot,
  structure: StructureRefinementDeclaration,
): number {
  const existingIds = new Set(before.layers.map((layer) => layer.id));
  const newGroupCount = structure.layers.filter((layer) => !existingIds.has(layer.id)).length;
  const resultingCelCount = structure.layers.length * before.frames.length;
  if (resultingCelCount > STRUCTURE_REFINEMENT_MAX_CELS) {
    throw structureError('limit_exceeded', false, {
      reason: 'structure_cels',
      max: STRUCTURE_REFINEMENT_MAX_CELS,
    });
  }

  const canvasBytes = safePayloadProduct(
    context.project.width.value,
    context.project.height.value,
    4,
  );
  const indexBytes = safePayloadProduct(
    context.project.width.value,
    context.project.height.value,
    1,
  );
  const beforeCelBytes = estimateCelPayloadBytes(before.cels);
  const groupBytes = context.project.getLoadedGroupLayerDataByteLength();
  const newGroupBytes = newGroupCount * before.frames.length * canvasBytes;
  const mergeOutputBytes = structure.mergePairs.length * before.frames.length * (canvasBytes + indexBytes);
  const afterCelBytes = beforeCelBytes + newGroupBytes + mergeOutputBytes;
  const snapshotBytes = beforeCelBytes + groupBytes + afterCelBytes + groupBytes;
  if (!Number.isSafeInteger(snapshotBytes) || snapshotBytes > STRUCTURE_REFINEMENT_MAX_PREPARATION_BYTES) {
    throw structureError('limit_exceeded', false, {
      reason: 'structure_preparation_bytes',
      max: STRUCTURE_REFINEMENT_MAX_PREPARATION_BYTES,
    });
  }
  return snapshotBytes;
}

function validateLayerRemovals(
  context: ProjectContext,
  before: StructureRefinementSnapshot,
  structure: StructureRefinementDeclaration,
): void {
  const retained = new Set(structure.layers.map((layer) => layer.id));
  const mergeSources = new Set(structure.mergePairs.map((pair) => pair.sourceLayerId));
  for (const layer of before.layers) {
    if (retained.has(layer.id)) continue;
    if (mergeSources.has(layer.id)) continue;
    if (layer.type === 'text') {
      throw structureError('unsupported', false, { reason: 'text_layer_removal' });
    }
    if (layer.type === 'group') {
      const retainedChild = before.layers.some((candidate) =>
        candidate.parentId === layer.id
          && retained.has(candidate.id)
          && structure.layers.find((declared) => declared.id === candidate.id)?.parentId === layer.id);
      if (retainedChild || !isLayerEmpty(before, layer.id) ||
          context.project.getLoadedGroupLayerDataByteLength(layer.id) > 0) {
        throw structureError('invalid_state', false, { reason: 'non_empty_layer_removal' });
      }
      continue;
    }
    if (!isLayerEmpty(before, layer.id)) {
      throw structureError('invalid_state', false, { reason: 'non_empty_layer_removal' });
    }
  }
}

interface MergeCelInputs {
  readonly source: Cel;
  readonly target: Cel;
}

function validateMergePayloads(
  context: ProjectContext,
  before: StructureRefinementSnapshot,
  structure: StructureRefinementDeclaration,
): ReadonlyMap<string, MergeCelInputs> {
  const participants = new Set(
    structure.mergePairs.flatMap((pair) => [pair.sourceLayerId, pair.targetLayerId]),
  );
  const paletteIndexes = new Map<string, MergeCelInputs>();
  for (const pair of structure.mergePairs) {
    for (const frame of before.frames) {
      const source = before.cels.get(context.animation.getCelKey(pair.sourceLayerId, frame.id));
      const target = before.cels.get(context.animation.getCelKey(pair.targetLayerId, frame.id));
      if (!source || !target) {
        throw structureError('invalid_state', false, { reason: 'merge_cel_missing' });
      }
      validateMergeCel(context, before, source, target, participants);
      paletteIndexes.set(
        context.animation.getCelKey(pair.targetLayerId, frame.id),
        { source, target },
      );
    }
  }
  return paletteIndexes;
}

function validateMergeCel(
  context: ProjectContext,
  before: StructureRefinementSnapshot,
  source: Cel,
  target: Cel,
  participants: ReadonlySet<string>,
): void {
  if (source.opacity !== undefined && source.opacity !== 100 ||
      target.opacity !== undefined && target.opacity !== 100) {
    throw structureError('unsupported', false, { reason: 'merge_cel_opacity' });
  }
  if (source.linkedCelId || source.linkType || source.textCelData ||
      target.linkedCelId || target.linkType || target.textCelData) {
    throw structureError('unsupported', false, { reason: 'merge_cel_payload' });
  }
  if (source.canvas.width !== target.canvas.width || source.canvas.height !== target.canvas.height ||
      source.canvas.width !== context.project.width.value || source.canvas.height !== context.project.height.value) {
    throw structureError('invalid_state', false, { reason: 'merge_cel_shape' });
  }
  validateExactCelPalette(before.palette, source);
  validateExactCelPalette(before.palette, target);
  if (isSharedWithOtherLayer(before.cels, source, participants) ||
      isSharedWithOtherLayer(before.cels, target, participants)) {
    throw structureError('invalid_state', false, { reason: 'merge_shared_payload' });
  }
}

function validateExactCelPalette(
  palette: ProjectPaletteSnapshot,
  cel: Cel,
): void {
  const colors = palette.colors;
  const colorIndexes = createPaletteIndexMap(colors);
  const context = cel.canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw structureError('internal', true, { reason: 'canvas_read' });
  const pixels = context.getImageData(0, 0, cel.canvas.width, cel.canvas.height).data;
  if (cel.indexBuffer && cel.indexBuffer.length !== cel.canvas.width * cel.canvas.height) {
    throw structureError('invalid_state', false, { reason: 'merge_index_payload' });
  }
  for (let pixel = 0; pixel < cel.canvas.width * cel.canvas.height; pixel++) {
    const offset = pixel * 4;
    const alpha = pixels[offset + 3];
    const paletteIndex = cel.indexBuffer?.[pixel];
    if (paletteIndex !== undefined) {
      if (paletteIndex > colors.length) {
        throw structureError('invalid_state', false, { reason: 'merge_index_payload' });
      }
      if (paletteIndex === 0) {
        if (alpha !== 0) throw structureError('invalid_state', false, { reason: 'merge_index_payload' });
        continue;
      }
      const color = hexToRgb(colors[paletteIndex - 1] ?? '');
      if (!color || alpha !== 255 || pixels[offset] !== color.r ||
          pixels[offset + 1] !== color.g || pixels[offset + 2] !== color.b) {
        throw structureError('invalid_state', false, { reason: 'merge_index_payload' });
      }
      continue;
    }
    if (alpha === 0) continue;
    if (alpha !== 255 || !colorIndexes.has(rgbToHex(pixels[offset], pixels[offset + 1], pixels[offset + 2]))) {
      throw structureError('invalid_state', false, { reason: 'merge_palette_representation' });
    }
  }
}

function isSharedWithOtherLayer(
  cels: ReadonlyMap<string, Cel>,
  participant: Cel,
  participants: ReadonlySet<string>,
): boolean {
  for (const candidate of cels.values()) {
    if (candidate === participant || participants.has(candidate.layerId)) continue;
    if (candidate.canvas === participant.canvas ||
        candidate.indexBuffer !== undefined && candidate.indexBuffer === participant.indexBuffer) {
      return true;
    }
  }
  return false;
}

function createAfterCels(
  context: ProjectContext,
  before: StructureRefinementSnapshot,
  structure: StructureRefinementDeclaration,
  mergeInputs: ReadonlyMap<string, MergeCelInputs>,
  entityIdFactory: (() => string) | undefined,
): Map<string, Cel> {
  const retained = new Set(
    structure.layers.map((layer) => layer.id),
  );
  const after = new Map<string, Cel>();
  for (const [key, cel] of before.cels) {
    if (retained.has(cel.layerId)) after.set(key, cel);
  }

  const ids = collectProjectEntityIds(before);
  const createId = entityIdFactory ?? (() => crypto.randomUUID());
  for (const layer of structure.layers) {
    if (before.layers.some((candidate) => candidate.id === layer.id)) continue;
    for (const frame of before.frames) {
      const celId = createUniqueEntityId(createId, ids, 'cel_identity');
      const canvas = markRuntimeEmptyCanvas(createBlankCanvas(
        context.project.width.value,
        context.project.height.value,
      ));
      after.set(context.animation.getCelKey(layer.id, frame.id), {
        id: celId,
        layerId: layer.id,
        frameId: frame.id,
        canvas,
      });
    }
  }

  const pairByTarget = new Map<string, StructureRefinementMergePair>();
  for (const pair of structure.mergePairs) pairByTarget.set(pair.targetLayerId, pair);
  for (const [targetLayerId, pair] of pairByTarget) {
    for (const frame of before.frames) {
      const targetKey = context.animation.getCelKey(targetLayerId, frame.id);
      const inputs = mergeInputs.get(targetKey);
      if (!inputs) throw structureError('internal', true, { reason: 'merge_inputs' });
      const merged = createMergedCel(context, before, pair, frame.id, inputs);
      after.set(targetKey, merged);
    }
  }
  return after;
}

function createMergedCel(
  context: ProjectContext,
  before: StructureRefinementSnapshot,
  pair: StructureRefinementMergePair,
  frameId: string,
  inputs: MergeCelInputs,
): Cel {
  const sourceIndex = before.layers.findIndex((layer) => layer.id === pair.sourceLayerId);
  const targetIndex = before.layers.findIndex((layer) => layer.id === pair.targetLayerId);
  const orderedLayers = sourceIndex < targetIndex
    ? [before.layers[sourceIndex], before.layers[targetIndex]]
    : [before.layers[targetIndex], before.layers[sourceIndex]];
  const pairCels = new Map<string, Cel>([
    [context.animation.getCelKey(inputs.source.layerId, frameId), inputs.source],
    [context.animation.getCelKey(inputs.target.layerId, frameId), inputs.target],
  ]);
  const canvas = createBlankCanvas(context.project.width.value, context.project.height.value);
  const drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!drawing) throw structureError('internal', true, { reason: 'merge_canvas' });
  drawArtworkComposition(
    drawing,
    createArtworkCompositionPlan({
      frameId,
      layers: orderedLayers,
      cels: pairCels,
      getCelKey: context.animation.getCelKey,
    }),
  );
  const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height).data;
  const indexBuffer = createExactIndexBuffer(before.palette.colors, pixels);
  return {
    ...inputs.target,
    canvas,
    indexBuffer,
    linkedCelId: undefined,
    linkType: undefined,
    textCelData: undefined,
  };
}

function createAfterLayers(
  context: ProjectContext,
  before: StructureRefinementSnapshot,
  declaration: readonly StructureRefinementLayerDeclaration[],
  cels: ReadonlyMap<string, Cel>,
): Layer[] {
  const beforeById = new Map(before.layers.map((layer) => [layer.id, layer]));
  const createLayer = (declared: StructureRefinementLayerDeclaration): Layer => {
    const existing = beforeById.get(declared.id);
    const layer: Layer = existing
      ? { ...existing, name: declared.name, parentId: declared.parentId }
      : {
          id: declared.id,
          name: declared.name,
          type: 'group',
          visible: true,
          locked: false,
          opacity: 255,
          blendMode: 'normal',
          parentId: declared.parentId,
          continuous: false,
        };
    if (declared.type === 'image') {
      const cel = cels.get(context.animation.getCelKey(declared.id, before.currentFrameId));
      if (!cel) throw structureError('invalid_state', false, { reason: 'layer_cel_missing' });
      layer.canvas = cel.canvas;
    }
    return layer;
  };

  return declaration.map(createLayer);
}

function createAfterGroupData(
  before: ReadonlyMap<string, Uint8Array>,
  declaration: readonly StructureRefinementLayerDeclaration[],
): Map<string, Uint8Array> {
  const retainedGroups = new Set(
    declaration.filter((layer) => layer.type === 'group').map((layer) => layer.id),
  );
  return new Map(
    [...before.entries()]
      .filter(([layerId]) => retainedGroups.has(layerId))
      .map(([layerId, bytes]) => [layerId, new Uint8Array(bytes)]),
  );
}

function compareAllFrameComposites(
  before: StructureRefinementSnapshot,
  after: StructureRefinementSnapshot,
  context: ProjectContext,
): ProjectCompositeEqualityEvidence {
  const frames = before.frames.map((frame) => {
    const beforePixels = renderSnapshot(context, before, frame.id);
    const afterPixels = renderSnapshot(context, after, frame.id);
    if (!sameBytes(beforePixels, afterPixels)) {
      throw structureError('invalid_state', false, { reason: 'composite_changed' });
    }
    return Object.freeze({
      frameId: frame.id,
      equal: true as const,
      beforeDigest: digestBytes(beforePixels),
      afterDigest: digestBytes(afterPixels),
    });
  });
  return Object.freeze({
    type: 'project.composite-equality',
    allEqual: true,
    frameCount: frames.length,
    frames: Object.freeze(frames),
  });
}

function renderSnapshot(
  context: ProjectContext,
  snapshot: StructureRefinementSnapshot,
  frameId: string,
): Uint8Array {
  const canvas = createBlankCanvas(context.project.width.value, context.project.height.value);
  const drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!drawing) throw structureError('internal', true, { reason: 'preflight_canvas' });
  drawArtworkComposition(
    drawing,
    createArtworkCompositionPlan({
      frameId,
      layers: snapshot.layers,
      cels: snapshot.cels,
      getCelKey: context.animation.getCelKey,
    }),
  );
  return new Uint8Array(drawing.getImageData(0, 0, canvas.width, canvas.height).data);
}

function createExactIndexBuffer(colors: readonly string[], pixels: ArrayLike<number>): Uint8Array {
  const indexes = createPaletteIndexMap(colors);
  const result = new Uint8Array(pixels.length / 4);
  for (let pixel = 0; pixel < result.length; pixel++) {
    const offset = pixel * 4;
    const alpha = pixels[offset + 3] ?? 0;
    if (alpha === 0) continue;
    if (alpha !== 255) throw structureError('unsupported', false, { reason: 'merge_partial_alpha' });
    const index = indexes.get(rgbToHex(
      pixels[offset] ?? 0,
      pixels[offset + 1] ?? 0,
      pixels[offset + 2] ?? 0,
    ));
    if (index === undefined) {
      throw structureError('invalid_state', false, { reason: 'merge_palette_representation' });
    }
    result[pixel] = index;
  }
  return result;
}

function createPaletteIndexMap(colors: readonly string[]): Map<string, number> {
  const indexes = new Map<string, number>();
  colors.forEach((color, index) => {
    const normalized = normalizeHex(color);
    if (indexes.has(normalized)) {
      throw structureError('invalid_state', false, { reason: 'palette_duplicate_color' });
    }
    indexes.set(normalized, index + 1);
  });
  return indexes;
}

function isLayerEmpty(snapshot: StructureRefinementSnapshot, layerId: string): boolean {
  const layer = snapshot.layers.find((candidate) => candidate.id === layerId);
  if (layer?.canvas && hasOpaquePixels(layer.canvas)) return false;
  for (const cel of snapshot.cels.values()) {
    if (cel.layerId !== layerId) continue;
    if (isRuntimeEmptyCel(cel)) continue;
    if (cel.indexBuffer?.some((index) => index !== 0)) return false;
    if (hasOpaquePixels(cel.canvas)) return false;
  }
  return true;
}

function hasOpaquePixels(canvas: HTMLCanvasElement): boolean {
  const drawing = canvas.getContext('2d', { willReadFrequently: true });
  if (!drawing) throw structureError('internal', true, { reason: 'canvas_read' });
  const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) return true;
  }
  return false;
}

function captureSnapshot(context: ProjectContext, includeGroupData = true): StructureRefinementSnapshot {
  return {
    layers: context.layers.layers.value.map((layer) => ({ ...layer })),
    cels: new Map(context.animation.cels.value),
    frames: context.animation.frames.value.map((frame) => ({ ...frame })),
    tags: context.animation.tags.value.map((tag) => ({ ...tag })),
    currentFrameId: context.animation.currentFrameId.value,
    palette: context.palette.captureProjectSnapshot(),
    activeLayerId: context.layers.activeLayerId.value,
    groupData: includeGroupData ? context.project.captureLoadedGroupLayerData() : new Map(),
  };
}

function sameSnapshot(first: StructureRefinementSnapshot, second: StructureRefinementSnapshot): boolean {
  return sameLayers(first.layers, second.layers)
    && sameCels(first.cels, second.cels)
    && sameFrames(first.frames, second.frames)
    && sameTags(first.tags, second.tags)
    && first.currentFrameId === second.currentFrameId
    && first.activeLayerId === second.activeLayerId
    && samePalette(first.palette, second.palette)
    && sameGroupData(first.groupData, second.groupData);
}

function sameLayers(first: readonly Layer[], second: readonly Layer[]): boolean {
  if (first.length !== second.length) return false;
  return first.every((layer, index) => {
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
      && layer.parentId === other.parentId
      && layer.canvas === other.canvas
      && sameTextData(layer.textData, other.textData)
      && sameReferenceData(layer.referenceData, other.referenceData);
  });
}

function sameTextData(
  first: Layer['textData'],
  second: Layer['textData'],
): boolean {
  return first?.font === second?.font && first?.color === second?.color;
}

function sameReferenceData(
  first: Layer['referenceData'],
  second: Layer['referenceData'],
): boolean {
  if (!first || !second) return first === second;
  return first.mimeType === second.mimeType
    && first.x === second.x
    && first.y === second.y
    && first.scale === second.scale
    && first.desaturate === second.desaturate
    && first.position === second.position
    && sameBytes(first.bytes, second.bytes);
}

function sameCels(first: ReadonlyMap<string, Cel>, second: ReadonlyMap<string, Cel>): boolean {
  if (first.size !== second.size) return false;
  const firstEntries = [...first.entries()];
  const secondEntries = [...second.entries()];
  for (const [key, cel] of firstEntries) {
    const other = second.get(key);
    if (!other || !sameCel(cel, other)) return false;
  }
  return samePayloadSharing(firstEntries, secondEntries);
}

function sameCel(first: Cel, second: Cel): boolean {
  return first.id === second.id
    && first.layerId === second.layerId
    && first.frameId === second.frameId
    && first.opacity === second.opacity
    && first.linkedCelId === second.linkedCelId
    && first.linkType === second.linkType
    && sameTextCelData(first.textCelData, second.textCelData)
    && sameCanvas(first.canvas, second.canvas)
    && sameBytes(first.indexBuffer, second.indexBuffer);
}

function samePayloadSharing(
  first: readonly (readonly [string, Cel])[],
  second: readonly (readonly [string, Cel])[],
): boolean {
  const firstCanvasSharing = payloadSharing(first.map(([key, cel]) => [key, cel.canvas] as const));
  const secondCanvasSharing = payloadSharing(second.map(([key, cel]) => [key, cel.canvas] as const));
  const firstIndexSharing = payloadSharing(first
    .filter(([, cel]) => cel.indexBuffer)
    .map(([key, cel]) => [key, cel.indexBuffer!] as const));
  const secondIndexSharing = payloadSharing(second
    .filter(([, cel]) => cel.indexBuffer)
    .map(([key, cel]) => [key, cel.indexBuffer!] as const));
  return sameStringMap(firstCanvasSharing, secondCanvasSharing)
    && sameStringMap(firstIndexSharing, secondIndexSharing);
}

function payloadSharing<T extends object>(entries: readonly (readonly [string, T])[]): Map<string, string> {
  const firstKeyByPayload = new Map<T, string>();
  const sharing = new Map<string, string>();
  for (const [key, payload] of entries) {
    const firstKey = firstKeyByPayload.get(payload) ?? key;
    firstKeyByPayload.set(payload, firstKey);
    sharing.set(key, firstKey);
  }
  return sharing;
}

function sameStringMap(first: ReadonlyMap<string, string>, second: ReadonlyMap<string, string>): boolean {
  if (first.size !== second.size) return false;
  for (const [key, value] of first) if (second.get(key) !== value) return false;
  return true;
}

function sameCanvas(first: HTMLCanvasElement, second: HTMLCanvasElement): boolean {
  if (first.width !== second.width || first.height !== second.height) return false;
  const firstContext = first.getContext('2d', { willReadFrequently: true });
  const secondContext = second.getContext('2d', { willReadFrequently: true });
  if (!firstContext || !secondContext) return false;
  return sameBytes(
    new Uint8Array(firstContext.getImageData(0, 0, first.width, first.height).data),
    new Uint8Array(secondContext.getImageData(0, 0, second.width, second.height).data),
  );
}

function sameFrames(first: readonly Frame[], second: readonly Frame[]): boolean {
  return first.length === second.length && first.every((frame, index) => {
    const other = second[index];
    return !!other && frame.id === other.id && frame.order === other.order && frame.duration === other.duration;
  });
}

function sameTags(first: readonly FrameTag[], second: readonly FrameTag[]): boolean {
  return first.length === second.length && first.every((tag, index) => {
    const other = second[index];
    return !!other && tag.id === other.id && tag.name === other.name && tag.color === other.color
      && tag.startFrameIndex === other.startFrameIndex && tag.endFrameIndex === other.endFrameIndex
      && tag.collapsed === other.collapsed;
  });
}

function samePalette(first: ProjectPaletteSnapshot, second: ProjectPaletteSnapshot): boolean {
  return first.currentPresetId === second.currentPresetId
    && first.currentCustomPaletteId === second.currentCustomPaletteId
    && first.isDirty === second.isDirty
    && sameStrings(first.newColorFlags, second.newColorFlags)
    && sameStrings(first.colors, second.colors)
    && first.entries.length === second.entries.length
    && first.entries.every((entry, index) => {
      const other = second.entries[index];
      return !!other && entry.id === other.id && entry.color === other.color;
    });
}

function sameGroupData(first: ReadonlyMap<string, Uint8Array>, second: ReadonlyMap<string, Uint8Array>): boolean {
  if (first.size !== second.size) return false;
  for (const [layerId, bytes] of first) if (!sameBytes(bytes, second.get(layerId))) return false;
  return true;
}

function sameTextCelData(
  first: Cel['textCelData'],
  second: Cel['textCelData'],
): boolean {
  return first?.content === second?.content && first?.x === second?.x && first?.y === second?.y;
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function sameBytes(first: ArrayLike<number> | undefined, second: ArrayLike<number> | undefined): boolean {
  if (!first || !second) return first === second;
  return first.length === second.length && Array.from(first).every((value, index) => value === second[index]);
}

function chooseActiveLayerId(activeLayerId: string | null, layers: readonly Layer[]): string | null {
  if (activeLayerId && layers.some((layer) => layer.id === activeLayerId)) return activeLayerId;
  return layers.find((layer) => layer.type === 'image')?.id ?? layers[0]?.id ?? null;
}

function collectProjectEntityIds(snapshot: StructureRefinementSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const layer of snapshot.layers) ids.add(layer.id);
  for (const frame of snapshot.frames) ids.add(frame.id);
  for (const cel of snapshot.cels.values()) ids.add(cel.id);
  for (const tag of snapshot.tags) ids.add(tag.id);
  for (const entry of snapshot.palette.entries) ids.add(entry.id);
  return ids;
}

function createUniqueEntityId(
  factory: () => string,
  ids: Set<string>,
  reason: string,
): string {
  const id = factory();
  if (typeof id !== 'string' || id.length === 0 || id.length > STRUCTURE_REFINEMENT_MAX_STRING_LENGTH || ids.has(id)) {
    throw structureError('invalid_state', false, { reason });
  }
  ids.add(id);
  return id;
}

function createBlankCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!drawing) throw structureError('internal', true, { reason: 'canvas_allocation' });
  drawing.imageSmoothingEnabled = false;
  drawing.clearRect(0, 0, width, height);
  return canvas;
}

function safePayloadProduct(width: number, height: number, bytesPerPixel: number): number {
  const value = width * height * bytesPerPixel;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw structureError('limit_exceeded', false, {
      reason: 'structure_preparation_bytes',
      max: STRUCTURE_REFINEMENT_MAX_PREPARATION_BYTES,
    });
  }
  return value;
}

function digestBytes(bytes: ArrayLike<number>): string {
  let first = 2166136261;
  let second = 2654435761;
  for (let index = 0; index < bytes.length; index++) {
    const value = bytes[index] ?? 0;
    first = Math.imul(first ^ value, 16777619);
    second = Math.imul(second ^ (value + index), 2246822519);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function requiredIdentity(value: unknown, reason: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw structureError('invalid_request', false, { reason });
  }
  if (value.length > STRUCTURE_REFINEMENT_MAX_STRING_LENGTH) {
    throw structureError('limit_exceeded', false, {
      reason,
      max: STRUCTURE_REFINEMENT_MAX_STRING_LENGTH,
    });
  }
  return value;
}

function requiredName(value: unknown): string {
  const name = requiredIdentity(value, 'layer_name');
  if (name.trim().length === 0) throw structureError('invalid_request', false, { reason: 'layer_name' });
  return name;
}

function assertExactKeys(value: Record<string, unknown>, allowedKeys: readonly string[], reason: string): void {
  if (!hasOnlyKeys(value, allowedKeys)) throw structureError('invalid_request', false, { reason });
}

function structureError(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
): StructureRefinementError {
  return new StructureRefinementError({ code, retryable, ...(details ? { details } : {}) });
}
