import type { Command } from '../stores/history';
import type {
  ProjectChangeEvent,
  ProjectChangeDomain,
} from '../stores/project-store';
import type { ProjectContext } from '../stores/project-context';
import type { Cel } from '../types/animation';
import type { Layer } from '../types/layer';
import { isRuntimeEmptyCel, markRuntimeEmptyCanvas } from '../stores/animation/empty-cel';

export const CANVAS_SIZE_COMMAND_ID = 'project.canvas.resize';
export const CANVAS_SIZE_MAX_DIMENSION = 2048;

export const canvasSizeCatalog = Object.freeze({
  version: '1.0',
  command: {
    id: CANVAS_SIZE_COMMAND_ID,
    target: 'project',
    requiresRevision: true,
    input: ['target', 'expectedRevision', 'width', 'height', 'offset'],
    affectedDomains: ['canvas-bounds', 'raster-content'] as const,
    undo: 'one-session-history-entry',
    confirmation: 'required-when-meaningful-content-is-cropped',
    errors: [
      'invalid_request',
      'target_not_found',
      'revision_conflict',
      'invalid_state',
      'limit_exceeded',
      'unsupported',
    ] as const,
  },
} as const);

export interface ProjectTarget {
  readonly projectId: string;
}

export interface CanvasOffset {
  readonly x: number;
  readonly y: number;
}

export interface CanvasSizeRequest {
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly width: number;
  readonly height: number;
  readonly offset: CanvasOffset;
}

export type CanvasSizeRequestInput = Omit<CanvasSizeRequest, 'target' | 'offset'> & {
  target: ProjectTarget | string;
  offset?: CanvasOffset;
  offsetX?: number;
  offsetY?: number;
};

export interface CanvasCropSummary {
  readonly rgbaPixels: number;
  readonly indexedPixels: number;
  readonly payloadCount: number;
}

export interface CanvasSizePreview {
  readonly request: CanvasSizeRequest;
  readonly currentWidth: number;
  readonly currentHeight: number;
  readonly crop: CanvasCropSummary;
  readonly requiresConfirmation: boolean;
}

export type CanvasSizeErrorCode =
  | 'invalid_request'
  | 'target_not_found'
  | 'revision_conflict'
  | 'invalid_state'
  | 'limit_exceeded'
  | 'unsupported'
  | 'internal';

export interface EditorError {
  readonly code: CanvasSizeErrorCode;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, string | number>>;
}

export interface CanvasSizeSuccess {
  readonly ok: true;
  readonly revision: number;
  readonly event: ProjectChangeEvent;
}

export interface CanvasSizeFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type CanvasSizeResult = CanvasSizeSuccess | CanvasSizeFailure;
export type CanvasSizePreviewResult =
  | { readonly ok: true; readonly preview: CanvasSizePreview }
  | CanvasSizeFailure;

export interface CanvasSizeExecutionOptions {
  readonly confirmed?: boolean;
  readonly preview?: CanvasSizePreview;
}

class CanvasSizeError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'CanvasSizeError';
    this.editorError = editorError;
  }
}

interface CanvasSizeEntry {
  readonly key: string;
  readonly layerId: string;
  readonly frameId: string;
  readonly cel?: Cel;
  readonly sourceCanvas?: HTMLCanvasElement;
}

interface CanvasSizeSnapshot {
  readonly width: number;
  readonly height: number;
  readonly cels: Map<string, Cel>;
}

interface ValidatedCanvasSize {
  readonly request: CanvasSizeRequest;
  readonly currentWidth: number;
  readonly currentHeight: number;
  readonly entries: readonly CanvasSizeEntry[];
  readonly crop: CanvasCropSummary;
}

interface PreparedCanvasSize {
  readonly before: CanvasSizeSnapshot;
  readonly after: CanvasSizeSnapshot;
}

interface CanvasPreparationState {
  readonly canvasReplacements: Map<HTMLCanvasElement, HTMLCanvasElement>;
  readonly indexReplacements: Map<Uint8Array, Uint8Array>;
  transparentSource?: HTMLCanvasElement;
}

export function captureProjectTarget(context: ProjectContext): ProjectTarget {
  return { projectId: context.project.id.value };
}

