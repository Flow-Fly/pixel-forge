import type { ProjectContext } from '../stores/project-context';
import type { ProjectChangeDomain } from '../stores/project-store';
import type { Cel } from '../types/animation';
import type { ProjectTarget, EditorError } from './contracts';
import {
  RASTER_GRID_MAX_CELLS,
  RASTER_GRID_MAX_COMPOSITE_BYTES,
  RASTER_GRID_MAX_LEGEND_ENTRIES,
  RASTER_GRID_MAX_PATCHES,
  RASTER_GRID_MAX_PREPARATION_BYTES,
  RASTER_GRID_MAX_REGION_HEIGHT,
  RASTER_GRID_MAX_REGION_WIDTH,
  RASTER_GRID_MAX_STRING_LENGTH,
  RASTER_GRID_REPRESENTATION_VERSION,
  RASTER_PATCH_COMMAND_ID,
  RASTER_OBSERVATION_ID,
} from './catalog';
import { hasOnlyKeys, isRecord } from './contracts';
import { createArtworkCompositionPlan, drawArtworkComposition } from '../services/export-composition';
import { hexToRgb, normalizeHex, rgbToHex } from '../stores/palette/color-utils';

const RASTER_PATCH_KIND = 'raster.patch';
const RASTER_OBSERVATION_TYPE = 'project.raster.observation';
const RASTER_PATCH_DOMAINS: readonly ProjectChangeDomain[] = Object.freeze(['raster-content']);
const SYMBOL_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export interface RasterRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RasterLayerSourceRequest {
  readonly kind: 'layer';
  readonly layerId: string;
  readonly frameId: string;
  readonly celId?: string;
}

export interface RasterCompositeSourceRequest {
  readonly kind: 'composite';
  readonly frameId: string;
}

export type RasterObservationSourceRequest =
  | RasterLayerSourceRequest
  | RasterCompositeSourceRequest;

// fallow-ignore-next-line unused-type -- Public observation request documents the adapter boundary.
export interface RasterObservationRequest {
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly source: RasterObservationSourceRequest;
  readonly region: RasterRegion;
}

export interface RasterLayerObservationSource {
  readonly kind: 'layer';
  readonly layerId: string;
  readonly frameId: string;
  readonly celId: string;
}

export interface RasterCompositeObservationSource {
  readonly kind: 'composite';
  readonly frameId: string;
}

export type RasterObservationSource =
  | RasterLayerObservationSource
  | RasterCompositeObservationSource;

export interface SymbolGridLegendEntry {
  readonly symbol: string;
  readonly color: string;
  readonly paletteEntryId?: string;
  readonly paletteIndex?: number;
}

export interface SymbolGridPaletteEntry {
  readonly id: string;
  readonly color: string;
}

export interface SymbolGridEncoding {
  readonly rows: readonly string[];
  readonly legend: readonly SymbolGridLegendEntry[];
}

/**
 * Encode detached RGBA pixels with the same deterministic Symbol Grid rules
 * used by raster observation. Palette identities are attached only for an
 * exact opaque RGB match; no nearest-color mapping is allowed.
 */
export function encodeSymbolGridPixels(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  paletteEntries: readonly SymbolGridPaletteEntry[] = [],
  existingLegend: readonly SymbolGridLegendEntry[] = [],
): SymbolGridEncoding {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width * height > RASTER_GRID_MAX_CELLS
      || pixels.length !== width * height * 4) {
    throw symbolGridError('invalid_state', false, { reason: 'symbol_grid_pixels' });
  }

  const paletteMatches = new Map<string, { readonly id: string; readonly index: number }[]>();
  paletteEntries.forEach((entry, index) => {
    const rgb = hexToRgb(entry.color);
    if (!rgb) return;
    const key = `${rgb.r},${rgb.g},${rgb.b}`;
    const matches = paletteMatches.get(key) ?? [];
    matches.push({ id: entry.id, index: index + 1 });
    paletteMatches.set(key, matches);
  });

  const entries: SymbolGridLegendEntry[] = existingLegend.map((entry) => ({ ...entry }));
  const keys = new Map<string, string>();
  entries.forEach((entry) => keys.set(entry.color, entry.symbol));
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const cell = y * width + x;
      const pixelOffset = cell * 4;
      const r = pixels[pixelOffset] ?? 0;
      const g = pixels[pixelOffset + 1] ?? 0;
      const b = pixels[pixelOffset + 2] ?? 0;
      const a = pixels[pixelOffset + 3] ?? 0;
      if (a === 0) {
        if (r !== 0 || g !== 0 || b !== 0) {
          throw symbolGridError('invalid_state', false, { reason: 'transparent_rgba' });
        }
        row += '.';
        continue;
      }

      const paletteCandidates = a === 255 ? paletteMatches.get(`${r},${g},${b}`) : undefined;
      const paletteMatch = paletteCandidates?.length === 1 ? paletteCandidates[0] : undefined;
      const key = rgbaToHex(r, g, b, a);
      let symbol = keys.get(key);
      if (!symbol) {
        if (entries.length >= RASTER_GRID_MAX_LEGEND_ENTRIES) {
          throw symbolGridError('limit_exceeded', false, {
            reason: 'legend',
            max: RASTER_GRID_MAX_LEGEND_ENTRIES,
          });
        }
        symbol = SYMBOL_ALPHABET[entries.length] ?? '';
        keys.set(key, symbol);
        entries.push({
          symbol,
          color: rgbaToHex(r, g, b, a),
          ...(paletteMatch ? { paletteEntryId: paletteMatch.id, paletteIndex: paletteMatch.index } : {}),
        });
      }
      row += symbol;
    }
    rows.push(row);
  }
  return { rows, legend: entries };
}

export interface RasterObservation {
  readonly type: typeof RASTER_OBSERVATION_TYPE;
  readonly target: ProjectTarget;
  readonly revision: number;
  readonly source: RasterObservationSource;
  readonly sourceKind: 'layer' | 'composite';
  readonly editable: boolean;
  readonly region: RasterRegion;
  readonly origin: { readonly x: number; readonly y: number };
  readonly extent: { readonly width: number; readonly height: number };
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
  readonly legend: readonly SymbolGridLegendEntry[];
  readonly digest: string;
}

export interface RasterObservationFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type RasterObservationResult = RasterObservation | RasterObservationFailure;

export interface RasterPatchLegendEntry {
  readonly symbol: string;
  readonly color?: string;
  readonly paletteEntryId?: string;
  readonly paletteIndex?: number;
}

