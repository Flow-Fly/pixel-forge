import type { ProjectContext } from '../stores/project-context';
import type { Cel, Frame, FrameTag } from '../types/animation';
import type { Layer } from '../types/layer';
import {
  ANIMATION_OBSERVATION_ID,
  ANIMATION_OBSERVATION_MAX_CANVAS_DIMENSION,
  ANIMATION_OBSERVATION_MAX_CELLS,
  ANIMATION_OBSERVATION_MAX_CONTACT_SHEET_BYTES,
  ANIMATION_OBSERVATION_MAX_CONTACT_SHEET_COLUMNS,
  ANIMATION_OBSERVATION_MAX_CONTACT_SHEET_ROWS,
  ANIMATION_OBSERVATION_MAX_FRAME_PIXELS,
  ANIMATION_OBSERVATION_MAX_FRAMES,
  ANIMATION_OBSERVATION_MAX_KEYFRAMES,
  ANIMATION_OBSERVATION_MAX_LEGEND_ENTRIES,
  ANIMATION_OBSERVATION_MAX_PALETTE_ENTRIES,
  ANIMATION_OBSERVATION_MIN_FRAMES,
  ANIMATION_OBSERVATION_REPRESENTATION_VERSION,
  RENDER_OBSERVATION_MAX_IDENTITY_LENGTH,
  RENDER_OBSERVATION_MAX_SCALE,
  RENDER_OBSERVATION_MIN_SCALE,
} from './catalog';
import type {
  EditorError,
  ProjectTarget,
} from './contracts';
import { hasOnlyKeys, isRecord } from './contracts';
import {
  renderProjectObservation,
  type RenderBackgroundPolicy,
  type RenderObservation,
  type RenderObservationResult,
} from './observations';
import {
  createSymbolGridDigest,
  encodeSymbolGridPixels,
  type SymbolGridEncoding,
  type SymbolGridLegendEntry,
} from './symbol-grid';
import { sameBytes } from './structure-support';

export type AnimationObservationRange = 'all' | { readonly tagId: string };

export interface AnimationObservationRequest {
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly range: AnimationObservationRange;
  readonly background: RenderBackgroundPolicy;
  readonly scale: number;
  readonly keyframes: readonly string[];
  readonly expectedDigest: string | null;
}

export interface AnimationGrid {
  readonly type: 'symbol-grid';
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
}

export interface AnimationTagMetadata {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly startFrameIndex: number;
  readonly endFrameIndex: number;
  readonly collapsed: boolean;
}

export interface AnimationEvaluationFrame {
  readonly id: string;
  readonly frameId: string;
  /** Stable one-based number within this captured range. */
  readonly number: number;
  /** The source timeline order, zero-based. */
  readonly order: number;
  readonly duration: number;
  readonly tags: readonly AnimationTagMetadata[];
  readonly render: RenderObservation;
  readonly renderedDigest: string;
  readonly grid: AnimationGrid;
}

export type AnimationDeltaKind = 'added' | 'removed' | 'recolored';

export interface AnimationDeltaCell {
  readonly x: number;
  readonly y: number;
  readonly kind: AnimationDeltaKind;
  readonly before: string;
  readonly after: string;
  /** Explicit aliases make the before/after symbols easy for clients to read. */
  readonly beforeSymbol: string;
  readonly afterSymbol: string;
}

export interface AnimationGridDelta {
  readonly type: 'symbol-grid.delta';
  readonly fromFrameId: string;
  readonly toFrameId: string;
  readonly fromNumber: number;
  readonly toNumber: number;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly AnimationDeltaCell[];
  readonly changedCellCount: number;
  readonly unchangedCellCount: number;
}

export interface AnimationContactSheetCell {
  readonly index: number;
  readonly row: number;
  readonly column: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly sourceRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly frameId: string;
  readonly frameNumber: number;
  readonly duration: number;
  readonly digest: string;
  readonly label: string;
}

export interface AnimationContactSheet {
  readonly type: 'animation.contact-sheet';
  readonly rows: number;
  readonly columns: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly width: number;
  readonly height: number;
  readonly format: 'rgba8';
  readonly stride: number;
  readonly smoothing: 'none';
  readonly pixels: Uint8Array;
  readonly cells: readonly AnimationContactSheetCell[];
}

export type AnimationKeyframeObservation = RenderObservation & {
  readonly frameNumber: number;
  readonly duration: number;
};

export interface AnimationEvaluationBundle {
  readonly type: 'animation.evaluation.bundle';
  readonly representationVersion: typeof ANIMATION_OBSERVATION_REPRESENTATION_VERSION;
  readonly target: ProjectTarget;
  readonly revision: number;
  readonly request: AnimationObservationRequest;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly frames: readonly AnimationEvaluationFrame[];
  readonly tags: readonly AnimationTagMetadata[];
  readonly palette: readonly { readonly id: string; readonly color: string; readonly index: number }[];
  readonly legend: readonly SymbolGridLegendEntry[];
  readonly baseGrid: AnimationGrid;
  readonly deltas: readonly AnimationGridDelta[];
  readonly contactSheet: AnimationContactSheet;
  readonly keyframes: readonly AnimationKeyframeObservation[];
  readonly digest: string;
}

export interface AnimationObservationFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type AnimationObservationResult = AnimationEvaluationBundle | AnimationObservationFailure;

class AnimationObservationError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'AnimationObservationError';
    this.editorError = editorError;
  }
}

interface CapturedAnimationState {
  readonly frames: readonly Frame[];
  readonly frameValues: readonly {
    readonly id: string;
    readonly order: number;
    readonly duration: number;
    readonly tags: string | undefined;
  }[];
  readonly layers: readonly Layer[];
  readonly layerValues: readonly CapturedLayerValue[];
  readonly cels: ReadonlyMap<string, Cel>;
  readonly celValues: ReadonlyMap<string, CapturedCelValue>;
  readonly tags: readonly FrameTag[];
  readonly tagValues: readonly AnimationTagMetadata[];
  readonly palette: readonly { readonly id: string; readonly color: string }[];
  readonly currentFrameId: string;
  readonly isPlaying: boolean;
  readonly playbackMode: string;
  readonly activeTagId: string | null;
}

