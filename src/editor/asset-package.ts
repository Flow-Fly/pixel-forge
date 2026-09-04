import pako from 'pako';
import type { ProjectContext } from '../stores/project-context';
import type { Cel, Frame, FrameTag } from '../types/animation';
import type { ProjectPaletteSnapshot } from '../stores/palette/store';
import type { Layer } from '../types/layer';
import type { Command } from '../stores/history-store';
import type {
  ProjectFile,
} from '../types/project';
import {
  ASSET_PACKAGE_CONTRACT_VERSION,
  ASSET_PACKAGE_MAX_ARTIFACT_BYTES,
  ASSET_PACKAGE_MAX_ARTIFACTS,
  ASSET_PACKAGE_MAX_CELS,
  ASSET_PACKAGE_MAX_CANVAS_DIMENSION,
  ASSET_PACKAGE_MAX_FRAMES,
  ASSET_PACKAGE_MAX_LAYERS,
  ASSET_PACKAGE_MAX_NAME_LENGTH,
  ASSET_PACKAGE_MAX_PALETTE_ENTRIES,
  ASSET_PACKAGE_MAX_REFERENCE_BYTES,
  ASSET_PACKAGE_MAX_SOURCE_BYTES,
  ASSET_PACKAGE_MAX_SPRITE_COLUMNS,
  ASSET_PACKAGE_MAX_SPRITE_ROWS,
  ASSET_PACKAGE_MAX_TOTAL_BYTES,
  ASSET_PACKAGE_OPERATION_ID,
} from './catalog';
import {
  hasOnlyKeys,
  isRecord,
  type EditorError,
  type ProjectSaveSafetyObservation,
  type ProjectTarget,
} from './contracts';
import { renderProjectObservation, type RenderObservation, type RenderObservationResult } from './observations';

export type AssetPackageArtifactRole = 'source' | 'preview' | 'sprite-sheet' | 'manifest';

export interface AssetPackagePrepareRequest {
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly expectedSaveSafety: ProjectSaveSafetyObservation;
}

export interface AssetPackageArtifact {
  readonly role: AssetPackageArtifactRole;
  readonly filename: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly digest: string;
  readonly bytes: Uint8Array;
}

export interface AssetPackageManifestArtifact {
  readonly role: Exclude<AssetPackageArtifactRole, 'manifest'>;
  readonly filename: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly digest: string;
}

export interface AssetPackageManifestLayer {
  readonly id: string;
  readonly name: string;
  readonly type: Layer['type'];
  readonly order: number;
  readonly parentId: string | null;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: Layer['blendMode'];
  readonly continuous: boolean;
}

export interface AssetPackageManifestFrame {
  readonly id: string;
  readonly number: number;
  readonly order: number;
  readonly duration: number;
  readonly renderDigest: string;
}

export interface AssetPackageManifestTag {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly startFrameIndex: number;
  readonly endFrameIndex: number;
  readonly collapsed: boolean;
}

// fallow-ignore-next-line code-duplication -- Sprite cells intentionally carry the same bounded geometry as the established animation contact-sheet contract.
export interface AssetPackageSpriteCell {
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
  readonly renderDigest: string;
}

export interface AssetPackageManifest {
  readonly type: 'asset-manifest';
  readonly contractVersion: typeof ASSET_PACKAGE_CONTRACT_VERSION;
  readonly target: ProjectTarget;
  readonly revision: number;
  readonly project: {
    readonly name: string;
    readonly width: number;
    readonly height: number;
  };
  readonly palette: readonly { readonly id: string; readonly color: string; readonly index: number }[];
  readonly layers: readonly AssetPackageManifestLayer[];
  readonly frames: readonly AssetPackageManifestFrame[];
  readonly tags: readonly AssetPackageManifestTag[];
  readonly artifacts: readonly AssetPackageManifestArtifact[];
  readonly relationships: readonly AssetPackageArtifactRelationship[];
  readonly spriteSheet?: AssetPackageSpriteSheet;
}

export type AssetPackageArtifactRelationship =
  | {
      readonly type: 'derived-from';
      readonly artifactRole: 'preview' | 'sprite-sheet';
      readonly sourceRole: 'source';
    }
  | {
      readonly type: 'contains-frame';
      readonly artifactRole: 'sprite-sheet';
      readonly frameId: string;
      readonly cellIndex: number;
    };

export interface AssetPackageSpriteSheet {
  readonly artifactRole: 'sprite-sheet';
  readonly rows: number;
  readonly columns: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly AssetPackageSpriteCell[];
}

export interface AssetPackageResult {
  readonly type: 'project.asset-package';
  readonly contractVersion: typeof ASSET_PACKAGE_CONTRACT_VERSION;
  readonly target: ProjectTarget;
  readonly revision: number;
  readonly artifacts: readonly AssetPackageArtifact[];
  readonly manifest: AssetPackageManifest;
  readonly manifestDigest: string;
  readonly packageDigest: string;
}

export interface AssetPackagePreparationFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type AssetPackagePreparationResult = AssetPackageResult | AssetPackagePreparationFailure;

export interface AssetPackagePreparationDependencies {
  readonly getSaveSafety: () => ProjectSaveSafetyObservation;
  readonly isCurrentTarget: () => boolean;
}

// fallow-ignore-next-line code-duplication -- Package capture repeats the existing animation boundary so source revalidation remains local and explicit.
interface CapturedFrameValue {
  readonly id: string;
  readonly order: number;
  readonly duration: number;
  readonly tags: string | undefined;
}

// fallow-ignore-next-line code-duplication -- Package capture repeats the existing animation boundary so source revalidation remains local and explicit.
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
  readonly pixels: Uint8Array;
}

interface CapturedHistory {
  readonly undo: Command[];
  readonly redo: Command[];
  readonly undoValues: string;
  readonly redoValues: string;
  readonly version: number;
}

