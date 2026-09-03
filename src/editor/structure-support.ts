import type { Cel, FrameTag } from '../types/animation';
import type { ProjectContext } from '../stores/project-context';
import type { ProjectPaletteSnapshot } from '../stores/palette/store';
import type { Layer } from '../types/layer';
import type { ProjectTarget } from './contracts';

export interface ProjectStructureSnapshot {
  readonly layers: readonly Layer[];
  readonly cels: ReadonlyMap<string, Cel>;
  readonly palette: ProjectPaletteSnapshot;
  readonly activeLayerId: string | null;
  readonly groupData: ReadonlyMap<string, Uint8Array>;
}

export function applyProjectStructureSnapshot(
  context: ProjectContext,
  snapshot: ProjectStructureSnapshot,
): void {
  context.project.applyStaticStructureState(
    snapshot.layers,
    new Map(snapshot.cels),
    snapshot.palette,
    snapshot.activeLayerId,
    snapshot.groupData,
  );
}

export function assertProjectSnapshot<T>(
  current: T,
  expected: T,
  equals: (current: T, expected: T) => boolean,
  mismatch: Error,
): void {
  if (!equals(current, expected)) throw mismatch;
}

export function validateProjectTargetAndRevision(
  context: ProjectContext,
  target: ProjectTarget,
  expectedRevision: number,
  targetNotFound: Error,
  invalidRevision: Error,
  revisionConflict: (currentRevision: number) => Error,
): void {
  if (context.isDisposed || context.project.id.value !== target.projectId) {
    throw targetNotFound;
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw invalidRevision;
  }
  if (context.project.revision.value !== expectedRevision) {
    throw revisionConflict(context.project.revision.value);
  }
}

export function sameBytes(
  first: ArrayLike<number> | undefined,
  second: ArrayLike<number> | undefined,
): boolean {
  if (!first || !second) return first === second;
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

export function sameLayerProperties(first: Layer, second: Layer): boolean {
  return first.id === second.id
    && first.name === second.name
    && first.type === second.type
    && first.visible === second.visible
    && first.locked === second.locked
    && first.opacity === second.opacity
    && first.blendMode === second.blendMode
    && (first.continuous ?? false) === (second.continuous ?? false)
    && first.parentId === second.parentId;
}

export function chooseActiveLayerId(
  activeLayerId: string | null,
  layers: readonly Layer[],
): string | null {
  if (activeLayerId && layers.some((layer) => layer.id === activeLayerId)) return activeLayerId;
  return layers.find((layer) => layer.type === 'image')?.id ?? layers[0]?.id ?? null;
}

export function sameCanvas(first: HTMLCanvasElement, second: HTMLCanvasElement): boolean {
  if (first.width !== second.width || first.height !== second.height) return false;
  const firstContext = first.getContext('2d', { willReadFrequently: true });
  const secondContext = second.getContext('2d', { willReadFrequently: true });
  if (!firstContext || !secondContext) return false;
  return sameBytes(
    new Uint8Array(firstContext.getImageData(0, 0, first.width, first.height).data),
    new Uint8Array(secondContext.getImageData(0, 0, second.width, second.height).data),
  );
}

export function hasOpaquePixels(canvas: HTMLCanvasElement, unavailable: Error): boolean {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw unavailable;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) return true;
  }
  return false;
}

export function sameGroupData(
  first: ReadonlyMap<string, Uint8Array>,
  second: ReadonlyMap<string, Uint8Array>,
): boolean {
  if (first.size !== second.size) return false;
  for (const [layerId, bytes] of first) {
    if (!sameBytes(bytes, second.get(layerId))) return false;
  }
  return true;
}

export function samePaletteSnapshot(
  first: ProjectPaletteSnapshot,
  second: ProjectPaletteSnapshot,
): boolean {
  return first.currentPresetId === second.currentPresetId
    && first.currentCustomPaletteId === second.currentCustomPaletteId
    && first.isDirty === second.isDirty
    && sameStrings(first.newColorFlags, second.newColorFlags)
    && sameStrings(first.colors, second.colors)
    && samePaletteEntries(first.entries, second.entries);
}

function samePaletteEntries(
  first: ProjectPaletteSnapshot['entries'],
  second: ProjectPaletteSnapshot['entries'],
): boolean {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    const firstEntry = first[index];
    const secondEntry = second[index];
    if (!firstEntry || !secondEntry || firstEntry.id !== secondEntry.id || firstEntry.color !== secondEntry.color) {
      return false;
    }
  }
  return true;
}

export function sameFrameTags(first: readonly FrameTag[], second: readonly FrameTag[]): boolean {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    const firstTag = first[index];
    const secondTag = second[index];
    if (!firstTag || !secondTag || firstTag.id !== secondTag.id || firstTag.name !== secondTag.name
        || firstTag.color !== secondTag.color || firstTag.startFrameIndex !== secondTag.startFrameIndex
        || firstTag.endFrameIndex !== secondTag.endFrameIndex || firstTag.collapsed !== secondTag.collapsed) {
      return false;
    }
  }
  return true;
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}
