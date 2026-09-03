/**
 * The canonical inventory of project-targeted editor commands.
 *
 * Catalog metadata stays independent from command implementations so loading
 * timeline controls does not pull the Canvas Size implementation into the
 * initial editor bundle.
 */

export const CANVAS_SIZE_COMMAND_ID = 'project.canvas.resize';
export const CANVAS_SIZE_MAX_DIMENSION = 2048;
export const RENDER_OBSERVATION_MAX_BYTES = 16 * 1024 * 1024;
export const TRANSACTION_PROVENANCE_MAX_STRING_LENGTH = 256;
export const TRANSACTION_PROVENANCE_MAX_TRANSITIONS = 16;
export const PROJECT_OBSERVATION_LIMITS = Object.freeze({
  maxLayers: 64,
  maxFrames: 64,
  maxCels: 4096,
  maxTags: 64,
  maxPaletteEntries: 256,
  maxHistoryEntries: 100,
  maxStringLength: 256,
});
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
export const RASTER_OBSERVATION_ID = 'project.raster.observe';
export const RASTER_PATCH_COMMAND_ID = 'project.raster.patch';
export const RASTER_GRID_MAX_REGION_WIDTH = 64;
export const RASTER_GRID_MAX_REGION_HEIGHT = 64;
export const RASTER_GRID_MAX_CELLS = 4096;
export const RASTER_GRID_MAX_PATCHES = 16;
export const RASTER_GRID_MAX_LEGEND_ENTRIES = 32;
export const RASTER_GRID_MAX_STRING_LENGTH = 256;
export const RASTER_GRID_MAX_PREPARATION_BYTES = 32 * 1024 * 1024;
export const RASTER_GRID_MAX_COMPOSITE_BYTES = 32 * 1024 * 1024;
export const RASTER_GRID_REPRESENTATION_VERSION = '1.0';