export interface RasterPatchRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
}

export interface RasterPatchRequest {
  readonly kind: typeof RASTER_PATCH_KIND;
  readonly layerId: string;
  readonly frameId: string;
  readonly celId: string;
  readonly region: RasterRegion;
  readonly digest: string;
  readonly legend: readonly RasterPatchLegendEntry[];
  readonly patches: readonly RasterPatchRectangle[];
}

export interface RasterPatchResult {
  readonly type: typeof RASTER_PATCH_COMMAND_ID;
  readonly changedBounds: RasterRegion;
}

export interface RasterPatchChildInput {
  readonly command: string;
  readonly input: Readonly<Record<string, unknown>>;
}

interface RasterPixelRead {
  readonly pixels: Uint8ClampedArray;
  readonly indices?: Uint8Array;
  readonly celId?: string;
}

interface ResolvedPatchColor {
  readonly rgba: readonly [number, number, number, number];
  readonly paletteIndex: number;
}

interface PreparedRasterPatchSnapshot {
  readonly pixels: Uint8ClampedArray;
  readonly indices?: Uint8Array;
}

export interface PreparedRasterPatchChange {
  readonly request: RasterPatchRequest;
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly layerId: string;
  readonly frameId: string;
  readonly canvas: HTMLCanvasElement;
  readonly drawing: CanvasRenderingContext2D;
  readonly before: PreparedRasterPatchSnapshot;
  readonly after: PreparedRasterPatchSnapshot;
  readonly changedBounds: RasterRegion;
  readonly domains: readonly ProjectChangeDomain[];
  readonly snapshotBytes: number;
}

class SymbolGridError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'SymbolGridError';
    this.editorError = editorError;
  }
}

/**
 * Observe one bounded source region without exposing a canvas or an index
 * buffer. A layer read remains editable; a composite read is proof only.
 */
export async function observeRaster(
  context: ProjectContext,
  input: unknown,
): Promise<RasterObservationResult> {
  try {
    const request = normalizeObservationRequest(input);
    validateTargetAndRevision(context, request.target, request.expectedRevision);
    validateEditorAvailability(context);
    validateRegionContained(request.region, context.project.width.value, context.project.height.value);
    const read = await readObservationPixels(context, request);
    const grid = buildSymbolGrid(context, request, read);
    return {
      type: RASTER_OBSERVATION_TYPE,
      target: { projectId: request.target.projectId },
      revision: request.expectedRevision,
      source: grid.source,
      sourceKind: request.source.kind,
      editable: request.source.kind === 'layer',
      region: { ...request.region },
      origin: { x: request.region.x, y: request.region.y },
      extent: { width: request.region.width, height: request.region.height },
      width: request.region.width,
      height: request.region.height,
      rows: grid.rows,
      legend: grid.legend,
      digest: await createDigest(request, {
        ...grid,
        pixels: read.pixels,
        ...(read.indices ? { indices: read.indices } : {}),
      }),
    };
  } catch (error) {
    return { ok: false, error: toEditorError(error) };
  }
}

/**
 * Prepare an exact layer patch. Observation, legend resolution, full payload
 * capture, and every after-state allocation finish before history execution.
 */
// fallow-ignore-next-line complexity -- The patch preflight keeps every bounded validation and snapshot allocation before mutation.
export async function prepareRasterPatchChange(
  context: ProjectContext,
  child: RasterPatchChildInput,
  target: ProjectTarget,
  expectedRevision: number,
): Promise<PreparedRasterPatchChange> {
  const request = normalizePatchRequest(child.input);
  validateTargetAndRevision(context, target, expectedRevision);
  validateEditorAvailability(context);
  const layer = context.layers.layers.value.find((candidate) => candidate.id === request.layerId);
  if (!layer || layer.type !== 'image') {
    throw symbolGridError('unsupported', false, { reason: 'editable_image_layer' });
  }
  if (layer.locked || !layer.visible) {
    throw symbolGridError('invalid_state', false, { reason: 'layer_not_editable' });
  }
  const frame = context.animation.frames.value.find((candidate) => candidate.id === request.frameId);
  if (!frame) throw symbolGridError('target_not_found', true, { resource: 'frame' });

  validateRegionContained(request.region, context.project.width.value, context.project.height.value);
  validatePatchesContained(request.patches, request.region, context.project.width.value, context.project.height.value);
  validatePatchOverlap(request.patches);
  validatePatchSymbols(request);

  const observed = await observeRaster(context, {
    target,
    expectedRevision,
    source: {
      kind: 'layer',
      layerId: request.layerId,
      frameId: request.frameId,
      ...(request.celId ? { celId: request.celId } : {}),
    },
    region: request.region,
  });
  if (isRasterObservationFailure(observed)) throw new SymbolGridError(observed.error);
  if (observed.source.kind !== 'layer') {
    throw symbolGridError('internal', true, { reason: 'layer_observation' });
  }
  if (request.celId && observed.source.celId !== request.celId) {
    throw symbolGridError('revision_conflict', true, { reason: 'cel_changed' });
  }
  if (observed.digest !== request.digest) {
    throw symbolGridError('revision_conflict', true, { reason: 'raster_digest' });
  }

  const key = context.animation.getCelKey(request.layerId, request.frameId);
  const cel = context.animation.cels.value.get(key);
  if (!cel || cel.id !== observed.source.celId) {
    throw symbolGridError('revision_conflict', true, { reason: 'cel_changed' });
  }
  if (cel.layerId !== request.layerId || cel.frameId !== request.frameId) {
    throw symbolGridError('invalid_state', false, { reason: 'cel_identity' });
  }
  const canvas = cel.canvas;
  if (!canvas || canvas.width !== context.project.width.value || canvas.height !== context.project.height.value) {
    throw symbolGridError('invalid_state', false, { reason: 'canvas_shape' });
  }
  const drawing = getDrawingContext(canvas);
  const indexBuffer = cel.indexBuffer;
  if (indexBuffer && indexBuffer.length !== canvas.width * canvas.height) {
    throw symbolGridError('invalid_state', false, { reason: 'index_buffer_shape' });
  }
  if (indexBuffer && hasSharedIndexBuffer(context, cel, indexBuffer)) {
    throw symbolGridError('unsupported', false, { reason: 'shared_index_buffer' });
  }
  validatePreparationBytes(canvas.width, canvas.height, Boolean(indexBuffer));

  const colors = resolvePatchLegend(context, request.legend);
  const beforePixels = readFullPixels(drawing, canvas);
  const beforeIndices = indexBuffer ? new Uint8Array(indexBuffer) : undefined;
  if (beforeIndices) validateIndexedPixels(beforePixels, beforeIndices, context);
  const afterPixels = new Uint8ClampedArray(beforePixels);
  const afterIndices = beforeIndices ? new Uint8Array(beforeIndices) : undefined;
  const changedBounds = applyPatchValues(
    request.patches,
    colors,
    afterPixels,
    afterIndices,
    canvas.width,
    beforePixels,
    beforeIndices,
  );
  if (!changedBounds) throw symbolGridError('invalid_request', false, { reason: 'no_change' });

  return {
    request,
    target: { projectId: target.projectId },
    expectedRevision,
    layerId: request.layerId,
    frameId: request.frameId,
    canvas,
    drawing,
    before: {
      pixels: beforePixels,
      ...(beforeIndices ? { indices: beforeIndices } : {}),
    },
    after: {
      pixels: afterPixels,
      ...(afterIndices ? { indices: afterIndices } : {}),
    },
    changedBounds,
    domains: RASTER_PATCH_DOMAINS,
    snapshotBytes: beforePixels.byteLength + afterPixels.byteLength
      + (beforeIndices?.byteLength ?? 0) + (afterIndices?.byteLength ?? 0),
  };
}

