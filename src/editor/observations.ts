import type { ProjectContext } from '../stores/project-context';
import type { ProjectChangeEvent } from '../stores/project-store';
import type { Command } from '../stores/history-store';
import type { Cel, Frame, FrameTag } from '../types/animation';
import { createArtworkCompositionPlan, drawArtworkComposition } from '../services/export-composition';
import { autoSaveService } from '../services/auto-save';
import {
  PROJECT_OBSERVATION_LIMITS,
  RENDER_OBSERVATION_MAX_PIXELS,
  RENDER_OBSERVATION_MAX_BYTES,
  RENDER_OBSERVATION_MAX_REGION_HEIGHT,
  RENDER_OBSERVATION_MAX_REGION_WIDTH,
  RENDER_OBSERVATION_MAX_SCALE,
  RENDER_OBSERVATION_MIN_SCALE,
  RENDER_OBSERVATION_REPRESENTATION_VERSION,
} from './catalog';
import type {
  AutomationTransactionProvenance,
  EditorError,
  ProjectSaveSafetyObservation,
  ProjectTarget,
} from './contracts';
import { isRecord } from './contracts';
import type { Layer } from '../types/layer';

export interface ProjectLayerObservation {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly order: number;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: string;
  readonly parentId: string | null;
  readonly continuous: boolean;
}

export interface ProjectCelObservation {
  readonly key: string;
  readonly id: string;
  readonly layerId: string;
  readonly frameId: string;
  readonly width: number;
  readonly height: number;
  readonly indexed: boolean;
  readonly indexLength: number;
  readonly hasNonTransparentPixels: boolean;
  readonly linkedCelId?: string;
  readonly linkType?: string;
  readonly opacity: number;
}

export interface ProjectFrameObservation {
  readonly id: string;
  readonly order: number;
  readonly duration: number;
  readonly cels: readonly ProjectCelObservation[];
}

export interface ProjectTagObservation {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly startFrameIndex: number;
  readonly endFrameIndex: number;
  readonly collapsed: boolean;
}

export interface ProjectPaletteEntryObservation {
  readonly id: string;
  readonly color: string;
  readonly index: number;
}

export interface HistoryEntryObservation {
  readonly id: string;
  readonly name: string;
  readonly timestamp?: number;
  readonly provenance?: AutomationTransactionProvenance;
}

export interface ProjectHistoryObservation {
  readonly undoCount: number;
  readonly redoCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: readonly HistoryEntryObservation[];
  readonly redo: readonly HistoryEntryObservation[];
}

export interface ProjectObservation {
  readonly type: 'project.observation';
  readonly target: ProjectTarget;
  readonly revision: number;
  readonly name: string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly currentFrameId: string;
  readonly fps: number;
  readonly layers: readonly ProjectLayerObservation[];
  readonly frames: readonly ProjectFrameObservation[];
  readonly tags: readonly ProjectTagObservation[];
  readonly palette: readonly ProjectPaletteEntryObservation[];
  readonly history: ProjectHistoryObservation;
  readonly saveSafety: ProjectSaveSafetyObservation;
  readonly lastEvent?: ProjectChangeEvent;
}

export interface RenderRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type RenderBackgroundPolicy =
  | { readonly kind: 'transparent' }
  | { readonly kind: 'solid'; readonly color: string };

export interface RenderCompositeSourceRequest {
  readonly kind: 'composite';
  readonly frameId: string;
}

export interface RenderLayerSourceRequest {
  readonly kind: 'layer';
  readonly layerId: string;
  readonly frameId: string;
  readonly celId?: string;
}

export type RenderObservationSourceRequest =
  | RenderCompositeSourceRequest
  | RenderLayerSourceRequest;

export interface RenderObservationRequest {
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly source: RenderObservationSourceRequest;
  readonly region?: RenderRegion;
  readonly background: RenderBackgroundPolicy;
  readonly scale: number;
  readonly expectedDigest: string | null;
}

export interface RenderCompositeObservationSource {
  readonly kind: 'composite';
  readonly frameId: string;
}

export interface RenderLayerObservationSource {
  readonly kind: 'layer';
  readonly layerId: string;
  readonly frameId: string;
  readonly celId: string;
}

