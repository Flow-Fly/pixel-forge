import type { Command } from '../stores/history';
import type { ProjectContext } from '../stores/project-context';
import type {
  ProjectChangeDomain,
  ProjectChangeEvent,
} from '../stores/project-store';
import {
  fillAllMatchingPixels,
  floodFill,
  constrainWithStickyAngles,
  type FloodFillColor,
} from '../services/drawing/algorithms';
import {
  collectGuidedFillRegion,
  paintGuidedFillRegion,
} from '../services/paint-by-number/guided-fill';
import { isPaintableLayer } from '../utils/layer-capabilities';
import { buildIndexBufferFromCanvas } from '../utils/indexed-color';
import { findClosestColorIndex } from '../stores/palette/indexed-color';
import { hexToRgb, normalizeHex, rgbToHex } from '../stores/palette/color-utils';
import { MAX_PALETTE_SIZE } from '../stores/palette/types';
import {
  isRecord,
  type EditorError,
  type ProjectTarget,
} from './contracts';

export {
  // fallow-ignore-next-line unused-export -- Public command ID is re-exported beside the transaction seam.
  FILL_COMMAND_ID,
  // fallow-ignore-next-line unused-export -- Public command ID is re-exported beside the transaction seam.
  GRADIENT_COMMAND_ID,
  // fallow-ignore-next-line unused-export -- Raster consumers can import the catalog beside the transaction seam.
  rasterFillCatalog,
  // fallow-ignore-next-line unused-export -- Raster consumers can import the catalog beside the transaction seam.
  rasterGradientCatalog,
} from './catalog';

// fallow-ignore-next-line unused-export -- The effective policy is part of the local command result contract.
export const EXISTING_PALETTE_GRADIENT_POLICY = 'existing-palette' as const;

// Uint8Array index 0 is transparent, so indexed raster writes can address at
// most 255 palette entries even though the palette store allows 256 colors.
const MAX_INDEXED_PALETTE_ENTRIES = 255;

type RasterDomain = Extract<ProjectChangeDomain, 'raster-content'>;

export interface RasterTarget {
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly layerId: string;
  readonly frameId: string;
  /** Captured cel identity prevents a gesture from landing on a replacement cel. */
  readonly celId?: string;
}

export interface RasterExecutionOptions {
  readonly canvas?: HTMLCanvasElement;
  readonly beforePixels?: Uint8ClampedArray;
  readonly beforeIndices?: Uint8Array;
}

export interface FillRequest extends RasterTarget {
  readonly startX: number;
  readonly startY: number;
  readonly hex: string;
  readonly contiguous: boolean;
}

export type GradientType = 'linear' | 'radial';

export interface GradientRequest extends RasterTarget {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly primaryHex: string;
  readonly secondaryHex: string;
  readonly type: GradientType;
  readonly shift: boolean;
}

export interface RasterSuccess {
  readonly ok: true;
  readonly revision: number;
  readonly event: ProjectChangeEvent;
}

export interface GradientSuccess extends RasterSuccess {
  readonly effectivePalettePolicy: typeof EXISTING_PALETTE_GRADIENT_POLICY;
  readonly endpoints: {
    readonly start: { readonly index: number; readonly color: string };
    readonly end: { readonly index: number; readonly color: string };
  };
  readonly effectiveEnd: { readonly x: number; readonly y: number };
}

export interface RasterFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type FillResult = RasterSuccess | RasterFailure;
export type GradientResult = GradientSuccess | RasterFailure;

export interface GradientRender {
  readonly pixels: Uint8ClampedArray;
  readonly indices: Uint8Array;
  readonly effectivePalettePolicy: typeof EXISTING_PALETTE_GRADIENT_POLICY;
  readonly effectiveEnd: { readonly x: number; readonly y: number };
  readonly endpoints: {
    readonly start: { readonly index: number; readonly color: string };
    readonly end: { readonly index: number; readonly color: string };
  };
}

interface PaletteSnapshot {
  readonly colors: readonly string[];
  readonly newColorFlags: ReadonlySet<string>;
  readonly isDirty: boolean;
}