export function applyPreparedRasterPatchChange(
  context: ProjectContext,
  prepared: PreparedRasterPatchChange,
  phase: 'before' | 'after',
): void {
  assertPreparedRasterPatchChange(context, prepared, phase === 'after' ? 'before' : 'after');
  const snapshot = phase === 'after' ? prepared.after : prepared.before;
  const currentIndexBuffer = getCurrentIndexBuffer(context, prepared);
  const previousPixels = readFullPixels(prepared.drawing, prepared.canvas);
  try {
    writeFullPixels(prepared.drawing, prepared.canvas, snapshot.pixels);
    applyIndexSnapshot(context, prepared, snapshot.indices);
    context.dirtyRect.markDirty(prepared.changedBounds);
  } catch (error) {
    try {
      writeFullPixels(prepared.drawing, prepared.canvas, previousPixels);
      restoreIndexSnapshot(context, prepared, currentIndexBuffer);
    } catch {
      throw symbolGridError('internal', false, { reason: 'raster_patch_rollback' });
    }
    throw error;
  }
}

function applyIndexSnapshot(
  context: ProjectContext,
  prepared: PreparedRasterPatchChange,
  indices: Uint8Array | undefined,
): void {
  if (indices && indices.length !== prepared.canvas.width * prepared.canvas.height) {
    throw symbolGridError('internal', false, { reason: 'index_snapshot' });
  }
  setCurrentIndexBuffer(context, prepared, indices ? new Uint8Array(indices) : undefined);
}

function restoreIndexSnapshot(
  context: ProjectContext,
  prepared: PreparedRasterPatchChange,
  previousIndexBuffer: Uint8Array | undefined,
): void {
  setCurrentIndexBuffer(context, prepared, previousIndexBuffer);
}

function setCurrentIndexBuffer(
  context: ProjectContext,
  prepared: PreparedRasterPatchChange,
  indexBuffer: Uint8Array | undefined,
): void {
  const key = context.animation.getCelKey(prepared.layerId, prepared.frameId);
  const cels = context.animation.cels.value;
  const cel = cels.get(key);
  if (!cel) throw symbolGridError('revision_conflict', true, { reason: 'cel_changed' });
  if (cel.indexBuffer === indexBuffer) return;

  const nextCels = new Map(cels);
  nextCels.set(key, {
    ...cel,
    ...(indexBuffer ? { indexBuffer } : { indexBuffer: undefined }),
  });
  context.animation.cels.value = nextCels;
}

export function assertPreparedRasterPatchChange(
  context: ProjectContext,
  prepared: PreparedRasterPatchChange,
  phase: 'before' | 'after',
): void {
  validateTarget(context, prepared.target);
  validateEditorAvailability(context);
  const cel = context.animation.cels.value.get(
    context.animation.getCelKey(prepared.layerId, prepared.frameId),
  );
  if (!cel || cel.canvas !== prepared.canvas
      || (prepared.request.celId !== undefined && cel.id !== prepared.request.celId)) {
    throw symbolGridError('revision_conflict', true, { reason: 'cel_changed' });
  }
  const currentIndexBuffer = getCurrentIndexBuffer(context, prepared);
  if (currentIndexBuffer && currentIndexBuffer.length !== prepared.canvas.width * prepared.canvas.height) {
    throw symbolGridError('revision_conflict', true, { reason: 'index_buffer_changed' });
  }
  if (currentIndexBuffer && hasSharedIndexBuffer(context, cel, currentIndexBuffer)) {
    throw symbolGridError('unsupported', false, { reason: 'shared_index_buffer' });
  }
  const currentPixels = readFullPixels(prepared.drawing, prepared.canvas);
  const expected = phase === 'after' ? prepared.after : prepared.before;
  if (!sameBytes(currentPixels, expected.pixels)) {
    throw symbolGridError('revision_conflict', true, { reason: 'pixels_changed' });
  }
  const indexMatches = expected.indices
    ? sameOptionalBytes(currentIndexBuffer, expected.indices)
    : currentIndexBuffer === undefined || isDerivedIndexBuffer(context, prepared, currentIndexBuffer);
  if (!indexMatches) {
    throw symbolGridError('revision_conflict', true, { reason: 'index_buffer_changed' });
  }
}

export function isRasterObservationFailure(
  value: RasterObservationResult,
): value is RasterObservationFailure {
  return 'ok' in value && value.ok === false;
}

function normalizeObservationRequest(input: unknown): RasterObservationRequest {
  if (!isRecord(input)) throw symbolGridError('invalid_request', false, { reason: 'request' });
  assertExactKeys(input, ['operation', 'target', 'expectedRevision', 'source', 'region'], 'request');
  if (input.operation !== undefined && input.operation !== RASTER_OBSERVATION_ID) {
    throw symbolGridError('invalid_request', false, { reason: 'operation' });
  }
  const target = normalizeTarget(input.target);
  const expectedRevision = normalizeRevision(input.expectedRevision);
  return {
    target,
    expectedRevision,
    source: normalizeObservationSource(input.source),
    region: normalizeRegion(input.region),
  };
}