interface CapturedLayerValue {
  readonly id: string;
  readonly name: string;
  readonly type: Layer['type'];
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: Layer['blendMode'];
  readonly parentId: string | null;
  readonly continuous: boolean | undefined;
  readonly canvas: HTMLCanvasElement | undefined;
  readonly textData: string | undefined;
  readonly referenceData: string | undefined;
}

interface CapturedCelValue {
  readonly id: string;
  readonly layerId: string;
  readonly frameId: string;
  readonly canvas: HTMLCanvasElement;
  readonly indexBuffer: Uint8Array | undefined;
  readonly indexValues: Uint8Array | undefined;
  readonly linkedCelId: string | undefined;
  readonly linkType: Cel['linkType'];
  readonly opacity: number | undefined;
  readonly textCelData: string | undefined;
  readonly pixels: Uint8ClampedArray;
}

interface CapturedAnimationPlan {
  readonly state: CapturedAnimationState;
  readonly selectedFrames: readonly Frame[];
  readonly selectedTags: readonly AnimationTagMetadata[];
  readonly palette: readonly { readonly id: string; readonly color: string; readonly index: number }[];
  readonly width: number;
  readonly height: number;
}

interface AnimationDimensions {
  readonly width: number;
  readonly height: number;
}

interface AnimationSources {
  readonly frames: readonly Frame[];
  readonly layers: readonly Layer[];
  readonly cels: ReadonlyMap<string, Cel>;
  readonly tags: readonly FrameTag[];
  readonly palette: readonly { readonly id: string; readonly color: string }[];
}

/** Normalize the public request before a target is looked up. */
export function normalizeAnimationObservationRequest(input: unknown): AnimationObservationRequest {
  if (!isRecord(input)) throw animationError('invalid_request', false, { reason: 'request' });
  assertExactKeys(input, [
    'operation',
    'target',
    'expectedRevision',
    'revision',
    'range',
    'frameRange',
    'background',
    'scale',
    'keyframes',
    'keyframeIds',
    'expectedDigest',
  ], 'animation_request');
  if (input.operation !== undefined && input.operation !== ANIMATION_OBSERVATION_ID) {
    throw animationError('invalid_request', false, { reason: 'operation' });
  }
  const target = normalizeTarget(input.target);
  const expectedRevision = normalizeRevision(input.expectedRevision ?? input.revision);
  const rangeValue = input.range ?? input.frameRange;
  if (rangeValue === undefined) throw animationError('invalid_request', false, { reason: 'range' });
  const range = normalizeRange(rangeValue);
  const background = normalizeBackground(input.background);
  const scale = normalizeScale(input.scale);
  const keyframeValue = input.keyframes ?? input.keyframeIds;
  if (!Array.isArray(keyframeValue)) throw animationError('invalid_request', false, { reason: 'keyframes' });
  if (keyframeValue.length < 1 || keyframeValue.length > ANIMATION_OBSERVATION_MAX_KEYFRAMES) {
    throw animationError('bounds_exceeded', false, {
      reason: 'keyframes',
      min: 1,
      max: ANIMATION_OBSERVATION_MAX_KEYFRAMES,
    });
  }
  const keyframes = keyframeValue.map((value) => normalizeIdentity(value, 'keyframe'));
  if (new Set(keyframes).size !== keyframes.length) {
    throw animationError('invalid_request', false, { reason: 'keyframes_unique' });
  }
  if (!('expectedDigest' in input)) throw animationError('invalid_request', false, { reason: 'digest' });
  const expectedDigest = input.expectedDigest;
  if (expectedDigest !== null && (typeof expectedDigest !== 'string' || !/^[0-9a-f]{64}$/.test(expectedDigest))) {
    throw animationError('invalid_request', false, { reason: 'digest' });
  }
  return {
    target,
    expectedRevision,
    range,
    background,
    scale,
    keyframes,
    expectedDigest,
  };
}

/**
 * Capture one detached animation evaluation bundle. Every composite frame is
 * rendered by the shipped Render Observation implementation before any
 * Symbol Grid, contact-sheet, or digest data is assembled.
 */
export async function observeAnimation(
  context: ProjectContext,
  request: AnimationObservationRequest,
): Promise<AnimationObservationResult> {
  try {
    const plan = captureAnimationPlan(context, request);
    const captured = await renderAnimationFrames(context, request, plan);
    assertCapturedAnimationState(context, request, plan.state);
    const artifacts = createAnimationArtifacts(captured.frames, request.keyframes);
    const digest = await createAnimationDigest({
      request,
      canvas: { width: plan.width, height: plan.height },
      frames: captured.frames,
      tags: plan.selectedTags,
      palette: plan.palette,
      legend: captured.legend,
      baseGrid: artifacts.baseGrid,
      deltas: artifacts.deltas,
      contactSheet: artifacts.contactSheet,
      keyframes: artifacts.keyframes,
    });

    assertCapturedAnimationState(context, request, plan.state);
    if (request.expectedDigest !== null && request.expectedDigest !== digest) {
      throw animationError('revision_conflict', true, { reason: 'animation_digest' });
    }

    return {
      type: 'animation.evaluation.bundle',
      representationVersion: ANIMATION_OBSERVATION_REPRESENTATION_VERSION,
      target: { projectId: request.target.projectId },
      revision: request.expectedRevision,
      request: cloneRequest(request),
      canvas: { width: plan.width, height: plan.height },
      frames: captured.frames.map(cloneEvaluationFrame),
      tags: plan.selectedTags.map(cloneTag),
      palette: plan.palette.map((entry) => ({ ...entry })),
      legend: captured.legend.map(cloneLegendEntry),
      baseGrid: artifacts.baseGrid,
      deltas: artifacts.deltas.map(cloneDelta),
      contactSheet: cloneContactSheet(artifacts.contactSheet),
      keyframes: artifacts.keyframes.map((keyframe) => ({ ...keyframe, pixels: new Uint8Array(keyframe.pixels) })),
      digest,
    };
  } catch (error) {
    if (isAnimationObservationFailure(error)) return error;
    return { ok: false, error: toAnimationError(error) };
  }
}