interface RasterState {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly indexBuffer: Uint8Array;
  readonly originalIndexBuffer: Uint8Array | undefined;
}

interface PreparedRasterChange {
  readonly request: RasterTarget;
  readonly layerId: string;
  readonly frameId: string;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly beforePixels: Uint8ClampedArray;
  readonly afterPixels: Uint8ClampedArray;
  readonly beforeIndices: Uint8Array;
  readonly afterIndices: Uint8Array;
  readonly indexBuffer: Uint8Array;
  readonly originalIndexBuffer: Uint8Array | undefined;
  readonly paletteBefore: PaletteSnapshot;
  readonly paletteAfter: PaletteSnapshot;
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

class RasterToolError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'RasterToolError';
    this.editorError = editorError;
  }
}

export function captureRasterTarget(
  context: ProjectContext,
  layerId = context.layers.activeLayerId.value ?? '',
  frameId = context.animation.currentFrameId.value,
): RasterTarget {
  const celKey = context.animation.getCelKey(layerId, frameId);
  const celId = context.animation.cels.value.get(celKey)?.id;
  return {
    target: { projectId: context.project.id.value },
    expectedRevision: context.project.revision.value,
    layerId,
    frameId,
    ...(celId ? { celId } : {}),
  };
}

// fallow-ignore-next-line unused-export -- Tool adapters use this request factory at the gesture boundary.
export function createFillRequest(
  context: ProjectContext,
  startX: number,
  startY: number,
  contiguous: boolean,
  hex = context.colors.primaryColor.value,
): FillRequest {
  return {
    ...captureRasterTarget(context),
    startX: Math.floor(startX),
    startY: Math.floor(startY),
    hex,
    contiguous,
  };
}

// fallow-ignore-next-line unused-export -- Tool adapters use this request factory at the gesture boundary.
export function createGradientRequest(
  context: ProjectContext,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  type: GradientType,
  shift: boolean,
  primaryHex = context.colors.primaryColor.value,
  secondaryHex = context.colors.secondaryColor.value,
): GradientRequest {
  return {
    ...captureRasterTarget(context),
    startX: Math.floor(startX),
    startY: Math.floor(startY),
    endX: Math.floor(endX),
    endY: Math.floor(endY),
    primaryHex,
    secondaryHex,
    type,
    shift,
  };
}

export async function executeFill(
  context: ProjectContext,
  input: FillRequest,
  options: RasterExecutionOptions = {},
): Promise<FillResult> {
  try {
    const request = normalizeFillRequest(input);
    const prepared = prepareFillChange(context, request, options);
    if (!prepared) {
      throw editorError('invalid_request', false, { reason: 'no_op' });
    }

    const command = new RasterToolCommand(context, prepared, 'Fill');
    await context.history.execute(command);
    const event = command.lastEvent;
    if (!event) throw editorError('internal', true, { reason: 'missing_change_event' });
    return { ok: true, revision: event.toRevision, event };
  } catch (error) {
    return { ok: false, error: toEditorError(error) };
  }
}

