/**
 * The canonical inventory of project-targeted editor commands.
 *
 * Catalog metadata stays independent from command implementations so loading
 * timeline controls does not pull the Canvas Size implementation into the
 * initial editor bundle.
 */

export const CANVAS_SIZE_COMMAND_ID = 'project.canvas.resize';
export const CANVAS_SIZE_MAX_DIMENSION = 2048;

export const canvasSizeCatalog = Object.freeze({
  version: '1.0',
  command: {
    id: CANVAS_SIZE_COMMAND_ID,
    target: 'project',
    requiresRevision: true,
    request: {
      target: { projectId: 'string' },
      expectedRevision: 'integer >= 0',
      width: 'integer 1..2048',
      height: 'integer 1..2048',
      offset: {
        x: 'integer -2048..2048',
        y: 'integer -2048..2048',
      },
    },
    limits: {
      dimension: { min: 1, max: CANVAS_SIZE_MAX_DIMENSION },
      offset: { min: -CANVAS_SIZE_MAX_DIMENSION, max: CANVAS_SIZE_MAX_DIMENSION },
    },
    availability: {
      guidedDrawing: 'unsupported',
    },
    affectedDomains: ['canvas-bounds', 'raster-content'] as const,
    revision: 'monotonic-project-revision',
    undo: 'one-session-history-entry',
    confirmation: 'required-when-meaningful-content-is-cropped',
    errors: [
      'invalid_request',
      'target_not_found',
      'revision_conflict',
      'invalid_state',
      'limit_exceeded',
      'unsupported',
      'internal',
    ] as const,
  },
} as const);

// fallow-ignore-next-line unused-export -- Stable command IDs are part of the public catalog contract.
export const LAYER_STATE_COMMAND_ID = 'project.layer.state';
// fallow-ignore-next-line unused-export -- Stable command IDs are part of the public catalog contract.
export const FRAME_TAG_COMMAND_ID = 'project.animation.frame-tag';
// fallow-ignore-next-line unused-export -- Stable command IDs are part of the public catalog contract.
export const CEL_UNLINK_COMMAND_ID = 'project.animation.cel.unlink';

// fallow-ignore-next-line unused-export -- Public command catalog consumed by editor tooling.
export const layerStateCatalog = Object.freeze({
  id: LAYER_STATE_COMMAND_ID,
  target: 'project',
  requiresRevision: true,
  operations: ['visibility', 'lock', 'continuity', 'reorder'] as const,
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

// fallow-ignore-next-line unused-export -- Public command catalog consumed by editor tooling.
export const celUnlinkCatalog = Object.freeze({
  id: CEL_UNLINK_COMMAND_ID,
  target: 'project',
  requiresRevision: true,
  operation: 'unlink-active-hard-linked-cel',
  affectedDomains: ['timeline', 'raster-content'] as const,
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

// fallow-ignore-next-line unused-export -- Public command inventory consumed by editor tooling.
export const editorCatalog = Object.freeze({
  version: '1.0',
  commands: Object.freeze([
    canvasSizeCatalog.command,
    layerStateCatalog,
    frameTagCatalog,
    celUnlinkCatalog,
  ]),
});
