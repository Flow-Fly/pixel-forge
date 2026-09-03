import type { ProjectContext } from '../stores/project-context';
import type { ProjectChangeDomain } from '../stores/project-store';
import * as tagManager from '../stores/animation/tag-manager';
import { isRuntimeEmptyCel, markRuntimeEmptyCanvas } from '../stores/animation/empty-cel';
import type { Cel, Frame, FrameTag } from '../types/animation';
import type { Layer } from '../types/layer';
import { estimateCelPayloadBytes } from './payload-memory';
import {
  ANIMATION_CEL_LINK_COMMAND_ID,
  ANIMATION_FRAME_COMMAND_ID,
  ANIMATION_FRAME_DURATION_MAX,
  ANIMATION_FRAME_DURATION_MIN,
  ANIMATION_MAX_CELS,
  ANIMATION_MAX_FRAMES,
  ANIMATION_MAX_LAYERS,
  ANIMATION_MAX_LINK_MEMBERS,
  ANIMATION_MAX_PREPARATION_BYTES,
  CEL_UNLINK_COMMAND_ID,
  FRAME_TAG_COMMAND_ID,
} from './catalog';
import {
  hasOnlyKeys,
  isRecord,
  type EditorError,
  type ProjectTarget,
} from './contracts';
import {
  prepareTimelineProjectStateChange,
  type CelUnlinkGroupMember,
  type FrameTagRequest,
} from './timeline-project-state';

export type AnimationFramePosition = 'start' | 'end' | 'before' | 'after';

export type AnimationFrameRequest =
  | {
      readonly kind: 'frame.create';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly position: AnimationFramePosition;
      readonly anchorFrameId?: string;
      readonly duration: number;
    }
  | {
      readonly kind: 'frame.duplicate';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly sourceFrameId: string;
      readonly position: AnimationFramePosition;
      readonly anchorFrameId?: string;
    }
  | {
      readonly kind: 'frame.reorder';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly frameId: string;
      readonly position: AnimationFramePosition;
      readonly anchorFrameId?: string;
    }
  | {
      readonly kind: 'frame.duration';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly frameId: string;
      readonly duration: number;
    }
  | {
      readonly kind: 'frame.delete';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly frameId: string;
    };

export interface AnimationCelLinkMember {
  readonly key: string;
  readonly celId: string;
  readonly layerId: string;
  readonly frameId: string;
}

export interface AnimationCelLinkRequest {
  readonly kind: 'cel.link';
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly layerId: string;
  readonly members: readonly AnimationCelLinkMember[];
}

export type AnimationProjectStateRequest =
  | AnimationFrameRequest
  | AnimationCelLinkRequest
  | FrameTagRequest
  | {
      readonly kind: 'cel.unlink';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly layerId: string;
      readonly frameId: string;
      readonly celId: string;
      readonly linkedCelId: string;
      readonly linkGroup: readonly CelUnlinkGroupMember[];
    };

export type AnimationProjectStateChildInput = {
  readonly command: string;
  readonly input: Readonly<Record<string, unknown>>;
};

export interface AnimationProjectStatePreparationOptions {
  readonly entityIdFactory?: () => string;
  readonly tagIdFactory?: () => string;
}

interface AnimationSnapshot {
  readonly frames: readonly Frame[];
  readonly cels: ReadonlyMap<string, Cel>;
  readonly tags: readonly FrameTag[];
  readonly currentFrameId: string;
  readonly activeTagId: string | null;
  readonly playbackMode: 'all' | 'tag';
  readonly layers: readonly Layer[];
}

export interface PreparedAnimationProjectStateChange {
  readonly command: string;
  readonly request: AnimationProjectStateRequest;
  readonly before: AnimationSnapshot;
  readonly after: AnimationSnapshot;
  readonly domains: readonly ProjectChangeDomain[];
  readonly snapshotBytes: number;
}

class AnimationProjectStateError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'AnimationProjectStateError';
    this.editorError = editorError;
  }
}

export function prepareAnimationProjectStateChange(
  context: ProjectContext,
  child: AnimationProjectStateChildInput,
  target: ProjectTarget,
  expectedRevision: number,
  options: AnimationProjectStatePreparationOptions = {},
): PreparedAnimationProjectStateChange {
  validateTargetAndRevision(context, target, expectedRevision);
  validateAvailability(context);
  const request = normalizeRequest(child, target, expectedRevision);
  const before = captureSnapshot(context);
  validateCollectionBounds(before, request);
  const after = prepareAfterSnapshot(context, before, request, options);
  const snapshotBytes = estimateCelPayloadBytes(before.cels) + estimateCelPayloadBytes(after.cels);
  if (!Number.isSafeInteger(snapshotBytes) || snapshotBytes > ANIMATION_MAX_PREPARATION_BYTES) {
    throw animationError('limit_exceeded', false, {
      reason: 'animation_preparation_bytes',
      max: ANIMATION_MAX_PREPARATION_BYTES,
    });
  }
  return {
    command: child.command,
    request,
    before,
    after,
    domains: domainsFor(request),
    snapshotBytes,
  };
}

