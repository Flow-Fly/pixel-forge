import type { Command } from '../stores/history';
import type {
  ProjectChangeDomain,
  ProjectChangeEvent,
} from '../stores/project-store';
import type { ProjectContext } from '../stores/project-context';
import * as tagManager from '../stores/animation/tag-manager';
import type { Cel, FrameTag } from '../types/animation';
import type { Layer } from '../types/layer';
import {
  isRecord,
  type EditorError,
  type EditorErrorCode,
  type ProjectTarget,
} from './contracts';

// fallow-ignore-next-line unused-export -- Compatibility re-export keeps the catalog beside the transaction seam.
export { editorCatalog } from './catalog';
// fallow-ignore-next-line unused-export -- Compatibility re-export keeps the catalog beside the transaction seam.
export { FRAME_TAG_COMMAND_ID } from './catalog';
// fallow-ignore-next-line unused-export -- Compatibility re-export keeps the catalog beside the transaction seam.
export { frameTagCatalog } from './catalog';
// fallow-ignore-next-line unused-export -- Compatibility re-export keeps the catalog beside the transaction seam.
export { LAYER_STATE_COMMAND_ID } from './catalog';
// fallow-ignore-next-line unused-export -- Compatibility re-export keeps the catalog beside the transaction seam.
export { layerStateCatalog } from './catalog';
// fallow-ignore-next-line unused-export -- Compatibility re-export keeps the catalog beside the transaction seam.
export { CEL_UNLINK_COMMAND_ID } from './catalog';
// fallow-ignore-next-line unused-export -- Compatibility re-export keeps the catalog beside the transaction seam.
export { celUnlinkCatalog } from './catalog';

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

export type CelUnlinkGroupMember = {
  readonly key: string;
  readonly celId: string;
  readonly layerId: string;
  readonly frameId: string;
  readonly linkedCelId: string;
  readonly linkType: 'hard';
};

export type CelUnlinkRequest = {
  readonly kind: 'cel.unlink';
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly layerId: string;
  readonly frameId: string;
  readonly celId: string;
  readonly linkedCelId: string;
  readonly linkGroup: readonly CelUnlinkGroupMember[];
};

