import type { Command } from '../stores/history';
import type {
  ProjectChangeDomain,
  ProjectChangeEvent,
} from '../stores/project-store';
import type { ProjectContext } from '../stores/project-context';
import type { FrameTag } from '../types/animation';
import type { Layer } from '../types/layer';
import { canvasSizeCatalog } from './canvas-size';
import {
  isRecord,
  type EditorError,
  type EditorErrorCode,
  type ProjectTarget,
} from './contracts';

// fallow-ignore-next-line unused-export -- Stable command IDs are part of the public catalog contract.
export const LAYER_STATE_COMMAND_ID = 'project.layer.state';
// fallow-ignore-next-line unused-export -- Stable command IDs are part of the public catalog contract.
export const FRAME_TAG_COMMAND_ID = 'project.animation.frame-tag';

// fallow-ignore-next-line unused-export -- Public command catalog consumed by editor tooling.
export const layerStateCatalog = Object.freeze({
  id: LAYER_STATE_COMMAND_ID,
  target: 'project',
  requiresRevision: true,
  operations: [
    'visibility',
    'lock',
    'continuity',
    'reorder',
  ] as const,
  affectedDomains: ['layer-state'] as const,
  availability: { guidedDrawing: 'unsupported' },
  undo: 'one-session-history-entry',
  errors: [
    'invalid_request',
    'target_not_found',
    'revision_conflict',
    'invalid_state',
    'unsupported',
    'internal',
  ] as const,
});

// fallow-ignore-next-line unused-export -- Public command catalog consumed by editor tooling.
export const frameTagCatalog = Object.freeze({
  id: FRAME_TAG_COMMAND_ID,
  target: 'project',
  requiresRevision: true,
  operations: [
    'create',
    'rename',
    'recolor',
    'range',
    'collapse',
    'remove-frame',
    'delete',
  ] as const,
  affectedDomains: ['timeline'] as const,
  availability: { guidedDrawing: 'supported' },
  undo: 'one-session-history-entry',
  errors: [
    'invalid_request',
    'target_not_found',
    'revision_conflict',
    'invalid_state',
    'unsupported',
    'internal',
  ] as const,
});

// fallow-ignore-next-line unused-export -- Public command inventory consumed by editor tooling.
export const editorCatalog = Object.freeze({
  version: '1.0',
  commands: Object.freeze([
    canvasSizeCatalog.command,
    layerStateCatalog,
    frameTagCatalog,
  ]),
});

export type LayerDirection = 'up' | 'down';

export type LayerStateRequest =
  | {
      readonly kind: 'layer.visibility';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly layerId: string;
      readonly visible: boolean;
    }
  | {
      readonly kind: 'layer.lock';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly layerId: string;
      readonly locked: boolean;
    }
  | {
      readonly kind: 'layer.continuity';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly layerId: string;
      readonly continuous: boolean;
    }
  | {
      readonly kind: 'layer.reorder';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly layerId: string;
      readonly direction?: LayerDirection;
      readonly targetLayerId?: string;
    };

export type FrameTagRequest =
  | {
      readonly kind: 'tag.create';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly name: string;
      readonly color: string;
      readonly startFrameIndex: number;
      readonly endFrameIndex: number;
    }
  | {
      readonly kind: 'tag.rename';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly tagId: string;
      readonly name: string;
    }
  | {
      readonly kind: 'tag.recolor';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly tagId: string;
      readonly color: string;
    }
  | {
      readonly kind: 'tag.range';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly tagId: string;
      readonly startFrameIndex: number;
      readonly endFrameIndex: number;
    }
  | {
      readonly kind: 'tag.collapse';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly tagId: string;
      readonly collapsed: boolean;
    }
  | {
      readonly kind: 'tag.remove-frame';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly tagId: string;
      readonly frameIndex: number;
    }
  | {
      readonly kind: 'tag.delete';
      readonly target: ProjectTarget;
      readonly expectedRevision: number;
      readonly tagId: string;
    };