function normalizeObservationSource(value: unknown): RasterObservationSourceRequest {
  if (!isRecord(value)) throw symbolGridError('invalid_request', false, { reason: 'source' });
  if (value.kind === 'layer') {
    assertExactKeys(value, ['kind', 'layerId', 'frameId', 'celId'], 'layer_source');
    return {
      kind: 'layer',
      layerId: normalizeString(value.layerId, 'layer_id'),
      frameId: normalizeString(value.frameId, 'frame_id'),
      ...(value.celId === undefined ? {} : { celId: normalizeString(value.celId, 'cel_id') }),
    };
  }
  if (value.kind === 'composite') {
    assertExactKeys(value, ['kind', 'frameId'], 'composite_source');
    return { kind: 'composite', frameId: normalizeString(value.frameId, 'frame_id') };
  }
  throw symbolGridError('invalid_request', false, { reason: 'source_kind' });
}

// fallow-ignore-next-line complexity -- The transport schema is a deliberately explicit bounded discriminated request.
function normalizePatchRequest(input: Readonly<Record<string, unknown>>): RasterPatchRequest {
  assertExactKeys(input, [
    'kind',
    'layerId',
    'frameId',
    'celId',
    'region',
    'digest',
    'legend',
    'patches',
  ], 'raster_patch');
  if (input.kind !== RASTER_PATCH_KIND) {
    throw symbolGridError('invalid_request', false, { reason: 'patch_kind' });
  }
  const digest = input.digest;
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) {
    throw symbolGridError('invalid_request', false, { reason: 'digest' });
  }
  if (!Array.isArray(input.legend)) throw symbolGridError('invalid_request', false, { reason: 'legend' });
  if (input.legend.length > RASTER_GRID_MAX_LEGEND_ENTRIES) {
    throw symbolGridError('limit_exceeded', false, { reason: 'legend', max: RASTER_GRID_MAX_LEGEND_ENTRIES });
  }
  if (!Array.isArray(input.patches)) throw symbolGridError('invalid_request', false, { reason: 'patches' });
  if (input.patches.length === 0) {
    throw symbolGridError('invalid_request', false, { reason: 'patches_empty' });
  }
  if (input.patches.length > RASTER_GRID_MAX_PATCHES) {
    throw symbolGridError('limit_exceeded', false, { reason: 'patches', max: RASTER_GRID_MAX_PATCHES });
  }
  const layerId = normalizeString(input.layerId, 'layer_id');
  const frameId = normalizeString(input.frameId, 'frame_id');
  const legend = input.legend.map(normalizePatchLegendEntry);
  validateLegendEntries(legend);
  return {
    kind: RASTER_PATCH_KIND,
    layerId,
    frameId,
    celId: normalizeString(input.celId, 'cel_id'),
    region: normalizeRegion(input.region),
    digest,
    legend,
    patches: input.patches.map(normalizePatchRectangle),
  };
}

// fallow-ignore-next-line complexity -- Legend validation keeps identity, color, and bounded symbol rules together.
function normalizePatchLegendEntry(value: unknown): RasterPatchLegendEntry {
  if (!isRecord(value)) throw symbolGridError('invalid_request', false, { reason: 'legend_entry' });
  assertExactKeys(value, ['symbol', 'color', 'paletteEntryId', 'paletteIndex'], 'legend_entry');
  const symbol = value.symbol;
  if (typeof symbol !== 'string' || symbol.length > RASTER_GRID_MAX_STRING_LENGTH
      || Array.from(symbol).length !== 1 || symbol === '.') {
    throw symbolGridError('invalid_request', false, { reason: 'legend_symbol' });
  }
  const color = value.color === undefined ? undefined : normalizeRgba(value.color, 'legend_color');
  const paletteEntryId = value.paletteEntryId === undefined
    ? undefined
    : normalizeString(value.paletteEntryId, 'palette_entry_id');
  const paletteIndex = value.paletteIndex === undefined
    ? undefined
    : normalizePaletteIndex(value.paletteIndex);
  if ((color === undefined) === (paletteEntryId === undefined)) {
    throw symbolGridError('invalid_request', false, { reason: 'legend_resolution' });
  }
  return {
    symbol,
    ...(color ? { color } : {}),
    ...(paletteEntryId ? { paletteEntryId } : {}),
    ...(paletteIndex !== undefined ? { paletteIndex } : {}),
  };
}

function validateLegendEntries(legend: readonly RasterPatchLegendEntry[]): void {
  const symbols = new Set<string>();
  const paletteIds = new Set<string>();
  for (const entry of legend) {
    if (symbols.has(entry.symbol)) {
      throw symbolGridError('invalid_request', false, { reason: 'legend_symbol_unique' });
    }
    symbols.add(entry.symbol);
    if (entry.paletteEntryId) {
      if (paletteIds.has(entry.paletteEntryId)) {
        throw symbolGridError('invalid_request', false, { reason: 'palette_identity_unique' });
      }
      paletteIds.add(entry.paletteEntryId);
    }
  }
}

function normalizePatchRectangle(value: unknown): RasterPatchRectangle {
  if (!isRecord(value)) throw symbolGridError('invalid_request', false, { reason: 'patch_rectangle' });
  assertExactKeys(value, ['x', 'y', 'width', 'height', 'rows'], 'patch_rectangle');
  const x = normalizeInteger(value.x, 'patch_x');
  const y = normalizeInteger(value.y, 'patch_y');
  const width = normalizeInteger(value.width, 'patch_width');
  const height = normalizeInteger(value.height, 'patch_height');
  if (width < 1 || height < 1 || width > RASTER_GRID_MAX_REGION_WIDTH || height > RASTER_GRID_MAX_REGION_HEIGHT) {
    throw symbolGridError('bounds_exceeded', false, { reason: 'patch_extent', max: RASTER_GRID_MAX_REGION_WIDTH });
  }
  if (width * height > RASTER_GRID_MAX_CELLS) {
    throw symbolGridError('limit_exceeded', false, { reason: 'patch_cells', max: RASTER_GRID_MAX_CELLS });
  }
  if (!Array.isArray(value.rows) || value.rows.length !== height) {
    throw symbolGridError('invalid_request', false, { reason: 'patch_rows' });
  }
  const rows = value.rows.map((row) => {
    if (typeof row !== 'string' || row.length > RASTER_GRID_MAX_STRING_LENGTH
        || Array.from(row).length !== width) {
      throw symbolGridError('invalid_request', false, { reason: 'patch_row_width' });
    }
    return row;
  });
  return { x, y, width, height, rows };
}