export function createCanvasSizeRequest(
  context: ProjectContext,
  width: number,
  height: number,
  offset: CanvasOffset = { x: 0, y: 0 }
): CanvasSizeRequest {
  return {
    target: captureProjectTarget(context),
    expectedRevision: context.project.revision.value,
    width,
    height,
    offset: { x: offset.x, y: offset.y },
  };
}

export function previewCanvasSize(
  context: ProjectContext,
  input: CanvasSizeRequestInput
): CanvasSizePreviewResult {
  try {
    const request = normalizeRequest(input);
    const validated = validateCanvasSize(context, request);
    return {
      ok: true,
      preview: {
        request: validated.request,
        currentWidth: validated.currentWidth,
        currentHeight: validated.currentHeight,
        crop: validated.crop,
        requiresConfirmation: hasMeaningfulCrop(validated.crop),
      },
    };
  } catch (error) {
    return { ok: false, error: toEditorError(error) };
  }
}

export async function executeCanvasSize(
  context: ProjectContext,
  input: CanvasSizeRequestInput,
  options: CanvasSizeExecutionOptions = {}
): Promise<CanvasSizeResult> {
  try {
    const request = normalizeRequest(input);
    const validated = validateCanvasSize(context, request);

    if (options.preview && !sameRequest(options.preview.request, request)) {
      throw editorError('invalid_request', false, { reason: 'preview_mismatch' });
    }

    if (hasMeaningfulCrop(validated.crop) && !options.confirmed) {
      throw editorError('invalid_request', false, { reason: 'confirmation_required' });
    }

    const prepared = prepareCanvasSize(validated);
    const command = new ResizeCanvasCommand(context, request, prepared);
    await context.history.execute(command);

    const event = command.lastEvent;
    if (!event) {
      throw editorError('internal', true, { reason: 'missing_change_event' });
    }

    return { ok: true, revision: event.toRevision, event };
  } catch (error) {
    return { ok: false, error: toEditorError(error) };
  }
}

class ResizeCanvasCommand implements Command {
  readonly id = crypto.randomUUID();
  readonly name = 'Resize Canvas';
  readonly memorySize: number;
  private readonly context: ProjectContext;
  private readonly request: CanvasSizeRequest;
  private readonly before: CanvasSizeSnapshot;
  private readonly after: CanvasSizeSnapshot;
  private expectedRevision: number;
  private applied = false;
  private _lastEvent: ProjectChangeEvent | null = null;

  constructor(
    context: ProjectContext,
    request: CanvasSizeRequest,
    prepared: PreparedCanvasSize
  ) {
    this.context = context;
    this.request = request;
    this.before = prepared.before;
    this.after = prepared.after;
    this.expectedRevision = request.expectedRevision;
    this.memorySize = estimateMemorySize(prepared.after.cels);
  }

  get lastEvent(): ProjectChangeEvent | null {
    return this._lastEvent;
  }

  execute(): void {
    if (this.applied) {
      throw editorError('invalid_state', false, { reason: 'already_applied' });
    }

    this.assertExpectedState(this.before);
    this.context.project.applyCanvasSizeState(
      this.after.width,
      this.after.height,
      this.after.cels
    );
    this._lastEvent = this.context.project.commitChange(this.id, changedDomains());
    this.expectedRevision = this._lastEvent.toRevision;
    this.applied = true;
  }

  undo(): void {
    if (!this.applied) {
      throw editorError('invalid_state', false, { reason: 'not_applied' });
    }

    this.assertExpectedState(this.after);
    this.context.project.applyCanvasSizeState(
      this.before.width,
      this.before.height,
      this.before.cels
    );
    this._lastEvent = this.context.project.commitChange(this.id, changedDomains());
    this.expectedRevision = this._lastEvent.toRevision;
    this.applied = false;
  }

  private assertExpectedState(expected: CanvasSizeSnapshot): void {
    const target = this.context.project.id.value;
    if (target !== this.request.target.projectId) {
      throw editorError('target_not_found', true);
    }

    if (this.context.project.revision.value !== this.expectedRevision) {
      throw editorError('revision_conflict', true, {
        expectedRevision: this.expectedRevision,
        currentRevision: this.context.project.revision.value,
      });
    }

    if (
      this.context.project.width.value !== expected.width ||
      this.context.project.height.value !== expected.height
    ) {
      throw editorError('revision_conflict', true, { reason: 'dimensions_changed' });
    }
  }
}