interface CapturedAssetState {
  readonly frames: readonly Frame[];
  readonly frameValues: readonly CapturedFrameValue[];
  readonly layers: readonly Layer[];
  readonly layerValues: readonly CapturedLayerValue[];
  readonly cels: ReadonlyMap<string, Cel>;
  readonly celValues: ReadonlyMap<string, CapturedCelValue>;
  readonly tags: readonly FrameTag[];
  readonly tagsValue: string;
  readonly palette: ProjectPaletteSnapshot;
  readonly saveSafety: ProjectSaveSafetyObservation;
  readonly currentFrameId: string;
  readonly selectedCelKeys: ReadonlySet<string>;
  readonly selectedCelValues: string;
  readonly selectionState: unknown;
  readonly selectionValue: string;
  readonly history: CapturedHistory;
  readonly fps: number;
  readonly isPlaying: boolean;
  readonly playbackMode: string;
  readonly activeTagId: string | null;
  readonly tagsExpanded: boolean;
  readonly width: number;
  readonly height: number;
  readonly name: string;
  readonly backgroundColor: string | null;
  readonly lastSaved: number | null;
}

interface CapturedRender {
  readonly frame: Frame;
  readonly render: RenderObservation;
}

interface PreparedArtifact {
  readonly role: AssetPackageArtifactRole;
  readonly filename: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly digest: string;
}

function isRenderFailure(
  value: RenderObservationResult,
): value is Extract<RenderObservationResult, { readonly ok: false }> {
  return 'ok' in value && value.ok === false;
}

class AssetPackageError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'AssetPackageError';
    this.editorError = editorError;
  }
}

function assetPackageError(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
): AssetPackageError {
  return new AssetPackageError({ code, retryable, ...(details ? { details } : {}) });
}

export function normalizeAssetPackageRequest(input: unknown): AssetPackagePrepareRequest {
  if (!isRecord(input)) throw assetPackageError('invalid_request', false, { reason: 'request' });
  assertExactKeys(input, ['operation', 'target', 'expectedRevision', 'expectedSaveSafety'], 'asset_package_request');
  if (input.operation !== undefined && input.operation !== ASSET_PACKAGE_OPERATION_ID) {
    throw assetPackageError('invalid_request', false, { reason: 'operation' });
  }
  const target = normalizeTarget(input.target);
  const expectedRevision = normalizeRevision(input.expectedRevision);
  const expectedSaveSafety = normalizeSaveSafety(input.expectedSaveSafety);
  return { target, expectedRevision, expectedSaveSafety };
}

/**
 * Prepare detached package artifacts from one already-persisted project
 * revision. The caller owns target lookup and save-safety observation so this
 * module cannot accidentally save or operate on another open project.
 */
// fallow-ignore-next-line complexity -- Package preparation deliberately keeps every bounded async boundary in one readable sequence.
export async function prepareAssetPackage(
  context: ProjectContext,
  request: AssetPackagePrepareRequest,
  dependencies: AssetPackagePreparationDependencies,
): Promise<AssetPackagePreparationResult> {
  try {
    validateRequest(request);
    assertEnvironment(context);
    const saveSafety = dependencies.getSaveSafety();
    assertExactSavedRevision(context, request, saveSafety, dependencies, undefined);
    const state = captureAssetState(context, saveSafety);
    const stem = createSafeFilenameStem(context.project.name.value);
    assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);

    const savedProject = structuredClone(await context.project.saveProject({ rebuildIndexBuffers: false }));
    assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);
    validateSavedProject(savedProject, state);

    const sourceBytes = compressProject(savedProject);
    assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);
    const sourceDigest = await digestBytes(sourceBytes);
    assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);
    const source = createPreparedArtifact(
      'source',
      `${stem}.pf`,
      'application/octet-stream',
      sourceBytes,
      sourceDigest,
    );

    const renders: CapturedRender[] = [];
    for (const frame of context.animation.frames.value) {
      const renderResult = await renderProjectObservation(context, {
        target: request.target,
        expectedRevision: request.expectedRevision,
        source: { kind: 'composite', frameId: frame.id },
        background: { kind: 'transparent' },
        scale: 1,
        expectedDigest: null,
      });
      if (isRenderFailure(renderResult)) {
        throw new AssetPackageError(renderResult.error);
      }
      renders.push({ frame, render: cloneRender(renderResult) });
      assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);
    }

    const previewBytes = encodePng(renders[0]!.render.pixels, state.width, state.height);
    assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);
    const previewDigest = await digestBytes(previewBytes);
    assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);
    const preview = createPreparedArtifact(
      'preview',
      `${stem}-preview.png`,
      'image/png',
      previewBytes,
      previewDigest,
    );

    let sprite: PreparedArtifact | undefined;
    let spriteSheet: AssetPackageSpriteSheet | undefined;
    if (renders.length > 1) {
      const spriteData = createSpriteSheet(renders, state.width, state.height);
      assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);
      const spriteBytes = encodePng(spriteData.pixels, spriteData.width, spriteData.height);
      assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);
      const spriteDigest = await digestBytes(spriteBytes);
      assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);
      sprite = createPreparedArtifact(
        'sprite-sheet',
        `${stem}-sprite-sheet.png`,
        'image/png',
        spriteBytes,
        spriteDigest,
      );
      spriteSheet = spriteData.sheet;
    }

    const nonManifestArtifacts = [source, preview, ...(sprite ? [sprite] : [])];
    const manifest = createManifest(
      context,
      request,
      state,
      nonManifestArtifacts,
      renders,
      spriteSheet,
    );
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);
    const manifestDigest = await digestBytes(manifestBytes);
    assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);
    const manifestArtifact = createPreparedArtifact(
      'manifest',
      `${stem}-manifest.json`,
      'application/json',
      manifestBytes,
      manifestDigest,
    );
    const artifacts = [...nonManifestArtifacts, manifestArtifact];
    validateArtifactBounds(artifacts);
    const packageDigest = await digestPackage(request, artifacts);
    assertExactSavedRevision(context, request, dependencies.getSaveSafety(), dependencies, state);

    return {
      type: 'project.asset-package',
      contractVersion: ASSET_PACKAGE_CONTRACT_VERSION,
      target: { projectId: request.target.projectId },
      revision: request.expectedRevision,
      artifacts: artifacts.map(cloneArtifact),
      manifest: structuredClone(manifest),
      manifestDigest,
      packageDigest,
    };
  } catch (error) {
    if (error instanceof AssetPackageError) return { ok: false, error: error.editorError };
    return { ok: false, error: { code: 'internal', retryable: true, details: { reason: 'unexpected_failure' } } };
  }
}