export type RenderObservationSource =
  | RenderCompositeObservationSource
  | RenderLayerObservationSource;

export interface RenderObservation {
  readonly type: 'render.observation';
  readonly target: ProjectTarget;
  readonly revision: number;
  /** Compatibility alias for the captured source frame. */
  readonly frameId: string;
  readonly source: RenderObservationSource;
  readonly sourceKind: 'composite' | 'layer';
  readonly region: RenderRegion;
  readonly background: RenderBackgroundPolicy;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly format: 'rgba8';
  readonly stride: number;
  readonly pixels: Uint8Array;
  readonly digest: string;
}

/** The pre-explicit-shape result retained for direct compatibility callers. */
export interface LegacyRenderObservation {
  readonly type: 'render.observation';
  readonly target: ProjectTarget;
  readonly revision: number;
  readonly frameId: string;
  readonly width: number;
  readonly height: number;
  readonly format: 'rgba8';
  readonly stride: number;
  readonly pixels: Uint8Array;
}

export interface ProjectObservationOptions {
  readonly saveSafety?: ProjectSaveSafetyObservation;
  readonly lastEvent?: ProjectChangeEvent;
  readonly maxHistoryEntries?: number;
}

export interface RenderObservationFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type RenderObservationResult = RenderObservation | RenderObservationFailure;

export interface ProjectObservationFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type ProjectObservationResult = ProjectObservation | ProjectObservationFailure;

/**
 * Capture project state as plain records. The context remains private to the
 * caller; no store, signal, canvas, command, or live collection is returned.
 */
export function observeProject(
  context: ProjectContext,
  target: ProjectTarget,
  options: ProjectObservationOptions = {},
): ProjectObservationResult {
  const paletteEntries = context.palette.getProjectPaletteEntries();
  const boundsFailure = validateProjectObservationBounds(context, target, paletteEntries, options);
  if (boundsFailure) return boundsFailure;

  const maxHistoryEntries = options.maxHistoryEntries ?? PROJECT_OBSERVATION_LIMITS.maxHistoryEntries;
  const layers = context.layers.layers.value.map((layer, order) => ({
    id: layer.id,
    name: layer.name,
    type: layer.type,
    order,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    parentId: layer.parentId,
    continuous: layer.continuous ?? false,
  }));

  const frames = context.animation.frames.value.map((frame, order) => ({
    id: frame.id,
    order,
    duration: frame.duration,
    cels: observeFrameCels(context, frame.id),
  }));

  const saveSafety = options.saveSafety ?? autoSaveService.getSaveSafetyObservation(context);
  return {
    type: 'project.observation',
    target: { projectId: target.projectId },
    revision: context.project.revision.value,
    name: context.project.name.value,
    canvas: {
      width: context.project.width.value,
      height: context.project.height.value,
    },
    currentFrameId: context.animation.currentFrameId.value,
    fps: context.animation.fps.value,
    layers,
    frames,
    tags: context.animation.tags.value.map(cloneTag),
    palette: paletteEntries.map((entry, index) => ({
      id: entry.id,
      color: entry.color,
      index,
    })),
    history: observeHistory(context, maxHistoryEntries),
    saveSafety: cloneSaveSafetyObservation(saveSafety),
    ...(options.lastEvent ? { lastEvent: cloneProjectChangeEvent(options.lastEvent) } : {}),
  };
}

/**
 * Render one explicit frame through the canonical artwork composition plan.
 * The returned byte buffer is detached from the canvas and safe to transfer.
 */