function normalizeRequest(input: CanvasSizeRequestInput): CanvasSizeRequest {
  const target =
    typeof input.target === 'string'
      ? { projectId: input.target }
      : input.target;
  const offset = input.offset ?? {
    x: input.offsetX ?? 0,
    y: input.offsetY ?? 0,
  };

  if (!target || typeof target.projectId !== 'string' || target.projectId.length === 0) {
    throw editorError('invalid_request', false, { reason: 'target' });
  }

  return {
    target: { projectId: target.projectId },
    expectedRevision: input.expectedRevision,
    width: input.width,
    height: input.height,
    offset: { x: offset.x, y: offset.y },
  };
}

function validateCanvasSize(
  context: ProjectContext,
  request: CanvasSizeRequest
): ValidatedCanvasSize {
  validateRequestShape(request);
  validateTargetAndRevision(context, request);
  validateCanvasSizeAvailability(context);
  const { width: currentWidth, height: currentHeight } = readCurrentDimensions(context);
  rejectUnchangedRequest(request, currentWidth, currentHeight);

  const entries = collectEntries(context, currentWidth, currentHeight);
  const crop = inspectCrop(entries, currentWidth, currentHeight, request);

  return {
    request,
    currentWidth,
    currentHeight,
    entries,
    crop,
  };
}

function validateTargetAndRevision(
  context: ProjectContext,
  request: CanvasSizeRequest
): void {
  if (context.project.id.value !== request.target.projectId) {
    throw editorError('target_not_found', true);
  }

  if (context.project.revision.value !== request.expectedRevision) {
    throw editorError('revision_conflict', true, {
      expectedRevision: request.expectedRevision,
      currentRevision: context.project.revision.value,
    });
  }
}

function validateCanvasSizeAvailability(context: ProjectContext): void {
  if (context.guidedDrawing.active) {
    throw editorError('unsupported', false, { feature: 'guided-drawing-canvas-resize' });
  }
}

function readCurrentDimensions(
  context: ProjectContext
): { width: number; height: number } {
  const width = context.project.width.value;
  const height = context.project.height.value;
  if (!isDimension(width) || !isDimension(height)) {
    throw editorError('invalid_state', false, { reason: 'current_dimensions' });
  }
  return { width, height };
}

function rejectUnchangedRequest(
  request: CanvasSizeRequest,
  currentWidth: number,
  currentHeight: number
): void {
  if (request.width === currentWidth && request.height === currentHeight &&
      request.offset.x === 0 && request.offset.y === 0) {
    throw editorError('invalid_request', false, { reason: 'dimensions_unchanged' });
  }
}

function validateRequestShape(request: CanvasSizeRequest): void {
  if (!Number.isInteger(request.expectedRevision) || request.expectedRevision < 0) {
    throw editorError('invalid_request', false, { reason: 'expected_revision' });
  }

  validateRequestedDimension(request.width, 'width');
  validateRequestedDimension(request.height, 'height');

  if (!Number.isInteger(request.offset.x) || !Number.isInteger(request.offset.y)) {
    throw editorError('invalid_request', false, { reason: 'offset' });
  }

  if (Math.abs(request.offset.x) > CANVAS_SIZE_MAX_DIMENSION ||
      Math.abs(request.offset.y) > CANVAS_SIZE_MAX_DIMENSION) {
    throw editorError('limit_exceeded', false, { limitId: 'canvas-offset', max: CANVAS_SIZE_MAX_DIMENSION });
  }
}

function validateRequestedDimension(value: number, axis: 'width' | 'height'): void {
  if (!Number.isInteger(value) || value < 1) {
    throw editorError('invalid_request', false, { reason: 'dimensions', axis });
  }
  if (value > CANVAS_SIZE_MAX_DIMENSION) {
    throw editorError('limit_exceeded', false, {
      limitId: 'canvas-dimension',
      axis,
      max: CANVAS_SIZE_MAX_DIMENSION,
    });
  }
}

function isDimension(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= CANVAS_SIZE_MAX_DIMENSION;
}