export async function executeGradient(
  context: ProjectContext,
  input: GradientRequest,
  options: RasterExecutionOptions = {},
): Promise<GradientResult> {
  try {
    const request = normalizeGradientRequest(input);
    rejectZeroLengthGradient(request);
    if (context.guidedDrawing.active) {
      throw editorError('unsupported', false, { feature: 'guided-drawing-gradient' });
    }

    const state = resolveRasterState(context, request, options.canvas);
    const paletteBefore = capturePalette(context);
    const { beforePixels, beforeIndices } = captureRasterBuffers(state, options);

    const render = renderGradientPixels(request, state.canvas.width, state.canvas.height, paletteBefore.colors);
    if (arraysEqual(beforePixels, render.pixels) && arraysEqual(beforeIndices, render.indices)) {
      throw editorError('invalid_request', false, { reason: 'no_op' });
    }

    const prepared: PreparedRasterChange = {
      request,
      layerId: request.layerId,
      frameId: request.frameId,
      canvas: state.canvas,
      context: state.context,
      beforePixels,
      afterPixels: render.pixels,
      beforeIndices,
      afterIndices: render.indices,
      indexBuffer: state.indexBuffer,
      originalIndexBuffer: state.originalIndexBuffer,
      paletteBefore,
      paletteAfter: paletteBefore,
      bounds: { x: 0, y: 0, width: state.canvas.width, height: state.canvas.height },
    };

    const command = new RasterToolCommand(context, prepared, 'Gradient');
    await context.history.execute(command);
    const event = command.lastEvent;
    if (!event) throw editorError('internal', true, { reason: 'missing_change_event' });
    return {
      ok: true,
      revision: event.toRevision,
      event,
      effectivePalettePolicy: EXISTING_PALETTE_GRADIENT_POLICY,
      endpoints: render.endpoints,
      effectiveEnd: render.effectiveEnd,
    };
  } catch (error) {
    return { ok: false, error: toEditorError(error) };
  }
}

/** Render a Gradient preview without changing history, revision, palette, or persistence. */
export function renderGradientPreview(
  context: ProjectContext,
  request: GradientRequest,
  width: number,
  height: number,
): GradientRender {
  const normalized = normalizeGradientRequest(request);
  validateTargetAndRevision(context, normalized);
  rejectZeroLengthGradient(normalized);
  return renderGradientPixels(normalized, width, height, context.palette.mainColors.value);
}

// fallow-ignore-next-line complexity -- Fill preparation keeps palette planning, indexed buffers, and guided regions atomic.
function prepareFillChange(
  context: ProjectContext,
  request: FillRequest,
  options: RasterExecutionOptions,
): PreparedRasterChange | null {
  if (context.guidedDrawing.active && !context.guidedDrawing.session.value) {
    throw editorError('unsupported', false, { feature: 'guided-drawing-fill' });
  }

  const state = resolveRasterState(context, request, options.canvas);
  const paletteBefore = capturePalette(context);
  const palettePlan = planPaletteColor(context, request.hex, paletteBefore);
  const { beforePixels, beforeIndices } = captureRasterBuffers(state, options);

  const afterPixels = new Uint8ClampedArray(beforePixels);
  const afterIndices = new Uint8Array(beforeIndices);
  const fill = paletteFillColor(palettePlan.index, palettePlan.colors);
  const bounds = context.guidedDrawing.active
    ? fillGuided(
      context,
      request,
      afterPixels,
      afterIndices,
      fill,
      state.canvas.width,
      state.canvas.height,
    )
    : request.contiguous
      ? floodFill(
        afterPixels,
        state.canvas.width,
        state.canvas.height,
        request.startX,
        request.startY,
        fill,
        afterIndices,
      )
      : fillAllMatchingPixels(
        afterPixels,
        state.canvas.width,
        state.canvas.height,
        request.startX,
        request.startY,
        fill,
        afterIndices,
      );

  if (!bounds || (arraysEqual(beforePixels, afterPixels) && arraysEqual(beforeIndices, afterIndices))) {
    return null;
  }

  return {
    request,
    layerId: request.layerId,
    frameId: request.frameId,
    canvas: state.canvas,
    context: state.context,
    beforePixels,
    afterPixels,
    beforeIndices,
    afterIndices,
    indexBuffer: state.indexBuffer,
    originalIndexBuffer: state.originalIndexBuffer,
    paletteBefore,
    paletteAfter: {
      colors: palettePlan.colors,
      newColorFlags: palettePlan.newColorFlags,
      isDirty: paletteBefore.isDirty || palettePlan.colors.length !== paletteBefore.colors.length,
    },
    bounds,
  };
}

function fillGuided(
  context: ProjectContext,
  request: FillRequest,
  pixels: Uint8ClampedArray,
  indices: Uint8Array,
  fill: FloodFillColor,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  const session = context.guidedDrawing.session.value;
  if (!session || session.width !== width || session.height !== height) {
    throw editorError('invalid_state', false, { reason: 'guided_buffers' });
  }

  const region = collectGuidedFillRegion(
    session.target,
    pixels,
    width,
    height,
    request.startX,
    request.startY,
  );
  if (!region) return null;
  paintGuidedFillRegion(pixels, indices, region, fill);
  return region.bounds;
}