export function isAssetPackagePreparationFailure(
  value: unknown,
): value is AssetPackagePreparationFailure {
  return isRecord(value) && value.ok === false && isRecord(value.error);
}

function validateRequest(request: AssetPackagePrepareRequest): void {
  normalizeTarget(request.target);
  normalizeRevision(request.expectedRevision);
  normalizeSaveSafety(request.expectedSaveSafety);
}

function assertEnvironment(context: ProjectContext): void {
  if (context.guidedDrawing.active) {
    throw assetPackageError('unsupported', false, { feature: 'guided-drawing' });
  }
  const selectionType = context.selection.state.value.type;
  if (selectionType === 'floating' || selectionType === 'transforming') {
    throw assetPackageError('invalid_state', false, { reason: 'selection_in_progress' });
  }
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw assetPackageError('internal', true, { reason: 'render_surface' });
  }
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
    throw assetPackageError('internal', true, { reason: 'digest_support' });
  }
}

// fallow-ignore-next-line complexity -- Every package boundary repeats the exact target, revision, and persisted save proof.
function assertExactSavedRevision(
  context: ProjectContext,
  request: AssetPackagePrepareRequest,
  saveSafety: ProjectSaveSafetyObservation,
  dependencies: AssetPackagePreparationDependencies,
  state: CapturedAssetState | undefined,
): void {
  if (!dependencies.isCurrentTarget()) {
    throw assetPackageError('target_not_found', true, { reason: 'target_rebound' });
  }
  if (context.isDisposed || context.project.id.value !== request.target.projectId) {
    throw assetPackageError('target_not_found', true);
  }
  if (context.project.revision.value !== request.expectedRevision) {
    throw assetPackageError('revision_conflict', true, {
      expectedRevision: request.expectedRevision,
      currentRevision: context.project.revision.value,
    });
  }
  if (!isExactSavedSafety(saveSafety, request.target, request.expectedRevision)
      || !isExactSavedSafety(request.expectedSaveSafety, request.target, request.expectedRevision)) {
    throw assetPackageError('invalid_state', false, { reason: 'save_safety' });
  }
  if (state && saveSafety !== state.saveSafety) {
    throw assetPackageError('invalid_state', false, { reason: 'save_safety_changed' });
  }
  if (state) assertCapturedState(context, state);
}

export function isExactSavedSafety(
  value: ProjectSaveSafetyObservation,
  target: ProjectTarget,
  revision: number,
): boolean {
  return value.type === 'project.save-safety'
    && value.target.projectId === target.projectId
    && value.currentRevision === revision
    && value.persistedRevision === revision
    && value.status === 'saved'
    && value.failure === undefined;
}

function normalizeTarget(value: unknown): ProjectTarget {
  if (!isRecord(value) || !hasOnlyKeys(value, ['projectId'])
      || typeof value.projectId !== 'string' || value.projectId.length === 0) {
    throw assetPackageError('invalid_request', false, { reason: 'target' });
  }
  if (value.projectId.length > ASSET_PACKAGE_MAX_NAME_LENGTH) {
    throw assetPackageError('limit_exceeded', false, {
      reason: 'target',
      max: ASSET_PACKAGE_MAX_NAME_LENGTH,
    });
  }
  return { projectId: value.projectId };
}

function normalizeRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw assetPackageError('invalid_request', false, { reason: 'expected_revision' });
  }
  return value as number;
}

// fallow-ignore-next-line complexity -- The strict save-safety proof is a bounded discriminated transport record.
function normalizeSaveSafety(value: unknown): ProjectSaveSafetyObservation {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'type',
    'target',
    'currentRevision',
    'persistedRevision',
    'status',
    'failure',
  ])) {
    throw assetPackageError('invalid_request', false, { reason: 'save_safety' });
  }
  const target = normalizeTarget(value.target);
  if (value.type !== 'project.save-safety'
      || !Number.isSafeInteger(value.currentRevision)
      || !Number.isSafeInteger(value.persistedRevision)
      || (value.currentRevision as number) < 0
      || (value.persistedRevision as number) < 0
      || !['dirty', 'saving', 'saved', 'failed'].includes(String(value.status))) {
    throw assetPackageError('invalid_request', false, { reason: 'save_safety' });
  }
  if (value.failure !== undefined) {
    if (!isRecord(value.failure) || !hasOnlyKeys(value.failure, ['category', 'action'])
        || typeof value.failure.category !== 'string'
        || value.failure.action !== 'retry_latest') {
      throw assetPackageError('invalid_request', false, { reason: 'save_safety_failure' });
    }
    return {
      type: 'project.save-safety',
      target,
      currentRevision: value.currentRevision as number,
      persistedRevision: value.persistedRevision as number,
      status: value.status as ProjectSaveSafetyObservation['status'],
      failure: {
        category: value.failure.category as NonNullable<ProjectSaveSafetyObservation['failure']>['category'],
        action: 'retry_latest',
      },
    };
  }
  return {
    type: 'project.save-safety',
    target,
    currentRevision: value.currentRevision as number,
    persistedRevision: value.persistedRevision as number,
    status: value.status as ProjectSaveSafetyObservation['status'],
  };
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  reason: string,
): void {
  if (!hasOnlyKeys(value, allowedKeys)) {
    throw assetPackageError('invalid_request', false, { reason });
  }
}

function captureAssetState(
  context: ProjectContext,
  saveSafety: ProjectSaveSafetyObservation,
): CapturedAssetState {
  const frames = context.animation.frames.value;
  const layers = context.layers.layers.value;
  const cels = context.animation.cels.value;
  const tags = context.animation.tags.value;
  const palette = context.palette.captureProjectSnapshot();
  validateSourceBounds(context, frames, layers, cels, tags, palette);
  const frameValues = frames.map((frame) => ({
    id: frame.id,
    order: frame.order,
    duration: frame.duration,
    tags: serializeForComparison(frame.tags),
  }));
  const layerValues = layers.map(captureLayerValue);
  const celValues = new Map<string, CapturedCelValue>();
  for (const [key, cel] of cels) celValues.set(key, captureCelValue(cel));
  const history = captureHistory(context);
  return {
    frames,
    frameValues,
    layers,
    layerValues,
    cels,
    celValues,
    tags,
    tagsValue: serializeForComparison(tags) ?? '',
    palette,
    saveSafety,
    currentFrameId: context.animation.currentFrameId.value,
    selectedCelKeys: context.animation.selectedCelKeys.value,
    selectedCelValues: serializeForComparison(context.animation.selectedCelKeys.value) ?? '',
    selectionState: context.selection.state.value,
    selectionValue: serializeForComparison(context.selection.state.value) ?? '',
    history,
    fps: context.animation.fps.value,
    isPlaying: context.animation.isPlaying.value,
    playbackMode: context.animation.playbackMode.value,
    activeTagId: context.animation.activeTagId.value,
    tagsExpanded: context.animation.tagsExpanded.value,
    width: context.project.width.value,
    height: context.project.height.value,
    name: context.project.name.value,
    backgroundColor: context.project.backgroundColor.value,
    lastSaved: context.project.lastSaved.value,
  };
}