export function applyPreparedAnimationProjectStateChange(
  context: ProjectContext,
  prepared: PreparedAnimationProjectStateChange,
  phase: 'before' | 'after',
): void {
  const snapshot = phase === 'after' ? prepared.after : prepared.before;
  context.project.applyTimelineAnimationState(
    snapshot.frames,
    new Map(snapshot.cels),
    snapshot.tags,
    snapshot.currentFrameId,
    snapshot.activeTagId,
    snapshot.playbackMode,
  );
}

export function assertPreparedAnimationProjectStateChange(
  context: ProjectContext,
  prepared: PreparedAnimationProjectStateChange,
  phase: 'before' | 'after',
): void {
  const expected = phase === 'after' ? prepared.after : prepared.before;
  const current = captureSnapshot(context);
  if (!sameSnapshot(current, expected)) {
    throw animationError('revision_conflict', true, { reason: 'history_structure_changed' });
  }
}

// fallow-ignore-next-line code-duplication -- Each prepared seam owns its explicit target and revision gate.
function validateTargetAndRevision(
  context: ProjectContext,
  target: ProjectTarget,
  expectedRevision: number,
): void {
  if (context.isDisposed || context.project.id.value !== target.projectId) {
    throw animationError('target_not_found', true);
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw animationError('invalid_request', false, { reason: 'expected_revision' });
  }
  if (context.project.revision.value !== expectedRevision) {
    throw animationError('revision_conflict', true, {
      expectedRevision,
      currentRevision: context.project.revision.value,
    });
  }
}

function validateAvailability(context: ProjectContext): void {
  if (context.guidedDrawing.active) {
    throw animationError('unsupported', false, { feature: 'guided-drawing-animation' });
  }
  const selectionType = context.selection.state.value.type;
  if (selectionType === 'floating' || selectionType === 'transforming') {
    throw animationError('invalid_state', false, { reason: 'selection_in_progress' });
  }
}

// fallow-ignore-next-line complexity -- Animation bounds and matrix checks must complete before any payload allocation.
function validateCollectionBounds(
  before: AnimationSnapshot,
  request: AnimationProjectStateRequest,
): void {
  const supportedLayers = before.layers.filter((layer) => layer.type !== 'reference');
  if (supportedLayers.length === 0) {
    throw animationError('invalid_state', false, { reason: 'supported_layer_required' });
  }
  if (before.frames.length > ANIMATION_MAX_FRAMES || supportedLayers.length > ANIMATION_MAX_LAYERS) {
    throw animationError('limit_exceeded', false, {
      reason: 'animation_collections',
      max: Math.max(ANIMATION_MAX_FRAMES, ANIMATION_MAX_LAYERS),
    });
  }
  if (before.cels.size > ANIMATION_MAX_CELS) {
    throw animationError('limit_exceeded', false, {
      reason: 'animation_cels',
      max: ANIMATION_MAX_CELS,
    });
  }
  if ((request.kind === 'frame.create' || request.kind === 'frame.duplicate') &&
      before.frames.length >= ANIMATION_MAX_FRAMES) {
    throw animationError('limit_exceeded', false, {
      reason: 'animation_frames',
      max: ANIMATION_MAX_FRAMES,
    });
  }
  if (request.kind === 'cel.link' && request.members.length > ANIMATION_MAX_LINK_MEMBERS) {
    throw animationError('limit_exceeded', false, {
      reason: 'cel_link_members',
      max: ANIMATION_MAX_LINK_MEMBERS,
    });
  }
  const expectedCelCount = request.kind === 'frame.create'
    ? before.cels.size + supportedLayers.length
    : request.kind === 'frame.duplicate'
      ? before.cels.size + supportedLayers.length
      : before.cels.size;
  if (expectedCelCount > ANIMATION_MAX_CELS) {
    throw animationError('limit_exceeded', false, {
      reason: 'animation_cels',
      max: ANIMATION_MAX_CELS,
    });
  }
  validateAnimationMatrix(before, supportedLayers);
  validatePreparationBytes(before, request, supportedLayers);
}