export function renderProject(
  context: ProjectContext,
  target: ProjectTarget,
  frameId: string,
  maxBytes = RENDER_OBSERVATION_MAX_BYTES,
): LegacyRenderObservation | RenderObservationFailure {
  const renderLimit = normalizeRenderByteLimit(maxBytes);
  if (renderLimit === null) {
    return {
      ok: false,
      error: {
        code: 'limit_exceeded',
        retryable: false,
        details: { limitId: 'render-bytes-config', max: RENDER_OBSERVATION_MAX_BYTES },
      },
    };
  }

  const frame = context.animation.frames.value.find((candidate) => candidate.id === frameId);
  if (!frame) {
    return {
      ok: false,
      error: {
        code: 'target_not_found',
        retryable: true,
        details: { resource: 'frame' },
      },
    };
  }

  const width = context.project.width.value;
  const height = context.project.height.value;
  const byteLength = width * height * 4;
  if (!Number.isSafeInteger(byteLength) || byteLength > renderLimit) {
    return {
      ok: false,
      error: {
        code: 'limit_exceeded',
        retryable: false,
        details: { limitId: 'render-bytes', max: renderLimit },
      },
    };
  }

  let canvas: HTMLCanvasElement;
  let drawing: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  } catch {
    return {
      ok: false,
      error: {
        code: 'internal',
        retryable: true,
        details: { reason: 'render_surface' },
      },
    };
  }

  if (!drawing) {
    return {
      ok: false,
      error: {
        code: 'invalid_state',
        retryable: false,
        details: { reason: 'render_context' },
      },
    };
  }

  try {
    drawing.clearRect(0, 0, width, height);
    drawArtworkComposition(
      drawing,
      createArtworkCompositionPlan({
        frameId,
        layers: context.layers.layers.value,
        cels: context.animation.cels.value,
        getCelKey: context.animation.getCelKey,
      }),
    );
    const imageData = drawing.getImageData(0, 0, width, height);
    return {
      type: 'render.observation',
      target: { projectId: target.projectId },
      revision: context.project.revision.value,
      frameId,
      width,
      height,
      format: 'rgba8',
      stride: width * 4,
      pixels: new Uint8Array(imageData.data),
    };
  } catch {
    return {
      ok: false,
      error: {
        code: 'invalid_state',
        retryable: false,
        details: { reason: 'render_readback' },
      },
    };
  }
}

/**
 * Capture a bounded, explicit render observation. The compositor receives
 * only captured store values and the returned bytes never retain a canvas.
 */
export async function renderProjectObservation(
  context: ProjectContext,
  request: RenderObservationRequest,
  maxBytes = RENDER_OBSERVATION_MAX_BYTES,
): Promise<RenderObservationResult> {
  try {
    const renderLimit = normalizeRenderByteLimit(maxBytes);
    if (renderLimit === null) {
      throw renderObservationError('limit_exceeded', false, {
        limitId: 'render-bytes-config',
        max: RENDER_OBSERVATION_MAX_BYTES,
      });
    }

    validateRenderRequest(request);
    if (context.isDisposed || context.project.id.value !== request.target.projectId) {
      throw renderObservationError('target_not_found', true);
    }
    if (context.project.revision.value !== request.expectedRevision) {
      throw renderObservationError('revision_conflict', true, {
        expectedRevision: request.expectedRevision,
        currentRevision: context.project.revision.value,
      });
    }

    const width = context.project.width.value;
    const height = context.project.height.value;
    validateCanvasDimensions(width, height);
    const region = normalizeRenderRegion(request.region, width, height);
    const regionBytes = region.width * region.height * 4;
    if (!Number.isSafeInteger(regionBytes) || regionBytes > renderLimit) {
      throw renderObservationError('limit_exceeded', false, {
        limitId: 'render-bytes',
        max: renderLimit,
      });
    }
    if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
      throw renderObservationError('internal', true, { reason: 'digest_support' });
    }

    const captured = captureRenderSource(context, request.source);
    const background = normalizeRenderBackground(request.background);
    const pixels = renderCapturedPixels(context, captured, region, background);
    const source = captured.source;
    const stride = region.width * 4;
    const digest = await createRenderObservationDigest({
      target: request.target,
      revision: request.expectedRevision,
      source,
      region,
      background,
      scale: request.scale,
      width: region.width,
      height: region.height,
      stride,
      pixels,
    });

    revalidateCapturedRender(context, request, captured);
    if (request.expectedDigest !== null && request.expectedDigest !== digest) {
      throw renderObservationError('revision_conflict', true, { reason: 'render_digest' });
    }

    return {
      type: 'render.observation',
      target: { projectId: request.target.projectId },
      revision: request.expectedRevision,
      frameId: source.frameId,
      source,
      sourceKind: source.kind,
      region,
      background,
      scale: request.scale,
      width: region.width,
      height: region.height,
      format: 'rgba8',
      stride,
      pixels,
      digest,
    };
  } catch (error) {
    return { ok: false, error: toRenderObservationError(error) };
  }
}