// fallow-ignore-next-line complexity -- Bounded dimensions, collections, identities, and payload relationships are one preflight.
function validateSourceBounds(
  context: ProjectContext,
  frames: readonly Frame[],
  layers: readonly Layer[],
  cels: ReadonlyMap<string, Cel>,
  tags: readonly FrameTag[],
  palette: ProjectPaletteSnapshot,
): void {
  // fallow-ignore-next-line code-duplication -- Package and animation observation keep independent error contracts for the same canvas bound.
  const width = context.project.width.value;
  const height = context.project.height.value;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1
      || width > ASSET_PACKAGE_MAX_CANVAS_DIMENSION
      || height > ASSET_PACKAGE_MAX_CANVAS_DIMENSION) {
    throw assetPackageError('bounds_exceeded', false, {
      reason: 'canvas_dimensions',
      max: ASSET_PACKAGE_MAX_CANVAS_DIMENSION,
    });
  }
  if (frames.length < 1 || frames.length > ASSET_PACKAGE_MAX_FRAMES) {
    throw assetPackageError('limit_exceeded', false, { reason: 'frames', max: ASSET_PACKAGE_MAX_FRAMES });
  }
  if (layers.length < 1 || layers.length > ASSET_PACKAGE_MAX_LAYERS) {
    throw assetPackageError('limit_exceeded', false, { reason: 'layers', max: ASSET_PACKAGE_MAX_LAYERS });
  }
  if (cels.size > ASSET_PACKAGE_MAX_CELS) {
    throw assetPackageError('limit_exceeded', false, { reason: 'cels', max: ASSET_PACKAGE_MAX_CELS });
  }
  if (palette.entries.length > ASSET_PACKAGE_MAX_PALETTE_ENTRIES) {
    throw assetPackageError('limit_exceeded', false, {
      reason: 'palette',
      max: ASSET_PACKAGE_MAX_PALETTE_ENTRIES,
    });
  }
  validateProjectName(context.project.name.value);
  validateFrames(frames);
  validateLayers(layers);
  validateTags(tags, frames.length);
  validatePalette(palette);
  validateCels(context, frames, layers, cels, width, height, palette.entries.length);
}

function validateFrames(frames: readonly Frame[]): void {
  const ids = new Set<string>();
  frames.forEach((frame) => {
    validateIdentity(frame.id, 'frame');
    if (ids.has(frame.id)) throw assetPackageError('invalid_state', false, { reason: 'frame_identity' });
    ids.add(frame.id);
    if (!Number.isSafeInteger(frame.order) || frame.order < 0) {
      throw assetPackageError('invalid_state', false, { reason: 'frame_order' });
    }
    if (!Number.isSafeInteger(frame.duration) || frame.duration < 1) {
      throw assetPackageError('invalid_state', false, { reason: 'frame_duration' });
    }
  });
}

function validateLayers(layers: readonly Layer[]): void {
  const ids = new Set<string>();
  layers.forEach((layer) => {
    validateIdentity(layer.id, 'layer');
    validateName(layer.name, 'layer_name');
    if (ids.has(layer.id)) throw assetPackageError('invalid_state', false, { reason: 'layer_identity' });
    ids.add(layer.id);
    if (layer.parentId !== null) validateIdentity(layer.parentId, 'parent_layer');
    if (layer.textData) {
      validateName(layer.textData.font, 'text_font');
      validateName(layer.textData.color, 'text_color');
      validateMetadataSize(layer.textData, 'text_data');
    }
    if (layer.referenceData) {
      if (!(layer.referenceData.bytes instanceof Uint8Array)) {
        throw assetPackageError('invalid_state', false, { reason: 'reference_bytes' });
      }
      if (layer.referenceData.bytes.byteLength > ASSET_PACKAGE_MAX_REFERENCE_BYTES) {
        throw assetPackageError('limit_exceeded', false, {
          reason: 'reference_bytes',
          max: ASSET_PACKAGE_MAX_REFERENCE_BYTES,
        });
      }
      validateBoundedString(layer.referenceData.mimeType, 'reference_mime');
      validateMetadataSize(layer.referenceData, 'reference_data');
    }
  });
}

function validateTags(tags: readonly FrameTag[], frameCount: number): void {
  if (tags.length > ASSET_PACKAGE_MAX_FRAMES) {
    throw assetPackageError('limit_exceeded', false, { reason: 'tags', max: ASSET_PACKAGE_MAX_FRAMES });
  }
  const ids = new Set<string>();
  tags.forEach((tag) => {
    validateIdentity(tag.id, 'tag');
    validateName(tag.name, 'tag_name');
    // fallow-ignore-next-line code-duplication -- Tag identity checks intentionally match the animation observation contract.
    if (ids.has(tag.id)) throw assetPackageError('invalid_state', false, { reason: 'tag_identity' });
    ids.add(tag.id);
    if (!Number.isSafeInteger(tag.startFrameIndex) || !Number.isSafeInteger(tag.endFrameIndex)
        || tag.startFrameIndex < 0 || tag.endFrameIndex < tag.startFrameIndex
        || tag.endFrameIndex >= frameCount) {
      throw assetPackageError('invalid_state', false, { reason: 'tag_range' });
    }
  });
}

function validatePalette(palette: ProjectPaletteSnapshot): void {
  const ids = new Set<string>();
  palette.entries.forEach((entry) => {
    validateIdentity(entry.id, 'palette_entry');
    if (ids.has(entry.id)) throw assetPackageError('invalid_state', false, { reason: 'palette_identity' });
    ids.add(entry.id);
    if (typeof entry.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(entry.color)) {
      throw assetPackageError('invalid_state', false, { reason: 'palette_color' });
    }
  });
}