function validateAnimationMatrix(before: AnimationSnapshot, supportedLayers: readonly Layer[]): void {
  const expectedKeys = new Set<string>();
  for (const frame of before.frames) {
    for (const layer of supportedLayers) {
      const key = `${layer.id}:${frame.id}`;
      expectedKeys.add(key);
      const cel = before.cels.get(key);
      if (!cel || cel.id.length === 0 || cel.layerId !== layer.id || cel.frameId !== frame.id) {
        throw animationError('invalid_state', false, { reason: 'animation_matrix' });
      }
    }
  }
  if (before.cels.size !== expectedKeys.size || [...before.cels.keys()].some((key) => !expectedKeys.has(key))) {
    throw animationError('invalid_state', false, { reason: 'animation_matrix' });
  }
}

// fallow-ignore-next-line complexity -- Conservative retained-payload accounting runs before cloning canvases or indices.
function validatePreparationBytes(
  before: AnimationSnapshot,
  request: AnimationProjectStateRequest,
  supportedLayers: readonly Layer[],
): void {
  const currentBytes = estimateCelPayloadBytes(before.cels);
  let additionalBytes = 0;
  if (request.kind === 'frame.create') {
    additionalBytes = canvasPayloadBytes(before);
  } else if (request.kind === 'frame.duplicate') {
    const source = before.frames.find((frame) => frame.id === request.sourceFrameId);
    if (!source) throw animationError('target_not_found', true, { resource: 'frame' });
    for (const layer of supportedLayers) {
      const sourceCel = before.cels.get(`${layer.id}:${source.id}`);
      if (!sourceCel) throw animationError('invalid_state', false, { reason: 'animation_matrix' });
      additionalBytes += sourceCel.canvas.width * sourceCel.canvas.height * 4;
      additionalBytes += sourceCel.indexBuffer?.byteLength ?? 0;
    }
  } else if (request.kind === 'cel.unlink') {
    const cel = before.cels.get(`${request.layerId}:${request.frameId}`);
    if (!cel) throw animationError('target_not_found', true, { resource: 'cel' });
    additionalBytes = cel.canvas.width * cel.canvas.height * 4 + (cel.indexBuffer?.byteLength ?? 0);
  }
  const snapshotBytes = currentBytes + currentBytes + additionalBytes;
  if (!Number.isSafeInteger(snapshotBytes) || snapshotBytes > ANIMATION_MAX_PREPARATION_BYTES) {
    throw animationError('limit_exceeded', false, {
      reason: 'animation_preparation_bytes',
      max: ANIMATION_MAX_PREPARATION_BYTES,
    });
  }
}

function canvasPayloadBytes(before: AnimationSnapshot): number {
  const layer = before.layers.find((candidate) => candidate.type !== 'reference');
  const frame = before.frames[0];
  if (!layer || !frame) throw animationError('invalid_state', false, { reason: 'animation_matrix' });
  const cel = before.cels.get(`${layer.id}:${frame.id}`);
  if (!cel) throw animationError('invalid_state', false, { reason: 'animation_matrix' });
  const bytes = cel.canvas.width * cel.canvas.height * 4;
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw animationError('limit_exceeded', false, {
      reason: 'animation_preparation_bytes',
      max: ANIMATION_MAX_PREPARATION_BYTES,
    });
  }
  return bytes;
}

function normalizeRequest(
  child: AnimationProjectStateChildInput,
  target: ProjectTarget,
  expectedRevision: number,
): AnimationProjectStateRequest {
  if (!isRecord(child.input) || typeof child.command !== 'string') {
    throw animationError('invalid_request', false, { reason: 'animation_child' });
  }
  const input = child.input;
  if (child.command === ANIMATION_FRAME_COMMAND_ID) {
    return normalizeFrameRequest(input, target, expectedRevision);
  }
  if (child.command === ANIMATION_CEL_LINK_COMMAND_ID) {
    return normalizeCelLinkRequest(input, target, expectedRevision);
  }
  if (child.command === FRAME_TAG_COMMAND_ID) {
    return normalizeTagRequest(input, target, expectedRevision);
  }
  if (child.command === CEL_UNLINK_COMMAND_ID) {
    return normalizeCelUnlinkRequest(input, target, expectedRevision);
  }
  throw animationError('unsupported', false, { reason: 'animation_child_command' });
}