/** Reconstruct all grids from a bundle's base and ordered deltas. */
export function reconstructAnimationGrids(bundle: AnimationEvaluationBundle): readonly AnimationGrid[] {
  const grids: AnimationGrid[] = [cloneGrid(bundle.baseGrid)];
  for (const delta of bundle.deltas) {
    const previous = grids[grids.length - 1]!;
    const cells = previous.rows.map((row) => Array.from(row));
    for (const cell of delta.cells) cells[cell.y]![cell.x] = cell.after;
    grids.push({
      type: 'symbol-grid',
      width: previous.width,
      height: previous.height,
      rows: cells.map((row) => row.join('')),
    });
  }
  return grids;
}

export function isAnimationObservationFailure(
  value: unknown,
): value is AnimationObservationFailure {
  return isRecord(value) && value.ok === false && isRecord(value.error);
}

interface CapturedAnimationFrames {
  readonly frames: readonly AnimationEvaluationFrame[];
  readonly legend: readonly SymbolGridLegendEntry[];
}

interface AnimationArtifacts {
  readonly baseGrid: AnimationGrid;
  readonly deltas: readonly AnimationGridDelta[];
  readonly contactSheet: AnimationContactSheet;
  readonly keyframes: readonly AnimationKeyframeObservation[];
}

async function renderAnimationFrames(
  context: ProjectContext,
  request: AnimationObservationRequest,
  plan: CapturedAnimationPlan,
): Promise<CapturedAnimationFrames> {
  let legend: readonly SymbolGridLegendEntry[] = [];
  const frames: AnimationEvaluationFrame[] = [];
  for (const [rangeIndex, frame] of plan.selectedFrames.entries()) {
    const renderResult = await renderProjectObservation(context, {
      target: request.target,
      expectedRevision: request.expectedRevision,
      source: { kind: 'composite', frameId: frame.id },
      background: request.background,
      scale: request.scale,
      expectedDigest: null,
    });
    if (isRenderObservationFailure(renderResult)) {
      throw new AnimationObservationError(renderResult.error);
    }
    const render = cloneRenderObservation(renderResult);
    const encoding = encodeSymbolGridPixels(
      render.pixels,
      render.width,
      render.height,
      plan.palette,
      legend,
    );
    legend = encoding.legend.map(cloneLegendEntry);
    frames.push({
      id: frame.id,
      frameId: frame.id,
      number: rangeIndex + 1,
      order: frame.order,
      duration: frame.duration,
      tags: plan.selectedTags.filter((tag) => tag.startFrameIndex <= frame.order && tag.endFrameIndex >= frame.order),
      render,
      renderedDigest: render.digest,
      grid: createGrid(encoding, render.width, render.height),
    });
  }
  assertLegendBounds(legend);
  return { frames, legend };
}

function assertLegendBounds(legend: readonly SymbolGridLegendEntry[]): void {
  if (legend.length > ANIMATION_OBSERVATION_MAX_LEGEND_ENTRIES) {
    throw animationError('limit_exceeded', false, {
      reason: 'legend',
      max: ANIMATION_OBSERVATION_MAX_LEGEND_ENTRIES,
    });
  }
}

function createAnimationArtifacts(
  frames: readonly AnimationEvaluationFrame[],
  keyframeIds: readonly string[],
): AnimationArtifacts {
  const firstFrame = frames[0];
  if (!firstFrame) throw animationError('invalid_state', false, { reason: 'animation_frames' });
  const baseGrid = cloneGrid(firstFrame.grid);
  const deltas = frames.slice(1).map((frame, index) => createGridDelta(frames[index]!, frame));
  const contactSheet = createContactSheet(frames);
  const keyframes = createKeyframeObservations(frames, keyframeIds);
  return { baseGrid, deltas, contactSheet, keyframes };
}

function createKeyframeObservations(
  frames: readonly AnimationEvaluationFrame[],
  keyframeIds: readonly string[],
): readonly AnimationKeyframeObservation[] {
  return keyframeIds.map((frameId) => {
    const frame = frames.find((candidate) => candidate.frameId === frameId);
    if (!frame) throw animationError('invalid_state', false, { reason: 'keyframe_range' });
    return {
      ...cloneRenderObservation(frame.render),
      frameNumber: frame.number,
      duration: frame.duration,
    };
  });
}

function captureAnimationPlan(
  context: ProjectContext,
  request: AnimationObservationRequest,
): CapturedAnimationPlan {
  validateRequest(request);
  assertAnimationTarget(context, request);
  assertAnimationEnvironment(context);
  const dimensions = readAnimationDimensions(context);
  const sources = readAnimationSources(context);
  validateAnimationSources(context, sources, dimensions);

  const selectedFrames = selectFrames(sources.frames, sources.tags, request.range);
  if (selectedFrames.length < ANIMATION_OBSERVATION_MIN_FRAMES || selectedFrames.length > ANIMATION_OBSERVATION_MAX_FRAMES) {
    throw animationError('bounds_exceeded', false, {
      reason: 'frame_range',
      min: ANIMATION_OBSERVATION_MIN_FRAMES,
      max: ANIMATION_OBSERVATION_MAX_FRAMES,
    });
  }
  const selectedIds = new Set(selectedFrames.map((frame) => frame.id));
  assertKeyframesSelected(request.keyframes, selectedIds);
  const selectedTags = sources.tags
    .filter((tag) => request.range === 'all' || rangesIntersect(tag, selectedFrames[0]!.order, selectedFrames[selectedFrames.length - 1]!.order))
    .map(cloneTag);
  const palette = sources.palette.map((entry, index) => ({ id: entry.id, color: entry.color.toLowerCase(), index }));
  return {
    state: captureAnimationState(context, sources),
    selectedFrames,
    selectedTags,
    palette,
    width: dimensions.width,
    height: dimensions.height,
  };
}

function assertAnimationTarget(context: ProjectContext, request: AnimationObservationRequest): void {
  if (context.isDisposed || context.project.id.value !== request.target.projectId) {
    throw animationError('target_not_found', true);
  }
  if (context.project.revision.value !== request.expectedRevision) {
    throw animationError('revision_conflict', true, {
      expectedRevision: request.expectedRevision,
      currentRevision: context.project.revision.value,
    });
  }
}