function normalizeRegion(value: unknown): RasterRegion {
  if (!isRecord(value)) throw symbolGridError('invalid_request', false, { reason: 'region' });
  assertExactKeys(value, ['x', 'y', 'width', 'height'], 'region');
  const x = normalizeInteger(value.x, 'region_x');
  const y = normalizeInteger(value.y, 'region_y');
  const width = normalizeInteger(value.width, 'region_width');
  const height = normalizeInteger(value.height, 'region_height');
  if (width < 1 || height < 1 || width > RASTER_GRID_MAX_REGION_WIDTH || height > RASTER_GRID_MAX_REGION_HEIGHT) {
    throw symbolGridError('bounds_exceeded', false, { reason: 'region_extent', max: RASTER_GRID_MAX_REGION_WIDTH });
  }
  if (width * height > RASTER_GRID_MAX_CELLS) {
    throw symbolGridError('limit_exceeded', false, { reason: 'region_cells', max: RASTER_GRID_MAX_CELLS });
  }
  return { x, y, width, height };
}

function validatePatchSymbols(request: RasterPatchRequest): void {
  const knownSymbols = new Set(request.legend.map((entry) => entry.symbol));
  for (const patch of request.patches) {
    for (const row of patch.rows) {
      const symbols = Array.from(row);
      for (const symbol of symbols) {
        if (symbol !== '.' && !knownSymbols.has(symbol)) {
          throw symbolGridError('invalid_request', false, { reason: 'unknown_symbol' });
        }
      }
    }
  }
}

function normalizeTarget(value: unknown): ProjectTarget {
  if (!isRecord(value)) throw symbolGridError('invalid_request', false, { reason: 'target' });
  assertExactKeys(value, ['projectId'], 'target');
  return { projectId: normalizeString(value.projectId, 'target') };
}

function normalizeRevision(value: unknown): number {
  return normalizeInteger(value, 'expected_revision', 0);
}

function normalizeInteger(value: unknown, reason: string, minimum?: number): number {
  if (!Number.isSafeInteger(value) || (minimum !== undefined && (value as number) < minimum)) {
    throw symbolGridError('invalid_request', false, { reason });
  }
  return value as number;
}

function normalizeString(value: unknown, reason: string): string {
  if (typeof value !== 'string' || value.length < 1) {
    throw symbolGridError('invalid_request', false, { reason });
  }
  if (value.length > RASTER_GRID_MAX_STRING_LENGTH) {
    throw symbolGridError('limit_exceeded', false, { reason, max: RASTER_GRID_MAX_STRING_LENGTH });
  }
  return value;
}

function normalizeRgba(value: unknown, reason: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{8}$/i.test(value)) {
    throw symbolGridError('invalid_request', false, { reason });
  }
  const alpha = Number.parseInt(value.slice(7, 9), 16);
  if (alpha === 0) throw symbolGridError('invalid_request', false, { reason: 'transparent_legend' });
  return value.toLowerCase();
}

function normalizePaletteIndex(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 255) {
    throw symbolGridError('invalid_request', false, { reason: 'palette_index' });
  }
  return value as number;
}

function validateTargetAndRevision(
  context: ProjectContext,
  target: ProjectTarget,
  expectedRevision: number,
): void {
  validateTarget(context, target);
  if (context.project.revision.value !== expectedRevision) {
    throw symbolGridError('revision_conflict', true, {
      expectedRevision,
      currentRevision: context.project.revision.value,
    });
  }
}

function validateTarget(context: ProjectContext, target: ProjectTarget): void {
  if (context.isDisposed || context.project.id.value !== target.projectId) {
    throw symbolGridError('target_not_found', true);
  }
}

function validateEditorAvailability(context: ProjectContext): void {
  if (context.guidedDrawing.active) {
    throw symbolGridError('unsupported', false, { feature: 'guided-drawing-raster' });
  }
  const selectionType = context.selection.state.value.type;
  if (selectionType === 'floating' || selectionType === 'transforming') {
    throw symbolGridError('invalid_state', false, { reason: 'selection_in_progress' });
  }
}

// fallow-ignore-next-line complexity -- Layer and composite reads share one bounded observation boundary and fail before results escape.
async function readObservationPixels(
  context: ProjectContext,
  request: RasterObservationRequest,
): Promise<RasterPixelRead> {
  if (request.source.kind === 'composite') {
    const frame = context.animation.frames.value.find((candidate) => candidate.id === request.source.frameId);
    if (!frame) throw symbolGridError('target_not_found', true, { resource: 'frame' });
    return readCompositePixels(context, request);
  }

  const source = request.source;
  if (source.kind !== 'layer') {
    throw symbolGridError('internal', true, { reason: 'layer_source' });
  }
  const layer = context.layers.layers.value.find((candidate) => candidate.id === source.layerId);
  if (!layer) throw symbolGridError('target_not_found', true, { resource: 'layer' });
  if (layer.type !== 'image') throw symbolGridError('unsupported', false, { reason: 'layer_type' });
  const frame = context.animation.frames.value.find((candidate) => candidate.id === source.frameId);
  if (!frame) throw symbolGridError('target_not_found', true, { resource: 'frame' });
  const key = context.animation.getCelKey(layer.id, frame.id);
  const cel = context.animation.cels.value.get(key);
  if (!cel) throw symbolGridError('target_not_found', true, { resource: 'cel' });
  if (cel.layerId !== layer.id || cel.frameId !== frame.id) {
    throw symbolGridError('invalid_state', false, { reason: 'cel_identity' });
  }
  if (source.celId && cel.id !== source.celId) {
    throw symbolGridError('revision_conflict', true, { reason: 'cel_changed' });
  }
  if (cel.linkedCelId || hasSharedCanvas(context, cel)) {
    throw symbolGridError('unsupported', false, { reason: 'linked_or_shared_cel' });
  }
  if (!cel.canvas || cel.canvas.width !== context.project.width.value || cel.canvas.height !== context.project.height.value) {
    throw symbolGridError('invalid_state', false, { reason: 'canvas_shape' });
  }
  const drawing = getDrawingContext(cel.canvas);
  const indexBuffer = cel.indexBuffer;
  if (indexBuffer && indexBuffer.length !== cel.canvas.width * cel.canvas.height) {
    throw symbolGridError('invalid_state', false, { reason: 'index_buffer_shape' });
  }
  if (indexBuffer && hasSharedIndexBuffer(context, cel, indexBuffer)) {
    throw symbolGridError('unsupported', false, { reason: 'shared_index_buffer' });
  }
  const pixels = readRegionPixels(drawing, request.region);
  const indices = indexBuffer ? readRegionIndices(indexBuffer, cel.canvas.width, request.region) : undefined;
  if (indices) validateIndexedPixels(pixels, indices, context);
  return { pixels, ...(indices ? { indices } : {}), celId: cel.id };
}