// fallow-ignore-next-line code-duplication -- Package source validation mirrors the animation observation's required-cel contract.
// fallow-ignore-next-line complexity -- Cel identity, shape, and required-frame checks must complete before serialization.
function validateCels(
  context: ProjectContext,
  frames: readonly Frame[],
  layers: readonly Layer[],
  cels: ReadonlyMap<string, Cel>,
  width: number,
  height: number,
  paletteLength: number,
): void {
  const layerIds = new Set(layers.map((layer) => layer.id));
  const celIds = new Set<string>();
  for (const [key, cel] of cels) {
    validateIdentity(cel.id, 'cel');
    if (celIds.has(cel.id)) throw assetPackageError('invalid_state', false, { reason: 'cel_identity' });
    celIds.add(cel.id);
    if (!layerIds.has(cel.layerId) || !frames.some((frame) => frame.id === cel.frameId)) {
      throw assetPackageError('invalid_state', false, { reason: 'cel_reference' });
    }
    if (layers.find((layer) => layer.id === cel.layerId)?.type === 'reference') {
      throw assetPackageError('invalid_state', false, { reason: 'reference_cel' });
    }
    if (key !== context.animation.getCelKey(cel.layerId, cel.frameId)) {
      throw assetPackageError('invalid_state', false, { reason: 'cel_key' });
    }
    if (!cel.canvas || cel.canvas.width !== width || cel.canvas.height !== height) {
      throw assetPackageError('invalid_state', false, { reason: 'cel_canvas_shape' });
    }
    if (cel.indexBuffer !== undefined && cel.indexBuffer.length !== width * height) {
      throw assetPackageError('invalid_state', false, { reason: 'cel_index_shape' });
    }
    if (cel.indexBuffer?.some((index) => index > paletteLength)) {
      throw assetPackageError('invalid_state', false, { reason: 'cel_index_value' });
    }
    if (cel.textCelData) {
      if (cel.textCelData.content.length > ASSET_PACKAGE_MAX_SOURCE_BYTES) {
        throw assetPackageError('limit_exceeded', false, { reason: 'text_cel_data', max: ASSET_PACKAGE_MAX_SOURCE_BYTES });
      }
      validateMetadataSize(cel.textCelData, 'text_cel_data');
    }
  }
  for (const frame of frames) {
    for (const layer of layers) {
      if (layer.type === 'reference' || layer.type === 'group') continue;
      const key = context.animation.getCelKey(layer.id, frame.id);
      const cel = cels.get(key);
      if (!cel) throw assetPackageError('target_not_found', true, { resource: 'cel' });
      if (cel.layerId !== layer.id || cel.frameId !== frame.id) {
        throw assetPackageError('invalid_state', false, { reason: 'cel_identity' });
      }
    }
  }
}

function validateIdentity(value: string, reason: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw assetPackageError('invalid_state', false, { reason });
  }
  if (value.length > ASSET_PACKAGE_MAX_NAME_LENGTH) {
    throw assetPackageError('limit_exceeded', false, { reason, max: ASSET_PACKAGE_MAX_NAME_LENGTH });
  }
  if (value.includes('/') || value.includes('\\') || value.includes(':') || hasControlCharacter(value)) {
    throw assetPackageError('invalid_state', false, { reason });
  }
}

function validateName(value: string, reason: string): void {
  validateIdentity(value, reason);
}

function validateBoundedString(value: string, reason: string): void {
  // fallow-ignore-next-line code-duplication -- MIME metadata uses the same bounded string guard as the package identity path.
  if (typeof value !== 'string' || value.length === 0) {
    throw assetPackageError('invalid_state', false, { reason });
  }
  if (value.length > ASSET_PACKAGE_MAX_NAME_LENGTH) {
    throw assetPackageError('limit_exceeded', false, { reason, max: ASSET_PACKAGE_MAX_NAME_LENGTH });
  }
  if (hasControlCharacter(value)) {
    throw assetPackageError('invalid_state', false, { reason });
  }
}

function validateProjectName(value: string): void {
  validateName(value, 'project_name');
}

function validateMetadataSize(value: unknown, reason: string): void {
  const serialized = serializeForComparison(value);
  if (serialized !== undefined && new TextEncoder().encode(serialized).byteLength > ASSET_PACKAGE_MAX_SOURCE_BYTES) {
    throw assetPackageError('limit_exceeded', false, { reason, max: ASSET_PACKAGE_MAX_SOURCE_BYTES });
  }
}

// fallow-ignore-next-line complexity -- Filename safety keeps path, platform, and artifact-extension rejection together.
function createSafeFilenameStem(value: string): string {
  const stem = value.trim();
  if (stem.length === 0 || stem === '.' || stem === '..'
      || stem.startsWith('.')
      || /[. ]$/.test(stem)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(stem)
      || /\.(?:pf|png|json)$/i.test(stem)) {
    throw assetPackageError('invalid_request', false, { reason: 'project_name' });
  }
  if (stem.length > ASSET_PACKAGE_MAX_NAME_LENGTH
      || stem.includes('/') || stem.includes('\\') || stem.includes(':')
      || hasControlCharacter(stem)) {
    throw assetPackageError('invalid_request', false, { reason: 'project_name' });
  }
  return stem;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function captureLayerValue(layer: Layer): CapturedLayerValue {
  // fallow-ignore-next-line code-duplication -- Detached layer capture mirrors animation observation fields for revalidation.
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
    textData: serializeForComparison(layer.textData),
    referenceData: serializeForComparison(layer.referenceData),
  };
}

// fallow-ignore-next-line code-duplication -- Detached cel capture intentionally repeats the animation observation's pixel and index proof.
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
    textCelData: serializeForComparison(cel.textCelData),
    pixels: readCanvasPixels(cel.canvas),
  };
}

function captureHistory(context: ProjectContext): CapturedHistory {
  const undo = context.history.undoStack.value;
  const redo = context.history.redoStack.value;
  return {
    undo,
    redo,
    undoValues: serializeHistory(undo),
    redoValues: serializeHistory(redo),
    version: context.history.version.value,
  };
}