// fallow-ignore-next-line complexity -- Deterministic sampling and nearest-palette writes stay in one pure render pass.
function renderGradientPixels(
  request: GradientRequest,
  width: number,
  height: number,
  paletteColors: readonly string[],
): GradientRender {
  if (paletteColors.length === 0) {
    throw editorError('limit_exceeded', false, { limitId: 'existing-palette-empty' });
  }

  const primary = hexToRgb(request.primaryHex);
  const secondary = hexToRgb(request.secondaryHex);
  if (!primary || !secondary) {
    throw editorError('invalid_request', false, { reason: 'gradient_color' });
  }

  const effectiveEnd = request.shift
    ? constrainWithStickyAngles(request.startX, request.startY, request.endX, request.endY)
    : { x: request.endX, y: request.endY };
  const startIndex = findClosestColorIndex(request.primaryHex, [...paletteColors]);
  const endIndex = findClosestColorIndex(request.secondaryHex, [...paletteColors]);
  assertIndexedPaletteIndex(startIndex);
  assertIndexedPaletteIndex(endIndex);
  const colors = [...paletteColors];
  const startColor = paletteColors[startIndex - 1] ?? paletteColors[0];
  const endColor = paletteColors[endIndex - 1] ?? paletteColors[paletteColors.length - 1];
  const pixels = new Uint8ClampedArray(width * height * 4);
  const indices = new Uint8Array(width * height);
  const dx = effectiveEnd.x - request.startX;
  const dy = effectiveEnd.y - request.startY;
  const lengthSquared = dx * dx + dy * dy;
  const radius = Math.sqrt(lengthSquared);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = request.type === 'radial'
        ? radius === 0
          ? 1
          : Math.min(1, Math.hypot(x + 0.5 - request.startX, y + 0.5 - request.startY) / radius)
        : lengthSquared === 0
          ? 1
          : Math.min(1, Math.max(0, ((x + 0.5 - request.startX) * dx + (y + 0.5 - request.startY) * dy) / lengthSquared));
      const rawColor = rgbToHex(
        primary.r + (secondary.r - primary.r) * t,
        primary.g + (secondary.g - primary.g) * t,
        primary.b + (secondary.b - primary.b) * t,
      );
      const paletteIndex = findClosestColorIndex(rawColor, colors);
      assertIndexedPaletteIndex(paletteIndex);
      const paletteColor = colors[paletteIndex - 1] ?? startColor;
      const rgb = hexToRgb(paletteColor) ?? primary;
      const pixelIndex = y * width + x;
      const offset = pixelIndex * 4;
      pixels[offset] = rgb.r;
      pixels[offset + 1] = rgb.g;
      pixels[offset + 2] = rgb.b;
      pixels[offset + 3] = 255;
      indices[pixelIndex] = paletteIndex;
    }
  }

  return {
    pixels,
    indices,
    effectivePalettePolicy: EXISTING_PALETTE_GRADIENT_POLICY,
    effectiveEnd,
    endpoints: {
      start: { index: startIndex, color: normalizeHex(startColor) },
      end: { index: endIndex, color: normalizeHex(endColor) },
    },
  };
}