function readCompositePixels(
  context: ProjectContext,
  request: RasterObservationRequest,
): RasterPixelRead {
  const { width, height } = request.region;
  const bytes = width * height * 4;
  if (!Number.isSafeInteger(bytes) || bytes > RASTER_GRID_MAX_COMPOSITE_BYTES) {
    throw symbolGridError('limit_exceeded', false, { reason: 'composite_bytes', max: RASTER_GRID_MAX_COMPOSITE_BYTES });
  }
  const canvas = createCanvas(width, height);
  const drawing = getDrawingContext(canvas);
  drawing.clearRect(0, 0, width, height);
  drawing.save();
  try {
    drawing.beginPath();
    drawing.rect(0, 0, width, height);
    drawing.clip();
    drawing.translate(-request.region.x, -request.region.y);
    drawArtworkComposition(
      drawing,
      createArtworkCompositionPlan({
        frameId: request.source.frameId,
        layers: context.layers.layers.value,
        cels: context.animation.cels.value,
        getCelKey: context.animation.getCelKey,
      }),
    );
  } finally {
    drawing.restore();
  }
  return {
    pixels: readRegionPixels(drawing, { x: 0, y: 0, width, height }),
  };
}

// fallow-ignore-next-line complexity -- Row-major Symbol Grid construction carries exact transparency and palette/index evidence.
function buildSymbolGrid(
  context: ProjectContext,
  request: RasterObservationRequest,
  read: RasterPixelRead,
): { readonly rows: readonly string[]; readonly legend: readonly SymbolGridLegendEntry[]; readonly source: RasterObservationSource } {
  let source: RasterObservationSource;
  if (request.source.kind === 'layer') {
    if (!read.celId) throw symbolGridError('internal', true, { reason: 'layer_cel_identity' });
    source = {
      kind: 'layer',
      layerId: request.source.layerId,
      frameId: request.source.frameId,
      celId: read.celId,
    };
  } else {
    source = { kind: 'composite', frameId: request.source.frameId };
  }
  if (!read.indices) {
    const encoding = encodeSymbolGridPixels(
      read.pixels,
      request.region.width,
      request.region.height,
      context.palette.getProjectPaletteEntries(),
    );
    return { ...encoding, source };
  }

  const entries: SymbolGridLegendEntry[] = [];
  const keys = new Map<string, string>();
  const rows: string[] = [];
  for (let y = 0; y < request.region.height; y++) {
    let row = '';
    for (let x = 0; x < request.region.width; x++) {
      const cell = y * request.region.width + x;
      const pixelOffset = cell * 4;
      const r = read.pixels[pixelOffset] ?? 0;
      const g = read.pixels[pixelOffset + 1] ?? 0;
      const b = read.pixels[pixelOffset + 2] ?? 0;
      const a = read.pixels[pixelOffset + 3] ?? 0;
      if (a === 0) {
        if (r !== 0 || g !== 0 || b !== 0) {
          throw symbolGridError('invalid_state', false, { reason: 'transparent_rgba' });
        }
        row += '.';
        continue;
      }

      const paletteIndex = read.indices?.[cell] ?? 0;
      const paletteEntry = paletteIndex > 0
        ? context.palette.getProjectPaletteEntries()[paletteIndex - 1]
        : undefined;
      const key = paletteIndex > 0
        ? `index:${paletteIndex}:${r},${g},${b},${a}`
        : `rgba:${r},${g},${b},${a}`;
      let symbol = keys.get(key);
      if (!symbol) {
        if (entries.length >= RASTER_GRID_MAX_LEGEND_ENTRIES) {
          throw symbolGridError('limit_exceeded', false, {
            reason: 'legend',
            max: RASTER_GRID_MAX_LEGEND_ENTRIES,
          });
        }
        symbol = SYMBOL_ALPHABET[entries.length] ?? '';
        keys.set(key, symbol);
        entries.push({
          symbol,
          color: rgbaToHex(r, g, b, a),
          ...(paletteEntry ? { paletteEntryId: paletteEntry.id, paletteIndex } : {}),
        });
      }
      row += symbol;
    }
    rows.push(row);
  }
  return { rows, legend: entries, source };
}

interface DigestInput {
  readonly rows: readonly string[];
  readonly legend: readonly SymbolGridLegendEntry[];
  readonly pixels: Uint8ClampedArray;
  readonly indices?: Uint8Array;
  readonly source: RasterObservationSource;
}