export type TimelineProjectStateRequest = LayerStateRequest | FrameTagRequest;

type RequestWithoutContext<T> = T extends unknown
  ? Omit<T, 'target' | 'expectedRevision'>
  : never;

export type TimelineProjectStateRequestInput = RequestWithoutContext<TimelineProjectStateRequest>;
export type FrameTagRequestInput = RequestWithoutContext<FrameTagRequest>;

export interface TimelineProjectStateSuccess {
  readonly ok: true;
  readonly revision: number;
  readonly event: ProjectChangeEvent;
  readonly tagId?: string;
}

export interface TimelineProjectStateFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type TimelineProjectStateResult =
  | TimelineProjectStateSuccess
  | TimelineProjectStateFailure;

type PreparedChange = {
  readonly beforeLayers?: readonly Layer[];
  readonly afterLayers?: readonly Layer[];
  readonly beforeTags?: readonly FrameTag[];
  readonly afterTags?: readonly FrameTag[];
  readonly beforeStructure: ProjectStructure;
  readonly afterStructure: ProjectStructure;
  readonly domains: readonly ProjectChangeDomain[];
  readonly tagId?: string;
};

type ProjectStructure = {
  readonly layers: readonly Layer[];
  readonly cels: ReadonlyMapSnapshot;
  readonly frames: readonly FrameStructure[];
  readonly tags: readonly FrameTag[];
};

type ReadonlyMapSnapshot = ReadonlyMap<string, unknown>;

type FrameStructure = {
  readonly id: string;
  readonly order: number;
  readonly duration: number;
};

class TimelineProjectStateError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'TimelineProjectStateError';
    this.editorError = editorError;
  }
}

class TimelineProjectStateCommand implements Command {
  readonly id = crypto.randomUUID();
  readonly name = 'Timeline Project State';
  readonly managesProjectRevision = true;
  readonly memorySize = 0;
  private readonly context: ProjectContext;
  private readonly request: TimelineProjectStateRequest;
  private readonly prepared: PreparedChange;
  private hasExecuted = false;
  private applied = false;
  private lastEvent: ProjectChangeEvent | null = null;

  constructor(
    context: ProjectContext,
    request: TimelineProjectStateRequest,
    prepared: PreparedChange,
  ) {
    this.context = context;
    this.request = request;
    this.prepared = prepared;
  }

  get event(): ProjectChangeEvent | null {
    return this.lastEvent;
  }

  execute(): void {
    if (this.applied) {
      throw timelineError('invalid_state', false, { reason: 'already_applied' });
    }

    this.assertTarget();
    if (!this.hasExecuted) {
      this.assertRevision();
    }
    this.assertStructure(this.prepared.beforeStructure);
    this.apply(this.prepared.afterLayers, this.prepared.afterTags);
    this.lastEvent = this.context.project.commitChange(this.id, this.prepared.domains);
    this.hasExecuted = true;
    this.applied = true;
  }

  undo(): void {
    if (!this.applied) {
      throw timelineError('invalid_state', false, { reason: 'not_applied' });
    }

    this.assertTarget();
    this.assertStructure(this.prepared.afterStructure);
    this.apply(this.prepared.beforeLayers, this.prepared.beforeTags);
    this.lastEvent = this.context.project.commitChange(this.id, this.prepared.domains);
    this.applied = false;
  }

  private assertTarget(): void {
    if (this.context.project.id.value !== this.request.target.projectId) {
      throw timelineError('target_not_found', true);
    }
  }

  private assertRevision(): void {
    if (this.context.project.revision.value !== this.request.expectedRevision) {
      throw timelineError('revision_conflict', true, {
        expectedRevision: this.request.expectedRevision,
        currentRevision: this.context.project.revision.value,
      });
    }
  }