// fallow-ignore-next-line complexity -- Target, layer, cel, canvas, and indexed-buffer checks form the transaction gate.
function resolveRasterState(
  context: ProjectContext,
  request: RasterTarget,
  canvasOverride?: HTMLCanvasElement,
): RasterState {
  validateTargetAndRevision(context, request);
  const layer = context.layers.layers.value.find((candidate) => candidate.id === request.layerId);
  if (!layer || !isPaintableLayer(layer)) {
    throw editorError('target_not_found', true, { layerId: request.layerId });
  }
  if (layer.locked || !layer.visible) {
    throw editorError('invalid_state', false, { reason: 'layer_not_editable' });
  }
  const key = context.animation.getCelKey(request.layerId, request.frameId);
  const cel = context.animation.cels.value.get(key);
  const canvas = canvasOverride ?? cel?.canvas ?? layer.canvas;
  if (!cel || !canvas || canvas.width < 1 || canvas.height < 1) {
    throw editorError('target_not_found', true, { reason: 'cel' });
  }
  if (request.celId && cel.id !== request.celId) {
    throw editorError('revision_conflict', true, { reason: 'cel_changed' });
  }
  const rasterContext = canvas.getContext('2d', { willReadFrequently: true });
  if (!rasterContext) {
    throw editorError('invalid_state', true, { reason: 'canvas_context' });
  }

  let indexBuffer = cel.indexBuffer;
  if (!indexBuffer) {
    indexBuffer = buildIndexBufferFromCanvas(canvas, context.palette, false);
  }
  if (indexBuffer.length !== canvas.width * canvas.height) {
    throw editorError('invalid_state', false, { reason: 'index_buffer_shape' });
  }

  return {
    canvas,
    context: rasterContext,
    indexBuffer,
    originalIndexBuffer: cel.indexBuffer,
  };
}

function validateTargetAndRevision(context: ProjectContext, request: RasterTarget): void {
  validateProjectTarget(context, request.target);
  if (context.project.revision.value !== request.expectedRevision) {
    throw editorError('revision_conflict', true, {
      expectedRevision: request.expectedRevision,
      currentRevision: context.project.revision.value,
    });
  }
}

function validateProjectTarget(context: ProjectContext, target: ProjectTarget): void {
  if (context.project.id.value !== target.projectId) {
    throw editorError('target_not_found', true);
  }
}

interface NormalizedRasterTarget {
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly layerId: string;
  readonly frameId: string;
  readonly celId?: string;
}

// fallow-ignore-next-line complexity -- Boundary validation enumerates the transport contract before any project read.
function normalizeRasterTarget(input: Record<string, unknown>): NormalizedRasterTarget {
  const target = input.target;
  const celId = input.celId;
  if (!isRecord(target) || typeof target.projectId !== 'string' || target.projectId.length === 0) {
    throw editorError('invalid_request', false, { reason: 'target' });
  }
  if (!Number.isInteger(input.expectedRevision) || (input.expectedRevision as number) < 0 ||
      typeof input.layerId !== 'string' || input.layerId.length === 0 ||
      typeof input.frameId !== 'string' || input.frameId.length === 0 ||
      (celId !== undefined && (typeof celId !== 'string' || celId.length === 0))) {
    throw editorError('invalid_request', false, { reason: 'target' });
  }

  return {
    target: { projectId: target.projectId },
    expectedRevision: input.expectedRevision as number,
    layerId: input.layerId as string,
    frameId: input.frameId as string,
    ...(celId ? { celId: celId as string } : {}),
  };
}

function normalizeFillRequest(input: unknown): FillRequest {
  if (!isRecord(input)) throw editorError('invalid_request', false, { reason: 'request' });
  const target = normalizeRasterTarget(input);
  if (!Number.isInteger(input.startX) || !Number.isInteger(input.startY) ||
      typeof input.hex !== 'string' || typeof input.contiguous !== 'boolean') {
    throw editorError('invalid_request', false, { reason: 'fill_request' });
  }

  return {
    ...target,
    startX: input.startX as number,
    startY: input.startY as number,
    hex: input.hex as string,
    contiguous: input.contiguous,
  };
}

// fallow-ignore-next-line complexity -- Boundary validation enumerates the transport contract before any project write.
function normalizeGradientRequest(input: unknown): GradientRequest {
  if (!isRecord(input)) throw editorError('invalid_request', false, { reason: 'request' });
  const target = normalizeRasterTarget(input);
  if (!Number.isInteger(input.startX) || !Number.isInteger(input.startY) || !Number.isInteger(input.endX) ||
      !Number.isInteger(input.endY) || typeof input.primaryHex !== 'string' ||
      typeof input.secondaryHex !== 'string' ||
      (input.type !== 'linear' && input.type !== 'radial') || typeof input.shift !== 'boolean') {
    throw editorError('invalid_request', false, { reason: 'gradient_request' });
  }
  return {
    ...target,
    startX: input.startX as number,
    startY: input.startY as number,
    endX: input.endX as number,
    endY: input.endY as number,
    primaryHex: input.primaryHex as string,
    secondaryHex: input.secondaryHex as string,
    type: input.type as GradientType,
    shift: input.shift as boolean,
  };
}