function assertAnimationEnvironment(context: ProjectContext): void {
  assertAnimationDrawingMode(context);
  assertAnimationSelection(context);
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw animationError('internal', true, { reason: 'render_surface' });
  }
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
    throw animationError('internal', true, { reason: 'digest_support' });
  }
}

function assertAnimationDrawingMode(context: ProjectContext): void {
  if (context.guidedDrawing.active) {
    throw animationError('unsupported', false, { feature: 'guided-drawing-animation' });
  }
}

function assertAnimationSelection(context: ProjectContext): void {
  const selectionType = context.selection.state.value.type;
  if (selectionType === 'floating' || selectionType === 'transforming') {
    throw animationError('invalid_state', false, { reason: 'selection_in_progress' });
  }
}

function readAnimationDimensions(context: ProjectContext): AnimationDimensions {
  const width = context.project.width.value;
  const height = context.project.height.value;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1
      || width > ANIMATION_OBSERVATION_MAX_CANVAS_DIMENSION
      || height > ANIMATION_OBSERVATION_MAX_CANVAS_DIMENSION) {
    throw animationError('bounds_exceeded', false, {
      reason: 'canvas_dimensions',
      max: ANIMATION_OBSERVATION_MAX_CANVAS_DIMENSION,
    });
  }
  const framePixels = width * height;
  if (!Number.isSafeInteger(framePixels) || framePixels > ANIMATION_OBSERVATION_MAX_FRAME_PIXELS) {
    throw animationError('limit_exceeded', false, {
      reason: 'frame_pixels',
      max: ANIMATION_OBSERVATION_MAX_FRAME_PIXELS,
    });
  }
  return { width, height };
}

function readAnimationSources(context: ProjectContext): AnimationSources {
  return {
    frames: context.animation.frames.value,
    layers: context.layers.layers.value,
    cels: context.animation.cels.value,
    tags: context.animation.tags.value,
    palette: context.palette.getProjectPaletteEntries(),
  };
}

function validateAnimationSources(
  context: ProjectContext,
  sources: AnimationSources,
  dimensions: AnimationDimensions,
): void {
  validateFrames(sources.frames);
  validateTags(sources.tags, sources.frames.length);
  validatePalette(sources.palette);
  validateCels(context, sources.frames, sources.layers, sources.cels, dimensions.width, dimensions.height, sources.palette.length);
}

function assertKeyframesSelected(keyframeIds: readonly string[], selectedIds: ReadonlySet<string>): void {
  for (const keyframeId of keyframeIds) {
    if (!selectedIds.has(keyframeId)) throw animationError('invalid_request', false, { reason: 'keyframe_range' });
  }
}

function captureAnimationState(context: ProjectContext, sources: AnimationSources): CapturedAnimationState {
  return {
    frames: sources.frames,
    frameValues: sources.frames.map((frame) => ({
      id: frame.id,
      order: frame.order,
      duration: frame.duration,
      tags: serializeOptional(frame.tags),
    })),
    layers: sources.layers,
    layerValues: sources.layers.map(captureLayerValue),
    cels: sources.cels,
    celValues: captureCelValues(sources.cels),
    tags: sources.tags,
    tagValues: sources.tags.map(cloneTag),
    palette: sources.palette.map((entry) => ({ ...entry })),
    currentFrameId: context.animation.currentFrameId.value,
    isPlaying: context.animation.isPlaying.value,
    playbackMode: context.animation.playbackMode.value,
    activeTagId: context.animation.activeTagId.value,
  };
}

function captureLayerValue(layer: Layer): CapturedLayerValue {
  return {
    id: layer.id,
    name: layer.name,
    type: layer.type,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    parentId: layer.parentId,
    continuous: layer.continuous,
    canvas: layer.canvas,
    textData: serializeOptional(layer.textData),
    referenceData: serializeOptional(layer.referenceData),
  };
}

function captureCelValues(cels: ReadonlyMap<string, Cel>): ReadonlyMap<string, CapturedCelValue> {
  const values = new Map<string, CapturedCelValue>();
  for (const [key, cel] of cels.entries()) values.set(key, captureCelValue(cel));
  return values;
}

function captureCelValue(cel: Cel): CapturedCelValue {
  return {
    id: cel.id,
    layerId: cel.layerId,
    frameId: cel.frameId,
    canvas: cel.canvas,
    indexBuffer: cel.indexBuffer,
    indexValues: cel.indexBuffer ? new Uint8Array(cel.indexBuffer) : undefined,
    linkedCelId: cel.linkedCelId,
    linkType: cel.linkType,
    opacity: cel.opacity,
    textCelData: serializeOptional(cel.textCelData),
    pixels: readCelPixels(cel.canvas),
  };
}

function serializeOptional(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return JSON.stringify(value);
}

function selectFrames(
  frames: readonly Frame[],
  tags: readonly FrameTag[],
  range: AnimationObservationRange,
): readonly Frame[] {
  if (range === 'all') return frames.slice();
  const tag = tags.find((candidate) => candidate.id === range.tagId);
  if (!tag) throw animationError('target_not_found', true, { resource: 'tag' });
  return frames.slice(tag.startFrameIndex, tag.endFrameIndex + 1);
}

function validateRequest(request: AnimationObservationRequest): void {
  normalizeIdentity(request.target.projectId, 'target');
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
    throw animationError('invalid_request', false, { reason: 'expected_revision' });
  }
  normalizeRange(request.range);
  normalizeBackground(request.background);
  normalizeScale(request.scale);
  if (!Array.isArray(request.keyframes) || request.keyframes.length < 1 || request.keyframes.length > ANIMATION_OBSERVATION_MAX_KEYFRAMES) {
    throw animationError('bounds_exceeded', false, { reason: 'keyframes', max: ANIMATION_OBSERVATION_MAX_KEYFRAMES });
  }
  const ids = request.keyframes.map((frameId) => normalizeIdentity(frameId, 'keyframe'));
  if (new Set(ids).size !== ids.length) throw animationError('invalid_request', false, { reason: 'keyframes_unique' });
  if (request.expectedDigest !== null && !/^[0-9a-f]{64}$/.test(request.expectedDigest)) {
    throw animationError('invalid_request', false, { reason: 'digest' });
  }
}