  private assertStructure(expected: ProjectStructure): void {
    const current = captureProjectStructure(this.context);
    if (!sameProjectStructure(current, expected)) {
      throw timelineError('revision_conflict', true, {
        reason: 'history_structure_changed',
      });
    }
  }

  private apply(
    layers: readonly Layer[] | undefined,
    tags: readonly FrameTag[] | undefined,
  ): void {
    if (layers) {
      this.context.layers.layers.value = layers.map(cloneLayer);
      this.context.dirtyRect.requestFullRedraw();
    }
    if (tags) {
      this.context.animation.tags.value = tags.map(cloneTag);
      clearDeletedActiveTag(this.context);
    }
  }
}

// fallow-ignore-next-line unused-export -- Adapters use this to capture target and revision at dispatch.
export function captureTimelineProjectRequest(
  context: ProjectContext,
  request: TimelineProjectStateRequestInput,
): TimelineProjectStateRequest {
  return {
    ...request,
    target: { projectId: context.project.id.value },
    expectedRevision: context.project.revision.value,
  } as TimelineProjectStateRequest;
}

export function createLayerVisibilityRequest(
  context: ProjectContext,
  layerId: string,
  visible: boolean,
): LayerStateRequest {
  return captureTimelineProjectRequest(context, {
    kind: 'layer.visibility',
    layerId,
    visible,
  }) as Extract<LayerStateRequest, { readonly kind: 'layer.visibility' }>;
}

export function createLayerLockRequest(
  context: ProjectContext,
  layerId: string,
  locked: boolean,
): LayerStateRequest {
  return captureTimelineProjectRequest(context, {
    kind: 'layer.lock',
    layerId,
    locked,
  }) as Extract<LayerStateRequest, { readonly kind: 'layer.lock' }>;
}

export function createLayerContinuityRequest(
  context: ProjectContext,
  layerId: string,
  continuous: boolean,
): LayerStateRequest {
  return captureTimelineProjectRequest(context, {
    kind: 'layer.continuity',
    layerId,
    continuous,
  }) as Extract<LayerStateRequest, { readonly kind: 'layer.continuity' }>;
}

export function createLayerDirectionRequest(
  context: ProjectContext,
  layerId: string,
  direction: LayerDirection,
): LayerStateRequest {
  return captureTimelineProjectRequest(context, {
    kind: 'layer.reorder',
    layerId,
    direction,
  }) as Extract<LayerStateRequest, { readonly kind: 'layer.reorder' }>;
}

export function createLayerDropRequest(
  context: ProjectContext,
  layerId: string,
  targetLayerId: string,
): LayerStateRequest {
  return captureTimelineProjectRequest(context, {
    kind: 'layer.reorder',
    layerId,
    targetLayerId,
  }) as Extract<LayerStateRequest, { readonly kind: 'layer.reorder' }>;
}

export function createFrameTagRequest(
  context: ProjectContext,
  request: FrameTagRequestInput,
): FrameTagRequest {
  return captureTimelineProjectRequest(context, request) as FrameTagRequest;
}

export async function executeTimelineProjectState(
  context: ProjectContext,
  input: unknown,
): Promise<TimelineProjectStateResult> {
  try {
    const request = normalizeRequest(input);
    const prepared = prepareChange(context, request);
    const command = new TimelineProjectStateCommand(context, request, prepared);
    await context.history.execute(command);

    if (!command.event) {
      throw timelineError('internal', true, { reason: 'missing_change_event' });
    }

    return {
      ok: true,
      revision: command.event.toRevision,
      event: command.event,
      ...(prepared.tagId ? { tagId: prepared.tagId } : {}),
    };
  } catch (error) {
    return { ok: false, error: toEditorError(error) };
  }
}

