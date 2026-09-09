import {
  transactionCatalog,
  LAYER_STATE_COMMAND_ID,
  FRAME_TAG_COMMAND_ID,
  STATIC_PALETTE_COMMAND_ID,
  STATIC_LAYER_TREE_COMMAND_ID,
  STRUCTURE_REFINEMENT_COMMAND_ID,
  ANIMATION_FRAME_COMMAND_ID,
  ANIMATION_CEL_LINK_COMMAND_ID,
  CEL_UNLINK_COMMAND_ID,
  RASTER_PATCH_COMMAND_ID,
  ANIMATION_MAX_LINK_MEMBERS,
  ANIMATION_MIN_LINK_MEMBERS,
  ANIMATION_FRAME_DURATION_MIN,
  ANIMATION_FRAME_DURATION_MAX,
  STATIC_STRUCTURE_MAX_PALETTE_ENTRIES,
  STATIC_STRUCTURE_MAX_LAYERS,
  STRUCTURE_REFINEMENT_MAX_LAYERS,
  STRUCTURE_REFINEMENT_MAX_MERGE_PAIRS,
  RASTER_GRID_MAX_PATCHES,
  RASTER_GRID_MAX_LEGEND_ENTRIES,
  RASTER_GRID_MAX_REGION_WIDTH,
  RASTER_GRID_MAX_REGION_HEIGHT,
} from './catalog';
import {
  siteArray as array,
  siteEnum as enumeration,
  siteInteger as integer,
  siteObject as object,
  siteString as string,
  type SiteSchema,
} from './site-tool-schema';

const id = string();
const boolean: SiteSchema = { type: 'boolean' };
const color: SiteSchema = {
  type: 'string',
  pattern: '^#[0-9a-fA-F]{6}$',
  minLength: 7,
  maxLength: 7,
};
export const siteDigestSchema: SiteSchema = {
  type: 'string',
  pattern: '^[0-9a-f]{64}$',
  minLength: 64,
  maxLength: 64,
};
export const siteRegionSchema = object({
  x: integer(-2048, 2048),
  y: integer(-2048, 2048),
  width: integer(1, RASTER_GRID_MAX_REGION_WIDTH),
  height: integer(1, RASTER_GRID_MAX_REGION_HEIGHT),
});
const nullableId: SiteSchema = { oneOf: [id, { type: 'null' }] };
const variant = (kind: string, properties: Record<string, SiteSchema>, optional: string[] = []) =>
  object({ kind: { const: kind }, ...properties }, optional);
const member = { key: id, celId: id, layerId: id, frameId: id };
const position = { position: enumeration(['start', 'end', 'before', 'after']), anchorFrameId: id };
const duration = integer(ANIMATION_FRAME_DURATION_MIN, ANIMATION_FRAME_DURATION_MAX);

