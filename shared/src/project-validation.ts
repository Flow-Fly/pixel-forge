import {
  isProjectByteArray,
  isSerializedProjectImageData,
  normalizeProjectFileImageData,
} from './project-data.js';
import { migrateProjectFileForLoad } from './project-migrations.js';
import {
  GUIDED_DRAWING_VERSION,
  type GuidedDrawingSessionFile,
  type LegacyProjectImageData,
  type ProjectCelFile,
  type ProjectFile,
  type ProjectFileInput,
  type ProjectFrameFile,
  type ProjectLayerFile,
} from './project.js';

const LAYER_TYPES: ReadonlySet<unknown> = new Set(['image', 'group', 'text', 'reference']);
const BLEND_MODES: ReadonlySet<unknown> = new Set([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
]);

export function decodeProjectFile(value: unknown): ProjectFile {
  assertProjectFileInput(value);
  const normalized = normalizeProjectFileImageData(value);
  const migrated = migrateProjectFileForLoad(normalized);
  assertProjectFile(migrated);
  return migrated;
}

export function assertProjectFile(value: unknown): asserts value is ProjectFile {
  assertProjectShape(value, isProjectImageData);
}

function assertProjectFileInput(value: unknown): asserts value is ProjectFileInput {
  assertProjectShape(value, isLegacyProjectImageData);
  if ('ephemeralPalette' in value) {
    assertOptionalStringArray(value.ephemeralPalette, 'ephemeral palette is invalid');
  }
}

function assertProjectShape(
  value: unknown,
  isImageData: (value: unknown) => value is LegacyProjectImageData
): asserts value is ProjectFileInput {
  assertImport(isRecord(value), 'project must be an object');
  assertImport(isNonEmptyString(value.version), 'version is missing');
  assertImport(value.name === undefined || typeof value.name === 'string', 'name is invalid');
  assertImport(isPositiveInteger(value.width), 'width must be a positive integer');
  assertImport(isPositiveInteger(value.height), 'height must be a positive integer');
  assertOptionalStringArray(value.palette, 'palette is invalid');
  assertImport(Array.isArray(value.layers) && value.layers.length > 0, 'a layer is required');
  assertImport(Array.isArray(value.frames) && value.frames.length > 0, 'a frame is required');
  assertImport(isRecord(value.animation), 'animation state is missing');

  const layers = value.layers as unknown[];
  const frames = value.frames as unknown[];
  layers.forEach((layer) => assertLayer(layer, isImageData));
  frames.forEach((frame) => assertFrame(frame, isImageData));

  const layerIds = layers.map((layer) => (layer as ProjectLayerFile).id);
  assertImport(new Set(layerIds).size === layerIds.length, 'layer ids must be unique');
  const frameIds = frames.map((frame) => (frame as ProjectFrameFile).id);
  assertImport(new Set(frameIds).size === frameIds.length, 'frame ids must be unique');
  const knownLayerIds = new Set(layerIds);
  assertImport(
    frames
      .flatMap((frame) => (frame as ProjectFrameFile).cels)
      .every((cel) => knownLayerIds.has(cel.layerId)),
    'a cel references an unknown layer'
  );

  assertImport(isPositiveNumber(value.animation.fps), 'animation fps must be positive');
  assertImport(
    isFrameIndex(value.animation.currentFrameIndex, frames.length),
    'animation frame is out of range'
  );
  assertTags(value.tags, frames.length);
  assertGuide(value.guidedDrawing);
}

function assertLayer(
  value: unknown,
  isImageData: (value: unknown) => value is LegacyProjectImageData
): asserts value is ProjectLayerFile {
  assertImport(isRecord(value), 'layer data is incomplete');
  assertImport(isNonEmptyString(value.id), 'layer ids must be strings');
  assertImport(typeof value.name === 'string', 'layer name is invalid');
  assertImport(value.type === undefined || LAYER_TYPES.has(value.type), 'layer type is invalid');
  assertImport(typeof value.visible === 'boolean', 'layer visibility is invalid');
  assertImport(isFiniteNumber(value.opacity), 'layer opacity is invalid');
  assertImport(
    value.blendMode === undefined || BLEND_MODES.has(value.blendMode),
    'layer blend mode is invalid'
  );
  assertImport(
    value.continuous === undefined || typeof value.continuous === 'boolean',
    'layer continuity is invalid'
  );
  assertImport(isImageData(value.data), 'layer image data is invalid');
  if (value.textData !== undefined) assertTextLayerData(value.textData);
  if (value.referenceData !== undefined) {
    assertReferenceData(value.referenceData, isImageData);
  }
}

function assertFrame(
  value: unknown,
  isImageData: (value: unknown) => value is LegacyProjectImageData
): asserts value is ProjectFrameFile {
  assertImport(isRecord(value), 'frame data is incomplete');
  assertImport(isNonEmptyString(value.id), 'frame data is incomplete');
  assertImport(isFiniteNumber(value.duration), 'frame duration is invalid');
  assertImport(Array.isArray(value.cels), 'frame data is incomplete');
  value.cels.forEach((cel) => assertCel(cel, isImageData));
}

