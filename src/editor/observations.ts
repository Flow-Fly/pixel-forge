import type { ProjectContext } from '../stores/project-context';
import type { ProjectChangeEvent } from '../stores/project-store';
import type { Command } from '../stores/history-store';
import type { Cel, FrameTag } from '../types/animation';
import { createArtworkCompositionPlan, drawArtworkComposition } from '../services/export-composition';
import { autoSaveService } from '../services/auto-save';
import type {
  EditorError,
  ProjectSaveSafetyObservation,
  ProjectTarget,
} from './contracts';

// fallow-ignore-next-line unused-export -- Public adapter limit is part of the catalog contract.
export const RENDER_OBSERVATION_MAX_BYTES = 16 * 1024 * 1024;
// fallow-ignore-next-line unused-export -- Public adapter limit is part of the catalog contract.
export const PROJECT_OBSERVATION_MAX_HISTORY_ENTRIES = 100;

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

/**
 * Capture project state as plain records. The context remains private to the
 * caller; no store, signal, canvas, command, or live collection is returned.
 */
export function observeProject(
  context: ProjectContext,
  target: ProjectTarget,
  options: ProjectObservationOptions = {},
): ProjectObservation {
  const maxHistoryEntries = options.maxHistoryEntries ?? PROJECT_OBSERVATION_MAX_HISTORY_ENTRIES;
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
    palette: context.palette.getProjectPaletteEntries().map((entry, index) => ({
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
  if (!Number.isSafeInteger(byteLength) || byteLength > maxBytes) {
    return {
      ok: false,
      error: {
        code: 'limit_exceeded',
        retryable: false,
        details: { limitId: 'render-bytes', max: maxBytes },
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