export type TimelineProjectStateRequest = LayerStateRequest | FrameTagRequest | CelUnlinkRequest;

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
  readonly beforeCels?: ReadonlyMap<string, Cel>;
  readonly afterCels?: ReadonlyMap<string, Cel>;
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
      this.assertCelUnlinkGroup();
    }
    this.assertStructure(this.prepared.beforeStructure);
    this.apply(this.prepared.afterLayers, this.prepared.afterTags, this.prepared.afterCels);
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
    this.apply(this.prepared.beforeLayers, this.prepared.beforeTags, this.prepared.beforeCels);
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

  private assertCelUnlinkGroup(): void {
    if (this.request.kind !== 'cel.unlink') return;

    const currentGroup = captureCelUnlinkGroup(
      this.context.animation.cels.value,
      this.request.linkedCelId,
    );
    if (!sameCelUnlinkGroup(currentGroup, this.request.linkGroup)) {
      throw timelineError('revision_conflict', true, { reason: 'link_group_changed' });
    }
  }

  private assertStructure(expected: ProjectStructure): void {
    const current = captureProjectStructure(this.context);
    const matches = this.hasExecuted
      ? this.request.kind.startsWith('layer.')
        ? sameLayerSemanticArrays(current.layers, expected.layers)
        : this.request.kind.startsWith('tag.')
          ? sameTimelineStructure(current, expected)
          : sameProjectStructure(current, expected)
      : sameProjectStructure(current, expected);
    if (!matches) {
      throw timelineError('revision_conflict', true, {
        reason: 'history_structure_changed',
      });
    }
  }

  private apply(
    layers: readonly Layer[] | undefined,
    tags: readonly FrameTag[] | undefined,
    cels: ReadonlyMap<string, Cel> | undefined,
  ): void {
    if (layers) {
      this.context.layers.layers.value = mergeLayerSemanticSnapshot(
        this.context.layers.layers.value,
        layers,
      );
      this.context.dirtyRect.requestFullRedraw();
    }
    if (tags) {
      this.context.animation.tags.value = tags.map(cloneTag);
      clearDeletedActiveTag(this.context);
    }
    if (cels) {
      this.context.project.applyTimelineCelState(new Map(cels));
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

export function createCelUnlinkRequest(
  context: ProjectContext,
  layerId: string,
  frameId: string,
): CelUnlinkRequest {
  const cel = context.animation.cels.value.get(context.animation.getCelKey(layerId, frameId));
  return captureTimelineProjectRequest(context, {
    kind: 'cel.unlink',
    layerId,
    frameId,
    celId: cel?.id ?? '',
    linkedCelId: cel?.linkedCelId ?? '',
    linkGroup: captureCelUnlinkGroup(context.animation.cels.value, cel?.linkedCelId ?? ''),
  }) as CelUnlinkRequest;
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
  if (input.kind === 'cel.unlink') {
    return normalizeCelUnlinkRequest(input, target, expectedRevision);
  }
  throw timelineError('invalid_request', false, { reason: 'kind' });
}

function normalizeCelUnlinkRequest(
  input: Record<string, unknown>,
  target: ProjectTarget,
  expectedRevision: number,
): CelUnlinkRequest {
  return {
    kind: 'cel.unlink',
    target,
    expectedRevision,
    layerId: requiredString(input.layerId, 'layer_id'),
    frameId: requiredString(input.frameId, 'frame_id'),
    celId: requiredString(input.celId, 'cel_id'),
    linkedCelId: requiredString(input.linkedCelId, 'linked_cel_id'),
    linkGroup: normalizeCelUnlinkGroup(input.linkGroup),
  };
}

function normalizeCelUnlinkGroup(value: unknown): CelUnlinkGroupMember[] {
  if (!Array.isArray(value)) {
    throw timelineError('invalid_request', false, { reason: 'link_group' });
  }

  const members = value.map((member) => {
    if (!isRecord(member)) {
      throw timelineError('invalid_request', false, { reason: 'link_group' });
    }

    const linkType = member.linkType;
    if (linkType !== 'hard') {
      throw timelineError('invalid_request', false, { reason: 'link_group' });
    }

    return {
      key: requiredString(member.key, 'link_group'),
      celId: requiredString(member.celId, 'link_group'),
      layerId: requiredString(member.layerId, 'link_group'),
      frameId: requiredString(member.frameId, 'link_group'),
      linkedCelId: requiredString(member.linkedCelId, 'link_group'),
      linkType,
    } satisfies CelUnlinkGroupMember;
  });

  const keys = new Set<string>();
  for (const member of members) {
    if (keys.has(member.key)) {
      throw timelineError('invalid_request', false, { reason: 'link_group' });
    }
    keys.add(member.key);
  }

  return members.sort((a, b) => compareCelUnlinkGroupKeys(a.key, b.key));
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
  if (request.kind.startsWith('tag.')) {
    return prepareTagChange(context, request as FrameTagRequest);
  }
  return prepareCelUnlinkChange(context, request as CelUnlinkRequest);
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
  if ((request.kind.startsWith('layer.') || request.kind === 'cel.unlink') && context.guidedDrawing.active) {
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

function prepareCelUnlinkChange(
  context: ProjectContext,
  request: CelUnlinkRequest,
): PreparedChange {
  const key = context.animation.getCelKey(request.layerId, request.frameId);
  const cel = context.animation.cels.value.get(key);
  if (!cel) {
    throw timelineError('target_not_found', true, { resource: 'cel' });
  }
  if (cel.id !== request.celId || cel.linkedCelId !== request.linkedCelId) {
    throw timelineError('revision_conflict', true, { reason: 'cel_changed' });
  }
  if (cel.linkType !== 'hard') {
    throw timelineError('invalid_state', false, { reason: 'cel_not_hard_linked' });
  }

  const groupEntries = [...context.animation.cels.value.entries()].filter(([, candidate]) =>
    candidate.linkedCelId === request.linkedCelId && candidate.linkType === 'hard',
  );
  const group = captureCelUnlinkGroup(context.animation.cels.value, request.linkedCelId);
  if (group.length < 2) {
    throw timelineError('invalid_state', false, { reason: 'cel_not_shared' });
  }
  if (!sameCelUnlinkGroup(group, request.linkGroup)) {
    throw timelineError('revision_conflict', true, { reason: 'link_group_changed' });
  }
  if (!groupEntries.every(([, candidate]) =>
    candidate.canvas === cel.canvas && candidate.indexBuffer === cel.indexBuffer,
  )) {
    throw timelineError('invalid_state', false, { reason: 'link_group_payload_changed' });
  }

  const beforeCels = new Map(context.animation.cels.value);
  const afterCels = new Map(beforeCels);
  afterCels.set(key, cloneUnlinkedCel(cel));

  return {
    beforeCels,
    afterCels,
    beforeStructure: captureProjectStructure(context),
    afterStructure: captureProjectStructureWithCels(context, afterCels),
    domains: ['timeline', 'raster-content'],
  };
}

function captureCelUnlinkGroup(
  cels: ReadonlyMap<string, Cel>,
  linkedCelId: string,
): CelUnlinkGroupMember[] {
  return [...cels.entries()]
    .filter(([, cel]) => cel.linkedCelId === linkedCelId && cel.linkType === 'hard')
    .sort(([firstKey], [secondKey]) => compareCelUnlinkGroupKeys(firstKey, secondKey))
    .map(([key, cel]) => ({
      key,
      celId: cel.id,
      layerId: cel.layerId,
      frameId: cel.frameId,
      linkedCelId: cel.linkedCelId as string,
      linkType: 'hard',
    }));
}

function compareCelUnlinkGroupKeys(first: string, second: string): number {
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

function sameCelUnlinkGroup(
  current: readonly CelUnlinkGroupMember[],
  expected: readonly CelUnlinkGroupMember[],
): boolean {
  if (current.length !== expected.length) return false;
  return current.every((member, index) => {
    const other = expected[index];
    return other !== undefined &&
      member.key === other.key &&
      member.celId === other.celId &&
      member.layerId === other.layerId &&
      member.frameId === other.frameId &&
      member.linkedCelId === other.linkedCelId &&
      member.linkType === other.linkType;
  });
}

function cloneUnlinkedCel(cel: Cel): Cel {
  const canvas = document.createElement('canvas');
  canvas.width = cel.canvas.width;
  canvas.height = cel.canvas.height;
  const drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!drawing) {
    throw timelineError('internal', true, { reason: 'canvas_allocation' });
  }

  try {
    drawing.imageSmoothingEnabled = false;
    drawing.drawImage(cel.canvas, 0, 0);
    return {
      ...cel,
      canvas,
      ...(cel.indexBuffer ? { indexBuffer: new Uint8Array(cel.indexBuffer) } : {}),
      linkedCelId: undefined,
      linkType: undefined,
    };
  } catch {
    throw timelineError('internal', true, { reason: 'cel_payload_clone' });
  }
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
      return requireTagMutation(tagManager.createFrameTagSnapshot(
        tags,
        request.name.trim(),
        request.color,
        request.startFrameIndex,
        request.endFrameIndex,
        frameCount,
      ));
    case 'tag.rename':
      return requireTagMutation(tagManager.updateFrameTagSnapshot(
        tags,
        request.tagId,
        { name: request.name.trim() },
      ));
    case 'tag.recolor':
      return requireTagMutation(tagManager.updateFrameTagSnapshot(
        tags,
        request.tagId,
        { color: request.color },
      ));
    case 'tag.range':
      return requireTagMutation(tagManager.resizeFrameTagSnapshot(
        tags,
        request.tagId,
        request.startFrameIndex,
        request.endFrameIndex,
        frameCount,
      ));
    case 'tag.collapse':
      return requireTagMutation(tagManager.updateFrameTagSnapshot(
        tags,
        request.tagId,
        { collapsed: request.collapsed },
      ));
    case 'tag.remove-frame':
      return requireTagMutation(tagManager.removeFrameFromTagSnapshot(
        tags,
        request.tagId,
        request.frameIndex,
      ));
    case 'tag.delete':
      return requireTagMutation(tagManager.deleteFrameTagSnapshot(tags, request.tagId));
  }
}

function requireTagMutation(result: tagManager.TagMutationResult<FrameTag[]>): FrameTag[] {
  if (result.ok) return result.value;
  switch (result.reason) {
    case 'tag_not_found':
      throw timelineError('target_not_found', true, { resource: 'tag' });
    case 'tag_overlap':
      throw timelineError('invalid_request', false, { reason: 'tag_overlap' });
    case 'invalid_range':
      throw timelineError('invalid_request', false, { reason: 'tag_range' });
    case 'frame_not_in_tag':
      throw timelineError('invalid_request', false, { reason: 'frame_not_in_tag' });
    case 'frame_not_at_tag_boundary':
      throw timelineError('invalid_request', false, { reason: 'frame_not_at_tag_boundary' });
  }
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

function captureProjectStructureWithCels(
  context: ProjectContext,
  cels: ReadonlyMap<string, Cel>,
): ProjectStructure {
  const currentFrameId = context.animation.currentFrameId.value;
  const layers = context.layers.layers.value.map((layer) => {
    if (layer.type === 'reference') return cloneLayer(layer);
    const cel = cels.get(context.animation.getCelKey(layer.id, currentFrameId));
    return cel ? { ...layer, canvas: cel.canvas } : cloneLayer(layer);
  });
  return captureProjectStructureWithLayersAndTags(context, layers, context.animation.tags.value, cels);
}

function captureProjectStructureWithLayersAndTags(
  context: ProjectContext,
  layers: readonly Layer[],
  tags: readonly FrameTag[],
  cels: ReadonlyMap<string, Cel> = context.animation.cels.value,
): ProjectStructure {
  return {
    layers: layers.map(cloneLayer),
    cels: new Map(cels),
    frames: context.animation.frames.value.map((frame) => ({
      id: frame.id,
      order: frame.order,
      duration: frame.duration,
    })),
    tags: tags.map(cloneTag),
  };
}

function sameProjectStructure(current: ProjectStructure, expected: ProjectStructure): boolean {
  return sameLayerArrays(current.layers, expected.layers) &&
    sameMapEntries(current.cels, expected.cels) &&
    sameTimelineStructure(current, expected);
}

function sameTimelineStructure(current: ProjectStructure, expected: ProjectStructure): boolean {
  return sameFrameStructures(current.frames, expected.frames) &&
    sameTagArrays(current.tags, expected.tags);
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

function sameLayerSemanticArrays(a: readonly Layer[], b: readonly Layer[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((layer, index) => sameLayerSemantic(layer, b[index]));
}

function sameLayerSemantic(a: Layer | undefined, b: Layer | undefined): boolean {
  if (!a || !b) return false;
  return sameLayerIdentity(a, b) && sameLayerState(a, b);
}

function mergeLayerSemanticSnapshot(
  currentLayers: readonly Layer[],
  snapshot: readonly Layer[],
): Layer[] {
  const currentById = new Map(currentLayers.map((layer) => [layer.id, layer]));
  if (currentById.size !== snapshot.length) {
    throw timelineError('revision_conflict', true, { reason: 'history_structure_changed' });
  }

  return snapshot.map((nextLayer) => {
    const currentLayer = currentById.get(nextLayer.id);
    if (!currentLayer) {
      throw timelineError('revision_conflict', true, { reason: 'history_structure_changed' });
    }
    return {
      ...currentLayer,
      id: nextLayer.id,
      name: nextLayer.name,
      type: nextLayer.type,
      visible: nextLayer.visible,
      locked: nextLayer.locked,
      opacity: nextLayer.opacity,
      blendMode: nextLayer.blendMode,
      parentId: nextLayer.parentId,
      continuous: nextLayer.continuous,
    };
  });
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