interface CapturedRenderSource {
  readonly source: RenderObservationSource;
  readonly frameId: string;
  readonly frame: Frame;
  readonly frames: readonly Frame[];
  readonly layers: readonly Layer[];
  readonly cels: ReadonlyMap<string, Cel>;
  readonly layer?: Layer;
  readonly cel?: Cel;
}

interface RenderDigestInput {
  readonly target: ProjectTarget;
  readonly revision: number;
  readonly source: RenderObservationSource;
  readonly region: RenderRegion;
  readonly background: RenderBackgroundPolicy;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly stride: number;
  readonly pixels: Uint8Array;
}

// fallow-ignore-next-line complexity -- The explicit observation boundary validates each bounded field before any Canvas work.
function validateRenderRequest(request: RenderObservationRequest): void {
  if (!isRecord(request.target)
      || typeof request.target.projectId !== 'string'
      || request.target.projectId.length === 0
      || request.target.projectId.length > 256) {
    throw renderObservationError('invalid_request', false, { reason: 'target' });
  }
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
    throw renderObservationError('invalid_request', false, { reason: 'expected_revision' });
  }
  if (!isRecord(request.source)) {
    throw renderObservationError('invalid_request', false, { reason: 'source' });
  }
  if (request.source.kind === 'composite') {
    validateRenderIdentity(request.source.frameId, 'frame_id');
  } else if (request.source.kind === 'layer') {
    validateRenderIdentity(request.source.layerId, 'layer_id');
    validateRenderIdentity(request.source.frameId, 'frame_id');
    if (request.source.celId !== undefined) {
      validateRenderIdentity(request.source.celId, 'cel_id');
    }
  } else {
    throw renderObservationError('invalid_request', false, { reason: 'source_kind' });
  }
  if (!Number.isSafeInteger(request.scale)
      || request.scale < RENDER_OBSERVATION_MIN_SCALE
      || request.scale > RENDER_OBSERVATION_MAX_SCALE) {
    throw renderObservationError('bounds_exceeded', false, {
      reason: 'scale',
      min: RENDER_OBSERVATION_MIN_SCALE,
      max: RENDER_OBSERVATION_MAX_SCALE,
    });
  }
  if (!isRecord(request.background)) {
    throw renderObservationError('invalid_request', false, { reason: 'background' });
  }
  normalizeRenderBackground(request.background);
  if (request.expectedDigest !== null
      && (typeof request.expectedDigest !== 'string' || !/^[0-9a-f]{64}$/.test(request.expectedDigest))) {
    throw renderObservationError('invalid_request', false, { reason: 'digest' });
  }
  if (request.region !== undefined && !isRecord(request.region)) {
    throw renderObservationError('invalid_request', false, { reason: 'region' });
  }
}

function validateRenderIdentity(value: unknown, reason: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw renderObservationError('invalid_request', false, { reason });
  }
  if (value.length > 256) {
    throw renderObservationError('limit_exceeded', false, { reason, max: 256 });
  }
}

function validateCanvasDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw renderObservationError('invalid_state', false, { reason: 'canvas_shape' });
  }
}

// fallow-ignore-next-line complexity -- Region validation keeps allocation and containment checks in one preflight.
function normalizeRenderRegion(
  requested: RenderRegion | undefined,
  canvasWidth: number,
  canvasHeight: number,
): RenderRegion {
  if (requested === undefined) {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  }
  const region = requested;
  if (!Number.isSafeInteger(region.x) || !Number.isSafeInteger(region.y)
      || !Number.isSafeInteger(region.width) || !Number.isSafeInteger(region.height)) {
    throw renderObservationError('invalid_request', false, { reason: 'region_integer' });
  }
  const isFullProjectRegion = region.x === 0 && region.y === 0
    && region.width === canvasWidth && region.height === canvasHeight;
  if (region.width < 1 || region.height < 1
      || (!isFullProjectRegion && (
        region.width > RENDER_OBSERVATION_MAX_REGION_WIDTH
        || region.height > RENDER_OBSERVATION_MAX_REGION_HEIGHT))) {
    throw renderObservationError('bounds_exceeded', false, {
      reason: 'region_extent',
      max: Math.max(RENDER_OBSERVATION_MAX_REGION_WIDTH, RENDER_OBSERVATION_MAX_REGION_HEIGHT),
    });
  }
  if (!isFullProjectRegion && region.width * region.height > RENDER_OBSERVATION_MAX_PIXELS) {
    throw renderObservationError('limit_exceeded', false, {
      reason: 'region_pixels',
      max: RENDER_OBSERVATION_MAX_PIXELS,
    });
  }
  if (region.x < 0 || region.y < 0
      || region.x > canvasWidth - region.width
      || region.y > canvasHeight - region.height) {
    throw renderObservationError('bounds_exceeded', false, { reason: 'canvas_bounds' });
  }
  return { x: region.x, y: region.y, width: region.width, height: region.height };
}