/** Identifiers, profile membership and limits stay owned by the editor catalogue. */
export const siteCommandInputSchemas: Readonly<Record<string, SiteSchema>> = {
  [LAYER_STATE_COMMAND_ID]: {
    oneOf: [
      variant('layer.visibility', { layerId: id, visible: boolean }),
      variant('layer.lock', { layerId: id, locked: boolean }),
      variant('layer.continuity', { layerId: id, continuous: boolean }),
      variant('layer.reorder', { layerId: id, direction: enumeration(['up', 'down']) }),
      variant('layer.reorder', { layerId: id, targetLayerId: id }),
    ],
  },
  [FRAME_TAG_COMMAND_ID]: {
    oneOf: [
      variant('tag.create', {
        name: id,
        color,
        startFrameIndex: integer(),
        endFrameIndex: integer(),
      }),
      variant('tag.rename', { tagId: id, name: id }),
      variant('tag.recolor', { tagId: id, color }),
      variant('tag.range', { tagId: id, startFrameIndex: integer(), endFrameIndex: integer() }),
      variant('tag.collapse', { tagId: id, collapsed: boolean }),
      variant('tag.remove-frame', { tagId: id, frameIndex: integer() }),
      variant('tag.delete', { tagId: id }),
    ],
  },
  [STATIC_PALETTE_COMMAND_ID]: variant('palette.declaration', {
    entries: array(object({ id, color }), STATIC_STRUCTURE_MAX_PALETTE_ENTRIES, 1),
  }),
  [STATIC_LAYER_TREE_COMMAND_ID]: variant('layer-tree.declaration', {
    layers: array(
      object(
        {
          id,
          name: id,
          type: enumeration(['image', 'group']),
          parentId: nullableId,
          visible: boolean,
          locked: boolean,
          opacity: integer(0, 255),
          blendMode: enumeration(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten']),
          continuous: boolean,
        },
        ['continuous']
      ),
      STATIC_STRUCTURE_MAX_LAYERS,
      1
    ),
  }),
  [STRUCTURE_REFINEMENT_COMMAND_ID]: variant(
    'structure.refine',
    {
      layers: array(
        object({
          id,
          name: id,
          type: enumeration(['image', 'group', 'text']),
          parentId: nullableId,
        }),
        STRUCTURE_REFINEMENT_MAX_LAYERS,
        1
      ),
      mergePairs: array(
        object({ sourceLayerId: id, targetLayerId: id }),
        STRUCTURE_REFINEMENT_MAX_MERGE_PAIRS
      ),
    },
    ['mergePairs']
  ),
  [ANIMATION_FRAME_COMMAND_ID]: {
    oneOf: [
      variant('frame.create', { ...position, duration }, ['anchorFrameId']),
      variant('frame.duplicate', { sourceFrameId: id, ...position }, ['anchorFrameId']),
      variant('frame.reorder', { frameId: id, ...position }, ['anchorFrameId']),
      variant('frame.duration', { frameId: id, duration }),
      variant('frame.delete', { frameId: id }),
    ],
  },
  [ANIMATION_CEL_LINK_COMMAND_ID]: variant('cel.link', {
    layerId: id,
    members: array(object(member), ANIMATION_MAX_LINK_MEMBERS, ANIMATION_MIN_LINK_MEMBERS),
  }),
  [CEL_UNLINK_COMMAND_ID]: variant('cel.unlink', {
    layerId: id,
    frameId: id,
    celId: id,
    linkedCelId: id,
    linkGroup: array(
      object({ ...member, linkedCelId: id, linkType: { const: 'hard' } }),
      ANIMATION_MAX_LINK_MEMBERS,
      ANIMATION_MIN_LINK_MEMBERS
    ),
  }),
  [RASTER_PATCH_COMMAND_ID]: variant('raster.patch', {
    layerId: id,
    frameId: id,
    celId: id,
    region: siteRegionSchema,
    digest: siteDigestSchema,
    legend: array(
      {
        oneOf: [
          object({ symbol: string(1), paletteEntryId: id, paletteIndex: integer(1, 255) }, [
            'paletteIndex',
          ]),
          object(
            {
              symbol: string(1),
              color: { type: 'string', pattern: '^#[0-9a-fA-F]{8}$', minLength: 9, maxLength: 9 },
              paletteIndex: integer(1, 255),
            },
            ['paletteIndex']
          ),
        ],
      },
      RASTER_GRID_MAX_LEGEND_ENTRIES
    ),
    patches: array(
      object({
        ...siteRegionSchema.properties,
        rows: array(string(RASTER_GRID_MAX_REGION_WIDTH), RASTER_GRID_MAX_REGION_HEIGHT, 1),
      }),
      RASTER_GRID_MAX_PATCHES,
      1
    ),
  }),
};

export const siteTransactionSchema: SiteSchema = {
  oneOf: Object.entries(transactionCatalog.profiles).map(([profile, definition]) => {
    const commands =
      'oneOfEach' in definition.children
        ? definition.children.oneOfEach
        : definition.children.oneOf;
    return object({
      profile: { const: profile },
      children: array(
        {
          oneOf: commands.map((command) =>
            object({ command: { const: command }, input: siteCommandInputSchemas[command] })
          ),
        },
        definition.children.exact,
        definition.children.exact
      ),
    });
  }),
};