function planPaletteColor(
  context: ProjectContext,
  hex: string,
  before: PaletteSnapshot,
): { index: number; colors: readonly string[]; newColorFlags: ReadonlySet<string> } {
  const normalized = normalizeHex(hex);
  if (!hexToRgb(normalized)) {
    throw editorError('invalid_request', false, { reason: 'fill_color' });
  }
  const existing = context.palette.getColorIndex(normalized);
  if (existing > 0) {
    return { index: existing, colors: before.colors, newColorFlags: before.newColorFlags };
  }
  if (before.colors.length >= MAX_INDEXED_PALETTE_ENTRIES || before.colors.length >= MAX_PALETTE_SIZE) {
    throw editorError('limit_exceeded', false, { limitId: 'palette-colors' });
  }
  const colors = [...before.colors, normalized];
  const newColorFlags = new Set(before.newColorFlags);
  newColorFlags.add(normalized);
  return { index: colors.length, colors, newColorFlags };
}

function paletteFillColor(index: number, colors: readonly string[]): FloodFillColor {
  assertIndexedPaletteIndex(index);
  const hex = colors[index - 1];
  const rgb = hexToRgb(hex ?? '');
  if (!rgb) throw editorError('invalid_state', false, { reason: 'palette_color' });
  return { r: rgb.r, g: rgb.g, b: rgb.b, a: 255, paletteIndex: index };
}

function assertIndexedPaletteIndex(index: number): void {
  if (index < 1 || index > MAX_INDEXED_PALETTE_ENTRIES) {
    throw editorError('limit_exceeded', false, { limitId: 'indexed-palette-entry' });
  }
}

function rejectZeroLengthGradient(request: GradientRequest): void {
  if (request.startX === request.endX && request.startY === request.endY) {
    throw editorError('invalid_request', false, { reason: 'no_op' });
  }
}

function capturePalette(context: ProjectContext): PaletteSnapshot {
  return {
    colors: [...context.palette.mainColors.value],
    newColorFlags: new Set(context.palette.newColorFlags.value),
    isDirty: context.palette.isDirty.value,
  };
}

function normalizedColorArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (normalizeHex(a[index] ?? '') !== normalizeHex(b[index] ?? '')) return false;
  }
  return true;
}

function normalizedFlagSetsEqual(
  actual: ReadonlySet<string>,
  expected: ReadonlySet<string>,
): boolean {
  const actualNormalized = new Set([...actual].map((color) => normalizeHex(color)));
  const expectedNormalized = new Set([...expected].map((color) => normalizeHex(color)));
  if (actualNormalized.size !== expectedNormalized.size) return false;
  for (const color of actualNormalized) {
    if (!expectedNormalized.has(color)) return false;
  }
  return true;
}

function paletteSnapshotsEqual(a: PaletteSnapshot, b: PaletteSnapshot): boolean {
  if (a.isDirty !== b.isDirty) return false;
  if (!normalizedColorArraysEqual(a.colors, b.colors)) {
    return false;
  }
  return normalizedFlagSetsEqual(a.newColorFlags, b.newColorFlags);
}

function applyPalette(context: ProjectContext, snapshot: PaletteSnapshot): void {
  context.palette.mainColors.value = [...snapshot.colors];
  context.palette.newColorFlags.value = new Set(snapshot.newColorFlags);
  context.palette.isDirty.value = snapshot.isDirty;
  context.palette.rebuildColorMap();
}