function normalizeRenderBackground(value: RenderBackgroundPolicy): RenderBackgroundPolicy {
  if (!isRecord(value) || value.kind === 'transparent') return { kind: 'transparent' };
  if (value.kind === 'solid' && typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)) {
    return { kind: 'solid', color: value.color.toLowerCase() };
  }
  throw renderObservationError('invalid_request', false, { reason: 'background' });
}

// fallow-ignore-next-line complexity -- Source capture validates frame, layer, cel, and canvas identity together.
function captureRenderSource(
  context: ProjectContext,
  source: RenderObservationSourceRequest,
): CapturedRenderSource {
  const frames = context.animation.frames.value;
  const layers = context.layers.layers.value;
  const cels = context.animation.cels.value;
  const frame = frames.find((candidate) => candidate.id === source.frameId);
  if (!frame) throw renderObservationError('target_not_found', true, { resource: 'frame' });

  if (source.kind === 'composite') {
    return {
      source: { kind: 'composite', frameId: source.frameId },
      frameId: source.frameId,
      frame,
      frames,
      layers,
      cels,
    };
  }

  const layer = layers.find((candidate) => candidate.id === source.layerId);
  if (!layer) throw renderObservationError('target_not_found', true, { resource: 'layer' });
  if (layer.type === 'reference') {
    throw renderObservationError('unsupported', false, { reason: 'reference_layer' });
  }
  if (layer.type !== 'image' && layer.type !== 'group' && layer.type !== 'text') {
    throw renderObservationError('unsupported', false, { reason: 'layer_type' });
  }
  const cel = cels.get(context.animation.getCelKey(layer.id, source.frameId));
  if (!cel) throw renderObservationError('target_not_found', true, { resource: 'cel' });
  if (cel.layerId !== layer.id || cel.frameId !== source.frameId) {
    throw renderObservationError('invalid_state', false, { reason: 'cel_identity' });
  }
  if (source.celId !== undefined && source.celId !== cel.id) {
    throw renderObservationError('revision_conflict', true, { reason: 'cel_changed' });
  }
  validateSourceCanvas(cel);
  return {
    source: { kind: 'layer', layerId: layer.id, frameId: source.frameId, celId: cel.id },
    frameId: source.frameId,
    frame,
    frames,
    layers,
    cels,
    layer,
    cel,
  };
}

function validateSourceCanvas(cel: Cel): void {
  if (!cel.canvas || !Number.isSafeInteger(cel.canvas.width) || !Number.isSafeInteger(cel.canvas.height)
      || cel.canvas.width < 1 || cel.canvas.height < 1) {
    throw renderObservationError('invalid_state', false, { reason: 'canvas_shape' });
  }
}

