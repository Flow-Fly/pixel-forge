import type { ProjectContext } from '../../stores/project-context';
import type { Cel, Frame } from '../../types/animation';

export interface SharedCelPresentation {
  readonly cel: Cel;
  readonly frameNumbers: readonly number[];
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

  const frameNumbers = context.animation.frames.value.reduce<number[]>((numbers, frame, index) => {
    const candidate = context.animation.cels.value.get(
      context.animation.getCelKey(layerId, frame.id),
    );
    if (candidate && candidate.linkedCelId === cel.linkedCelId && candidate.linkType === 'hard') {
      numbers.push(index + 1);
    }
    return numbers;
  }, []);

  if (frameNumbers.length < 2) return null;
  return { cel, frameNumbers };
}

export function formatAffectedFrames(frameNumbers: readonly number[]): string {
  return frameNumbers.join(', ');
}

export function sharedCelAccessibleName(
  layerName: string,
  frameNumber: number,
  affectedFrames: readonly number[],
): string {
  return `${layerName}, frame ${frameNumber}. Shared cel — affects frames ${formatAffectedFrames(affectedFrames)}. Edits propagate to every affected frame.`;
}

export function sharedCelFrameIndex(
  frames: readonly Frame[],
  frameId: string,
): number {
  return frames.findIndex((frame) => frame.id === frameId);
}
