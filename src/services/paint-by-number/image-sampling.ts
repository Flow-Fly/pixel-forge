const DEFAULT_GUIDE_ALPHA_THRESHOLD = 128;

export interface TargetGridSize {
  width: number;
  height: number;
}

export interface SampleImageOptions {
  longSide: number;
  alphaThreshold?: number;
}

export function getTargetGridSize(
  sourceWidth: number,
  sourceHeight: number,
  longSide: number,
): TargetGridSize {
  const safeWidth = requirePositiveInteger(sourceWidth, 'sourceWidth');
  const safeHeight = requirePositiveInteger(sourceHeight, 'sourceHeight');
  const safeLongSide = requirePositiveInteger(longSide, 'longSide');

  if (safeWidth >= safeHeight) {
    return {
      width: safeLongSide,
      height: Math.max(1, Math.round((safeHeight / safeWidth) * safeLongSide)),
    };
  }

  return {
    width: Math.max(1, Math.round((safeWidth / safeHeight) * safeLongSide)),
    height: safeLongSide,
  };
}

export function sampleImageToGrid(
  source: ImageData,
  options: SampleImageOptions,
): ImageData {
  const target = getTargetGridSize(source.width, source.height, options.longSide);
  const alphaThreshold = clampByte(
    options.alphaThreshold ?? DEFAULT_GUIDE_ALPHA_THRESHOLD,
  );
  const result = new ImageData(target.width, target.height);
  const scaleX = source.width / target.width;
  const scaleY = source.height / target.height;

  for (let targetY = 0; targetY < target.height; targetY += 1) {
    const sourceTop = targetY * scaleY;
    const sourceBottom = (targetY + 1) * scaleY;

    for (let targetX = 0; targetX < target.width; targetX += 1) {
      const sourceLeft = targetX * scaleX;
      const sourceRight = (targetX + 1) * scaleX;
      const sample = sampleSourceRegion(
        source,
        sourceLeft,
        sourceTop,
        sourceRight,
        sourceBottom,
      );
      const targetIndex = (targetY * target.width + targetX) * 4;

      if (sample.alpha < alphaThreshold) {
        continue;
      }

      result.data[targetIndex] = sample.red;
      result.data[targetIndex + 1] = sample.green;
      result.data[targetIndex + 2] = sample.blue;
      result.data[targetIndex + 3] = 255;
    }
  }

  return result;
}

interface SampledColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function sampleSourceRegion(
  source: ImageData,
  left: number,
  top: number,
  right: number,
  bottom: number,
): SampledColor {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  let opaqueWeight = 0;
  let regionWeight = 0;

  const startX = Math.floor(left);
  const endX = Math.min(Math.ceil(right), source.width);
  const startY = Math.floor(top);
  const endY = Math.min(Math.ceil(bottom), source.height);

  for (let sourceY = startY; sourceY < endY; sourceY += 1) {
    const overlapY = Math.min(sourceY + 1, bottom) - Math.max(sourceY, top);

    for (let sourceX = startX; sourceX < endX; sourceX += 1) {
      const overlapX = Math.min(sourceX + 1, right) - Math.max(sourceX, left);
      const pixelWeight = overlapX * overlapY;
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const sourceAlpha = source.data[sourceIndex + 3] / 255;
      const colorWeight = pixelWeight * sourceAlpha;

      red += source.data[sourceIndex] * colorWeight;
      green += source.data[sourceIndex + 1] * colorWeight;
      blue += source.data[sourceIndex + 2] * colorWeight;
      alpha += source.data[sourceIndex + 3] * pixelWeight;
      opaqueWeight += colorWeight;
      regionWeight += pixelWeight;
    }
  }

  if (regionWeight === 0 || opaqueWeight === 0) {
    return { red: 0, green: 0, blue: 0, alpha: 0 };
  }

  return {
    red: Math.round(red / opaqueWeight),
    green: Math.round(green / opaqueWeight),
    blue: Math.round(blue / opaqueWeight),
    alpha: Math.round(alpha / regionWeight),
  };
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError(`${name} must be at least 1`);
  }

  return Math.round(value);
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GUIDE_ALPHA_THRESHOLD;
  return Math.max(0, Math.min(255, Math.round(value)));
}
