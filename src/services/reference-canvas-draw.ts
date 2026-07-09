import type { ReferenceLayerRenderEntry } from './reference-render-plan';

export type ReferenceDrawableImage = CanvasImageSource & {
  readonly width: number;
  readonly height: number;
};

export function drawReferenceImage(
  context: CanvasRenderingContext2D,
  entry: ReferenceLayerRenderEntry,
  image: ReferenceDrawableImage
): void {
  context.save();

  try {
    context.globalAlpha = Math.max(0, Math.min(1, entry.opacity / 255));
    context.filter = entry.desaturate ? 'grayscale(1)' : 'none';
    context.imageSmoothingEnabled = true;
    context.drawImage(
      image,
      entry.x,
      entry.y,
      image.width * entry.scale,
      image.height * entry.scale
    );
  } finally {
    context.restore();
  }
}