function validateFrames(frames: readonly Frame[]): void {
  const ids = new Set<string>();
  frames.forEach((frame, index) => {
    normalizeIdentity(frame.id, 'frame');
    if (ids.has(frame.id)) throw animationError('invalid_state', false, { reason: 'frame_identity' });
    ids.add(frame.id);
    if (!Number.isSafeInteger(frame.order) || frame.order !== index) {
      throw animationError('invalid_state', false, { reason: 'frame_order' });
    }
    if (!Number.isSafeInteger(frame.duration) || frame.duration < 1) {
      throw animationError('invalid_state', false, { reason: 'frame_duration' });
    }
  });
}

function validateTags(tags: readonly FrameTag[], frameCount: number): void {
  const ids = new Set<string>();
  tags.forEach((tag) => {
    normalizeIdentity(tag.id, 'tag');
    if (ids.has(tag.id)) throw animationError('invalid_state', false, { reason: 'tag_identity' });
    ids.add(tag.id);
    if (!Number.isSafeInteger(tag.startFrameIndex) || !Number.isSafeInteger(tag.endFrameIndex)
        || tag.startFrameIndex < 0 || tag.endFrameIndex < tag.startFrameIndex
        || tag.endFrameIndex >= frameCount) {
      throw animationError('invalid_state', false, { reason: 'tag_range' });
    }
  });
}

function validatePalette(
  entries: readonly { readonly id: string; readonly color: string }[],
): void {
  if (entries.length > ANIMATION_OBSERVATION_MAX_PALETTE_ENTRIES) {
    throw animationError('limit_exceeded', false, { reason: 'palette', max: ANIMATION_OBSERVATION_MAX_PALETTE_ENTRIES });
  }
  const ids = new Set<string>();
  entries.forEach((entry) => {
    normalizeIdentity(entry.id, 'palette_entry');
    if (ids.has(entry.id)) throw animationError('invalid_state', false, { reason: 'palette_identity' });
    ids.add(entry.id);
    if (typeof entry.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(entry.color)) {
      throw animationError('invalid_state', false, { reason: 'palette_color' });
    }
  });
}

function validateCels(
  context: ProjectContext,
  frames: readonly Frame[],
  layers: readonly Layer[],
  cels: ReadonlyMap<string, Cel>,
  width: number,
  height: number,
  paletteLength: number,
): void {
  validateLayerIds(layers);
  validateCelEntries(context, cels, width, height, paletteLength);
  validateRequiredCels(context, frames, layers, cels);
}

function validateLayerIds(layers: readonly Layer[]): void {
  const layerIds = new Set<string>();
  for (const layer of layers) {
    normalizeIdentity(layer.id, 'layer');
    if (layerIds.has(layer.id)) throw animationError('invalid_state', false, { reason: 'layer_identity' });
    layerIds.add(layer.id);
  }
}

function validateCelEntries(
  context: ProjectContext,
  cels: ReadonlyMap<string, Cel>,
  width: number,
  height: number,
  paletteLength: number,
): void {
  const celIds = new Set<string>();
  for (const [key, cel] of cels.entries()) {
    validateCelIdentity(cel, celIds);
    validateCelCanvas(cel, width, height);
    validateCelIndexBuffer(cel, width, height, paletteLength);
    if (key !== context.animation.getCelKey(cel.layerId, cel.frameId)) {
      throw animationError('invalid_state', false, { reason: 'cel_key' });
    }
  }
}

function validateCelIdentity(cel: Cel, celIds: Set<string>): void {
  normalizeIdentity(cel.id, 'cel');
  if (celIds.has(cel.id)) throw animationError('invalid_state', false, { reason: 'cel_identity' });
  celIds.add(cel.id);
}

function validateCelCanvas(cel: Cel, width: number, height: number): void {
  if (!cel.canvas || cel.canvas.width !== width || cel.canvas.height !== height) {
    throw animationError('invalid_state', false, { reason: 'cel_canvas_shape' });
  }
}

function validateCelIndexBuffer(cel: Cel, width: number, height: number, paletteLength: number): void {
  if (cel.indexBuffer !== undefined && cel.indexBuffer.length !== width * height) {
    throw animationError('invalid_state', false, { reason: 'cel_index_shape' });
  }
  if (cel.indexBuffer?.some((index) => !Number.isSafeInteger(index) || index < 0 || index > paletteLength)) {
    throw animationError('invalid_state', false, { reason: 'cel_index_value' });
  }
}

function validateRequiredCels(
  context: ProjectContext,
  frames: readonly Frame[],
  layers: readonly Layer[],
  cels: ReadonlyMap<string, Cel>,
): void {
  for (const frame of frames) {
    for (const layer of layers) {
      if (layer.type === 'reference') continue;
      const cel = cels.get(context.animation.getCelKey(layer.id, frame.id));
      if (!cel) throw animationError('target_not_found', true, { resource: 'cel' });
      if (cel.layerId !== layer.id || cel.frameId !== frame.id) {
        throw animationError('invalid_state', false, { reason: 'cel_identity' });
      }
    }
  }
}

function assertCapturedAnimationState(
  context: ProjectContext,
  request: AnimationObservationRequest,
  state: CapturedAnimationState,
): void {
  assertCapturedTarget(context, request);
  assertCapturedReferences(context, state);
  assertCapturedTimeline(context, state);
  assertCapturedPalette(context, state);
}

function assertCapturedTarget(context: ProjectContext, request: AnimationObservationRequest): void {
  if (context.isDisposed || context.project.id.value !== request.target.projectId) {
    throw animationError('target_not_found', true);
  }
  const currentRevision = context.project.revision.value;
  if (currentRevision !== request.expectedRevision) {
    throw animationError('revision_conflict', true, {
      expectedRevision: request.expectedRevision,
      currentRevision,
    });
  }
}

function assertCapturedReferences(context: ProjectContext, state: CapturedAnimationState): void {
  if (context.animation.frames.value !== state.frames
      || context.layers.layers.value !== state.layers
      || context.animation.cels.value !== state.cels
      || context.animation.tags.value !== state.tags
      || context.animation.currentFrameId.value !== state.currentFrameId
      || context.animation.isPlaying.value !== state.isPlaying
      || context.animation.playbackMode.value !== state.playbackMode
      || context.animation.activeTagId.value !== state.activeTagId) {
    throw animationError('revision_conflict', true, { reason: 'source_changed' });
  }
  assertCapturedLayers(context.layers.layers.value, state.layerValues);
  assertCapturedCels(context.animation.cels.value, state.celValues);
}