function collectEntries(
  context: ProjectContext,
  currentWidth: number,
  currentHeight: number
): CanvasSizeEntry[] {
  const layers = context.layers.layers.value;
  const frames = context.animation.frames.value;
  const cels = context.animation.cels.value;
  const layerIds = new Set(layers.map((layer) => layer.id));
  const expectedKeys = new Set<string>();
  const entries: CanvasSizeEntry[] = [];
  const currentFrameId = context.animation.currentFrameId.value;

  for (const frame of frames) {
    for (const layer of layers) {
      if (layer.type === 'reference') continue;
      const entry = collectEntry(
        context,
        layer,
        frame.id,
        frame.id === currentFrameId ? layer.canvas : undefined,
        cels,
        currentWidth,
        currentHeight
      );
      expectedKeys.add(entry.key);
      entries.push(entry);
    }
  }

  rejectOrphanCels(cels, layerIds, expectedKeys);

  return entries;
}

function collectEntry(
  context: ProjectContext,
  layer: Layer,
  frameId: string,
  currentLayerCanvas: HTMLCanvasElement | undefined,
  cels: Map<string, Cel>,
  currentWidth: number,
  currentHeight: number
): CanvasSizeEntry {
  const key = context.animation.getCelKey(layer.id, frameId);
  const cel = cels.get(key);
  const sourceCanvas = cel?.canvas ?? currentLayerCanvas;

  if (cel) validateCelShape(cel, currentWidth, currentHeight);
  if (sourceCanvas) validateCanvasShape(sourceCanvas, currentWidth, currentHeight);

  return { key, layerId: layer.id, frameId, cel, sourceCanvas };
}

function rejectOrphanCels(
  cels: Map<string, Cel>,
  layerIds: Set<string>,
  expectedKeys: Set<string>
): void {
  for (const [key, cel] of cels) {
    if (!layerIds.has(cel.layerId) || !expectedKeys.has(key)) {
      throw editorError('invalid_state', false, { reason: 'orphan_cel' });
    }
  }
}

function validateCelShape(cel: Cel, width: number, height: number): void {
  validateCanvasShape(cel.canvas, width, height);

  if (cel.indexBuffer && cel.indexBuffer.length !== width * height) {
    throw editorError('invalid_state', false, { reason: 'index_buffer_shape' });
  }
}

function validateCanvasShape(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): void {
  if (canvas.width !== width || canvas.height !== height) {
    throw editorError('invalid_state', false, { reason: 'canvas_shape' });
  }
}

function inspectCrop(
  entries: readonly CanvasSizeEntry[],
  currentWidth: number,
  currentHeight: number,
  request: CanvasSizeRequest
): CanvasCropSummary {
  if (!couldCropContent(currentWidth, currentHeight, request)) {
    return { rgbaPixels: 0, indexedPixels: 0, payloadCount: 0 };
  }

  const canvasSources = new Set<HTMLCanvasElement>();
  const indexSources = new Set<Uint8Array>();
  let rgbaPixels = 0;
  let indexedPixels = 0;

  for (const entry of entries) {
    if (entry.sourceCanvas && !canvasSources.has(entry.sourceCanvas)) {
      canvasSources.add(entry.sourceCanvas);
      rgbaPixels += countMeaningfulRgbaOutside(
        entry.sourceCanvas,
        currentWidth,
        currentHeight,
        request
      );
    }

    const indexBuffer = entry.cel?.indexBuffer;
    if (indexBuffer && !indexSources.has(indexBuffer)) {
      indexSources.add(indexBuffer);
      indexedPixels += countMeaningfulIndicesOutside(
        indexBuffer,
        currentWidth,
        currentHeight,
        request
      );
    }
  }

  return {
    rgbaPixels,
    indexedPixels,
    payloadCount: canvasSources.size + indexSources.size,
  };
}

function couldCropContent(
  currentWidth: number,
  currentHeight: number,
  request: CanvasSizeRequest
): boolean {
  return request.offset.x < 0 || request.offset.y < 0 ||
    request.offset.x + currentWidth > request.width ||
    request.offset.y + currentHeight > request.height;
}

