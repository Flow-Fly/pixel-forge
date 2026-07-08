import { canvasToPngBytes } from '../utils/canvas-binary';

const THUMBNAIL_MAX_SIZE = 128;

export async function createProjectThumbnail(options: {
  compositeFrame: (
    frameId: string,
    targetCtx: CanvasRenderingContext2D
  ) => void;
  frameId: string;
  width: number;
  height: number;
}): Promise<Uint8Array | undefined> {
  const sourceWidth = Math.max(1, options.width);
  const sourceHeight = Math.max(1, options.height);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;

  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) return undefined;

  sourceCtx.imageSmoothingEnabled = false;
  options.compositeFrame(options.frameId, sourceCtx);

  const longSide = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(1, THUMBNAIL_MAX_SIZE / longSide);
  const thumbnailWidth = Math.max(1, Math.round(sourceWidth * scale));
  const thumbnailHeight = Math.max(1, Math.round(sourceHeight * scale));
  const thumbnailCanvas = document.createElement('canvas');
  thumbnailCanvas.width = thumbnailWidth;
  thumbnailCanvas.height = thumbnailHeight;

  const thumbnailCtx = thumbnailCanvas.getContext('2d');
  if (!thumbnailCtx) return undefined;

  thumbnailCtx.imageSmoothingEnabled = false;
  thumbnailCtx.drawImage(
    sourceCanvas,
    0,
    0,
    sourceWidth,
    sourceHeight,
    0,
    0,
    thumbnailWidth,
    thumbnailHeight
  );

  return await canvasToPngBytes(thumbnailCanvas);
}