// fallow-ignore-next-line complexity -- The finite frame discriminated union is normalized before project mutation.
function normalizeFrameRequest(
  input: Readonly<Record<string, unknown>>,
  target: ProjectTarget,
  expectedRevision: number,
): AnimationFrameRequest {
  if (typeof input.kind !== 'string' || !input.kind.startsWith('frame.')) {
    throw animationError('invalid_request', false, { reason: 'animation_child_family' });
  }
  switch (input.kind) {
    case 'frame.create': {
      assertExactKeys(input, ['kind', 'position', 'anchorFrameId', 'duration'], 'frame_create');
      return {
        kind: 'frame.create',
        target,
        expectedRevision,
        position: normalizePosition(input.position),
        ...(input.anchorFrameId === undefined ? {} : { anchorFrameId: requiredString(input.anchorFrameId, 'anchor_frame') }),
        duration: normalizeDuration(input.duration),
      };
    }
    case 'frame.duplicate': {
      assertExactKeys(input, ['kind', 'sourceFrameId', 'position', 'anchorFrameId'], 'frame_duplicate');
      return {
        kind: 'frame.duplicate',
        target,
        expectedRevision,
        sourceFrameId: requiredString(input.sourceFrameId, 'source_frame'),
        position: normalizePosition(input.position),
        ...(input.anchorFrameId === undefined ? {} : { anchorFrameId: requiredString(input.anchorFrameId, 'anchor_frame') }),
      };
    }
    case 'frame.reorder': {
      assertExactKeys(input, ['kind', 'frameId', 'position', 'anchorFrameId'], 'frame_reorder');
      return {
        kind: 'frame.reorder',
        target,
        expectedRevision,
        frameId: requiredString(input.frameId, 'frame_id'),
        position: normalizePosition(input.position),
        ...(input.anchorFrameId === undefined ? {} : { anchorFrameId: requiredString(input.anchorFrameId, 'anchor_frame') }),
      };
    }
    case 'frame.duration':
      assertExactKeys(input, ['kind', 'frameId', 'duration'], 'frame_duration');
      return {
        kind: 'frame.duration',
        target,
        expectedRevision,
        frameId: requiredString(input.frameId, 'frame_id'),
        duration: normalizeDuration(input.duration),
      };
    case 'frame.delete':
      assertExactKeys(input, ['kind', 'frameId'], 'frame_delete');
      return {
        kind: 'frame.delete',
        target,
        expectedRevision,
        frameId: requiredString(input.frameId, 'frame_id'),
      };
    default:
      throw animationError('invalid_request', false, { reason: 'frame_kind' });
  }
}

function normalizeCelLinkRequest(
  input: Readonly<Record<string, unknown>>,
  target: ProjectTarget,
  expectedRevision: number,
): AnimationCelLinkRequest {
  assertExactKeys(input, ['kind', 'layerId', 'members'], 'cel_link');
  if (input.kind !== 'cel.link' || !Array.isArray(input.members)) {
    throw animationError('invalid_request', false, { reason: 'cel_link' });
  }
  return {
    kind: 'cel.link',
    target,
    expectedRevision,
    layerId: requiredString(input.layerId, 'layer_id'),
    members: input.members.map(normalizeCelLinkMember),
  };
}

function normalizeCelLinkMember(value: unknown): AnimationCelLinkMember {
  if (!isRecord(value)) throw animationError('invalid_request', false, { reason: 'cel_link_member' });
  assertExactKeys(value, ['key', 'celId', 'layerId', 'frameId'], 'cel_link_member');
  return {
    key: requiredString(value.key, 'cel_link_member'),
    celId: requiredString(value.celId, 'cel_link_member'),
    layerId: requiredString(value.layerId, 'cel_link_member'),
    frameId: requiredString(value.frameId, 'cel_link_member'),
  };
}

function normalizeTagRequest(
  input: Readonly<Record<string, unknown>>,
  target: ProjectTarget,
  expectedRevision: number,
): FrameTagRequest {
  if (typeof input.kind !== 'string' || !input.kind.startsWith('tag.')) {
    throw animationError('invalid_request', false, { reason: 'animation_child_family' });
  }
  return {
    ...(input as unknown as Omit<FrameTagRequest, 'target' | 'expectedRevision'>),
    target,
    expectedRevision,
  } as FrameTagRequest;
}

function normalizeCelUnlinkRequest(
  input: Readonly<Record<string, unknown>>,
  target: ProjectTarget,
  expectedRevision: number,
): AnimationProjectStateRequest {
  assertExactKeys(input, ['kind', 'layerId', 'frameId', 'celId', 'linkedCelId', 'linkGroup'], 'cel_unlink');
  if (input.kind !== 'cel.unlink' || !Array.isArray(input.linkGroup)) {
    throw animationError('invalid_request', false, { reason: 'cel_unlink' });
  }
  return {
    kind: 'cel.unlink',
    target,
    expectedRevision,
    layerId: requiredString(input.layerId, 'layer_id'),
    frameId: requiredString(input.frameId, 'frame_id'),
    celId: requiredString(input.celId, 'cel_id'),
    linkedCelId: requiredString(input.linkedCelId, 'linked_cel_id'),
    linkGroup: input.linkGroup as readonly CelUnlinkGroupMember[],
  };
}