function renderCapturedPixels(
  context: ProjectContext,
  captured: CapturedRenderSource,
  region: RenderRegion,
  background: RenderBackgroundPolicy,
): Uint8Array {
  let canvas: HTMLCanvasElement;
  let drawing: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = region.width;
    canvas.height = region.height;
    drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  } catch {
    throw renderObservationError('internal', true, { reason: 'render_surface' });
  }
  if (!drawing) throw renderObservationError('invalid_state', false, { reason: 'render_context' });

  try {
    drawing.imageSmoothingEnabled = false;
    drawing.clearRect(0, 0, region.width, region.height);
    if (background.kind === 'solid') {
      drawing.fillStyle = background.color;
      drawing.fillRect(0, 0, region.width, region.height);
    }
    drawing.save();
    try {
      drawing.beginPath();
      drawing.rect(0, 0, region.width, region.height);
      drawing.clip();
      drawing.translate(-region.x, -region.y);
      drawArtworkComposition(
        drawing,
        createArtworkCompositionPlan({
          frameId: captured.frameId,
          layers: captured.layer ? [captured.layer] : captured.layers,
          cels: captured.cels,
          getCelKey: context.animation.getCelKey,
        }),
      );
    } finally {
      drawing.restore();
    }
    const imageData = drawing.getImageData(0, 0, region.width, region.height);
    const pixels = new Uint8Array(imageData.data);
    if (pixels.length !== region.width * region.height * 4) {
      throw renderObservationError('invalid_state', false, { reason: 'render_readback' });
    }
    return pixels;
  } catch (error) {
    if (isRenderObservationError(error)) throw error;
    throw renderObservationError('invalid_state', false, { reason: 'render_readback' });
  }
}

async function createRenderObservationDigest(input: RenderDigestInput): Promise<string> {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
    throw renderObservationError('internal', true, { reason: 'digest_support' });
  }
  const metadata = JSON.stringify({
    representation: RENDER_OBSERVATION_REPRESENTATION_VERSION,
    target: input.target,
    revision: input.revision,
    sourceKind: input.source.kind,
    source: input.source,
    region: input.region,
    background: input.background,
    scale: input.scale,
    format: 'rgba8',
    width: input.width,
    height: input.height,
    stride: input.stride,
  });
  const metadataBytes = new TextEncoder().encode(metadata);
  const bytes = new Uint8Array(metadataBytes.length + 1 + input.pixels.length);
  bytes.set(metadataBytes);
  bytes[metadataBytes.length] = 0;
  bytes.set(input.pixels, metadataBytes.length + 1);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

// fallow-ignore-next-line code-duplication -- Source revalidation intentionally repeats the boundary's identity checks.
// fallow-ignore-next-line complexity -- Async render work must recheck every captured identity before returning bytes.
function revalidateCapturedRender(
  context: ProjectContext,
  request: RenderObservationRequest,
  captured: CapturedRenderSource,
): void {
  if (context.isDisposed || context.project.id.value !== request.target.projectId) {
    throw renderObservationError('target_not_found', true);
  }
  const currentRevision = context.project.revision.value;
  if (currentRevision !== request.expectedRevision) {
    throw renderObservationError('revision_conflict', true, {
      expectedRevision: request.expectedRevision,
      currentRevision,
    });
  }
  if (context.animation.frames.value !== captured.frames || context.layers.layers.value !== captured.layers
      || context.animation.cels.value !== captured.cels) {
    throw renderObservationError('revision_conflict', true, { reason: 'source_changed' });
  }
  const currentFrame = context.animation.frames.value.find((candidate) => candidate.id === captured.frameId);
  if (currentFrame !== captured.frame) {
    throw renderObservationError('revision_conflict', true, { reason: 'frame_changed' });
  }
  if (captured.layer) {
    const currentLayer = context.layers.layers.value.find((candidate) => candidate.id === captured.layer!.id);
    const currentCel = context.animation.cels.value.get(
      context.animation.getCelKey(captured.layer.id, captured.frameId),
    );
    if (currentLayer !== captured.layer || currentCel !== captured.cel) {
      throw renderObservationError('revision_conflict', true, { reason: 'source_changed' });
    }
  }
}

class RenderObservationError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'RenderObservationError';
    this.editorError = editorError;
  }
}

function renderObservationError(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
): RenderObservationError {
  return new RenderObservationError({ code, retryable, ...(details ? { details } : {}) });
}

function isRenderObservationError(error: unknown): error is RenderObservationError {
  return error instanceof RenderObservationError;
}

function toRenderObservationError(error: unknown): EditorError {
  if (isRenderObservationError(error)) return error.editorError;
  return { code: 'internal', retryable: true, details: { reason: 'unexpected_failure' } };
}

export function normalizeRenderByteLimit(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const limit = Math.floor(value);
  if (limit < 1) return null;
  return Math.min(limit, RENDER_OBSERVATION_MAX_BYTES);
}