export const canvasSizeCatalog = Object.freeze({
  version: '1.0',
  command: {
    id: CANVAS_SIZE_COMMAND_ID,
    target: 'project',
    requiresRevision: true,
    request: {
      target: { projectId: 'string' },
      expectedRevision: 'integer >= 0',
      action: 'preview | execute (default execute)',
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

export const LAYER_STATE_COMMAND_ID = 'project.layer.state';
export const FRAME_TAG_COMMAND_ID = 'project.animation.frame-tag';
export const STATIC_PALETTE_COMMAND_ID = 'project.palette.declaration';
export const STATIC_LAYER_TREE_COMMAND_ID = 'project.layer.tree';
export const STATIC_STRUCTURE_MAX_PALETTE_ENTRIES = 32;
export const STATIC_STRUCTURE_MAX_LAYERS = 16;
export const STATIC_STRUCTURE_MAX_FRAMES = 16;
export const STATIC_STRUCTURE_MAX_CELS = STATIC_STRUCTURE_MAX_LAYERS * STATIC_STRUCTURE_MAX_FRAMES;
export const STATIC_STRUCTURE_MAX_PREPARATION_BYTES = 32 * 1024 * 1024;
export const STATIC_STRUCTURE_SELECTION_ERROR_REASON = 'selection_in_progress';
export const STRUCTURE_REFINEMENT_COMMAND_ID = 'project.layer.structure.refine';
export const STRUCTURE_REFINEMENT_MAX_LAYERS = 16;
export const STRUCTURE_REFINEMENT_MAX_FRAMES = 16;
export const STRUCTURE_REFINEMENT_MAX_CELS = STRUCTURE_REFINEMENT_MAX_LAYERS * STRUCTURE_REFINEMENT_MAX_FRAMES;
export const STRUCTURE_REFINEMENT_MAX_MERGE_PAIRS = 16;
export const STRUCTURE_REFINEMENT_MAX_PREPARATION_BYTES = 32 * 1024 * 1024;
export const STRUCTURE_REFINEMENT_MAX_STRING_LENGTH = 256;
export const CEL_UNLINK_COMMAND_ID = 'project.animation.cel.unlink';
export const ANIMATION_FRAME_COMMAND_ID = 'project.animation.frame';
export const ANIMATION_CEL_LINK_COMMAND_ID = 'project.animation.cel.link';
export const ANIMATION_REQUEST_STRING_MIN = 1;
export const ANIMATION_REQUEST_STRING_MAX = 256;
export const ANIMATION_MIN_LINK_MEMBERS = 2;
const ANIMATION_MIN_UNLINK_MEMBERS = 2;
export const ANIMATION_MAX_FRAMES = 16;
export const ANIMATION_MAX_LAYERS = 16;
export const ANIMATION_MAX_CELS = 256;
export const ANIMATION_MAX_LINK_MEMBERS = 16;
export const ANIMATION_FRAME_DURATION_MIN = 10;
export const ANIMATION_FRAME_DURATION_MAX = 2000;
export const ANIMATION_MAX_PREPARATION_BYTES = 32 * 1024 * 1024;
export const TRANSACTION_COMMAND_ID = 'project.transaction.execute';

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

// fallow-ignore-next-line unused-export -- Public transaction catalog consumed by editor tooling.
export const transactionCatalog = Object.freeze({
  id: TRANSACTION_COMMAND_ID,
  kind: 'command',
  target: 'project',
  requiresRevision: true,
  request: {
    profile: {
      oneOf: ['layer-and-tag', 'static-structure', 'structure-refinement', 'animation', 'raster-patch'],
      default: 'layer-and-tag',
    },
    target: { projectId: 'string' },
    expectedRevision: 'integer >= 0',
    provenance: {
      clientId: 'non-empty bounded string',
      sessionId: 'non-empty bounded string',
      runId: 'non-empty bounded string',
      operationId: 'non-empty bounded string',
    },
    children: {
      order: 'either',
      profiles: {
        'layer-and-tag': {
          exact: 2,
          oneOfEach: [LAYER_STATE_COMMAND_ID, FRAME_TAG_COMMAND_ID],
        },
        'static-structure': {
          exact: 2,
          oneOfEach: [STATIC_PALETTE_COMMAND_ID, STATIC_LAYER_TREE_COMMAND_ID],
          item: {
            palette: {
              command: STATIC_PALETTE_COMMAND_ID,
              input: {
                kind: 'palette.declaration',
                entries: [{ id: 'stable bounded string', color: 'six-digit hex color' }],
              },
            },
            layerTree: {
              command: STATIC_LAYER_TREE_COMMAND_ID,
              input: {
                kind: 'layer-tree.declaration',
                layers: [{
                  id: 'stable bounded string',
                  name: 'bounded non-empty string',
                  type: 'image | group',
                  parentId: 'null | existing group identity',
                  visible: 'boolean',
                  locked: 'boolean',
                  opacity: 'integer 0..255',
                  blendMode: 'supported blend mode',
                  continuous: 'optional boolean',
                }],
              },
            },
          },
        },
        'structure-refinement': {
          exact: 1,
          oneOf: [STRUCTURE_REFINEMENT_COMMAND_ID],
          item: {
            structure: {
              command: STRUCTURE_REFINEMENT_COMMAND_ID,
              input: {
                kind: 'structure.refine',
                layers: [{
                  id: 'stable bounded string',
                  name: 'bounded non-empty string',
                  type: 'image | group | existing text',
                  parentId: 'null | group identity',
                }],
                mergePairs: [{
                  sourceLayerId: 'existing image layer identity',
                  targetLayerId: 'existing image layer identity',
                }],
              },
            },
          },
        },
        animation: {
          exact: 1,
          oneOf: [ANIMATION_FRAME_COMMAND_ID, ANIMATION_CEL_LINK_COMMAND_ID, CEL_UNLINK_COMMAND_ID, FRAME_TAG_COMMAND_ID],
        },
        'raster-patch': {
          exact: 1,
          oneOf: [RASTER_PATCH_COMMAND_ID],
        },
      },
      item: {
        shape: { command: 'catalog child command ID', input: 'concrete discriminated input' },
        layerState: {
          command: LAYER_STATE_COMMAND_ID,
          input: {
            oneOf: [
              { kind: 'layer.visibility', layerId: 'string', visible: 'boolean' },
              { kind: 'layer.lock', layerId: 'string', locked: 'boolean' },
              { kind: 'layer.continuity', layerId: 'string', continuous: 'boolean' },
              {
                kind: 'layer.reorder',
                layerId: 'string',
                direction: 'optional up | down',
                targetLayerId: 'optional string',
                exactlyOne: ['direction', 'targetLayerId'],
              },
            ],
          },
        },
        frameTag: {
          command: FRAME_TAG_COMMAND_ID,
          input: {
            oneOf: [
              {
                kind: 'tag.create',
                name: 'string',
                color: 'string',
                startFrameIndex: 'integer',
                endFrameIndex: 'integer',
              },
              { kind: 'tag.rename', tagId: 'string', name: 'string' },
              { kind: 'tag.recolor', tagId: 'string', color: 'string' },
              {
                kind: 'tag.range',
                tagId: 'string',
                startFrameIndex: 'integer',
                endFrameIndex: 'integer',
              },
              { kind: 'tag.collapse', tagId: 'string', collapsed: 'boolean' },
              { kind: 'tag.remove-frame', tagId: 'string', frameIndex: 'integer' },
              { kind: 'tag.delete', tagId: 'string' },
            ],
          },
        },
        animationFrame: {
          command: ANIMATION_FRAME_COMMAND_ID,
          input: {
            oneOf: [
              { kind: 'frame.create', position: 'start | end | before | after', anchorFrameId: 'optional bounded non-empty string (1..256)', duration: 'integer 10..2000' },
              { kind: 'frame.duplicate', sourceFrameId: 'bounded non-empty string (1..256)', position: 'start | end | before | after', anchorFrameId: 'optional bounded non-empty string (1..256)' },
              { kind: 'frame.reorder', frameId: 'bounded non-empty string (1..256)', position: 'start | end | before | after', anchorFrameId: 'optional bounded non-empty string (1..256)' },
              { kind: 'frame.duration', frameId: 'bounded non-empty string (1..256)', duration: 'integer 10..2000' },
              { kind: 'frame.delete', frameId: 'bounded non-empty string (1..256)' },
            ],
          },
        },
        animationCelLink: {
          command: ANIMATION_CEL_LINK_COMMAND_ID,
          input: {
            kind: 'cel.link',
            layerId: 'bounded non-empty string (1..256)',
            members: {
              min: ANIMATION_MIN_LINK_MEMBERS,
              max: ANIMATION_MAX_LINK_MEMBERS,
              item: {
                key: 'bounded non-empty string (1..256)',
                celId: 'bounded non-empty string (1..256)',
                layerId: 'bounded non-empty string (1..256)',
                frameId: 'bounded non-empty string (1..256)',
              },
            },
          },
        },
        animationCelUnlink: {
          command: CEL_UNLINK_COMMAND_ID,
          input: {
            kind: 'cel.unlink',
            layerId: 'bounded non-empty string (1..256)',
            frameId: 'bounded non-empty string (1..256)',
            celId: 'bounded non-empty string (1..256)',
            linkedCelId: 'bounded non-empty string (1..256)',
            linkGroup: {
              min: ANIMATION_MIN_UNLINK_MEMBERS,
              max: ANIMATION_MAX_LINK_MEMBERS,
              item: {
                key: 'bounded non-empty string (1..256)',
                celId: 'bounded non-empty string (1..256)',
                layerId: 'bounded non-empty string (1..256)',
                frameId: 'bounded non-empty string (1..256)',
                linkedCelId: 'bounded non-empty string (1..256)',
                linkType: 'hard',
              },
            },
          },
        },
        rasterPatch: {
          command: RASTER_PATCH_COMMAND_ID,
          input: {
            kind: 'raster.patch',
            layerId: 'bounded non-empty string (1..256)',
            frameId: 'bounded non-empty string (1..256)',
            celId: 'captured cel identity',
            region: {
              x: 'integer',
              y: 'integer',
              width: 'integer 1..64',
              height: 'integer 1..64',
            },
            digest: '64-character lowercase SHA-256 digest',
            legend: {
              maxEntries: RASTER_GRID_MAX_LEGEND_ENTRIES,
              item: {
                symbol: 'one-character non-transparent symbol',
                resolution: 'exactly one of paletteEntryId or color',
                paletteEntryId: 'optional stable existing palette identity',
                paletteIndex: 'optional exact 1-based palette index',
                color: 'optional non-transparent #RRGGBBAA with exact palette RGB',
              },
            },
            patches: {
              max: RASTER_GRID_MAX_PATCHES,
              maxCells: RASTER_GRID_MAX_CELLS,
              item: {
                x: 'integer absolute origin',
                y: 'integer absolute origin',
                width: 'integer 1..64',
                height: 'integer 1..64',
                rows: 'equal-width non-empty symbol rows',
              },
            },
          },
        },
      },
    },
  },
  result: {
    type: TRANSACTION_COMMAND_ID,
    target: { projectId: 'string' },
    fromRevision: 'integer >= 0',
    revision: 'integer >= 0',
    event: {
      type: 'project-change',
      target: 'string',
      fromRevision: 'integer >= 0',
      toRevision: 'integer >= 0',
      transactionId: 'string',
      domains: ['palette', 'layer-state', 'timeline', 'raster-content'] as const,
    },
    compositeEquality: {
      type: 'project.composite-equality',
      allEqual: true,
      frameCount: 'integer >= 1',
      frames: [{
        frameId: 'string',
        equal: true,
        beforeDigest: 'deterministic bounded digest',
        afterDigest: 'deterministic bounded digest',
      }],
    },
    rasterPatch: {
      type: 'project.raster.patch',
      changedBounds: {
        x: 'integer',
        y: 'integer',
        width: 'positive integer',
        height: 'positive integer',
      },
    },
    provenance: {
      source: 'automation',
      transactionId: 'string',
      clientId: 'string',
      sessionId: 'string',
      runId: 'string',
      operationId: 'string',
      target: { projectId: 'string' },
      fromRevision: 'integer >= 0',
      toRevision: 'integer >= 0',
      transitionCount: 'integer >= 0',
      transitionsTruncated: 'boolean; true when older transitions are outside the bounded window',
      transitions: [{
        phase: 'execute | undo | redo',
        fromRevision: 'integer >= 0',
        toRevision: 'integer >= 0',
      }],
      children: [{
        commandId: 'project.layer.state | project.layer.structure.refine | project.animation.frame-tag | project.palette.declaration | project.layer.tree | project.animation.frame | project.animation.cel.link | project.animation.cel.unlink | project.raster.patch',
        operation: 'concrete child kind',
        domains: ['palette | layer-state | timeline | raster-content'],
      }],
    },
  },
  limits: {
    children: {
      order: 'either',
      profiles: {
        'layer-and-tag': {
          exact: 2,
          oneOfEach: [LAYER_STATE_COMMAND_ID, FRAME_TAG_COMMAND_ID],
        },
        'static-structure': {
          exact: 2,
          oneOfEach: [STATIC_PALETTE_COMMAND_ID, STATIC_LAYER_TREE_COMMAND_ID],
        },
        'structure-refinement': {
          exact: 1,
          oneOf: [STRUCTURE_REFINEMENT_COMMAND_ID],
        },
        animation: {
          exact: 1,
          oneOf: [ANIMATION_FRAME_COMMAND_ID, ANIMATION_CEL_LINK_COMMAND_ID, CEL_UNLINK_COMMAND_ID, FRAME_TAG_COMMAND_ID],
        },
        'raster-patch': {
          exact: 1,
          oneOf: [RASTER_PATCH_COMMAND_ID],
        },
      },
    },
    provenance: {
      stringLength: {
        min: 1,
        max: TRANSACTION_PROVENANCE_MAX_STRING_LENGTH,
      },
      transitions: { max: TRANSACTION_PROVENANCE_MAX_TRANSITIONS },
    },
    profiles: {
      'layer-and-tag': {},
      'static-structure': {
        paletteEntries: { max: STATIC_STRUCTURE_MAX_PALETTE_ENTRIES },
        layers: { max: STATIC_STRUCTURE_MAX_LAYERS },
        frames: { max: STATIC_STRUCTURE_MAX_FRAMES },
        cels: { max: STATIC_STRUCTURE_MAX_CELS },
        preparationBytes: { max: STATIC_STRUCTURE_MAX_PREPARATION_BYTES },
      },
      'structure-refinement': {
        layers: { max: STRUCTURE_REFINEMENT_MAX_LAYERS },
        frames: { max: STRUCTURE_REFINEMENT_MAX_FRAMES },
        cels: { max: STRUCTURE_REFINEMENT_MAX_CELS },
        mergePairs: { max: STRUCTURE_REFINEMENT_MAX_MERGE_PAIRS },
        requestString: {
          min: 1,
          max: STRUCTURE_REFINEMENT_MAX_STRING_LENGTH,
        },
        preparationBytes: { max: STRUCTURE_REFINEMENT_MAX_PREPARATION_BYTES },
      },
      animation: {
        frames: { max: ANIMATION_MAX_FRAMES },
        layers: { max: ANIMATION_MAX_LAYERS },
        cels: { max: ANIMATION_MAX_CELS },
        duration: { min: ANIMATION_FRAME_DURATION_MIN, max: ANIMATION_FRAME_DURATION_MAX },
        linkMembers: { min: ANIMATION_MIN_LINK_MEMBERS, max: ANIMATION_MAX_LINK_MEMBERS },
        unlinkGroup: { min: ANIMATION_MIN_UNLINK_MEMBERS, max: ANIMATION_MAX_LINK_MEMBERS },
        requestString: { min: ANIMATION_REQUEST_STRING_MIN, max: ANIMATION_REQUEST_STRING_MAX },
        preparationBytes: { max: ANIMATION_MAX_PREPARATION_BYTES },
      },
      'raster-patch': {
        patches: { max: RASTER_GRID_MAX_PATCHES },
        patchCells: { max: RASTER_GRID_MAX_CELLS },
        legendEntries: { max: RASTER_GRID_MAX_LEGEND_ENTRIES },
        region: {
          maxWidth: RASTER_GRID_MAX_REGION_WIDTH,
          maxHeight: RASTER_GRID_MAX_REGION_HEIGHT,
          maxCells: RASTER_GRID_MAX_CELLS,
        },
        stringLength: { min: 1, max: RASTER_GRID_MAX_STRING_LENGTH },
        preparationBytes: { max: RASTER_GRID_MAX_PREPARATION_BYTES },
      },
    },
  },
  profiles: {
    'layer-and-tag': {
      children: {
        exact: 2,
        oneOfEach: [LAYER_STATE_COMMAND_ID, FRAME_TAG_COMMAND_ID],
      },
      affectedDomains: ['layer-state', 'timeline'],
    },
    'static-structure': {
      children: {
        exact: 2,
        oneOfEach: [STATIC_PALETTE_COMMAND_ID, STATIC_LAYER_TREE_COMMAND_ID],
      },
      palette: {
        kind: 'palette.declaration',
        entries: { id: 'stable bounded string', color: 'six-digit hex color' },
        maxEntries: STATIC_STRUCTURE_MAX_PALETTE_ENTRIES,
      },
      layerTree: {
        kind: 'layer-tree.declaration',
        layers: {
          id: 'stable bounded string',
          name: 'bounded non-empty string',
          type: 'image | group',
          parentId: 'null | existing group identity',
          visible: 'boolean',
          locked: 'boolean',
          opacity: 'integer 0..255',
          blendMode: 'normal | multiply | screen | overlay | darken | lighten',
          continuous: 'optional boolean',
        },
        maxLayers: STATIC_STRUCTURE_MAX_LAYERS,
        parentOrder: 'parent precedes child; acyclic',
      },
      affectedDomains: ['palette', 'layer-state'],
    },
    'structure-refinement': {
      children: {
        exact: 1,
        oneOf: [STRUCTURE_REFINEMENT_COMMAND_ID],
      },
      structure: {
        kind: 'structure.refine',
        layers: {
          id: 'stable bounded string',
          name: 'bounded non-empty string',
          type: 'image | group | existing text',
          parentId: 'null | group identity',
        },
        maxLayers: STRUCTURE_REFINEMENT_MAX_LAYERS,
        mergePairs: {
          sourceLayerId: 'existing image layer identity',
          targetLayerId: 'existing image layer identity',
          max: STRUCTURE_REFINEMENT_MAX_MERGE_PAIRS,
          nonOverlapping: true,
        },
        parentOrder: 'parent precedes child; acyclic',
      },
      preflight: {
        renderer: 'createArtworkCompositionPlan + drawArtworkComposition',
        frames: 'every frame',
        equality: 'exact rgba8 bytes',
      },
      compatibility: {
        text: 'existing text layers retain exact metadata and cels; no new, deleted, or merged text',
        reference: 'unsupported',
      },
      affectedDomains: ['layer-state', 'raster-content'],
    },
    animation: {
      children: {
        exact: 1,
        oneOf: [ANIMATION_FRAME_COMMAND_ID, ANIMATION_CEL_LINK_COMMAND_ID, CEL_UNLINK_COMMAND_ID, FRAME_TAG_COMMAND_ID],
      },
      frame: {
        operations: ['create', 'duplicate', 'reorder', 'duration', 'delete'],
        maxFrames: ANIMATION_MAX_FRAMES,
        maxLayers: ANIMATION_MAX_LAYERS,
        maxCels: ANIMATION_MAX_CELS,
        duration: { min: ANIMATION_FRAME_DURATION_MIN, max: ANIMATION_FRAME_DURATION_MAX },
      },
      celLink: {
        minMembers: ANIMATION_MIN_LINK_MEMBERS,
        maxMembers: ANIMATION_MAX_LINK_MEMBERS,
        member: 'exact observed key, cel, layer, and frame identity',
      },
      celUnlink: {
        minMembers: ANIMATION_MIN_UNLINK_MEMBERS,
        maxMembers: ANIMATION_MAX_LINK_MEMBERS,
      },
      requestString: {
        min: ANIMATION_REQUEST_STRING_MIN,
        max: ANIMATION_REQUEST_STRING_MAX,
      },
      preparationBytes: { max: ANIMATION_MAX_PREPARATION_BYTES },
      affectedDomains: ['timeline', 'raster-content'],
    },
    'raster-patch': {
      children: {
        exact: 1,
        oneOf: [RASTER_PATCH_COMMAND_ID],
      },
      patch: {
        kind: 'raster.patch',
        region: {
          maxWidth: RASTER_GRID_MAX_REGION_WIDTH,
          maxHeight: RASTER_GRID_MAX_REGION_HEIGHT,
          maxCells: RASTER_GRID_MAX_CELLS,
        },
        maxPatches: RASTER_GRID_MAX_PATCHES,
        maxPatchCells: RASTER_GRID_MAX_CELLS,
        maxLegendEntries: RASTER_GRID_MAX_LEGEND_ENTRIES,
        digest: '64-character lowercase SHA-256 digest',
        palette: 'existing exact identity or exact RGB match; no growth or approximation',
      },
      preflight: 're-observe matching layer region and prepare complete before-state and after-state snapshots',
      affectedDomains: ['raster-content'],
    },
  },
  affectedDomains: ['palette', 'layer-state', 'timeline', 'raster-content'] as const,
  availability: {
    profiles: {
      'layer-and-tag': {
        guidedDrawing: {
          layerState: 'unsupported',
          frameTag: 'supported',
        },
      },
      'static-structure': {
        guidedDrawing: 'unsupported',
        selection: 'none | selected; floating and transforming are rejected',
      },
      'structure-refinement': {
        guidedDrawing: 'unsupported',
        selection: 'none | selected; floating and transforming are rejected',
        layers: 'image, group, and existing text; new identities are groups',
        text: 'existing text layers are declared with exact metadata and cels; no new or removed text',
        reference: 'unsupported',
      },
      animation: {
        guidedDrawing: 'unsupported',
        selection: 'none | selected; floating and transforming are rejected',
        layers: 'supported non-reference layers only',
      },
      'raster-patch': {
        guidedDrawing: 'unsupported',
        selection: 'none | selected; floating and transforming are rejected',
        source: 'existing image-layer cel only; linked or shared payloads are unsupported',
        palette: 'existing entries only; exact index and RGB matching',
      },
    },
  },
  revision: 'expectedRevision must equal the captured project revision; execute advances it once',
  undo: 'one-session-history-entry',
  errors: [
    'invalid_request',
    'target_not_found',
    'revision_conflict',
    'invalid_state',
    'bounds_exceeded',
    'limit_exceeded',
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
    target: { projectId: 'bounded non-empty string (1..256)' },
    expectedRevision: 'integer >= 0',
    layerId: 'bounded non-empty string (1..256)',
    frameId: 'bounded non-empty string (1..256)',
    celId: 'bounded non-empty string (1..256)',
    linkedCelId: 'bounded non-empty string (1..256)',
    linkGroup: {
      min: ANIMATION_MIN_UNLINK_MEMBERS,
      max: ANIMATION_MAX_LINK_MEMBERS,
      item: {
        key: 'bounded non-empty string (1..256)',
        celId: 'bounded non-empty string (1..256)',
        layerId: 'bounded non-empty string (1..256)',
        frameId: 'bounded non-empty string (1..256)',
        linkedCelId: 'bounded non-empty string (1..256)',
        linkType: 'hard',
      },
    },
  },
  affectedDomains: ['timeline', 'raster-content'] as const,
  availability: { guidedDrawing: 'unsupported' },
  undo: 'one-session-history-entry',
  errors: [
    'invalid_request',
    'target_not_found',
    'revision_conflict',
    'invalid_state',
    'bounds_exceeded',
    'unsupported',
    'internal',
  ] as const,
});

// fallow-ignore-next-line unused-export -- Public creation operation is negotiated by adapters.
export const projectCreateCatalog = Object.freeze({
  id: 'project.create',
  kind: 'creation-command',
  target: 'none',
  requiresRevision: false,
  request: {
    kind: 'blank | safe-copy',
    blank: {
      name: 'bounded non-empty string',
      width: 'integer 16..64',
      height: 'integer 16..64',
    },
    safeCopy: {
      name: 'optional bounded non-empty string; default Copy of source name',
      source: {
        target: { projectId: 'string' },
        expectedRevision: 'integer >= 0',
      },
    },
  },
  result: {
    type: 'project.create',
    target: { projectId: 'fresh string' },
    revision: 0,
    kind: 'blank | safe-copy',
  },
  limits: {
    name: { max: PROJECT_OBSERVATION_LIMITS.maxStringLength },
    dimension: { min: 16, max: 64 },
  },
  revision: 'safe-copy source expectedRevision must equal one captured source revision; new target starts at zero',
  affectedDomains: [] as const,
  availability: { guidedDrawing: 'supported' },
  undo: 'none',
  errors: [
    'invalid_request',
    'target_not_found',
    'revision_conflict',
    'bounds_exceeded',
    'invalid_state',
    'limit_exceeded',
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

export const rasterObservationCatalog = Object.freeze({
  id: RASTER_OBSERVATION_ID,
  kind: 'observation',
  target: 'project',
  requiresRevision: true,
  request: {
    target: { projectId: 'bounded non-empty string (1..256)' },
    expectedRevision: 'integer >= 0',
    source: {
      layer: {
        kind: 'layer',
        layerId: 'bounded non-empty string (1..256)',
        frameId: 'bounded non-empty string (1..256)',
        celId: 'optional captured cel identity',
      },
      composite: {
        kind: 'composite',
        frameId: 'bounded non-empty string (1..256)',
      },
    },
    region: {
      x: 'integer',
      y: 'integer',
      width: `integer 1..${RASTER_GRID_MAX_REGION_WIDTH}`,
      height: `integer 1..${RASTER_GRID_MAX_REGION_HEIGHT}`,
    },
  },
  result: {
    type: 'project.raster.observation',
    target: { projectId: 'string' },
    revision: 'integer >= 0',
    source: 'layer identity with cel or composite frame identity',
    sourceKind: 'layer | composite',
    editable: 'true for layer; false for composite',
    origin: { x: 'integer', y: 'integer' },
    extent: {
      width: `integer 1..${RASTER_GRID_MAX_REGION_WIDTH}`,
      height: `integer 1..${RASTER_GRID_MAX_REGION_HEIGHT}`,
    },
    rows: 'equal-width Symbol Grid rows; . is transparent',
    legend: 'deterministic non-transparent symbol/color/palette identity entries',
    digest: '64-character lowercase SHA-256 digest',
  },
  limits: {
    region: {
      maxWidth: RASTER_GRID_MAX_REGION_WIDTH,
      maxHeight: RASTER_GRID_MAX_REGION_HEIGHT,
      maxCells: RASTER_GRID_MAX_CELLS,
    },
    legend: { maxEntries: RASTER_GRID_MAX_LEGEND_ENTRIES },
    stringLength: { min: 1, max: RASTER_GRID_MAX_STRING_LENGTH },
    compositeBytes: { max: RASTER_GRID_MAX_COMPOSITE_BYTES },
  },
  affectedDomains: ['raster-content'] as const,
  availability: {
    guidedDrawing: 'unsupported',
    selection: 'none | selected; floating and transforming are rejected',
    layer: 'existing image-layer cel only; linked or shared payloads are unsupported',
    composite: 'canonical compositor; read-only and never patchable',
  },
  privacy: 'bounded Symbol Grid metadata and digest only; no canvas, store, command, or raw project bytes',
  errors: [
    'invalid_request',
    'target_not_found',
    'revision_conflict',
    'invalid_state',
    'bounds_exceeded',
    'limit_exceeded',
    'unsupported',
    'internal',
  ] as const,
});

export const rasterPatchCatalog = Object.freeze({
  id: RASTER_PATCH_COMMAND_ID,
  kind: 'command',
  target: 'project',
  requiresRevision: true,
  request: {
    kind: 'raster.patch',
    target: { projectId: 'bounded non-empty string (1..256)' },
    expectedRevision: 'integer >= 0',
    layerId: 'bounded non-empty string (1..256)',
    frameId: 'bounded non-empty string (1..256)',
    celId: 'captured cel identity',
    region: {
      x: 'integer',
      y: 'integer',
      width: `integer 1..${RASTER_GRID_MAX_REGION_WIDTH}`,
      height: `integer 1..${RASTER_GRID_MAX_REGION_HEIGHT}`,
    },
    digest: '64-character lowercase SHA-256 digest',
    legend: {
      maxEntries: RASTER_GRID_MAX_LEGEND_ENTRIES,
      item: {
        symbol: 'one-character non-transparent symbol',
        resolution: 'exactly one of paletteEntryId or color',
        paletteEntryId: 'optional stable existing palette identity',
        paletteIndex: 'optional exact 1-based palette index',
        color: 'optional non-transparent #RRGGBBAA with exact palette RGB',
      },
    },
    patches: {
      max: RASTER_GRID_MAX_PATCHES,
      maxCells: RASTER_GRID_MAX_CELLS,
      item: {
        x: 'integer absolute origin',
        y: 'integer absolute origin',
        width: `integer 1..${RASTER_GRID_MAX_REGION_WIDTH}`,
        height: `integer 1..${RASTER_GRID_MAX_REGION_HEIGHT}`,
        rows: 'equal-width non-empty symbol rows',
      },
    },
  },
  result: {
    type: 'project.raster.patch',
    changedBounds: {
      x: 'integer',
      y: 'integer',
      width: 'positive integer',
      height: 'positive integer',
    },
  },
  limits: {
    region: {
      maxWidth: RASTER_GRID_MAX_REGION_WIDTH,
      maxHeight: RASTER_GRID_MAX_REGION_HEIGHT,
      maxCells: RASTER_GRID_MAX_CELLS,
    },
    patches: { max: RASTER_GRID_MAX_PATCHES, maxCells: RASTER_GRID_MAX_CELLS },
    legend: { maxEntries: RASTER_GRID_MAX_LEGEND_ENTRIES },
    stringLength: { min: 1, max: RASTER_GRID_MAX_STRING_LENGTH },
    preparationBytes: { max: RASTER_GRID_MAX_PREPARATION_BYTES },
  },
  affectedDomains: ['raster-content'] as const,
  availability: {
    guidedDrawing: 'unsupported',
    selection: 'none | selected; floating and transforming are rejected',
    layer: 'existing image-layer cel only; linked or shared payloads are unsupported',
    palette: 'existing entries only; exact index and RGB matching; no growth or approximation',
  },
  undo: 'one-session-history-entry',
  privacy: 'no artwork bytes in result, provenance, events, or errors',
  errors: [
    'invalid_request',
    'target_not_found',
    'revision_conflict',
    'invalid_state',
    'bounds_exceeded',
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
  limits: PROJECT_OBSERVATION_LIMITS,
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
  limits: { maxBytes: RENDER_OBSERVATION_MAX_BYTES },
  privacy: 'canonical artwork bytes only; no canvas or browser chrome',
});

const automationOperationCatalog = Object.freeze([
  {
    id: 'catalog.negotiate',
    kind: 'negotiation',
    target: 'none',
    requiresRevision: false,
    request: { version: 'major.minor' },
    result: {
      type: 'catalog.negotiation',
      requestedVersion: 'major.minor',
      version: 'major.minor',
      catalog: 'cloned editor catalog',
    },
    limits: {},
    revision: 'not applicable',
    errors: ['invalid_request', 'unsupported', 'internal'] as const,
  },
  {
    id: 'project.create',
    kind: projectCreateCatalog.kind,
    target: projectCreateCatalog.target,
    requiresRevision: projectCreateCatalog.requiresRevision,
    request: projectCreateCatalog.request,
    result: projectCreateCatalog.result,
    limits: projectCreateCatalog.limits,
    revision: projectCreateCatalog.revision,
    errors: projectCreateCatalog.errors,
  },
  {
    id: 'project.target',
    kind: 'target-observation',
    target: 'project',
    requiresRevision: false,
    request: { target: { projectId: 'string' } },
    result: {
      type: 'project.target',
      target: { projectId: 'string' },
      revision: 'integer >= 0',
    },
    limits: { maxStringLength: PROJECT_OBSERVATION_LIMITS.maxStringLength },
    revision: 'captures the current project revision for the explicit target',
    errors: ['invalid_request', 'target_not_found', 'unsupported', 'internal'] as const,
  },
  {
    id: PROJECT_OBSERVATION_ID,
    kind: 'observation',
    target: 'project',
    requiresRevision: true,
    request: { target: { projectId: 'string' }, expectedRevision: 'integer >= 0' },
    result: {
      type: 'project.observation',
      ...projectObservationCatalog.fields,
    },
    limits: projectObservationCatalog.limits,
    revision: 'expectedRevision must equal the captured project revision; result reports that revision',
    errors: [
      'invalid_request',
      'target_not_found',
      'revision_conflict',
      'limit_exceeded',
      'unsupported',
      'internal',
    ] as const,
  },
  {
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
      type: 'render.observation',
      target: { projectId: 'string' },
      revision: 'integer >= 0',
      frameId: 'string',
      ...renderObservationCatalog.result,
    },
    limits: renderObservationCatalog.limits,
    revision: 'expectedRevision must equal the captured project revision; result reports that revision',
    errors: [
      'invalid_request',
      'target_not_found',
      'revision_conflict',
      'limit_exceeded',
      'invalid_state',
      'unsupported',
      'internal',
    ] as const,
  },
  {
    id: RASTER_OBSERVATION_ID,
    kind: rasterObservationCatalog.kind,
    target: rasterObservationCatalog.target,
    requiresRevision: rasterObservationCatalog.requiresRevision,
    request: rasterObservationCatalog.request,
    result: rasterObservationCatalog.result,
    limits: rasterObservationCatalog.limits,
    affectedDomains: rasterObservationCatalog.affectedDomains,
    availability: rasterObservationCatalog.availability,
    privacy: rasterObservationCatalog.privacy,
    revision: 'expectedRevision must equal the captured project revision; result reports that revision',
    errors: rasterObservationCatalog.errors,
  },
  {
    id: CANVAS_SIZE_COMMAND_ID,
    kind: 'command',
    target: 'project',
    requiresRevision: true,
    request: canvasSizeCatalog.command.request,
    result: {
      preview: {
        type: 'project.canvas.resize.preview',
        preview: 'Canvas Size preview',
      },
      execute: {
        type: 'project.canvas.resize',
        target: { projectId: 'string' },
        revision: 'integer >= 0',
        event: 'project-change event',
      },
    },
    limits: canvasSizeCatalog.command.limits,
    revision: 'expectedRevision must equal the captured project revision; execute advances it monotonically and preview does not',
    errors: canvasSizeCatalog.command.errors,
  },
  {
    id: TRANSACTION_COMMAND_ID,
    kind: 'command',
    target: 'project',
    requiresRevision: true,
    request: transactionCatalog.request,
    result: transactionCatalog.result,
    limits: transactionCatalog.limits,
    revision: transactionCatalog.revision,
    undo: transactionCatalog.undo,
    availability: transactionCatalog.availability,
    errors: transactionCatalog.errors,
  },
  {
    id: 'project.history.undo',
    kind: 'history-command',
    target: 'project',
    requiresRevision: true,
    request: { target: { projectId: 'string' }, expectedRevision: 'integer >= 0' },
    result: {
      type: 'project.history.undo',
      target: { projectId: 'string' },
      revision: 'integer >= 0',
      event: 'project-change event',
    },
    limits: { maxHistoryEntries: PROJECT_OBSERVATION_LIMITS.maxHistoryEntries },
    revision: 'expectedRevision must equal the captured project revision; successful undo returns its resulting revision',
    errors: [
      'invalid_request',
      'target_not_found',
      'revision_conflict',
      'invalid_state',
      'unsupported',
      'internal',
    ] as const,
  },
  {
    id: 'project.history.redo',
    kind: 'history-command',
    target: 'project',
    requiresRevision: true,
    request: { target: { projectId: 'string' }, expectedRevision: 'integer >= 0' },
    result: {
      type: 'project.history.redo',
      target: { projectId: 'string' },
      revision: 'integer >= 0',
      event: 'project-change event',
    },
    limits: { maxHistoryEntries: PROJECT_OBSERVATION_LIMITS.maxHistoryEntries },
    revision: 'expectedRevision must equal the captured project revision; successful redo returns its resulting revision',
    errors: [
      'invalid_request',
      'target_not_found',
      'revision_conflict',
      'invalid_state',
      'unsupported',
      'internal',
    ] as const,
  },
  {
    id: 'project.save',
    kind: 'persistence-command',
    target: 'project',
    requiresRevision: true,
    request: { target: { projectId: 'string' }, expectedRevision: 'integer >= 0' },
    result: {
      type: 'project.save',
      target: { projectId: 'string' },
      revision: 'integer >= 0',
      saveSafety: 'project.save-safety observation',
    },
    limits: {},
    revision: 'expectedRevision must equal the captured project revision; success reports the revision observed by save-safety',
    errors: [
      'invalid_request',
      'target_not_found',
      'revision_conflict',
      'unsupported',
      'internal',
    ] as const,
  },
  {
    id: 'project.reload',
    kind: 'persistence-command',
    target: 'project',
    requiresRevision: true,
    request: { target: { projectId: 'string' }, expectedRevision: 'integer >= 0' },
    result: {
      type: 'project.reload',
      target: { projectId: 'string' },
      revision: 'integer >= 0; preserves expectedRevision',
      observation: 'project.observation',
    },
    limits: {},
    revision: 'expectedRevision must equal the captured project revision; successful reload preserves that revision',
    preconditions: {
      exactSave: {
        operation: 'project.save',
        target: 'same captured ProjectContext and project ID',
        revision: 'same expectedRevision',
        saveSafety: {
          status: 'saved',
          persistedRevision: 'same expectedRevision',
        },
      },
    },
    errors: [
      'invalid_request',
      'target_not_found',
      'revision_conflict',
      'invalid_state',
      'unsupported',
      'limit_exceeded',
      'internal',
    ] as const,
  },
] as const);

export const editorCatalog = Object.freeze({
  version: '1.0',
  limits: PROJECT_OBSERVATION_LIMITS,
  operations: automationOperationCatalog,
  observations: Object.freeze([
    projectSaveSafetyCatalog,
    projectObservationCatalog,
    renderObservationCatalog,
    rasterObservationCatalog,
  ]),
  commands: Object.freeze([
    projectCreateCatalog,
    canvasSizeCatalog.command,
    transactionCatalog,
    layerStateCatalog,
    frameTagCatalog,
    {
      id: STATIC_PALETTE_COMMAND_ID,
      target: 'project',
      requiresRevision: true,
      operation: 'palette.declaration; supported only in static-structure transaction profile',
      affectedDomains: ['palette'] as const,
      availability: { guidedDrawing: 'unsupported' },
      undo: 'one-session-history-entry',
      errors: transactionCatalog.errors,
    },
    {
      id: STATIC_LAYER_TREE_COMMAND_ID,
      target: 'project',
      requiresRevision: true,
      operation: 'layer-tree.declaration; supported only in static-structure transaction profile',
      affectedDomains: ['layer-state'] as const,
      availability: { guidedDrawing: 'unsupported' },
      undo: 'one-session-history-entry',
      errors: transactionCatalog.errors,
    },
    {
      id: STRUCTURE_REFINEMENT_COMMAND_ID,
      target: 'project',
      requiresRevision: true,
      operation: 'structure.refine; supported only in structure-refinement transaction profile',
      affectedDomains: ['layer-state', 'raster-content'] as const,
      availability: {
        guidedDrawing: 'unsupported',
        selection: 'floating and transforming rejected',
        compatibility: 'existing text layers may move or group only when composites remain equal; references unsupported',
      },
      undo: 'one-session-history-entry',
      errors: transactionCatalog.errors,
    },
    celUnlinkCatalog,
    {
      id: ANIMATION_FRAME_COMMAND_ID,
      target: 'project',
      requiresRevision: true,
      operation: 'frame.create | frame.duplicate | frame.reorder | frame.duration | frame.delete; supported only in animation transaction profile',
      affectedDomains: ['timeline', 'raster-content'] as const,
      availability: { guidedDrawing: 'unsupported', selection: 'floating and transforming rejected' },
      undo: 'one-session-history-entry',
      errors: transactionCatalog.errors,
    },
    {
      id: ANIMATION_CEL_LINK_COMMAND_ID,
      target: 'project',
      requiresRevision: true,
      operation: 'cel.link; supported only in animation transaction profile',
      affectedDomains: ['timeline', 'raster-content'] as const,
      availability: { guidedDrawing: 'unsupported', selection: 'floating and transforming rejected' },
      undo: 'one-session-history-entry',
      errors: transactionCatalog.errors,
    },
    rasterFillCatalog,
    rasterGradientCatalog,
    rasterPatchCatalog,
  ]),
});