function assertCapturedLayers(layers: readonly Layer[], expected: readonly CapturedLayerValue[]): void {
  if (layers.length !== expected.length || layers.some((layer, index) => !sameCapturedLayer(layer, expected[index]))) {
    throw animationError('revision_conflict', true, { reason: 'source_changed' });
  }
}

function sameCapturedLayer(layer: Layer, expected: CapturedLayerValue | undefined): boolean {
  if (!expected) return false;
  return sameLayerIdentity(layer, expected)
    && sameLayerPresentation(layer, expected)
    && sameLayerData(layer, expected);
}

function sameLayerIdentity(layer: Layer, expected: CapturedLayerValue): boolean {
  return layer.id === expected.id
    && layer.type === expected.type
    && layer.parentId === expected.parentId
    && layer.canvas === expected.canvas;
}

function sameLayerPresentation(layer: Layer, expected: CapturedLayerValue): boolean {
  return layer.name === expected.name
    && layer.visible === expected.visible
    && layer.locked === expected.locked
    && layer.opacity === expected.opacity
    && layer.blendMode === expected.blendMode
    && layer.continuous === expected.continuous;
}

function sameLayerData(layer: Layer, expected: CapturedLayerValue): boolean {
  return serializeOptional(layer.textData) === expected.textData
    && serializeOptional(layer.referenceData) === expected.referenceData;
}

function assertCapturedCels(
  cels: ReadonlyMap<string, Cel>,
  expected: ReadonlyMap<string, CapturedCelValue>,
): void {
  if (cels.size !== expected.size) {
    throw animationError('revision_conflict', true, { reason: 'source_changed' });
  }
  for (const [key, cel] of cels.entries()) {
    const captured = expected.get(key);
    if (!captured || !sameCapturedCel(cel, captured)) {
      throw animationError('revision_conflict', true, { reason: 'source_changed' });
    }
  }
}

function sameCapturedCel(cel: Cel, expected: CapturedCelValue): boolean {
  return sameCelIdentity(cel, expected)
    && sameCelPayload(cel, expected)
    && sameCelMetadata(cel, expected);
}

function sameCelIdentity(cel: Cel, expected: CapturedCelValue): boolean {
  return cel.id === expected.id
    && cel.layerId === expected.layerId
    && cel.frameId === expected.frameId
    && cel.canvas === expected.canvas;
}

function sameCelPayload(cel: Cel, expected: CapturedCelValue): boolean {
  return cel.indexBuffer === expected.indexBuffer
    && sameBytes(cel.indexBuffer, expected.indexValues)
    && sameBytes(readCelPixels(cel.canvas), expected.pixels);
}

function sameCelMetadata(cel: Cel, expected: CapturedCelValue): boolean {
  return cel.linkedCelId === expected.linkedCelId
    && cel.linkType === expected.linkType
    && cel.opacity === expected.opacity
    && serializeOptional(cel.textCelData) === expected.textCelData;
}

function readCelPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!drawing) throw animationError('internal', true, { reason: 'canvas_read' });
  try {
    return new Uint8ClampedArray(drawing.getImageData(0, 0, canvas.width, canvas.height).data);
  } catch {
    throw animationError('internal', true, { reason: 'canvas_read' });
  }
}

function assertCapturedTimeline(context: ProjectContext, state: CapturedAnimationState): void {
  const frames = context.animation.frames.value;
  const tags = context.animation.tags.value;
  const framesChanged = frames.length !== state.frameValues.length || frames.some((frame, index) => {
    const captured = state.frameValues[index];
    return !captured || frame.id !== captured.id || frame.order !== captured.order || frame.duration !== captured.duration
      || serializeOptional(frame.tags) !== captured.tags;
  });
  const tagsChanged = tags.length !== state.tagValues.length || tags.some((tag, index) => (
    JSON.stringify(cloneTag(tag)) !== JSON.stringify(state.tagValues[index])
  ));
  if (framesChanged || tagsChanged) {
    throw animationError('revision_conflict', true, { reason: 'timeline_changed' });
  }
}

function assertCapturedPalette(context: ProjectContext, state: CapturedAnimationState): void {
  const currentPalette = context.palette.getProjectPaletteEntries();
  if (currentPalette.length !== state.palette.length
      || currentPalette.some((entry, index) => entry.id !== state.palette[index]?.id || entry.color !== state.palette[index]?.color)) {
    throw animationError('revision_conflict', true, { reason: 'palette_changed' });
  }
}

function createGrid(encoding: SymbolGridEncoding, width: number, height: number): AnimationGrid {
  if (encoding.rows.length !== height || encoding.rows.some((row) => row.length !== width)) {
    throw animationError('invalid_state', false, { reason: 'symbol_grid_shape' });
  }
  return { type: 'symbol-grid', width, height, rows: encoding.rows.slice() };
}

function createGridDelta(from: AnimationEvaluationFrame, to: AnimationEvaluationFrame): AnimationGridDelta {
  if (from.grid.width !== to.grid.width || from.grid.height !== to.grid.height) {
    throw animationError('invalid_state', false, { reason: 'symbol_grid_dimensions' });
  }
  const cells: AnimationDeltaCell[] = [];
  let unchangedCellCount = 0;
  for (let y = 0; y < from.grid.height; y++) {
    const beforeRow = from.grid.rows[y]!;
    const afterRow = to.grid.rows[y]!;
    for (let x = 0; x < from.grid.width; x++) {
      const cell = createDeltaCell(beforeRow[x]!, afterRow[x]!, x, y);
      if (!cell) {
        unchangedCellCount++;
        continue;
      }
      cells.push(cell);
    }
  }
  assertDeltaCellBounds(cells.length, unchangedCellCount);
  return {
    type: 'symbol-grid.delta',
    fromFrameId: from.frameId,
    toFrameId: to.frameId,
    fromNumber: from.number,
    toNumber: to.number,
    width: from.grid.width,
    height: from.grid.height,
    cells,
    changedCellCount: cells.length,
    unchangedCellCount,
  };
}