function validateProjectObservationBounds(
  context: ProjectContext,
  target: ProjectTarget,
  paletteEntries: readonly { readonly id: string; readonly color: string }[],
  options: ProjectObservationOptions,
): ProjectObservationFailure | undefined {
  const limits = PROJECT_OBSERVATION_LIMITS;
  const maxHistoryEntries = options.maxHistoryEntries ?? limits.maxHistoryEntries;
  if (!Number.isSafeInteger(maxHistoryEntries) || maxHistoryEntries < 0 ||
      maxHistoryEntries > limits.maxHistoryEntries) {
    return observationLimitFailure('project-history-entries', limits.maxHistoryEntries);
  }

  const layers = context.layers.layers.value;
  const frames = context.animation.frames.value;
  const tags = context.animation.tags.value;
  const cels = context.animation.cels.value;
  const undo = context.history.undoStack.value;
  const redo = context.history.redoStack.value;

  const collectionFailure = validateObservationCollections(
    layers.length,
    frames.length,
    cels.size,
    tags.length,
    paletteEntries.length,
    undo.length,
    redo.length,
  );
  if (collectionFailure) return collectionFailure;

  const strings = collectObservationStrings(context, target, paletteEntries, options);
  return validateObservationStrings(strings);
}

function validateObservationCollections(
  layerCount: number,
  frameCount: number,
  celCount: number,
  tagCount: number,
  paletteCount: number,
  undoCount: number,
  redoCount: number,
): ProjectObservationFailure | undefined {
  const limits = PROJECT_OBSERVATION_LIMITS;
  const counts: readonly [string, number, number][] = [
    ['project-layers', layerCount, limits.maxLayers],
    ['project-frames', frameCount, limits.maxFrames],
    ['project-cels', celCount, limits.maxCels],
    ['project-tags', tagCount, limits.maxTags],
    ['project-palette-entries', paletteCount, limits.maxPaletteEntries],
    ['project-history-entries', Math.max(undoCount, redoCount), limits.maxHistoryEntries],
  ];
  for (const [limitId, count, max] of counts) {
    if (count > max) return observationLimitFailure(limitId, max);
  }
  return undefined;
}

function collectObservationStrings(
  context: ProjectContext,
  target: ProjectTarget,
  paletteEntries: readonly { readonly id: string; readonly color: string }[],
  options: ProjectObservationOptions,
): Array<[string, string | null | undefined]> {
  const strings: Array<[string, string | null | undefined]> = [
    ['target', target.projectId],
    ['project-name', context.project.name.value],
    ['current-frame', context.animation.currentFrameId.value],
  ];
  for (const layer of context.layers.layers.value) {
    strings.push(
      ['layer-id', layer.id],
      ['layer-name', layer.name],
      ['layer-type', layer.type],
      ['layer-blend-mode', layer.blendMode],
      ['layer-parent-id', layer.parentId],
    );
  }
  for (const frame of context.animation.frames.value) strings.push(['frame-id', frame.id]);
  for (const [key, cel] of context.animation.cels.value) {
    strings.push(
      ['cel-key', key],
      ['cel-id', cel.id],
      ['cel-layer-id', cel.layerId],
      ['cel-frame-id', cel.frameId],
      ['cel-linked-id', cel.linkedCelId],
      ['cel-link-type', cel.linkType],
    );
  }
  for (const tag of context.animation.tags.value) {
    strings.push(['tag-id', tag.id], ['tag-name', tag.name], ['tag-color', tag.color]);
  }
  for (const entry of paletteEntries) {
    strings.push(['palette-id', entry.id], ['palette-color', entry.color]);
  }
  for (const command of [
    ...context.history.undoStack.value,
    ...context.history.redoStack.value,
  ]) {
    strings.push(['history-id', command.id], ['history-name', command.name]);
  }
  if (options.lastEvent) {
    strings.push(['event-target', options.lastEvent.target], ['event-id', options.lastEvent.transactionId]);
  }
  return strings;
}

function validateObservationStrings(
  strings: readonly [string, string | null | undefined][],
): ProjectObservationFailure | undefined {
  for (const [resource, value] of strings) {
    if (value !== undefined && value !== null && value.length > PROJECT_OBSERVATION_LIMITS.maxStringLength) {
      return observationLimitFailure(
        'project-string-length',
        PROJECT_OBSERVATION_LIMITS.maxStringLength,
        resource,
      );
    }
  }
  return undefined;
}