function prepareAfterSnapshot(
  context: ProjectContext,
  before: AnimationSnapshot,
  request: AnimationProjectStateRequest,
  options: AnimationProjectStatePreparationOptions,
): AnimationSnapshot {
  if (request.kind === 'frame.create') return createFrame(context, before, request, options);
  if (request.kind === 'frame.duplicate') return duplicateFrame(context, before, request, options);
  if (request.kind === 'frame.reorder') return reorderFrame(before, request);
  if (request.kind === 'frame.duration') return changeDuration(before, request);
  if (request.kind === 'frame.delete') return deleteFrame(before, request);
  if (request.kind === 'cel.link') return linkCels(before, request, options);
  if (request.kind === 'cel.unlink') return unlinkCel(context, before, request, options);
  return changeTags(context, before, request, options);
}

function createFrame(
  context: ProjectContext,
  before: AnimationSnapshot,
  request: Extract<AnimationProjectStateRequest, { kind: 'frame.create' }>,
  options: AnimationProjectStatePreparationOptions,
): AnimationSnapshot {
  const index = insertionIndex(before.frames, request.position, request.anchorFrameId);
  const frameId = nextIdentity(options.entityIdFactory, allEntityIdentities(before), 'frame');
  const inserted = insertFrameSnapshot(before, frameId, index, request.duration);
  const { frames, tags, cels } = inserted;
  const layers = before.layers.filter((layer) => layer.type !== 'reference');
  const canvas = createBlankCanvas(context.project.width.value, context.project.height.value);
  const celIds = allEntityIdentities(before);
  celIds.add(frameId);
  for (const layer of layers) {
    const celId = nextIdentity(options.entityIdFactory, celIds, 'cel');
    cels.set(context.animation.getCelKey(layer.id, frameId), {
      id: celId,
      layerId: layer.id,
      frameId,
      canvas,
    });
  }
  return { ...before, frames, cels, tags, currentFrameId: frameId };
}

function duplicateFrame(
  context: ProjectContext,
  before: AnimationSnapshot,
  request: Extract<AnimationProjectStateRequest, { kind: 'frame.duplicate' }>,
  options: AnimationProjectStatePreparationOptions,
): AnimationSnapshot {
  const source = before.frames.find((frame) => frame.id === request.sourceFrameId);
  if (!source) throw animationError('target_not_found', true, { resource: 'frame' });
  const index = insertionIndex(before.frames, request.position, request.anchorFrameId);
  const frameId = nextIdentity(options.entityIdFactory, allEntityIdentities(before), 'frame');
  const inserted = insertFrameSnapshot(before, frameId, index, source.duration);
  const { frames, tags, cels } = inserted;
  const celIds = allEntityIdentities(before);
  celIds.add(frameId);
  const layers = before.layers.filter((layer) => layer.type !== 'reference');
  for (const layer of layers) {
    const sourceKey = context.animation.getCelKey(layer.id, source.id);
    const sourceCel = before.cels.get(sourceKey);
    if (!sourceCel) throw animationError('invalid_state', false, { reason: 'animation_matrix' });
    const celId = nextIdentity(options.entityIdFactory, celIds, 'cel');
    cels.set(context.animation.getCelKey(layer.id, frameId), {
      ...sourceCel,
      id: celId,
      frameId,
      canvas: cloneCelCanvas(sourceCel),
      ...(sourceCel.indexBuffer ? { indexBuffer: new Uint8Array(sourceCel.indexBuffer) } : {}),
      linkedCelId: undefined,
      linkType: undefined,
      ...(sourceCel.textCelData ? { textCelData: { ...sourceCel.textCelData } } : {}),
    });
  }
  return { ...before, frames, cels, tags, currentFrameId: frameId };
}

function insertFrameSnapshot(
  before: AnimationSnapshot,
  frameId: string,
  index: number,
  duration: number,
): { readonly frames: Frame[]; readonly tags: FrameTag[]; readonly cels: Map<string, Cel> } {
  const frame: Frame = { id: frameId, order: index, duration };
  return {
    frames: normalizeFrameOrder([...before.frames.slice(0, index), frame, ...before.frames.slice(index)]),
    tags: tagManager.adjustTagsForFrameInsert([...before.tags], index),
    cels: new Map(before.cels),
  };
}

function reorderFrame(
  before: AnimationSnapshot,
  request: Extract<AnimationProjectStateRequest, { kind: 'frame.reorder' }>,
): AnimationSnapshot {
  if (!before.frames.some((frame) => frame.id === request.frameId)) {
    throw animationError('target_not_found', true, { resource: 'frame' });
  }
  const index = insertionIndex(before.frames, request.position, request.anchorFrameId, request.frameId);
  const currentIndex = before.frames.findIndex((frame) => frame.id === request.frameId);
  const without = before.frames.filter((frame) => frame.id !== request.frameId);
  const candidate = [...without.slice(0, index), before.frames[currentIndex], ...without.slice(index)];
  if (candidate.every((frame, frameIndex) => frame.id === before.frames[frameIndex]?.id)) {
    throw animationError('invalid_request', false, { reason: 'no_change' });
  }
  const frames = normalizeFrameOrder(candidate);
  return { ...before, frames };
}