function normalizeRequest(input: unknown): TimelineProjectStateRequest {
  if (!isRecord(input) || typeof input.kind !== 'string') {
    throw timelineError('invalid_request', false, { reason: 'request' });
  }

  const target = normalizeTarget(input.target);
  const expectedRevision = normalizeExpectedRevision(input.expectedRevision);
  if (input.kind.startsWith('layer.')) {
    return normalizeLayerRequest(input, target, expectedRevision);
  }
  if (input.kind.startsWith('tag.')) {
    return normalizeTagRequest(input, target, expectedRevision);
  }
  throw timelineError('invalid_request', false, { reason: 'kind' });
}

function normalizeExpectedRevision(value: unknown): number {
  if (typeof value !== 'number') {
    throw timelineError('invalid_request', false, { reason: 'expected_revision' });
  }
  return value;
}

function normalizeLayerRequest(
  input: Record<string, unknown>,
  target: ProjectTarget,
  expectedRevision: number,
): LayerStateRequest {
  switch (input.kind) {
    case 'layer.visibility':
      return {
        kind: 'layer.visibility',
        target,
        expectedRevision,
        layerId: requiredString(input.layerId, 'layer_id'),
        visible: requiredBoolean(input.visible, 'visible'),
      };
    case 'layer.lock':
      return {
        kind: 'layer.lock',
        target,
        expectedRevision,
        layerId: requiredString(input.layerId, 'layer_id'),
        locked: requiredBoolean(input.locked, 'locked'),
      };
    case 'layer.continuity':
      return {
        kind: 'layer.continuity',
        target,
        expectedRevision,
        layerId: requiredString(input.layerId, 'layer_id'),
        continuous: requiredBoolean(input.continuous, 'continuous'),
      };
    case 'layer.reorder':
      return normalizeLayerReorderRequest(input, target, expectedRevision);
    default:
      throw timelineError('invalid_request', false, { reason: 'kind' });
  }
}

function normalizeTagRequest(
  input: Record<string, unknown>,
  target: ProjectTarget,
  expectedRevision: number,
): FrameTagRequest {
  switch (input.kind) {
    case 'tag.create':
      return {
        kind: 'tag.create',
        target,
        expectedRevision,
        name: requiredName(input.name),
        color: requiredString(input.color, 'color'),
        startFrameIndex: requiredInteger(input.startFrameIndex, 'start_frame'),
        endFrameIndex: requiredInteger(input.endFrameIndex, 'end_frame'),
      };
    case 'tag.rename':
      return {
        kind: 'tag.rename',
        target,
        expectedRevision,
        tagId: requiredString(input.tagId, 'tag_id'),
        name: requiredName(input.name),
      };
    case 'tag.recolor':
      return {
        kind: 'tag.recolor',
        target,
        expectedRevision,
        tagId: requiredString(input.tagId, 'tag_id'),
        color: requiredString(input.color, 'color'),
      };
    case 'tag.range':
      return {
        kind: 'tag.range',
        target,
        expectedRevision,
        tagId: requiredString(input.tagId, 'tag_id'),
        startFrameIndex: requiredInteger(input.startFrameIndex, 'start_frame'),
        endFrameIndex: requiredInteger(input.endFrameIndex, 'end_frame'),
      };
    case 'tag.collapse':
      return {
        kind: 'tag.collapse',
        target,
        expectedRevision,
        tagId: requiredString(input.tagId, 'tag_id'),
        collapsed: requiredBoolean(input.collapsed, 'collapsed'),
      };
    case 'tag.remove-frame':
      return {
        kind: 'tag.remove-frame',
        target,
        expectedRevision,
        tagId: requiredString(input.tagId, 'tag_id'),
        frameIndex: requiredInteger(input.frameIndex, 'frame_index'),
      };
    case 'tag.delete':
      return {
        kind: 'tag.delete',
        target,
        expectedRevision,
        tagId: requiredString(input.tagId, 'tag_id'),
      };
    default:
      throw timelineError('invalid_request', false, { reason: 'kind' });
  }
}