async function createDigest(
  request: RasterObservationRequest,
  grid: DigestInput,
): Promise<string> {
  const metadata = JSON.stringify({
    representation: RASTER_GRID_REPRESENTATION_VERSION,
    target: request.target,
    revision: request.expectedRevision,
    source: grid.source,
    region: request.region,
    rows: grid.rows,
    legend: grid.legend,
    indexMeaning: grid.indices ? 'palette-index-1-based-transparent-zero' : 'rgba8',
  });
  const metadataBytes = new TextEncoder().encode(metadata);
  const indexBytes = grid.indices ?? new Uint8Array(0);
  const bytes = new Uint8Array(metadataBytes.length + 1 + grid.pixels.length + indexBytes.length);
  bytes.set(metadataBytes, 0);
  bytes[metadataBytes.length] = 0;
  bytes.set(grid.pixels, metadataBytes.length + 1);
  bytes.set(indexBytes, metadataBytes.length + 1 + grid.pixels.length);
  if (!globalThis.crypto?.subtle) {
    throw symbolGridError('internal', true, { reason: 'digest_support' });
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

// fallow-ignore-next-line complexity -- Deterministic palette identity and explicit-RGBA resolution must reject all approximations.
function resolvePatchLegend(
  context: ProjectContext,
  legend: readonly RasterPatchLegendEntry[],
): ReadonlyMap<string, ResolvedPatchColor> {
  const paletteEntries = context.palette.getProjectPaletteEntries();
  const byId = new Map(paletteEntries.map((entry, index) => [entry.id, { entry, index: index + 1 }]));
  const symbols = new Set<string>();
  const paletteIds = new Set<string>();
  const resolved = new Map<string, ResolvedPatchColor>();
  for (const entry of legend) {
    if (symbols.has(entry.symbol)) throw symbolGridError('invalid_request', false, { reason: 'legend_symbol_unique' });
    symbols.add(entry.symbol);
    if (entry.paletteEntryId && paletteIds.has(entry.paletteEntryId)) {
      throw symbolGridError('invalid_request', false, { reason: 'palette_identity_unique' });
    }

    let paletteIndex: number;
    let rgb: { r: number; g: number; b: number };
    if (entry.paletteEntryId) {
      const match = byId.get(entry.paletteEntryId);
      if (!match) throw symbolGridError('target_not_found', true, { resource: 'palette_entry' });
      paletteIds.add(entry.paletteEntryId);
      paletteIndex = match.index;
      const parsed = hexToRgb(match.entry.color);
      if (!parsed) throw symbolGridError('invalid_state', false, { reason: 'palette_color' });
      rgb = parsed;
      if (entry.paletteIndex !== undefined && entry.paletteIndex !== paletteIndex) {
        throw symbolGridError('revision_conflict', true, { reason: 'palette_index_changed' });
      }
      if (entry.color) {
        const requested = parseRgba(entry.color);
        if (requested[0] !== rgb.r || requested[1] !== rgb.g || requested[2] !== rgb.b) {
          throw symbolGridError('revision_conflict', true, { reason: 'palette_color_changed' });
        }
      }
    } else {
      if (!entry.color) throw symbolGridError('invalid_request', false, { reason: 'legend_resolution' });
      const colorBytes = parseRgba(entry.color);
      const requestedRgb = rgbToHex(colorBytes[0], colorBytes[1], colorBytes[2]);
      const matchingIndex = paletteEntries.findIndex((paletteEntry) => normalizeHex(paletteEntry.color) === requestedRgb);
      if (matchingIndex === -1) throw symbolGridError('target_not_found', true, { resource: 'palette_color' });
      paletteIndex = matchingIndex + 1;
      rgb = { r: colorBytes[0], g: colorBytes[1], b: colorBytes[2] };
      if (entry.paletteIndex !== undefined && entry.paletteIndex !== paletteIndex) {
        throw symbolGridError('revision_conflict', true, { reason: 'palette_index_changed' });
      }
    }
    const rgba = entry.color ? parseRgba(entry.color) : [rgb.r, rgb.g, rgb.b, 255] as const;
    resolved.set(entry.symbol, { rgba, paletteIndex });
  }
  return resolved;
}

// fallow-ignore-next-line complexity -- Applying absolute-origin rectangles is the final pure step over prepared copies.
function applyPatchValues(
  patches: readonly RasterPatchRectangle[],
  colors: ReadonlyMap<string, ResolvedPatchColor>,
  afterPixels: Uint8ClampedArray,
  afterIndices: Uint8Array | undefined,
  canvasWidth: number,
  beforePixels: Uint8ClampedArray,
  beforeIndices: Uint8Array | undefined,
): RasterRegion | null {
  let bounds: RasterRegion | null = null;
  for (const patch of patches) {
    for (let row = 0; row < patch.height; row++) {
      const symbols = patch.rows[row] ?? '';
      const symbolCells = Array.from(symbols);
      for (let column = 0; column < patch.width; column++) {
        const symbol = symbolCells[column];
        const pixelIndex = (patch.y + row) * canvasWidth + patch.x + column;
        const pixelOffset = pixelIndex * 4;
        const resolved = symbol === '.'
          ? { rgba: [0, 0, 0, 0] as const, paletteIndex: 0 }
          : colors.get(symbol);
        if (!resolved) throw symbolGridError('invalid_request', false, { reason: 'unknown_symbol' });
        const [r, g, b, a] = resolved.rgba;
        const changed = beforePixels[pixelOffset] !== r
          || beforePixels[pixelOffset + 1] !== g
          || beforePixels[pixelOffset + 2] !== b
          || beforePixels[pixelOffset + 3] !== a
          || (beforeIndices !== undefined && beforeIndices[pixelIndex] !== resolved.paletteIndex);
        afterPixels[pixelOffset] = r;
        afterPixels[pixelOffset + 1] = g;
        afterPixels[pixelOffset + 2] = b;
        afterPixels[pixelOffset + 3] = a;
        if (afterIndices) afterIndices[pixelIndex] = resolved.paletteIndex;
        if (changed) bounds = extendBounds(bounds, patch.x + column, patch.y + row);
      }
    }
  }
  return bounds;
}

function extendBounds(bounds: RasterRegion | null, x: number, y: number): RasterRegion {
  if (!bounds) return { x, y, width: 1, height: 1 };
  const right = Math.max(bounds.x + bounds.width, x + 1);
  const bottom = Math.max(bounds.y + bounds.height, y + 1);
  return {
    x: Math.min(bounds.x, x),
    y: Math.min(bounds.y, y),
    width: right - Math.min(bounds.x, x),
    height: bottom - Math.min(bounds.y, y),
  };
}

// fallow-ignore-next-line complexity -- Patch containment validates both observed and canvas bounds before any raster allocation.
function validatePatchesContained(
  patches: readonly RasterPatchRectangle[],
  observedRegion: RasterRegion,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const totalCells = patches.reduce((total, patch) => total + patch.width * patch.height, 0);
  if (totalCells > RASTER_GRID_MAX_CELLS) {
    throw symbolGridError('limit_exceeded', false, { reason: 'patch_cells', max: RASTER_GRID_MAX_CELLS });
  }
  const observedRight = observedRegion.x + observedRegion.width;
  const observedBottom = observedRegion.y + observedRegion.height;
  for (const patch of patches) {
    if (patch.x < observedRegion.x || patch.y < observedRegion.y
        || patch.x > observedRight - patch.width
        || patch.y > observedBottom - patch.height) {
      throw symbolGridError('bounds_exceeded', false, { reason: 'patch_region' });
    }
    if (patch.x < 0 || patch.y < 0
        || patch.x > canvasWidth - patch.width
        || patch.y > canvasHeight - patch.height) {
      throw symbolGridError('bounds_exceeded', false, { reason: 'canvas_bounds' });
    }
  }
}

function validateRegionContained(region: RasterRegion, canvasWidth: number, canvasHeight: number): void {
  if (region.x < 0 || region.y < 0
      || region.x > canvasWidth - region.width
      || region.y > canvasHeight - region.height) {
    throw symbolGridError('bounds_exceeded', false, { reason: 'canvas_bounds' });
  }
}

function validatePatchOverlap(patches: readonly RasterPatchRectangle[]): void {
  for (let first = 0; first < patches.length; first++) {
    const a = patches[first];
    if (!a) continue;
    for (let second = first + 1; second < patches.length; second++) {
      const b = patches[second];
      if (!b) continue;
      if (a.x < b.x + b.width && a.x + a.width > b.x
          && a.y < b.y + b.height && a.y + a.height > b.y) {
        throw symbolGridError('invalid_request', false, { reason: 'patch_overlap' });
      }
    }
  }
}

function validatePreparationBytes(width: number, height: number, indexed: boolean): void {
  const pixels = width * height * 4;
  const indices = indexed ? width * height : 0;
  const total = pixels * 2 + indices * 2;
  if (!Number.isSafeInteger(total) || total > RASTER_GRID_MAX_PREPARATION_BYTES) {
    throw symbolGridError('limit_exceeded', false, { reason: 'preparation_bytes', max: RASTER_GRID_MAX_PREPARATION_BYTES });
  }
}

function getDrawingContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  let drawing: CanvasRenderingContext2D | null;
  try {
    drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  } catch {
    throw symbolGridError('invalid_state', true, { reason: 'canvas_context' });
  }
  if (!drawing) throw symbolGridError('invalid_state', true, { reason: 'canvas_context' });
  return drawing;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  } catch {
    throw symbolGridError('internal', true, { reason: 'canvas_allocation' });
  }
  return canvas;
}