function createDeltaCell(before: string, after: string, x: number, y: number): AnimationDeltaCell | undefined {
  if (before === after) return undefined;
  const kind: AnimationDeltaKind = before === '.'
    ? 'added'
    : after === '.'
      ? 'removed'
      : 'recolored';
  return { x, y, kind, before, after, beforeSymbol: before, afterSymbol: after };
}

function assertDeltaCellBounds(changedCellCount: number, unchangedCellCount: number): void {
  if (changedCellCount > ANIMATION_OBSERVATION_MAX_CELLS || unchangedCellCount > ANIMATION_OBSERVATION_MAX_CELLS) {
    throw animationError('limit_exceeded', false, { reason: 'delta_cells', max: ANIMATION_OBSERVATION_MAX_CELLS });
  }
}

function createContactSheet(frames: readonly AnimationEvaluationFrame[]): AnimationContactSheet {
  const layout = getContactSheetLayout(frames);
  const pixels = new Uint8Array(layout.byteLength);
  const cells: AnimationContactSheetCell[] = [];
  frames.forEach((frame, index) => {
    const position = getContactSheetPosition(index, layout);
    copyContactSheetPixels(frame, position, layout, pixels);
    cells.push(createContactSheetCell(frame, index, position, layout));
  });
  return {
    type: 'animation.contact-sheet',
    rows: layout.rows,
    columns: layout.columns,
    cellWidth: layout.cellWidth,
    cellHeight: layout.cellHeight,
    width: layout.width,
    height: layout.height,
    format: 'rgba8',
    stride: layout.stride,
    smoothing: 'none',
    pixels,
    cells,
  };
}

interface ContactSheetLayout {
  readonly rows: number;
  readonly columns: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly width: number;
  readonly height: number;
  readonly stride: number;
  readonly byteLength: number;
}

interface ContactSheetPosition {
  readonly row: number;
  readonly column: number;
  readonly x: number;
  readonly y: number;
}

function getContactSheetLayout(frames: readonly AnimationEvaluationFrame[]): ContactSheetLayout {
  const cellWidth = frames[0]?.render.width ?? 0;
  const cellHeight = frames[0]?.render.height ?? 0;
  const columns = Math.min(ANIMATION_OBSERVATION_MAX_CONTACT_SHEET_COLUMNS, frames.length);
  const rows = columns > 0 ? Math.ceil(frames.length / columns) : 0;
  const width = cellWidth * columns;
  const height = cellHeight * rows;
  const stride = width * 4;
  const byteLength = stride * height;
  const layout = { rows, columns, cellWidth, cellHeight, width, height, stride, byteLength };
  assertContactSheetLayout(layout);
  return layout;
}

function assertContactSheetLayout(layout: ContactSheetLayout): void {
  assertContactSheetGridBounds(layout);
  if (!Number.isSafeInteger(layout.byteLength)
      || layout.byteLength > ANIMATION_OBSERVATION_MAX_CONTACT_SHEET_BYTES) {
    throw animationError('limit_exceeded', false, {
      reason: 'contact_sheet',
      max: ANIMATION_OBSERVATION_MAX_CONTACT_SHEET_BYTES,
    });
  }
}

function assertContactSheetGridBounds(layout: ContactSheetLayout): void {
  if (!Number.isSafeInteger(layout.columns) || !Number.isSafeInteger(layout.rows)
      || layout.rows < 1 || layout.rows > ANIMATION_OBSERVATION_MAX_CONTACT_SHEET_ROWS
      || layout.columns < 1 || layout.columns > ANIMATION_OBSERVATION_MAX_CONTACT_SHEET_COLUMNS
      || !Number.isSafeInteger(layout.width) || !Number.isSafeInteger(layout.height)) {
    throw animationError('limit_exceeded', false, {
      reason: 'contact_sheet',
      max: ANIMATION_OBSERVATION_MAX_CONTACT_SHEET_BYTES,
    });
  }
}

function getContactSheetPosition(index: number, layout: ContactSheetLayout): ContactSheetPosition {
  const row = Math.floor(index / layout.columns);
  const column = index % layout.columns;
  return {
    row,
    column,
    x: column * layout.cellWidth,
    y: row * layout.cellHeight,
  };
}

function copyContactSheetPixels(
  frame: AnimationEvaluationFrame,
  position: ContactSheetPosition,
  layout: ContactSheetLayout,
  pixels: Uint8Array,
): void {
  for (let sourceRow = 0; sourceRow < layout.cellHeight; sourceRow++) {
    const sourceStart = sourceRow * frame.render.stride;
    const targetStart = (position.y + sourceRow) * layout.stride + position.x * 4;
    pixels.set(frame.render.pixels.subarray(sourceStart, sourceStart + frame.render.stride), targetStart);
  }
}

function createContactSheetCell(
  frame: AnimationEvaluationFrame,
  index: number,
  position: ContactSheetPosition,
  layout: ContactSheetLayout,
): AnimationContactSheetCell {
  return {
    index,
    row: position.row,
    column: position.column,
    x: position.x,
    y: position.y,
    width: layout.cellWidth,
    height: layout.cellHeight,
    sourceRect: { x: 0, y: 0, width: layout.cellWidth, height: layout.cellHeight },
    frameId: frame.frameId,
    frameNumber: frame.number,
    duration: frame.duration,
    digest: frame.renderedDigest,
    label: `Frame ${frame.number} · ${frame.duration} ms`,
  };
}

type AnimationDigestInput = Pick<
  AnimationEvaluationBundle,
  'request' | 'canvas' | 'frames' | 'tags' | 'palette' | 'legend'
  | 'baseGrid' | 'deltas' | 'contactSheet' | 'keyframes'
>;

