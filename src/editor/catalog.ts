/**
 * The canonical inventory of project-targeted editor commands.
 *
 * Catalog metadata stays independent from command implementations so loading
 * timeline controls does not pull the Canvas Size implementation into the
 * initial editor bundle.
 */

export const CANVAS_SIZE_COMMAND_ID = 'project.canvas.resize';
export const CANVAS_SIZE_MAX_DIMENSION = 2048;
// fallow-ignore-next-line unused-export -- Stable observation ID is part of the public catalog contract.
export const PROJECT_SAVE_SAFETY_OBSERVATION_ID = 'project.save-safety';
// fallow-ignore-next-line unused-export -- Stable observation ID is part of the public catalog contract.
export const PROJECT_OBSERVATION_ID = 'project.observe';
// fallow-ignore-next-line unused-export -- Stable observation ID is part of the public catalog contract.
export const RENDER_OBSERVATION_ID = 'project.render.observe';
// fallow-ignore-next-line unused-export -- Stable command ID is part of the public catalog contract.
export const FILL_COMMAND_ID = 'project.raster.fill';
// fallow-ignore-next-line unused-export -- Stable command ID is part of the public catalog contract.
export const GRADIENT_COMMAND_ID = 'project.raster.gradient';

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
  request: {
    target: { projectId: 'string' },
    expectedRevision: 'integer >= 0',
    layerId: 'string',
    frameId: 'string',
    celId: 'string',
    linkedCelId: 'string',
    linkGroup: [{
      key: 'string',
      celId: 'string',
      layerId: 'string',
      frameId: 'string',
      linkedCelId: 'string',
      linkType: 'hard',
    }],
  },
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

export const rasterFillCatalog = Object.freeze({
  id: FILL_COMMAND_ID,
  target: 'project',
  requiresRevision: true,
  request: {
    target: { projectId: 'string' },
    expectedRevision: 'integer >= 0',
    layerId: 'string',
    frameId: 'string',
    celId: 'optional captured cel identity',
    startX: 'integer',
    startY: 'integer',
    hex: 'six-digit hex color',
    contiguous: 'boolean',
  },
  affectedDomains: ['raster-content'] as const,
  availability: { guidedDrawing: 'supported' },
  undo: 'one-session-history-entry',
  errors: [
    'invalid_request',
    'target_not_found',
    'revision_conflict',
    'invalid_state',
    'limit_exceeded',
    'unsupported',
    'internal',
  ] as const,
});

export const rasterGradientCatalog = Object.freeze({
  id: GRADIENT_COMMAND_ID,
  target: 'project',
  requiresRevision: true,
  request: {
    target: { projectId: 'string' },
    expectedRevision: 'integer >= 0',
    layerId: 'string',
    frameId: 'string',
    celId: 'optional captured cel identity',
    startX: 'integer',
    startY: 'integer',
    endX: 'integer',
    endY: 'integer',
    primaryHex: 'six-digit hex color',
    secondaryHex: 'six-digit hex color',
    type: 'linear | radial',
    shift: 'boolean; existing 15-degree sticky snapping',
  },
  result: {
    effectivePalettePolicy: 'existing-palette',
    endpoints: {
      start: { index: 'integer 1..255', color: 'six-digit hex color' },
      end: { index: 'integer 1..255', color: 'six-digit hex color' },
    },
    effectiveEnd: { x: 'integer', y: 'integer' },
  },
  limits: { paletteGrowth: 'none', dithering: 'none' },
  availability: { guidedDrawing: 'unsupported' },
  affectedDomains: ['raster-content'] as const,
  undo: 'one-session-history-entry',
  errors: [
    'invalid_request',
    'target_not_found',
    'revision_conflict',
    'invalid_state',
    'limit_exceeded',
    'unsupported',
    'internal',
  ] as const,
});

export const projectSaveSafetyCatalog = Object.freeze({
  id: PROJECT_SAVE_SAFETY_OBSERVATION_ID,
  kind: 'observation',
  target: 'project',
  fields: {
    target: { projectId: 'string' },
    currentRevision: 'integer >= 0',
    persistedRevision: 'integer >= 0',
    status: ['dirty', 'saving', 'saved', 'failed'] as const,
    failure: {
      category: [
        'storage_unavailable',
        'quota_exceeded',
        'serialization_failed',
        'write_failed',
        'internal',
      ] as const,
      action: ['retry_latest'] as const,
    },
  },
  privacy: 'no project content or raw errors',
});

// fallow-ignore-next-line unused-export -- Public observation catalog is negotiated by adapters.
export const projectObservationCatalog = Object.freeze({
  id: PROJECT_OBSERVATION_ID,
  kind: 'observation',
  target: 'project',
  requiresRevision: true,
  fields: {
    target: { projectId: 'string' },
    revision: 'integer >= 0',
    canvas: { width: 'positive integer', height: 'positive integer' },
    layers: 'bounded ordered layer identities and state',
    frames: 'bounded ordered frame and cel identities',
    tags: 'bounded ordered frame-tag identities and ranges',
    palette: 'bounded ordered palette-entry identities and colors',
    history: 'bounded undo and redo summary',
    saveSafety: 'project.save-safety observation',
    lastEvent: 'optional compact project-change event',
  },
  privacy: 'no canvases, stores, signals, command instances, or raw errors',
});

// fallow-ignore-next-line unused-export -- Public observation catalog is negotiated by adapters.
export const renderObservationCatalog = Object.freeze({
  id: RENDER_OBSERVATION_ID,
  kind: 'observation',
  target: 'project',
  requiresRevision: true,
  request: {
    target: { projectId: 'string' },
    expectedRevision: 'integer >= 0',
    frameId: 'string',
  },
  result: {
    format: 'rgba8',
    pixels: 'copied Uint8Array',
    stride: 'width * 4',
  },
  limits: { maxBytes: 16 * 1024 * 1024 },
  privacy: 'canonical artwork bytes only; no canvas or browser chrome',
});

export const editorCatalog = Object.freeze({
  version: '1.0',
  observations: Object.freeze([
    projectSaveSafetyCatalog,
    projectObservationCatalog,
    renderObservationCatalog,
  ]),
  commands: Object.freeze([
    canvasSizeCatalog.command,
    layerStateCatalog,
    frameTagCatalog,
    celUnlinkCatalog,
    rasterFillCatalog,
    rasterGradientCatalog,
  ]),
});
