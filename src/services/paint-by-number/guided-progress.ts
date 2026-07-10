import type { ProjectContext } from '../../stores/project-context';
import type { GuidedDrawingSession } from '../../types/guided-drawing';

export interface GuidedDrawingSnapshot {
  session: GuidedDrawingSession;
  pixels: Uint8ClampedArray;
}

export interface GuidedDrawingProgress {
  total: number;
  covered: number;
  remaining: number;
  percentage: number;
  remainingByNumber: Uint32Array;
}

export function analyzeGuidedDrawingProgress(
  target: Uint8Array,
  pixels: Uint8ClampedArray,
): GuidedDrawingProgress {
  if (pixels.length !== target.length * 4) {
    throw new RangeError('Guided drawing pixels do not match the target buffer');
  }

  const remainingByNumber = new Uint32Array(findHighestGuideNumber(target) + 1);
  let total = 0;
  let covered = 0;

  for (let index = 0; index < target.length; index += 1) {
    const guideNumber = target[index];
    if (guideNumber === 0) continue;

    total += 1;
    if (pixels[index * 4 + 3] > 0) {
      covered += 1;
    } else {
      remainingByNumber[guideNumber] += 1;
    }
  }

  const remaining = total - covered;
  return {
    total,
    covered,
    remaining,
    percentage: total === 0 ? 0 : Math.round((covered / total) * 100),
    remainingByNumber,
  };
}

export function getGuidedDrawingSnapshot(
  context: ProjectContext,
): GuidedDrawingSnapshot | null {
  const session = context.guidedDrawing.session.value;
  if (!session) return null;

  const paintingLayer = context.layers.layers.value.find((layer) => layer.type === 'image');
  const canvas = paintingLayer?.canvas;
  if (!canvas || canvas.width !== session.width || canvas.height !== session.height) {
    return null;
  }

  const drawingContext = canvas.getContext('2d', { willReadFrequently: true });
  if (!drawingContext) return null;

  try {
    return {
      session,
      pixels: drawingContext.getImageData(0, 0, session.width, session.height).data,
    };
  } catch {
    return null;
  }
}

function findHighestGuideNumber(target: Uint8Array): number {
  let highest = 0;
  for (const guideNumber of target) {
    highest = Math.max(highest, guideNumber);
  }
  return highest;
}