class RasterToolCommand implements Command {
  readonly id = crypto.randomUUID();
  readonly managesProjectRevision = true;
  readonly memorySize: number;
  readonly timestamp = Date.now();
  private readonly context: ProjectContext;
  private readonly change: PreparedRasterChange;
  readonly name: string;
  private applied = false;
  private hasExecuted = false;
  private _lastEvent: ProjectChangeEvent | null = null;

  constructor(context: ProjectContext, change: PreparedRasterChange, name: string) {
    this.context = context;
    this.change = change;
    this.name = name;
    this.memorySize = change.beforePixels.byteLength + change.afterPixels.byteLength +
      change.beforeIndices.byteLength + change.afterIndices.byteLength + 256;
  }

  get lastEvent(): ProjectChangeEvent | null {
    return this._lastEvent;
  }

  execute(): void {
    this.assertState(!this.hasExecuted ? 'initial' : 'redo');
    this.applyState(this.change.afterPixels, this.change.afterIndices, this.change.paletteAfter, false);
    this.hasExecuted = true;
    this.applied = true;
  }

  undo(): void {
    this.assertState('undo');
    this.applyState(this.change.beforePixels, this.change.beforeIndices, this.change.paletteBefore, true);
    this.applied = false;
  }

  // fallow-ignore-next-line complexity -- History transitions must validate every captured target and payload invariant.
  private assertState(phase: 'initial' | 'undo' | 'redo'): void {
    if (phase === 'initial') {
      validateTargetAndRevision(this.context, this.change.request);
    } else {
      validateProjectTarget(this.context, this.change.request.target);
    }
    if (phase === 'initial' && this.hasExecuted) {
      throw editorError('invalid_state', false, { reason: 'already_executed' });
    }
    if (phase === 'undo' && !this.applied) {
      throw editorError('invalid_state', false, { reason: 'not_applied' });
    }
    if (phase === 'redo' && this.applied) {
      throw editorError('invalid_state', false, { reason: 'already_applied' });
    }

    const key = this.context.animation.getCelKey(this.change.layerId, this.change.frameId);
    const cel = this.context.animation.cels.value.get(key);
    if (!cel || cel.canvas !== this.change.canvas) {
      throw editorError('revision_conflict', true, { reason: 'cel_changed' });
    }
    if (this.change.request.celId && cel.id !== this.change.request.celId) {
      throw editorError('revision_conflict', true, { reason: 'cel_changed' });
    }
    if (this.change.originalIndexBuffer && cel.indexBuffer !== this.change.originalIndexBuffer) {
      throw editorError('revision_conflict', true, { reason: 'index_buffer_changed' });
    }
    const expectedPalette = phase === 'undo' ? this.change.paletteAfter : this.change.paletteBefore;
    if (!paletteSnapshotsEqual(capturePalette(this.context), expectedPalette)) {
      throw editorError('revision_conflict', true, { reason: 'palette_changed' });
    }
    const expectedPixels = phase === 'undo' ? this.change.afterPixels : this.change.beforePixels;
    if (!arraysEqual(readPixels(this.change.context, this.change.canvas), expectedPixels)) {
      throw editorError('revision_conflict', true, { reason: 'pixels_changed' });
    }
    const expectedIndices = phase === 'undo' ? this.change.afterIndices : this.change.beforeIndices;
    if (!arraysEqual(this.readCurrentIndices(), expectedIndices)) {
      throw editorError('revision_conflict', true, { reason: 'index_buffer_changed' });
    }
  }