function normalizeLayerReorderRequest(
  input: Record<string, unknown>,
  target: ProjectTarget,
  expectedRevision: number,
): LayerStateRequest {
  const layerId = requiredString(input.layerId, 'layer_id');
  const direction = normalizeLayerDirection(input.direction);
  const targetLayerId = normalizeTargetLayerId(input.targetLayerId);
  assertOneReorderTarget(direction, targetLayerId);

  return {
    kind: 'layer.reorder',
    target,
    expectedRevision,
    layerId,
    ...(direction !== undefined ? { direction } : {}),
    ...(targetLayerId !== undefined ? { targetLayerId } : {}),
  };
}

function normalizeLayerDirection(value: unknown): LayerDirection | undefined {
  if (value === undefined) return undefined;
  if (value !== 'up' && value !== 'down') {
    throw timelineError('invalid_request', false, { reason: 'direction' });
  }
  return value;
}

function normalizeTargetLayerId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw timelineError('invalid_request', false, { reason: 'target_layer_id' });
  }
  return value;
}

function assertOneReorderTarget(
  direction: LayerDirection | undefined,
  targetLayerId: string | undefined,
): void {
  if ((direction === undefined) === (targetLayerId === undefined)) {
    throw timelineError('invalid_request', false, { reason: 'reorder_target' });
  }
}

function normalizeTarget(value: unknown): ProjectTarget {
  if (!isRecord(value) || typeof value.projectId !== 'string' || value.projectId.length === 0) {
    throw timelineError('invalid_request', false, { reason: 'target' });
  }
  return { projectId: value.projectId };
}

function requiredString(value: unknown, reason: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw timelineError('invalid_request', false, { reason });
  }
  return value;
}

function requiredName(value: unknown): string {
  const name = requiredString(value, 'name');
  if (name.trim().length === 0) {
    throw timelineError('invalid_request', false, { reason: 'name' });
  }
  return name;
}

function requiredBoolean(value: unknown, reason: string): boolean {
  if (typeof value !== 'boolean') {
    throw timelineError('invalid_request', false, { reason });
  }
  return value;
}

function requiredInteger(value: unknown, reason: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw timelineError('invalid_request', false, { reason });
  }
  return value;
}

function prepareChange(
  context: ProjectContext,
  request: TimelineProjectStateRequest,
): PreparedChange {
  validateTargetAndRevision(context, request);
  validateAvailability(context, request);

  if (request.kind.startsWith('layer.')) {
    return prepareLayerChange(context, request as LayerStateRequest);
  }
  return prepareTagChange(context, request as FrameTagRequest);
}

function validateTargetAndRevision(
  context: ProjectContext,
  request: TimelineProjectStateRequest,
): void {
  if (context.project.id.value !== request.target.projectId) {
    throw timelineError('target_not_found', true);
  }
  if (!Number.isInteger(request.expectedRevision) || request.expectedRevision < 0) {
    throw timelineError('invalid_request', false, { reason: 'expected_revision' });
  }
  if (context.project.revision.value !== request.expectedRevision) {
    throw timelineError('revision_conflict', true, {
      expectedRevision: request.expectedRevision,
      currentRevision: context.project.revision.value,
    });
  }
}

function validateAvailability(
  context: ProjectContext,
  request: TimelineProjectStateRequest,
): void {
  if (request.kind.startsWith('layer.') && context.guidedDrawing.active) {
    throw timelineError('unsupported', false, { feature: 'guided-drawing-timeline-state' });
  }
}