function changeDuration(
  before: AnimationSnapshot,
  request: Extract<AnimationProjectStateRequest, { kind: 'frame.duration' }>,
): AnimationSnapshot {
  const frameIndex = before.frames.findIndex((frame) => frame.id === request.frameId);
  if (frameIndex < 0) throw animationError('target_not_found', true, { resource: 'frame' });
  if (before.frames[frameIndex].duration === request.duration) {
    throw animationError('invalid_request', false, { reason: 'no_change' });
  }
  const frames = before.frames.map((frame, index) => index === frameIndex ? { ...frame, duration: request.duration } : { ...frame });
  return { ...before, frames };
}

function deleteFrame(
  before: AnimationSnapshot,
  request: Extract<AnimationProjectStateRequest, { kind: 'frame.delete' }>,
): AnimationSnapshot {
  if (before.frames.length <= 1) throw animationError('invalid_state', false, { reason: 'last_frame' });
  const frameIndex = before.frames.findIndex((frame) => frame.id === request.frameId);
  if (frameIndex < 0) throw animationError('target_not_found', true, { resource: 'frame' });
  const frames = normalizeFrameOrder(before.frames.filter((frame) => frame.id !== request.frameId));
  const cels = new Map([...before.cels].filter(([, cel]) => cel.frameId !== request.frameId));
  const tags = tagManager.adjustTagsForFrameDelete([...before.tags], frameIndex, frames.length);
  const currentFrameId = before.currentFrameId === request.frameId
    ? frames[Math.max(0, frameIndex - 1)]?.id ?? frames[0].id
    : before.currentFrameId;
  const activeTagId = tags.some((tag) => tag.id === before.activeTagId) ? before.activeTagId : null;
  const playbackMode = activeTagId ? before.playbackMode : 'all';
  return { ...before, frames, cels, tags, currentFrameId, activeTagId, playbackMode };
}

// fallow-ignore-next-line complexity -- Link preflight compares every bounded member and payload before sharing.
function linkCels(
  before: AnimationSnapshot,
  request: AnimationCelLinkRequest,
  options: AnimationProjectStatePreparationOptions,
): AnimationSnapshot {
  if (request.members.length < 2 || request.members.length > ANIMATION_MAX_LINK_MEMBERS) {
    throw animationError('limit_exceeded', false, { reason: 'cel_link_members', max: ANIMATION_MAX_LINK_MEMBERS });
  }
  const keys = new Set<string>();
  const cels: Cel[] = [];
  for (const member of request.members) {
    if (keys.has(member.key)) throw animationError('invalid_request', false, { reason: 'duplicate_cel_member' });
    keys.add(member.key);
    if (member.layerId !== request.layerId || member.key !== `${member.layerId}:${member.frameId}`) {
      throw animationError('revision_conflict', true, { reason: 'cel_member_changed' });
    }
    const cel = before.cels.get(member.key);
    if (!cel || !before.frames.some((frame) => frame.id === member.frameId) ||
        cel.id !== member.celId || cel.layerId !== member.layerId || cel.frameId !== member.frameId) {
      throw animationError('revision_conflict', true, { reason: 'cel_member_changed' });
    }
    if (cel.linkedCelId || cel.linkType) throw animationError('invalid_state', false, { reason: 'cel_already_linked' });
    cels.push(cel);
  }
  const first = cels[0];
  if (!first || cels.some((cel) => !sameCelPayload(first, cel))) {
    throw animationError('invalid_state', false, { reason: 'cel_payload_mismatch' });
  }
  const linkedCelId = nextIdentity(options.entityIdFactory, allEntityIdentities(before), 'link');
  const after = new Map(before.cels);
  for (const cel of cels) {
    after.set(`${cel.layerId}:${cel.frameId}`, { ...cel, canvas: first.canvas, indexBuffer: first.indexBuffer, linkedCelId, linkType: 'hard' });
  }
  return { ...before, cels: after };
}

function unlinkCel(
  context: ProjectContext,
  before: AnimationSnapshot,
  request: Extract<AnimationProjectStateRequest, { kind: 'cel.unlink' }>,
  options: AnimationProjectStatePreparationOptions,
): AnimationSnapshot {
  const prepared = prepareTimelineProjectStateChange(context, request, { tagIdFactory: options.tagIdFactory });
  const cels = prepared.afterCels ? new Map(prepared.afterCels) : new Map(before.cels);
  return { ...before, cels };
}