  private applyState(
    pixels: Uint8ClampedArray,
    indices: Uint8Array,
    palette: PaletteSnapshot,
    removeDerivedIndexBuffer = false,
  ): void {
    const previousPixels = readPixels(this.change.context, this.change.canvas);
    const previousIndices = this.readCurrentIndices();
    const currentKey = this.context.animation.getCelKey(this.change.layerId, this.change.frameId);
    const previousHadIndexBuffer = Boolean(this.context.animation.cels.value.get(currentKey)?.indexBuffer);
    const previousPalette = capturePalette(this.context);
    try {
      applyPalette(this.context, palette);
      writePixels(this.change.context, this.change.canvas, pixels);
      this.updateIndexReferences(indices, removeDerivedIndexBuffer);
      this.context.dirtyRect.markDirty(this.change.bounds);
      const event = this.context.project.commitChange(this.id, ['raster-content'] satisfies readonly RasterDomain[]);
      this._lastEvent = event;
    } catch (error) {
      try {
        applyPalette(this.context, previousPalette);
        writePixels(this.change.context, this.change.canvas, previousPixels);
        this.updateIndexReferences(previousIndices, !previousHadIndexBuffer);
      } catch {
        // Preserve the original stable failure. The command never reaches history.
      }
      throw error;
    }
  }

  private readCurrentIndices(): Uint8Array {
    const key = this.context.animation.getCelKey(this.change.layerId, this.change.frameId);
    const current = this.context.animation.cels.value.get(key)?.indexBuffer;
    if (current) return new Uint8Array(current);
    return buildIndexBufferFromCanvas(this.change.canvas, this.context.palette, false);
  }

  // fallow-ignore-next-line complexity -- Shared cels need one identity-preserving index-buffer swap for commit and undo.
  private updateIndexReferences(indices: Uint8Array, removeDerived: boolean): void {
    const key = this.context.animation.getCelKey(this.change.layerId, this.change.frameId);
    const currentCels = this.context.animation.cels.value;
    const targetCel = currentCels.get(key);
    if (!targetCel) throw editorError('revision_conflict', true, { reason: 'cel_changed' });

    if (this.change.originalIndexBuffer) {
      this.change.originalIndexBuffer.set(indices);
      return;
    }

    const nextCels = new Map(currentCels);
    const linkId = targetCel.linkedCelId;
    for (const [celKey, cel] of currentCels) {
      const shouldUpdate = celKey === key ||
        (Boolean(linkId) && cel.linkedCelId === linkId && cel.canvas === this.change.canvas);
      if (!shouldUpdate) continue;
      nextCels.set(celKey, {
        ...cel,
        indexBuffer: removeDerived ? undefined : this.change.indexBuffer,
      });
    }
    if (!removeDerived) this.change.indexBuffer.set(indices);
    this.context.animation.cels.value = nextCels;
  }
}

function readPixels(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): Uint8ClampedArray {
  return new Uint8ClampedArray(context.getImageData(0, 0, canvas.width, canvas.height).data);
}

function writePixels(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  pixels: Uint8ClampedArray,
): void {
  context.putImageData(createRasterImageData(pixels, canvas.width, canvas.height), 0, 0);
}

export function createRasterImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  if (typeof ImageData === 'function') {
    return new ImageData(new Uint8ClampedArray(data), width, height);
  }
  return { data: new Uint8ClampedArray(data), width, height } as ImageData;
}

function captureRasterBuffers(
  state: RasterState,
  options: RasterExecutionOptions,
): { beforePixels: Uint8ClampedArray; beforeIndices: Uint8Array } {
  const beforePixels = options.beforePixels
    ? new Uint8ClampedArray(options.beforePixels)
    : readPixels(state.context, state.canvas);
  const beforeIndices = options.beforeIndices
    ? new Uint8Array(options.beforeIndices)
    : new Uint8Array(state.indexBuffer);
  validateBufferLengths(state.canvas, beforePixels, beforeIndices);
  return { beforePixels, beforeIndices };
}

function validateBufferLengths(
  canvas: HTMLCanvasElement,
  pixels: Uint8ClampedArray,
  indices: Uint8Array,
): void {
  if (pixels.length !== canvas.width * canvas.height * 4 ||
      indices.length !== canvas.width * canvas.height) {
    throw editorError('invalid_state', false, { reason: 'raster_buffer_shape' });
  }
}

function arraysEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function editorError(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
): RasterToolError {
  return new RasterToolError({ code, retryable, details });
}

function toEditorError(error: unknown): EditorError {
  if (error instanceof RasterToolError) return error.editorError;
  return { code: 'internal', retryable: true, details: { reason: 'unexpected_failure' } };
}