function serializeHistory(commands: readonly Command[]): string {
  return serializeForComparison(commands.map((command) => ({
    id: command.id,
    name: command.name,
    userId: command.userId,
    timestamp: command.timestamp,
    memorySize: command.memorySize,
    managesProjectRevision: command.managesProjectRevision,
    provenance: command.provenance,
  }))) ?? '';
}

function readCanvasPixels(canvas: HTMLCanvasElement): Uint8Array {
  const drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!drawing) throw assetPackageError('invalid_state', false, { reason: 'canvas_read' });
  try {
    return new Uint8Array(drawing.getImageData(0, 0, canvas.width, canvas.height).data);
  } catch {
    throw assetPackageError('internal', true, { reason: 'canvas_read' });
  }
}

// fallow-ignore-next-line complexity -- Revalidation enumerates every mutable editor collection and saved-state field before bytes escape.
function assertCapturedState(context: ProjectContext, state: CapturedAssetState): void {
  if (context.project.width.value !== state.width
      || context.project.height.value !== state.height
      || context.project.name.value !== state.name
      || context.project.backgroundColor.value !== state.backgroundColor
      || context.project.lastSaved.value !== state.lastSaved) {
    throw assetPackageError('revision_conflict', true, { reason: 'source_changed' });
  }
  // fallow-ignore-next-line code-duplication -- Revalidation repeats the animation source collection identity boundary.
  if (context.animation.frames.value !== state.frames
      || context.layers.layers.value !== state.layers
      || context.animation.cels.value !== state.cels
      || context.animation.tags.value !== state.tags
      || context.animation.currentFrameId.value !== state.currentFrameId
      || context.animation.selectedCelKeys.value !== state.selectedCelKeys
      || context.selection.state.value !== state.selectionState) {
    throw assetPackageError('revision_conflict', true, { reason: 'source_changed' });
  }
  if (context.animation.fps.value !== state.fps
      || context.animation.isPlaying.value !== state.isPlaying
      || context.animation.playbackMode.value !== state.playbackMode
      || context.animation.activeTagId.value !== state.activeTagId
      || context.animation.tagsExpanded.value !== state.tagsExpanded) {
    throw assetPackageError('revision_conflict', true, { reason: 'animation_state_changed' });
  }
  const frames = context.animation.frames.value;
  if (frames.length !== state.frameValues.length || frames.some((frame, index) => {
    const expected = state.frameValues[index];
    return !expected || frame.id !== expected.id || frame.order !== expected.order
      || frame.duration !== expected.duration || serializeForComparison(frame.tags) !== expected.tags;
  })) {
    throw assetPackageError('revision_conflict', true, { reason: 'timeline_changed' });
  }
  assertCapturedLayers(context.layers.layers.value, state.layerValues);
  assertCapturedCels(context.animation.cels.value, state.celValues);
  if (serializeForComparison(context.animation.tags.value) !== state.tagsValue
      || serializeForComparison(context.animation.selectedCelKeys.value) !== state.selectedCelValues
      || serializeForComparison(context.selection.state.value) !== state.selectionValue) {
    throw assetPackageError('revision_conflict', true, { reason: 'source_changed' });
  }
  const history = context.history;
  if (history.undoStack.value !== state.history.undo
      || history.redoStack.value !== state.history.redo
      || history.version.value !== state.history.version
      || serializeHistory(history.undoStack.value) !== state.history.undoValues
      || serializeHistory(history.redoStack.value) !== state.history.redoValues) {
    throw assetPackageError('revision_conflict', true, { reason: 'history_changed' });
  }
  if (!samePaletteSnapshot(context.palette.captureProjectSnapshot(), state.palette)) {
    throw assetPackageError('revision_conflict', true, { reason: 'palette_changed' });
  }
}

function assertCapturedLayers(
  layers: readonly Layer[],
  expected: readonly CapturedLayerValue[],
): void {
  // fallow-ignore-next-line complexity -- Layer revalidation intentionally compares every persisted presentation and metadata field.
  if (layers.length !== expected.length || layers.some((layer, index) => {
    const value = expected[index];
    return !value || layer.id !== value.id || layer.name !== value.name || layer.type !== value.type
      || layer.visible !== value.visible || layer.locked !== value.locked || layer.opacity !== value.opacity
      || layer.blendMode !== value.blendMode || layer.parentId !== value.parentId
      || layer.continuous !== value.continuous || layer.canvas !== value.canvas
      || serializeForComparison(layer.textData) !== value.textData
      || serializeForComparison(layer.referenceData) !== value.referenceData;
  })) {
    throw assetPackageError('revision_conflict', true, { reason: 'layers_changed' });
  }
}

// fallow-ignore-next-line complexity -- Revalidation compares cel identity, metadata, index buffers, and detached pixels together.
function assertCapturedCels(
  cels: ReadonlyMap<string, Cel>,
  expected: ReadonlyMap<string, CapturedCelValue>,
): void {
  if (cels.size !== expected.size) {
    throw assetPackageError('revision_conflict', true, { reason: 'cels_changed' });
  }
  for (const [key, cel] of cels) {
    const value = expected.get(key);
    if (!value || cel.id !== value.id || cel.layerId !== value.layerId || cel.frameId !== value.frameId
        || cel.canvas !== value.canvas || cel.indexBuffer !== value.indexBuffer
        || !sameBytes(cel.indexBuffer, value.indexValues)
        || !sameBytes(readCanvasPixels(cel.canvas), value.pixels)
        || cel.linkedCelId !== value.linkedCelId || cel.linkType !== value.linkType
        || cel.opacity !== value.opacity || serializeForComparison(cel.textCelData) !== value.textCelData) {
      throw assetPackageError('revision_conflict', true, { reason: 'cels_changed' });
    }
  }
}

