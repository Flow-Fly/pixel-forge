import type { ProjectContext } from '../stores/project-context';
import type { ProjectChangeEvent } from '../stores/project-store';
import type { Command } from '../stores/history-store';
import type { Cel, FrameTag } from '../types/animation';
import { createArtworkCompositionPlan, drawArtworkComposition } from '../services/export-composition';
import { autoSaveService } from '../services/auto-save';
import {
  PROJECT_OBSERVATION_LIMITS,
  RENDER_OBSERVATION_MAX_BYTES,
} from './catalog';
import type {
  EditorError,
  ProjectSaveSafetyObservation,
  ProjectTarget,
} from './contracts';

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

export interface RenderObservation {
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
): RenderObservation | RenderObservationFailure {
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