function prepareLayerChange(
  context: ProjectContext,
  request: LayerStateRequest,
): PreparedChange {
  const beforeLayers = context.layers.layers.value.map(cloneLayer);
  const layer = beforeLayers.find((item) => item.id === request.layerId);
  if (!layer) {
    throw timelineError('target_not_found', true, { resource: 'layer' });
  }

  const afterLayers = beforeLayers.map(cloneLayer);
  switch (request.kind) {
    case 'layer.visibility':
      updateLayerField(afterLayers, request.layerId, 'visible', request.visible);
      break;
    case 'layer.lock':
      updateLayerField(afterLayers, request.layerId, 'locked', request.locked);
      break;
    case 'layer.continuity':
      updateLayerField(afterLayers, request.layerId, 'continuous', request.continuous);
      break;
    case 'layer.reorder':
      reorderLayerSnapshot(afterLayers, request);
      break;
  }

  if (sameLayerArrays(beforeLayers, afterLayers)) {
    throw timelineError('invalid_request', false, { reason: 'no_change' });
  }

  return {
    beforeLayers,
    afterLayers,
    beforeStructure: captureProjectStructure(context),
    afterStructure: captureProjectStructureWithLayers(context, afterLayers),
    domains: ['layer-state'],
  };
}

function updateLayerField<K extends 'visible' | 'locked' | 'continuous'>(
  layers: Layer[],
  layerId: string,
  field: K,
  value: Layer[K],
): void {
  const index = layers.findIndex((layer) => layer.id === layerId);
  if (index === -1) {
    throw timelineError('target_not_found', true, { resource: 'layer' });
  }
  layers[index] = { ...layers[index], [field]: value };
}

function reorderLayerSnapshot(layers: Layer[], request: Extract<LayerStateRequest, { kind: 'layer.reorder' }>): void {
  const fromIndex = layers.findIndex((layer) => layer.id === request.layerId);
  if (fromIndex === -1) {
    throw timelineError('target_not_found', true, { resource: 'layer' });
  }

  let toIndex: number;
  if (request.direction) {
    toIndex = request.direction === 'up' ? fromIndex + 1 : fromIndex - 1;
  } else {
    toIndex = layers.findIndex((layer) => layer.id === request.targetLayerId);
  }
  if (toIndex < 0 || toIndex >= layers.length) {
    throw timelineError('invalid_request', false, { reason: 'reorder_bounds' });
  }
  if (request.targetLayerId === request.layerId || fromIndex === toIndex) {
    throw timelineError('invalid_request', false, { reason: 'no_change' });
  }

  const [layer] = layers.splice(fromIndex, 1);
  if (!layer) {
    throw timelineError('invalid_state', false, { reason: 'layer_reorder' });
  }
  layers.splice(toIndex, 0, layer);
}

function prepareTagChange(
  context: ProjectContext,
  request: FrameTagRequest,
): PreparedChange {
  const beforeTags = context.animation.tags.value.map(cloneTag);
  const frameCount = context.animation.frames.value.length;
  const afterTags = prepareTagSnapshot(beforeTags, request, frameCount);

  if (sameTagArrays(beforeTags, afterTags)) {
    throw timelineError('invalid_request', false, { reason: 'no_change' });
  }

  const tagId = request.kind === 'tag.create'
    ? afterTags[afterTags.length - 1]?.id
    : undefined;

  return {
    beforeTags,
    afterTags,
    beforeStructure: captureProjectStructure(context),
    afterStructure: captureProjectStructureWithTags(context, afterTags),
    domains: ['timeline'],
    ...(tagId ? { tagId } : {}),
  };
}

function prepareTagSnapshot(
  tags: readonly FrameTag[],
  request: FrameTagRequest,
  frameCount: number,
): FrameTag[] {
  switch (request.kind) {
    case 'tag.create':
      return createTagSnapshot(tags, request, frameCount);
    case 'tag.rename':
      return updateTag(tags, request.tagId, { name: request.name.trim() });
    case 'tag.recolor':
      return updateTag(tags, request.tagId, { color: request.color });
    case 'tag.range':
      return resizeTagSnapshot(tags, request, frameCount);
    case 'tag.collapse':
      return updateTag(tags, request.tagId, { collapsed: request.collapsed });
    case 'tag.remove-frame':
      return removeFrameFromTag(tags, request.tagId, request.frameIndex);
    case 'tag.delete':
      return deleteTagSnapshot(tags, request.tagId);
  }
}