// fallow-ignore-next-line code-duplication -- Local byte equality keeps this package's detached revalidation independent of transaction helpers.
function sameBytes(
  first: ArrayLike<number> | undefined,
  second: ArrayLike<number> | undefined,
): boolean {
  if (!first || !second) return first === second;
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

function samePaletteSnapshot(first: ProjectPaletteSnapshot, second: ProjectPaletteSnapshot): boolean {
  return first.currentPresetId === second.currentPresetId
    && first.currentCustomPaletteId === second.currentCustomPaletteId
    && first.isDirty === second.isDirty
    && serializeForComparison(first.newColorFlags) === serializeForComparison(second.newColorFlags)
    && serializeForComparison(first.colors) === serializeForComparison(second.colors)
    && serializeForComparison(first.entries) === serializeForComparison(second.entries);
}

function serializeForComparison(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.stringify(value, (_key, item: unknown) => {
      if (item instanceof Uint8Array || item instanceof Uint8ClampedArray) {
        return Array.from(item);
      }
      if (item instanceof Set) return { __set: Array.from(item) };
      if (typeof ImageData !== 'undefined' && item instanceof ImageData) {
        return { width: item.width, height: item.height, data: Array.from(item.data) };
      }
      return item;
    });
  } catch {
    throw assetPackageError('invalid_state', false, { reason: 'source_serialization' });
  }
}

// fallow-ignore-next-line complexity -- Serialized source validation checks project dimensions, identity, and bounded JSON before compression.
function validateSavedProject(project: ProjectFile, state: CapturedAssetState): void {
  if (!project || !Number.isSafeInteger(project.width) || !Number.isSafeInteger(project.height)
      || project.width !== state.width || project.height !== state.height
      || project.layers.length !== state.layers.length || project.frames.length !== state.frames.length) {
    throw assetPackageError('invalid_state', false, { reason: 'source_snapshot' });
  }
  if (project.layers.some((layer, index) => {
    const expected = state.layers[index];
    return !expected || layer.id !== expected.id || layer.name !== expected.name
      || layer.type !== expected.type || layer.parentId !== expected.parentId;
  })) {
    throw assetPackageError('invalid_state', false, { reason: 'source_snapshot' });
  }
  if (project.frames.some((frame, index) => {
    const expected = state.frames[index];
    return !expected || frame.id !== expected.id || frame.duration !== expected.duration;
  })) {
    throw assetPackageError('invalid_state', false, { reason: 'source_snapshot' });
  }
  const sourceJson = serializeProject(project);
  if (sourceJson.byteLength > ASSET_PACKAGE_MAX_SOURCE_BYTES) {
    throw assetPackageError('limit_exceeded', false, {
      reason: 'source_bytes',
      max: ASSET_PACKAGE_MAX_SOURCE_BYTES,
    });
  }
}

function serializeProject(project: ProjectFile): Uint8Array {
  try {
    return new TextEncoder().encode(JSON.stringify(project));
  } catch {
    throw assetPackageError('internal', true, { reason: 'source_encoding' });
  }
}

function compressProject(project: ProjectFile): Uint8Array {
  const json = serializeProject(project);
  try {
    const compressed = pako.deflate(json);
    const bytes = new Uint8Array(compressed);
    if (bytes.byteLength > ASSET_PACKAGE_MAX_ARTIFACT_BYTES) {
      throw assetPackageError('limit_exceeded', false, {
        reason: 'source_artifact',
        max: ASSET_PACKAGE_MAX_ARTIFACT_BYTES,
      });
    }
    return bytes;
  } catch (error) {
    if (error instanceof AssetPackageError) throw error;
    throw assetPackageError('internal', true, { reason: 'compression' });
  }
}

function createPreparedArtifact(
  role: AssetPackageArtifactRole,
  filename: string,
  mediaType: string,
  bytes: Uint8Array,
  digest: string,
): PreparedArtifact {
  if (bytes.byteLength > ASSET_PACKAGE_MAX_ARTIFACT_BYTES) {
    throw assetPackageError('limit_exceeded', false, {
      reason: `${role}_bytes`,
      max: ASSET_PACKAGE_MAX_ARTIFACT_BYTES,
    });
  }
  return {
    role,
    filename,
    mediaType,
    bytes: new Uint8Array(bytes),
    digest,
  };
}

function validateArtifactBounds(artifacts: readonly PreparedArtifact[]): void {
  if (artifacts.length > ASSET_PACKAGE_MAX_ARTIFACTS) {
    throw assetPackageError('limit_exceeded', false, {
      reason: 'artifacts',
      max: ASSET_PACKAGE_MAX_ARTIFACTS,
    });
  }
  let total = 0;
  for (const artifact of artifacts) {
    if (!Number.isSafeInteger(artifact.bytes.byteLength)
        || artifact.bytes.byteLength > ASSET_PACKAGE_MAX_ARTIFACT_BYTES) {
      throw assetPackageError('limit_exceeded', false, {
        reason: `${artifact.role}_bytes`,
        max: ASSET_PACKAGE_MAX_ARTIFACT_BYTES,
      });
    }
    total += artifact.bytes.byteLength;
    if (!Number.isSafeInteger(total) || total > ASSET_PACKAGE_MAX_TOTAL_BYTES) {
      throw assetPackageError('limit_exceeded', false, {
        reason: 'total_bytes',
        max: ASSET_PACKAGE_MAX_TOTAL_BYTES,
      });
    }
  }
}