function assertCel(
  value: unknown,
  isImageData: (value: unknown) => value is LegacyProjectImageData
): asserts value is ProjectCelFile {
  assertImport(isRecord(value), 'cel data is incomplete');
  assertImport(isNonEmptyString(value.layerId), 'cel layer id is invalid');
  assertImport(isImageData(value.data), 'cel image data is invalid');
  assertImport(
    value.indexData === undefined || isProjectByteArray(value.indexData),
    'cel index data is invalid'
  );
  assertImport(
    value.linkedCelId === undefined || typeof value.linkedCelId === 'string',
    'linked cel id is invalid'
  );
  assertImport(
    value.linkType === undefined || value.linkType === 'soft' || value.linkType === 'hard',
    'cel link type is invalid'
  );
  if (value.textCelData !== undefined) assertTextCelData(value.textCelData);
}

function assertReferenceData(
  value: unknown,
  isImageData: (value: unknown) => value is LegacyProjectImageData
): void {
  assertImport(isRecord(value), 'reference data is invalid');
  assertImport(isImageData(value.bytes), 'reference image data is invalid');
  assertImport(isNonEmptyString(value.mimeType), 'reference MIME type is invalid');
  assertImport(isFiniteNumber(value.x) && isFiniteNumber(value.y), 'reference position is invalid');
  assertImport(isFiniteNumber(value.scale), 'reference scale is invalid');
  assertImport(
    value.desaturate === undefined || typeof value.desaturate === 'boolean',
    'reference desaturation is invalid'
  );
  assertImport(
    value.position === undefined || value.position === 'above' || value.position === 'below',
    'reference placement is invalid'
  );
}

function assertTextLayerData(value: unknown): void {
  assertImport(isRecord(value), 'text layer data is invalid');
  assertImport(typeof value.font === 'string', 'text layer font is invalid');
  assertImport(typeof value.color === 'string', 'text layer color is invalid');
}

function assertTextCelData(value: unknown): void {
  assertImport(isRecord(value), 'text cel data is invalid');
  assertImport(typeof value.content === 'string', 'text cel content is invalid');
  assertImport(isFiniteNumber(value.x) && isFiniteNumber(value.y), 'text cel position is invalid');
}

function assertTags(value: unknown, frameCount: number): void {
  if (value === undefined) return;
  assertImport(Array.isArray(value), 'frame tags are invalid');
  for (const tag of value) {
    assertImport(isRecord(tag), 'frame tag is invalid');
    assertImport(isNonEmptyString(tag.id), 'frame tag id is invalid');
    assertImport(typeof tag.name === 'string', 'frame tag name is invalid');
    assertImport(typeof tag.color === 'string', 'frame tag color is invalid');
    assertImport(isFrameIndex(tag.startFrameIndex, frameCount), 'frame tag start is invalid');
    assertImport(isFrameIndex(tag.endFrameIndex, frameCount), 'frame tag end is invalid');
    assertImport(tag.startFrameIndex <= tag.endFrameIndex, 'frame tag range is invalid');
    assertImport(typeof tag.collapsed === 'boolean', 'frame tag state is invalid');
  }
}

function assertGuide(value: unknown): asserts value is GuidedDrawingSessionFile | undefined {
  if (value === undefined) return;
  assertImport(isRecord(value), 'guided drawing data is invalid');
  assertImport(value.version === GUIDED_DRAWING_VERSION, 'guided drawing version is unsupported');
  assertImport(isPositiveInteger(value.width), 'guided drawing width is invalid');
  assertImport(isPositiveInteger(value.height), 'guided drawing height is invalid');
  assertImport(isProjectByteArray(value.target), 'guided drawing target is invalid');
  assertImport(
    value.target.length === value.width * value.height,
    'guided drawing target size is invalid'
  );
  assertImport(
    value.guideColorCount === undefined || isPositiveInteger(value.guideColorCount),
    'guided color count is invalid'
  );
  assertGuideSettings(value.settings);
  assertImport(
    value.sourceName === undefined || typeof value.sourceName === 'string',
    'guided source name is invalid'
  );
  assertImport(isFiniteNumber(value.createdAt), 'guided creation time is invalid');
}

function assertGuideSettings(value: unknown): void {
  assertImport(isRecord(value), 'guided drawing settings are missing');
  assertImport(isPositiveInteger(value.longSide), 'guided long side is invalid');
  assertImport(
    value.paletteSource === 'generated' || value.paletteSource === 'restricted',
    'guided palette source is invalid'
  );
  assertImport(
    value.maxColors === undefined || isPositiveInteger(value.maxColors),
    'guided color limit is invalid'
  );
  assertOptionalStringArray(value.restrictedPalette, 'guided palette is invalid');
  assertImport(
    value.mapping === 'color' || value.mapping === 'luminance',
    'guided mapping is invalid'
  );
  assertImport(
    typeof value.simplifyIsolatedPixels === 'boolean',
    'guided simplification setting is invalid'
  );
}

function isProjectImageData(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function isLegacyProjectImageData(value: unknown): value is LegacyProjectImageData {
  if (isProjectImageData(value) || typeof value === 'string') return true;
  return isSerializedProjectImageData(value);
}

function assertOptionalStringArray(value: unknown, detail: string): void {
  assertImport(value === undefined || isStringArray(value), detail);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFrameIndex(value: unknown, frameCount: number): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < frameCount;
}

function assertImport(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`Invalid project file: ${detail}`);
}