function createTagSnapshot(
  tags: readonly FrameTag[],
  request: Extract<FrameTagRequest, { kind: 'tag.create' }>,
  frameCount: number,
): FrameTag[] {
  validateTagRange(request.startFrameIndex, request.endFrameIndex, frameCount);
  if (hasTagOverlap(tags, request.startFrameIndex, request.endFrameIndex)) {
    throw timelineError('invalid_request', false, { reason: 'tag_overlap' });
  }
  return [
    ...tags.map(cloneTag),
    {
      id: crypto.randomUUID(),
      name: request.name.trim(),
      color: request.color,
      startFrameIndex: request.startFrameIndex,
      endFrameIndex: request.endFrameIndex,
      collapsed: false,
    },
  ];
}

function resizeTagSnapshot(
  tags: readonly FrameTag[],
  request: Extract<FrameTagRequest, { kind: 'tag.range' }>,
  frameCount: number,
): FrameTag[] {
  validateTagRange(request.startFrameIndex, request.endFrameIndex, frameCount);
  if (hasTagOverlap(tags, request.startFrameIndex, request.endFrameIndex, request.tagId)) {
    throw timelineError('invalid_request', false, { reason: 'tag_overlap' });
  }
  return updateTag(tags, request.tagId, {
    startFrameIndex: request.startFrameIndex,
    endFrameIndex: request.endFrameIndex,
  });
}

function deleteTagSnapshot(tags: readonly FrameTag[], tagId: string): FrameTag[] {
  if (!tags.some((tag) => tag.id === tagId)) {
    throw timelineError('target_not_found', true, { resource: 'tag' });
  }
  return tags.filter((tag) => tag.id !== tagId).map(cloneTag);
}

function validateTagRange(start: number, end: number, frameCount: number): void {
  if (
    start < 0 ||
    end < start ||
    start >= frameCount ||
    end >= frameCount
  ) {
    throw timelineError('invalid_request', false, { reason: 'tag_range' });
  }
}

function hasTagOverlap(
  tags: readonly FrameTag[],
  start: number,
  end: number,
  excludeTagId?: string,
): boolean {
  return tags.some((tag) => {
    if (excludeTagId && tag.id === excludeTagId) return false;
    return start <= tag.endFrameIndex && end >= tag.startFrameIndex;
  });
}

function updateTag(
  tags: readonly FrameTag[],
  tagId: string,
  updates: Partial<Omit<FrameTag, 'id'>>,
): FrameTag[] {
  const index = tags.findIndex((tag) => tag.id === tagId);
  if (index === -1) {
    throw timelineError('target_not_found', true, { resource: 'tag' });
  }
  const next = tags.map(cloneTag);
  next[index] = { ...next[index], ...updates };
  return next;
}

function removeFrameFromTag(
  tags: readonly FrameTag[],
  tagId: string,
  frameIndex: number,
): FrameTag[] {
  const tag = tags.find((item) => item.id === tagId);
  if (!tag) {
    throw timelineError('target_not_found', true, { resource: 'tag' });
  }
  if (
    frameIndex < tag.startFrameIndex ||
    frameIndex > tag.endFrameIndex
  ) {
    throw timelineError('invalid_request', false, { reason: 'frame_not_in_tag' });
  }
  if (tag.startFrameIndex === tag.endFrameIndex) {
    return tags.filter((item) => item.id !== tagId).map(cloneTag);
  }
  if (frameIndex === tag.startFrameIndex) {
    return updateTag(tags, tagId, { startFrameIndex: tag.startFrameIndex + 1 });
  }
  if (frameIndex === tag.endFrameIndex) {
    return updateTag(tags, tagId, { endFrameIndex: tag.endFrameIndex - 1 });
  }
  throw timelineError('invalid_request', false, { reason: 'frame_not_at_tag_boundary' });
}

function captureProjectStructure(context: ProjectContext): ProjectStructure {
  return captureProjectStructureWithLayersAndTags(
    context,
    context.layers.layers.value,
    context.animation.tags.value,
  );
}