async function createAnimationDigest(input: AnimationDigestInput): Promise<string> {
  const metadata = JSON.stringify({
    representation: ANIMATION_OBSERVATION_REPRESENTATION_VERSION,
    // expectedDigest validates a prior result; it is not part of the result
    // representation, so checkpoint capture remains digest-stable.
    request: { ...input.request, expectedDigest: null },
    canvas: input.canvas,
    tags: input.tags,
    palette: input.palette,
    legend: input.legend,
    frames: input.frames.map((frame) => ({
      id: frame.frameId,
      number: frame.number,
      order: frame.order,
      duration: frame.duration,
      tags: frame.tags,
      renderDigest: frame.renderedDigest,
      grid: frame.grid,
    })),
    baseGrid: input.baseGrid,
    deltas: input.deltas,
    contactSheet: {
      type: input.contactSheet.type,
      rows: input.contactSheet.rows,
      columns: input.contactSheet.columns,
      cellWidth: input.contactSheet.cellWidth,
      cellHeight: input.contactSheet.cellHeight,
      width: input.contactSheet.width,
      height: input.contactSheet.height,
      format: input.contactSheet.format,
      stride: input.contactSheet.stride,
      smoothing: input.contactSheet.smoothing,
      cells: input.contactSheet.cells,
    },
    keyframeIds: input.keyframes.map((keyframe) => keyframe.frameId),
  });
  const metadataBytes = new TextEncoder().encode(metadata);
  const bytes = new Uint8Array(metadataBytes.length + 1 + input.contactSheet.pixels.length);
  bytes.set(metadataBytes);
  bytes[metadataBytes.length] = 0;
  bytes.set(input.contactSheet.pixels, metadataBytes.length + 1);
  return createSymbolGridDigest(bytes);
}

function cloneRenderObservation(observation: RenderObservation): RenderObservation {
  return {
    ...observation,
    target: { ...observation.target },
    source: { ...observation.source },
    region: { ...observation.region },
    background: { ...observation.background },
    pixels: new Uint8Array(observation.pixels),
  };
}

function cloneEvaluationFrame(frame: AnimationEvaluationFrame): AnimationEvaluationFrame {
  return {
    ...frame,
    tags: frame.tags.map(cloneTag),
    render: cloneRenderObservation(frame.render),
    grid: cloneGrid(frame.grid),
  };
}

function cloneGrid(grid: AnimationGrid): AnimationGrid {
  return { ...grid, rows: grid.rows.slice() };
}

function cloneLegendEntry(entry: SymbolGridLegendEntry): SymbolGridLegendEntry {
  return { ...entry };
}

function cloneTag(tag: AnimationTagMetadata | FrameTag): AnimationTagMetadata {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    startFrameIndex: tag.startFrameIndex,
    endFrameIndex: tag.endFrameIndex,
    collapsed: tag.collapsed,
  };
}

function cloneDelta(delta: AnimationGridDelta): AnimationGridDelta {
  return { ...delta, cells: delta.cells.map((cell) => ({ ...cell })) };
}

function cloneContactSheet(sheet: AnimationContactSheet): AnimationContactSheet {
  return {
    ...sheet,
    pixels: new Uint8Array(sheet.pixels),
    cells: sheet.cells.map((cell) => ({ ...cell, sourceRect: { ...cell.sourceRect } })),
  };
}

function cloneRequest(request: AnimationObservationRequest): AnimationObservationRequest {
  return {
    ...request,
    target: { ...request.target },
    range: request.range === 'all' ? 'all' : { ...request.range },
    background: { ...request.background },
    keyframes: request.keyframes.slice(),
  };
}

function rangesIntersect(tag: FrameTag | AnimationTagMetadata, start: number, end: number): boolean {
  return tag.startFrameIndex <= end && tag.endFrameIndex >= start;
}

function normalizeTarget(value: unknown): ProjectTarget {
  if (!isRecord(value) || !hasOnlyKeys(value, ['projectId'])) {
    throw animationError('invalid_request', false, { reason: 'target' });
  }
  return { projectId: normalizeIdentity(value.projectId, 'target') };
}

function normalizeRange(value: unknown): AnimationObservationRange {
  if (value === 'all') return 'all';
  if (!isRecord(value)) throw animationError('invalid_request', false, { reason: 'range' });
  if ('kind' in value && value.kind !== 'tag') throw animationError('invalid_request', false, { reason: 'range_kind' });
  if (!hasOnlyKeys(value, ['tagId', 'kind']) || value.tagId === undefined) {
    throw animationError('invalid_request', false, { reason: 'range' });
  }
  return { tagId: normalizeIdentity(value.tagId, 'tag') };
}

function normalizeBackground(value: unknown): RenderBackgroundPolicy {
  if (!isRecord(value)) throw animationError('invalid_request', false, { reason: 'background' });
  if (value.kind === 'transparent' && hasOnlyKeys(value, ['kind'])) return { kind: 'transparent' };
  if (value.kind === 'solid' && hasOnlyKeys(value, ['kind', 'color'])
      && typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)) {
    return { kind: 'solid', color: value.color.toLowerCase() };
  }
  throw animationError('invalid_request', false, { reason: 'background' });
}

function normalizeScale(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < RENDER_OBSERVATION_MIN_SCALE
      || (value as number) > RENDER_OBSERVATION_MAX_SCALE) {
    throw animationError('bounds_exceeded', false, {
      reason: 'scale',
      min: RENDER_OBSERVATION_MIN_SCALE,
      max: RENDER_OBSERVATION_MAX_SCALE,
    });
  }
  return value as number;
}

function normalizeRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw animationError('invalid_request', false, { reason: 'expected_revision' });
  }
  return value as number;
}

function normalizeIdentity(value: unknown, reason: string): string {
  if (typeof value !== 'string' || value.length < 1) {
    throw animationError('invalid_request', false, { reason });
  }
  if (value.length > RENDER_OBSERVATION_MAX_IDENTITY_LENGTH) {
    throw animationError('limit_exceeded', false, { reason, max: RENDER_OBSERVATION_MAX_IDENTITY_LENGTH });
  }
  return value;
}

function assertExactKeys(value: Record<string, unknown>, allowedKeys: readonly string[], reason: string): void {
  if (!hasOnlyKeys(value, allowedKeys)) throw animationError('invalid_request', false, { reason });
}

function animationError(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
): AnimationObservationError {
  return new AnimationObservationError({ code, retryable, ...(details ? { details } : {}) });
}

function toAnimationError(error: unknown): EditorError {
  if (error instanceof AnimationObservationError) return error.editorError;
  return { code: 'internal', retryable: true, details: { reason: 'unexpected_failure' } };
}

function isRenderObservationFailure(value: RenderObservationResult): value is { readonly ok: false; readonly error: EditorError } {
  return 'ok' in value && value.ok === false;
}