function changeTags(
  context: ProjectContext,
  before: AnimationSnapshot,
  request: FrameTagRequest,
  options: AnimationProjectStatePreparationOptions,
): AnimationSnapshot {
  const prepared = prepareTimelineProjectStateChange(context, request, { tagIdFactory: options.tagIdFactory });
  const tags = prepared.afterTags ? prepared.afterTags.map((tag) => ({ ...tag })) : before.tags;
  const activeTagId = tags.some((tag) => tag.id === before.activeTagId) ? before.activeTagId : null;
  const playbackMode = activeTagId ? before.playbackMode : 'all';
  return { ...before, tags, activeTagId, playbackMode };
}

// fallow-ignore-next-line complexity -- Explicit start/end/anchor placement is kept in one bounded identity helper.
function insertionIndex(
  frames: readonly Frame[],
  position: AnimationFramePosition,
  anchorFrameId?: string,
  movingFrameId?: string,
): number {
  if ((position === 'start' || position === 'end') && anchorFrameId !== undefined) {
    throw animationError('invalid_request', false, { reason: 'anchor_position' });
  }
  if ((position === 'before' || position === 'after') && anchorFrameId === undefined) {
    throw animationError('invalid_request', false, { reason: 'anchor_required' });
  }
  const available = movingFrameId ? frames.filter((frame) => frame.id !== movingFrameId) : frames;
  if (position === 'start') return 0;
  if (position === 'end') return available.length;
  const anchorIndex = available.findIndex((frame) => frame.id === anchorFrameId);
  if (anchorIndex < 0 || anchorFrameId === movingFrameId) {
    throw animationError('target_not_found', true, { resource: 'anchor_frame' });
  }
  return position === 'before' ? anchorIndex : anchorIndex + 1;
}

function normalizeFrameOrder(frames: readonly Frame[]): Frame[] {
  return frames.map((frame, order) => ({ ...frame, order }));
}

function captureSnapshot(context: ProjectContext): AnimationSnapshot {
  return {
    frames: context.animation.frames.value.map((frame) => ({ ...frame })),
    cels: new Map(context.animation.cels.value),
    tags: context.animation.tags.value.map((tag) => ({ ...tag })),
    currentFrameId: context.animation.currentFrameId.value,
    activeTagId: context.animation.activeTagId.value,
    playbackMode: context.animation.playbackMode.value,
    layers: context.layers.layers.value.map((layer) => ({ ...layer })),
  };
}

function sameSnapshot(current: AnimationSnapshot, expected: AnimationSnapshot): boolean {
  return current.currentFrameId === expected.currentFrameId &&
    current.activeTagId === expected.activeTagId &&
    current.playbackMode === expected.playbackMode &&
    sameFrames(current.frames, expected.frames) &&
    sameTags(current.tags, expected.tags) &&
    sameLayers(current.layers, expected.layers) &&
    sameCels(current.cels, expected.cels);
}

function sameFrames(current: readonly Frame[], expected: readonly Frame[]): boolean {
  return current.length === expected.length && current.every((frame, index) => {
    const other = expected[index];
    return !!other && frame.id === other.id && frame.order === other.order && frame.duration === other.duration &&
      JSON.stringify(frame.tags) === JSON.stringify(other.tags);
  });
}

function sameTags(current: readonly FrameTag[], expected: readonly FrameTag[]): boolean {
  return current.length === expected.length && current.every((tag, index) => {
    const other = expected[index];
    return !!other && tag.id === other.id && tag.name === other.name && tag.color === other.color &&
      tag.startFrameIndex === other.startFrameIndex && tag.endFrameIndex === other.endFrameIndex &&
      tag.collapsed === other.collapsed;
  });
}

// fallow-ignore-next-line complexity -- Replay equality includes every persisted layer field and inert metadata.
// fallow-ignore-next-line code-duplication -- Animation replay must compare its complete layer snapshot.
function sameLayers(current: readonly Layer[], expected: readonly Layer[]): boolean {
  // fallow-ignore-next-line complexity -- The nested comparison is intentionally field-by-field for replay safety.
  return current.length === expected.length && current.every((layer, index) => {
    const other = expected[index];
    // fallow-ignore-next-line code-duplication -- This compares the animation snapshot's complete persisted layer state.
    return !!other && layer.id === other.id && layer.name === other.name && layer.type === other.type &&
      layer.visible === other.visible && layer.locked === other.locked && layer.opacity === other.opacity &&
      layer.blendMode === other.blendMode && layer.parentId === other.parentId &&
      (layer.continuous ?? false) === (other.continuous ?? false) &&
      JSON.stringify(layer.textData) === JSON.stringify(other.textData) &&
      JSON.stringify(layer.referenceData) === JSON.stringify(other.referenceData);
  });
}