function readRegionPixels(drawing: CanvasRenderingContext2D, region: RasterRegion): Uint8ClampedArray {
  try {
    return new Uint8ClampedArray(drawing.getImageData(region.x, region.y, region.width, region.height).data);
  } catch {
    throw symbolGridError('invalid_state', false, { reason: 'raster_read' });
  }
}

function readFullPixels(drawing: CanvasRenderingContext2D, canvas: HTMLCanvasElement): Uint8ClampedArray {
  try {
    return new Uint8ClampedArray(drawing.getImageData(0, 0, canvas.width, canvas.height).data);
  } catch {
    throw symbolGridError('invalid_state', false, { reason: 'raster_read' });
  }
}

function writeFullPixels(
  drawing: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  pixels: Uint8ClampedArray,
): void {
  try {
    const imageData = typeof ImageData === 'function'
      ? new ImageData(new Uint8ClampedArray(pixels), canvas.width, canvas.height)
      : { data: new Uint8ClampedArray(pixels), width: canvas.width, height: canvas.height } as ImageData;
    drawing.putImageData(imageData, 0, 0);
  } catch {
    throw symbolGridError('invalid_state', false, { reason: 'raster_write' });
  }
}

function readRegionIndices(
  indexBuffer: Uint8Array,
  canvasWidth: number,
  region: RasterRegion,
): Uint8Array {
  const indices = new Uint8Array(region.width * region.height);
  for (let row = 0; row < region.height; row++) {
    const sourceStart = (region.y + row) * canvasWidth + region.x;
    indices.set(indexBuffer.subarray(sourceStart, sourceStart + region.width), row * region.width);
  }
  return indices;
}

// fallow-ignore-next-line complexity -- Exact palette/index coherence enumerates transparent and non-transparent invariants for every cell.
function validateIndexedPixels(
  pixels: Uint8ClampedArray,
  indices: Uint8Array,
  context: ProjectContext,
): void {
  const expectedPixels = indices.length * 4;
  if (pixels.length !== expectedPixels) {
    throw symbolGridError('invalid_state', false, { reason: 'indexed_content_incoherent' });
  }
  const entries = context.palette.getProjectPaletteEntries();
  for (let index = 0; index < indices.length; index++) {
    const paletteIndex = indices[index] ?? 0;
    const offset = index * 4;
    if (paletteIndex === 0) {
      if (pixels[offset + 3] !== 0 || pixels[offset] !== 0 || pixels[offset + 1] !== 0 || pixels[offset + 2] !== 0) {
        throw symbolGridError('invalid_state', false, { reason: 'indexed_content_incoherent' });
      }
      continue;
    }
    const color = entries[paletteIndex - 1]?.color;
    const rgb = color ? hexToRgb(color) : null;
    if (!rgb || pixels[offset] !== rgb.r || pixels[offset + 1] !== rgb.g || pixels[offset + 2] !== rgb.b
        || pixels[offset + 3] === 0) {
      throw symbolGridError('invalid_state', false, { reason: 'indexed_content_incoherent' });
    }
  }
}

function hasSharedCanvas(context: ProjectContext, targetCel: Cel): boolean {
  for (const cel of context.animation.cels.value.values()) {
    if (cel !== targetCel && cel.canvas === targetCel.canvas) return true;
  }
  return false;
}

function hasSharedIndexBuffer(context: ProjectContext, targetCel: Cel, buffer: Uint8Array): boolean {
  for (const cel of context.animation.cels.value.values()) {
    if (cel !== targetCel && cel.indexBuffer === buffer) return true;
  }
  return false;
}

function getCurrentIndexBuffer(context: ProjectContext, prepared: PreparedRasterPatchChange): Uint8Array | undefined {
  return context.animation.cels.value.get(
    context.animation.getCelKey(prepared.layerId, prepared.frameId),
  )?.indexBuffer;
}

function isDerivedIndexBuffer(
  context: ProjectContext,
  prepared: PreparedRasterPatchChange,
  indexBuffer: Uint8Array | undefined,
): boolean {
  if (!indexBuffer || indexBuffer.length !== prepared.canvas.width * prepared.canvas.height) {
    return false;
  }
  try {
    validateIndexedPixels(readFullPixels(prepared.drawing, prepared.canvas), indexBuffer, context);
    return true;
  } catch {
    return false;
  }
}

function sameBytes(first: ArrayLike<number>, second: ArrayLike<number>): boolean {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

function sameOptionalBytes(first: Uint8Array | undefined, second: Uint8Array | undefined): boolean {
  if (!first || !second) return first === second;
  return sameBytes(first, second);
}

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  return `#${[r, g, b, a].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function parseRgba(value: string): readonly [number, number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
    Number.parseInt(value.slice(7, 9), 16),
  ];
}

function toEditorError(error: unknown): EditorError {
  if (error instanceof SymbolGridError) return error.editorError;
  return { code: 'internal', retryable: true, details: { reason: 'unexpected_failure' } };
}

function symbolGridError(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
): SymbolGridError {
  return new SymbolGridError({ code, retryable, ...(details ? { details } : {}) });
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  reason: string,
): void {
  if (!hasOnlyKeys(value, allowedKeys)) throw symbolGridError('invalid_request', false, { reason });
}
