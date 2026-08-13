import type { ProjectContext } from '../../stores/project-context';
import type { Frame } from '../../types/animation';

export interface SharedCelPresentation {
  readonly frameNumbers: readonly number[];
  readonly members: readonly SharedCelMember[];
}

export interface SharedCelMember {
  readonly layerId: string;
  readonly layerName: string;
  readonly layerIndex: number;
  readonly frameId: string;
  readonly frameNumber: number;
}

export function getCelUnlinkUnavailableReason(context: ProjectContext): string | null {
  return context.guidedDrawing.active ? 'Unavailable during Guided Drawing.' : null;
}

export function getSharedCelPresentation(
  context: ProjectContext,
  layerId: string,
  frameId: string,
): SharedCelPresentation | null {
  const cel = context.animation.cels.value.get(context.animation.getCelKey(layerId, frameId));
  if (!cel?.linkedCelId || cel.linkType !== 'hard' || context.animation.isRuntimeEmptyCel(cel)) {
    return null;
  }

  const frames = context.animation.frames.value;
  const layers = context.layers.layers.value;
  const frameNumbers = new Map(frames.map((frame, index) => [frame.id, index + 1]));
  const layerIndexes = new Map(layers.map((layer, index) => [layer.id, index]));
  const members = [...context.animation.cels.value.entries()]
    .filter(([, candidate]) =>
      candidate.linkedCelId === cel.linkedCelId && candidate.linkType === 'hard',
    )
    .map(([key, candidate]) => {
      const layerIndex = layerIndexes.get(candidate.layerId) ?? layers.length;
      const frameNumber = frameNumbers.get(candidate.frameId);
      if (frameNumber === undefined) return null;

      return {
        key,
        layerId: candidate.layerId,
        layerName: layers[layerIndex]?.name ?? candidate.layerId,
        layerIndex,
        frameId: candidate.frameId,
        frameNumber,
      } satisfies SharedCelMember & { key: string };
    })
    .filter((member): member is SharedCelMember & { key: string } => member !== null)
    .sort((first, second) =>
      first.frameNumber - second.frameNumber ||
      first.layerIndex - second.layerIndex ||
      first.key.localeCompare(second.key),
    )
    .map(({ key: _key, ...member }) => member);

  if (members.length < 2) return null;
  return { frameNumbers: members.map((member) => member.frameNumber), members };
}

export function formatAffectedFrames(presentation: SharedCelPresentation): string {
  const usesMultipleLayers = new Set(presentation.members.map((member) => member.layerId)).size > 1;
  const frameLayerNames = new Map<string, number>();
  for (const member of presentation.members) {
    const key = `${member.frameNumber}:${member.layerName}`;
    frameLayerNames.set(key, (frameLayerNames.get(key) ?? 0) + 1);
  }

  return presentation.members
    .map((member) => {
      if (!usesMultipleLayers) return String(member.frameNumber);
      const key = `${member.frameNumber}:${member.layerName}`;
      const layerName = frameLayerNames.get(key) === 1
        ? member.layerName
        : `${member.layerName}, layer ${member.layerIndex + 1}`;
      return `${member.frameNumber} (${layerName})`;
    })
    .join(', ');
}

export function sharedCelAccessibleName(
  layerName: string,
  frameNumber: number,
  presentation: SharedCelPresentation,
): string {
  return `${layerName}, frame ${frameNumber}. Shared cel — affects frames ${formatAffectedFrames(presentation)}. Edits propagate to every affected frame.`;
}

export function sharedCelFrameIndex(
  frames: readonly Frame[],
  frameId: string,
): number {
  return frames.findIndex((frame) => frame.id === frameId);
}