function countMeaningfulRgbaOutside(
  source: HTMLCanvasElement,
  width: number,
  height: number,
  request: CanvasSizeRequest
): number {
  const imageData = readCanvasPixels(source, width, height);
  return countOutsidePixels(
    width,
    height,
    request,
    (x, y) => imageData.data[(y * width + x) * 4 + 3] > 0
  );
}

function countMeaningfulIndicesOutside(
  source: Uint8Array,
  width: number,
  height: number,
  request: CanvasSizeRequest
): number {
  return countOutsidePixels(width, height, request, (x, y) => source[y * width + x] !== 0);
}

function readCanvasPixels(
  source: HTMLCanvasElement,
  width: number,
  height: number
): ImageData {
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) throw editorError('invalid_state', false, { reason: 'canvas_context' });

  try {
    return context.getImageData(0, 0, width, height);
  } catch {
    throw editorError('invalid_state', false, { reason: 'canvas_readback' });
  }
}

function countOutsidePixels(
  width: number,
  height: number,
  request: CanvasSizeRequest,
  isMeaningful: (x: number, y: number) => boolean
): number {
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isMeaningful(x, y)) continue;
      const targetX = x + request.offset.x;
      const targetY = y + request.offset.y;
      if (targetX < 0 || targetX >= request.width ||
          targetY < 0 || targetY >= request.height) {
        count += 1;
      }
    }
  }
  return count;
}

function prepareCanvasSize(validated: ValidatedCanvasSize): PreparedCanvasSize {
  const before: CanvasSizeSnapshot = {
    width: validated.currentWidth,
    height: validated.currentHeight,
    cels: validatedContextCels(validated),
  };
  const state: CanvasPreparationState = {
    canvasReplacements: new Map(),
    indexReplacements: new Map(),
  };

  const afterCels = new Map(before.cels);
  for (const entry of validated.entries) {
    afterCels.set(entry.key, prepareEntry(entry, validated, state));
  }

  return {
    before,
    after: {
      width: validated.request.width,
      height: validated.request.height,
      cels: afterCels,
    },
  };
}

function prepareEntry(
  entry: CanvasSizeEntry,
  validated: ValidatedCanvasSize,
  state: CanvasPreparationState
): Cel {
  const sourceCanvas = getEntrySourceCanvas(entry, validated, state);
  const replacementCanvas = getCanvasReplacement(sourceCanvas, validated, state);
  const replacementIndexBuffer = getIndexReplacement(entry, validated, state);
  return createPreparedCel(entry, replacementCanvas, replacementIndexBuffer);
}

function getEntrySourceCanvas(
  entry: CanvasSizeEntry,
  validated: ValidatedCanvasSize,
  state: CanvasPreparationState
): HTMLCanvasElement {
  if (entry.sourceCanvas) return entry.sourceCanvas;
  state.transparentSource ??= createTransparentCanvas(
    validated.currentWidth,
    validated.currentHeight
  );
  return state.transparentSource;
}

function getCanvasReplacement(
  sourceCanvas: HTMLCanvasElement,
  validated: ValidatedCanvasSize,
  state: CanvasPreparationState
): HTMLCanvasElement {
  const existing = state.canvasReplacements.get(sourceCanvas);
  if (existing) return existing;

  const replacement = createResizedCanvas(
    sourceCanvas,
    validated.request.width,
    validated.request.height,
    validated.request.offset
  );
  state.canvasReplacements.set(sourceCanvas, replacement);
  return replacement;
}

function getIndexReplacement(
  entry: CanvasSizeEntry,
  validated: ValidatedCanvasSize,
  state: CanvasPreparationState
): Uint8Array | undefined {
  const source = entry.cel?.indexBuffer;
  if (!source) return undefined;

  const existing = state.indexReplacements.get(source);
  if (existing) return existing;

  const replacement = resizeIndexBuffer(
    source,
    validated.currentWidth,
    validated.currentHeight,
    validated.request.width,
    validated.request.height,
    validated.request.offset
  );
  state.indexReplacements.set(source, replacement);
  return replacement;
}