function observationLimitFailure(
  limitId: string,
  max: number,
  resource?: string,
): ProjectObservationFailure {
  return {
    ok: false,
    error: {
      code: 'limit_exceeded',
      retryable: false,
      details: {
        limitId,
        max,
        ...(resource ? { resource } : {}),
      },
    },
  };
}

function observeFrameCels(context: ProjectContext, frameId: string): ProjectCelObservation[] {
  const observations: ProjectCelObservation[] = [];
  for (const layer of context.layers.layers.value) {
    const key = context.animation.getCelKey(layer.id, frameId);
    const cel = context.animation.cels.value.get(key);
    if (cel) observations.push(observeCel(key, cel));
  }
  return observations;
}

function observeCel(key: string, cel: Cel): ProjectCelObservation {
  const indexBuffer = cel.indexBuffer;
  const hasIndexedPixels = indexBuffer?.some((index) => index !== 0) ?? false;
  return {
    key,
    id: cel.id,
    layerId: cel.layerId,
    frameId: cel.frameId,
    width: cel.canvas.width,
    height: cel.canvas.height,
    indexed: indexBuffer !== undefined,
    indexLength: indexBuffer?.length ?? 0,
    hasNonTransparentPixels: hasIndexedPixels,
    ...(cel.linkedCelId ? { linkedCelId: cel.linkedCelId } : {}),
    ...(cel.linkType ? { linkType: cel.linkType } : {}),
    opacity: cel.opacity ?? 100,
  };
}

function observeHistory(context: ProjectContext, maxEntries: number): ProjectHistoryObservation {
  return {
    undoCount: context.history.undoStack.value.length,
    redoCount: context.history.redoStack.value.length,
    canUndo: context.history.canUndo.value,
    canRedo: context.history.canRedo.value,
    undo: context.history.undoStack.value
      .slice(-maxEntries)
      .map(observeHistoryEntry),
    redo: context.history.redoStack.value
      .slice(-maxEntries)
      .map(observeHistoryEntry),
  };
}

function observeHistoryEntry(command: Command): HistoryEntryObservation {
  return {
    id: command.id,
    name: command.name,
    ...(command.timestamp !== undefined ? { timestamp: command.timestamp } : {}),
    ...(command.provenance ? { provenance: cloneAutomationProvenance(command.provenance) } : {}),
  };
}

function cloneAutomationProvenance(
  provenance: AutomationTransactionProvenance,
): AutomationTransactionProvenance {
  return {
    source: 'automation',
    transactionId: provenance.transactionId,
    clientId: provenance.clientId,
    sessionId: provenance.sessionId,
    runId: provenance.runId,
    operationId: provenance.operationId,
    target: { projectId: provenance.target.projectId },
    fromRevision: provenance.fromRevision,
    toRevision: provenance.toRevision,
    transitionCount: provenance.transitionCount,
    transitionsTruncated: provenance.transitionsTruncated,
    transitions: provenance.transitions.map((transition) => ({
      phase: transition.phase,
      fromRevision: transition.fromRevision,
      toRevision: transition.toRevision,
    })),
    children: provenance.children.map((child) => ({
      commandId: child.commandId,
      operation: child.operation,
      domains: [...child.domains],
    })),
  };
}

function cloneTag(tag: FrameTag): ProjectTagObservation {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    startFrameIndex: tag.startFrameIndex,
    endFrameIndex: tag.endFrameIndex,
    collapsed: tag.collapsed,
  };
}

export function cloneSaveSafetyObservation(
  state: ProjectSaveSafetyObservation,
): ProjectSaveSafetyObservation {
  return {
    type: 'project.save-safety',
    target: { projectId: state.target.projectId },
    currentRevision: state.currentRevision,
    persistedRevision: state.persistedRevision,
    status: state.status,
    ...(state.failure
      ? { failure: { category: state.failure.category, action: state.failure.action } }
      : {}),
  };
}

export function cloneProjectChangeEvent(event: ProjectChangeEvent): ProjectChangeEvent {
  return {
    type: 'project-change',
    target: event.target,
    fromRevision: event.fromRevision,
    toRevision: event.toRevision,
    transactionId: event.transactionId,
    domains: [...event.domains],
  };
}