function captureProjectStructureWithLayers(
  context: ProjectContext,
  layers: readonly Layer[],
): ProjectStructure {
  return captureProjectStructureWithLayersAndTags(context, layers, context.animation.tags.value);
}

function captureProjectStructureWithTags(
  context: ProjectContext,
  tags: readonly FrameTag[],
): ProjectStructure {
  return captureProjectStructureWithLayersAndTags(context, context.layers.layers.value, tags);
}

function captureProjectStructureWithLayersAndTags(
  context: ProjectContext,
  layers: readonly Layer[],
  tags: readonly FrameTag[],
): ProjectStructure {
  return {
    layers: layers.map(cloneLayer),
    cels: new Map(context.animation.cels.value),
    frames: context.animation.frames.value.map((frame) => ({
      id: frame.id,
      order: frame.order,
      duration: frame.duration,
    })),
    tags: tags.map(cloneTag),
  };
}

function sameProjectStructure(a: ProjectStructure, b: ProjectStructure): boolean {
  return sameLayerArrays(a.layers, b.layers) &&
    sameMapEntries(a.cels, b.cels) &&
    sameFrameStructures(a.frames, b.frames) &&
    sameTagArrays(a.tags, b.tags);
}

function sameMapEntries(a: ReadonlyMapSnapshot, b: ReadonlyMapSnapshot): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

function sameFrameStructures(a: readonly FrameStructure[], b: readonly FrameStructure[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((frame, index) => {
    const other = b[index];
    return other !== undefined && frame.id === other.id &&
      frame.order === other.order && frame.duration === other.duration;
  });
}

function sameLayerArrays(a: readonly Layer[], b: readonly Layer[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((layer, index) => sameLayer(layer, b[index]));
}

function sameLayer(a: Layer | undefined, b: Layer | undefined): boolean {
  if (!a || !b) return false;
  return sameLayerIdentity(a, b) && sameLayerState(a, b) && sameLayerPayloads(a, b);
}

function sameLayerIdentity(a: Layer, b: Layer): boolean {
  return a.id === b.id && a.name === b.name && a.type === b.type && a.parentId === b.parentId;
}

function sameLayerState(a: Layer, b: Layer): boolean {
  return a.visible === b.visible &&
    a.locked === b.locked &&
    a.opacity === b.opacity &&
    a.blendMode === b.blendMode &&
    a.continuous === b.continuous;
}

function sameLayerPayloads(a: Layer, b: Layer): boolean {
  return a.canvas === b.canvas && a.textData === b.textData && a.referenceData === b.referenceData;
}

function sameTagArrays(a: readonly FrameTag[], b: readonly FrameTag[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tag, index) => {
    const other = b[index];
    return other !== undefined && tag.id === other.id &&
      tag.name === other.name && tag.color === other.color &&
      tag.startFrameIndex === other.startFrameIndex &&
      tag.endFrameIndex === other.endFrameIndex &&
      tag.collapsed === other.collapsed;
  });
}

function cloneLayer(layer: Layer): Layer {
  return { ...layer };
}

function cloneTag(tag: FrameTag): FrameTag {
  return { ...tag };
}

function clearDeletedActiveTag(context: ProjectContext): void {
  const activeTagId = context.animation.activeTagId.value;
  if (activeTagId && !context.animation.tags.value.some((tag) => tag.id === activeTagId)) {
    context.animation.setPlaybackMode('all');
  }
}

function timelineError(
  code: EditorErrorCode,
  retryable: boolean,
  details?: Readonly<Record<string, string | number>>,
): TimelineProjectStateError {
  return new TimelineProjectStateError({ code, retryable, details });
}

function toEditorError(error: unknown): EditorError {
  if (error instanceof TimelineProjectStateError) return error.editorError;
  return {
    code: 'internal',
    retryable: true,
    details: { reason: 'unexpected_failure' },
  };
}