function createPreparedCel(
  entry: CanvasSizeEntry,
  replacementCanvas: HTMLCanvasElement,
  replacementIndexBuffer: Uint8Array | undefined
): Cel {
  if (!entry.cel) {
    markRuntimeEmptyCanvas(replacementCanvas);
    return {
      id: crypto.randomUUID(),
      layerId: entry.layerId,
      frameId: entry.frameId,
      canvas: replacementCanvas,
    };
  }

  if (isRuntimeEmptyCel(entry.cel)) markRuntimeEmptyCanvas(replacementCanvas);
  return {
    ...entry.cel,
    canvas: replacementCanvas,
    ...(replacementIndexBuffer
      ? { indexBuffer: replacementIndexBuffer }
      : { indexBuffer: undefined }),
  };
}

function validatedContextCels(validated: ValidatedCanvasSize): Map<string, Cel> {
  // Entries retain the map's Cel objects. The map itself is recovered exactly
  // by Undo and remains untouched while replacements are prepared.
  const entries = validated.entries;
  const cels = new Map<string, Cel>();
  for (const entry of entries) {
    if (entry.cel) cels.set(entry.key, entry.cel);
  }
  return cels;
}

function createTransparentCanvas(width: number, height: number): HTMLCanvasElement {
  const { canvas, context } = createCanvasSurface(width, height);
  context.clearRect(0, 0, width, height);
  return markRuntimeEmptyCanvas(canvas);
}

function createResizedCanvas(
  source: HTMLCanvasElement,
  width: number,
  height: number,
  offset: CanvasOffset
): HTMLCanvasElement {
  const { canvas, context } = createCanvasSurface(width, height);

  try {
    context.imageSmoothingEnabled = false;
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, width, height);
    context.drawImage(source, offset.x, offset.y);
  } catch {
    throw editorError('limit_exceeded', false, { limitId: 'canvas-size-allocation' });
  }

  return canvas;
}

function createCanvasSurface(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  } catch {
    throw editorError('limit_exceeded', false, { limitId: 'canvas-size-allocation' });
  }

  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) {
    throw editorError('invalid_state', false, { reason: 'canvas_context' });
  }

  return { canvas, context };
}

function resizeIndexBuffer(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  offset: CanvasOffset
): Uint8Array {
  try {
    const result = new Uint8Array(width * height);
    for (let y = 0; y < sourceHeight; y += 1) {
      for (let x = 0; x < sourceWidth; x += 1) {
        const targetX = x + offset.x;
        const targetY = y + offset.y;
        if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) {
          continue;
        }
        result[targetY * width + targetX] = source[y * sourceWidth + x];
      }
    }
    return result;
  } catch {
    throw editorError('limit_exceeded', false, { limitId: 'canvas-size-allocation' });
  }
}

function estimateMemorySize(cels: Map<string, Cel>): number {
  const canvases = new Set<HTMLCanvasElement>();
  const indexBuffers = new Set<Uint8Array>();
  let bytes = 0;

  for (const cel of cels.values()) {
    if (!canvases.has(cel.canvas)) {
      canvases.add(cel.canvas);
      bytes += cel.canvas.width * cel.canvas.height * 4;
    }
    if (cel.indexBuffer && !indexBuffers.has(cel.indexBuffer)) {
      indexBuffers.add(cel.indexBuffer);
      bytes += cel.indexBuffer.byteLength;
    }
  }
  return bytes;
}

function changedDomains(): readonly ProjectChangeDomain[] {
  return ['canvas-bounds', 'raster-content'];
}

function hasMeaningfulCrop(crop: CanvasCropSummary): boolean {
  return crop.rgbaPixels > 0 || crop.indexedPixels > 0;
}

function sameRequest(a: CanvasSizeRequest, b: CanvasSizeRequest): boolean {
  return a.target.projectId === b.target.projectId &&
    a.expectedRevision === b.expectedRevision &&
    a.width === b.width &&
    a.height === b.height &&
    a.offset.x === b.offset.x &&
    a.offset.y === b.offset.y;
}

function editorError(
  code: CanvasSizeErrorCode,
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>
): CanvasSizeError {
  return new CanvasSizeError({ code, retryable, details });
}

function toEditorError(error: unknown): EditorError {
  if (error instanceof CanvasSizeError) return error.editorError;
  return {
    code: 'internal',
    retryable: true,
    details: { reason: 'unexpected_failure' },
  };
}