function cloneArtifact(artifact: PreparedArtifact): AssetPackageArtifact {
  return {
    role: artifact.role,
    filename: artifact.filename,
    mediaType: artifact.mediaType,
    byteLength: artifact.bytes.byteLength,
    digest: artifact.digest,
    bytes: new Uint8Array(artifact.bytes),
  };
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
    return toHex(new Uint8Array(digest));
  } catch {
    throw assetPackageError('internal', true, { reason: 'digest' });
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function cloneRender(render: RenderObservation): RenderObservation {
  return {
    ...render,
    target: { projectId: render.target.projectId },
    source: { ...render.source },
    region: { ...render.region },
    background: { ...render.background },
    pixels: new Uint8Array(render.pixels),
  };
}

function createManifest(
  context: ProjectContext,
  request: AssetPackagePrepareRequest,
  state: CapturedAssetState,
  artifacts: readonly PreparedArtifact[],
  renders: readonly CapturedRender[],
  spriteSheet: AssetPackageSpriteSheet | undefined,
): AssetPackageManifest {
  const layers = state.layers.map((layer, order) => ({
    id: layer.id,
    name: layer.name,
    type: layer.type,
    order,
    parentId: layer.parentId,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    continuous: layer.continuous ?? false,
  }));
  const frames = state.frames.map((frame, index) => ({
      id: frame.id,
      number: index + 1,
      order: index,
      duration: frame.duration,
      renderDigest: renders[index]?.render.digest ?? '',
    }));
  const relationships: AssetPackageArtifactRelationship[] = [
    { type: 'derived-from', artifactRole: 'preview', sourceRole: 'source' },
    ...(spriteSheet ? [{ type: 'derived-from' as const, artifactRole: 'sprite-sheet' as const, sourceRole: 'source' as const }] : []),
    ...(spriteSheet?.cells.map((cell) => ({
      type: 'contains-frame' as const,
      artifactRole: 'sprite-sheet' as const,
      frameId: cell.frameId,
      cellIndex: cell.index,
    })) ?? []),
  ];
  return {
    type: 'asset-manifest',
    contractVersion: ASSET_PACKAGE_CONTRACT_VERSION,
    target: { projectId: request.target.projectId },
    revision: request.expectedRevision,
    project: {
      name: context.project.name.value,
      width: state.width,
      height: state.height,
    },
    palette: state.palette.entries.map((entry, index) => ({
      id: entry.id,
      color: entry.color.toLowerCase(),
      index,
    })),
    layers,
    frames,
    tags: state.tags.map(cloneTag),
    artifacts: artifacts.map((artifact) => ({
      role: artifact.role as Exclude<AssetPackageArtifactRole, 'manifest'>,
      filename: artifact.filename,
      mediaType: artifact.mediaType,
      byteLength: artifact.bytes.byteLength,
      digest: artifact.digest,
    })),
    relationships,
    ...(spriteSheet ? { spriteSheet } : {}),
  };
}

function cloneTag(tag: FrameTag): AssetPackageManifestTag {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    startFrameIndex: tag.startFrameIndex,
    endFrameIndex: tag.endFrameIndex,
    collapsed: tag.collapsed,
  };
}

interface SpriteSheetData {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly sheet: AssetPackageSpriteSheet;
}

function createSpriteSheet(
  renders: readonly CapturedRender[],
  cellWidth: number,
  cellHeight: number,
): SpriteSheetData {
  const columns = Math.min(ASSET_PACKAGE_MAX_SPRITE_COLUMNS, renders.length);
  const rows = Math.ceil(renders.length / columns);
  if (rows > ASSET_PACKAGE_MAX_SPRITE_ROWS) {
    throw assetPackageError('limit_exceeded', false, { reason: 'sprite_rows', max: ASSET_PACKAGE_MAX_SPRITE_ROWS });
  }
  const width = cellWidth * columns;
  const height = cellHeight * rows;
  const byteLength = width * height * 4;
  if (!Number.isSafeInteger(byteLength) || byteLength > ASSET_PACKAGE_MAX_ARTIFACT_BYTES) {
    throw assetPackageError('limit_exceeded', false, {
      reason: 'sprite_bytes',
      max: ASSET_PACKAGE_MAX_ARTIFACT_BYTES,
    });
  }
  const pixels = new Uint8Array(byteLength);
  const cells: AssetPackageSpriteCell[] = [];
  renders.forEach(({ frame, render }, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = column * cellWidth;
    const y = row * cellHeight;
    for (let sourceRow = 0; sourceRow < cellHeight; sourceRow++) {
      const sourceStart = sourceRow * cellWidth * 4;
      const targetStart = ((y + sourceRow) * width + x) * 4;
      pixels.set(render.pixels.subarray(sourceStart, sourceStart + cellWidth * 4), targetStart);
    }
    cells.push({
      index,
      row,
      column,
      x,
      y,
      width: cellWidth,
      height: cellHeight,
      sourceRect: { x: 0, y: 0, width: cellWidth, height: cellHeight },
      frameId: frame.id,
      frameNumber: index + 1,
      duration: frame.duration,
      renderDigest: render.digest,
    });
  });
  return {
    pixels,
    width,
    height,
    sheet: { artifactRole: 'sprite-sheet', rows, columns, cellWidth, cellHeight, width, height, cells },
  };
}

async function digestPackage(
  request: AssetPackagePrepareRequest,
  artifacts: readonly PreparedArtifact[],
): Promise<string> {
  const descriptor = new TextEncoder().encode(JSON.stringify({
    type: 'project.asset-package',
    contractVersion: ASSET_PACKAGE_CONTRACT_VERSION,
    target: request.target,
    revision: request.expectedRevision,
    artifacts: artifacts.map((artifact) => ({
      role: artifact.role,
      filename: artifact.filename,
      mediaType: artifact.mediaType,
      byteLength: artifact.bytes.byteLength,
      digest: artifact.digest,
    })),
  }));
  let total = descriptor.byteLength + 1;
  for (const artifact of artifacts) total += artifact.bytes.byteLength;
  if (!Number.isSafeInteger(total) || total > ASSET_PACKAGE_MAX_TOTAL_BYTES) {
    throw assetPackageError('limit_exceeded', false, {
      reason: 'total_bytes',
      max: ASSET_PACKAGE_MAX_TOTAL_BYTES,
    });
  }
  const binding = new Uint8Array(total);
  binding.set(descriptor);
  let offset = descriptor.byteLength;
  binding[offset++] = 0;
  for (const artifact of artifacts) {
    binding.set(artifact.bytes, offset);
    offset += artifact.bytes.byteLength;
  }
  return digestBytes(binding);
}

// fallow-ignore-next-line complexity -- Deterministic PNG encoding validates allocation, compression, chunks, and artifact bounds in one pass.
function encodePng(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const rowBytes = width * 4;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || pixels.length !== rowBytes * height) {
    throw assetPackageError('invalid_state', false, { reason: 'png_pixels' });
  }
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let row = 0; row < height; row++) {
    const rawStart = row * (rowBytes + 1);
    raw[rawStart] = 0;
    raw.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), rawStart + 1);
  }
  let compressed: Uint8Array;
  try {
    compressed = new Uint8Array(pako.deflate(raw));
  } catch {
    throw assetPackageError('internal', true, { reason: 'png_compression' });
  }
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks = [
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const total = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (total > ASSET_PACKAGE_MAX_ARTIFACT_BYTES) {
    throw assetPackageError('limit_exceeded', false, {
      reason: 'png_bytes',
      max: ASSET_PACKAGE_MAX_ARTIFACT_BYTES,
    });
  }
  const result = new Uint8Array(total);
  result.set(PNG_SIGNATURE);
  let offset = PNG_SIGNATURE.length;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