// fallow-ignore-next-line complexity -- Replay equality compares every identity, sharing, and metadata invariant.
function sameCels(current: ReadonlyMap<string, Cel>, expected: ReadonlyMap<string, Cel>): boolean {
  if (current.size !== expected.size) return false;
  for (const [key, cel] of current) {
    const other = expected.get(key);
    if (!other || cel.id !== other.id || cel.layerId !== other.layerId || cel.frameId !== other.frameId ||
        cel.canvas !== other.canvas || cel.indexBuffer !== other.indexBuffer ||
        cel.linkedCelId !== other.linkedCelId || cel.linkType !== other.linkType || cel.opacity !== other.opacity ||
        !sameTextData(cel.textCelData, other.textCelData)) return false;
  }
  return true;
}

function sameCelPayload(first: Cel, second: Cel): boolean {
  if (first.canvas.width !== second.canvas.width || first.canvas.height !== second.canvas.height ||
      !sameBytes(readCanvas(first.canvas), readCanvas(second.canvas)) ||
      !sameBytes(first.indexBuffer, second.indexBuffer) || first.opacity !== second.opacity ||
      !sameTextData(first.textCelData, second.textCelData)) return false;
  return true;
}

function sameTextData(first: Cel['textCelData'], second: Cel['textCelData']): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function readCanvas(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw animationError('internal', true, { reason: 'canvas_read' });
  try {
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    throw animationError('internal', true, { reason: 'canvas_read' });
  }
}

function sameBytes(first: ArrayLike<number> | undefined, second: ArrayLike<number> | undefined): boolean {
  if (!first || !second) return first === second;
  return first.length === second.length && Array.from(first).every((value, index) => value === second[index]);
}

function cloneCelCanvas(cel: Cel): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = cel.canvas.width;
  canvas.height = cel.canvas.height;
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) throw animationError('internal', true, { reason: 'canvas_allocation' });
  try {
    context.imageSmoothingEnabled = false;
    context.drawImage(cel.canvas, 0, 0);
    return isRuntimeEmptyCel(cel) ? markRuntimeEmptyCanvas(canvas) : canvas;
  } catch {
    throw animationError('internal', true, { reason: 'cel_payload_clone' });
  }
}

// fallow-ignore-next-line code-duplication -- This seam marks runtime-empty animation payloads for independent frame creation.
function createBlankCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) throw animationError('internal', true, { reason: 'canvas_allocation' });
  context.imageSmoothingEnabled = false;
  return markRuntimeEmptyCanvas(canvas);
}

function nextIdentity(
  factory: (() => string) | undefined,
  existing: Set<string>,
  reason: string,
): string {
  const identity = factory?.() ?? crypto.randomUUID();
  if (typeof identity !== 'string' || identity.length === 0 || existing.has(identity)) {
    throw animationError('invalid_state', false, { reason: `${reason}_identity` });
  }
  existing.add(identity);
  return identity;
}

function allEntityIdentities(before: AnimationSnapshot): Set<string> {
  const identities = new Set(before.frames.map((frame) => frame.id));
  for (const cel of before.cels.values()) {
    identities.add(cel.id);
    if (cel.linkedCelId) identities.add(cel.linkedCelId);
  }
  return identities;
}

function normalizePosition(value: unknown): AnimationFramePosition {
  if (value !== 'start' && value !== 'end' && value !== 'before' && value !== 'after') {
    throw animationError('invalid_request', false, { reason: 'position' });
  }
  return value;
}

function normalizeDuration(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < ANIMATION_FRAME_DURATION_MIN ||
      (value as number) > ANIMATION_FRAME_DURATION_MAX) {
    throw animationError('bounds_exceeded', false, {
      reason: 'duration',
      max: ANIMATION_FRAME_DURATION_MAX,
    });
  }
  return value as number;
}

function requiredString(value: unknown, reason: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw animationError('invalid_request', false, { reason });
  }
  return value;
}

function assertExactKeys(value: Readonly<Record<string, unknown>>, allowedKeys: readonly string[], reason: string): void {
  if (!hasOnlyKeys(value, allowedKeys)) throw animationError('invalid_request', false, { reason });
}

function domainsFor(request: AnimationProjectStateRequest): readonly ProjectChangeDomain[] {
  if (request.kind === 'frame.create' || request.kind === 'frame.duplicate' || request.kind === 'frame.delete' || request.kind === 'cel.link' || request.kind === 'cel.unlink') {
    return ['timeline', 'raster-content'];
  }
  return ['timeline'];
}

function animationError(
  code: EditorError['code'],
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
): AnimationProjectStateError {
  return new AnimationProjectStateError({ code, retryable, ...(details ? { details } : {}) });
}
