import { type Rect } from '../../types/geometry';
import { type SelectionShape } from '../../types/selection';

export interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

type PixelVisitor = (
  x: number,
  y: number,
  pixelIndex: number,
  rgbaIndex: number
) => void;

type SelectedPixelVisitor = (rgbaIndex: number) => void;

function forEachPixel(width: number, height: number, visit: PixelVisitor) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      visit(x, y, pixelIndex, pixelIndex * 4);
    }
  }
}

function hasVisibleAlpha(data: Uint8ClampedArray, rgbaIndex: number) {
  return data[rgbaIndex + 3] > 0;
}

function includePixel(bounds: ContentBounds, x: number, y: number) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function hasIncludedPixels(bounds: ContentBounds) {
  return bounds.maxX >= 0 && bounds.maxY >= 0;
}

function makeEmptyContentBounds(width: number): ContentBounds {
  return { minX: width, minY: Number.MAX_SAFE_INTEGER, maxX: -1, maxY: -1 };
}

export function isWholeImageBounds(
  bounds: ContentBounds,
  width: number,
  height: number
) {
  return (
    bounds.minX === 0 &&
    bounds.minY === 0 &&
    bounds.maxX === width - 1 &&
    bounds.maxY === height - 1
  );
}

export function findContentBounds(imageData: ImageData) {
  const bounds = makeEmptyContentBounds(imageData.width);

  forEachPixel(imageData.width, imageData.height, (x, y, _pixelIndex, rgbaIndex) => {
    if (hasVisibleAlpha(imageData.data, rgbaIndex)) {
      includePixel(bounds, x, y);
    }
  });

  return hasIncludedPixels(bounds) ? bounds : null;
}

function copyPixel(
  source: Uint8ClampedArray,
  sourceRgbaIndex: number,
  target: Uint8ClampedArray,
  targetRgbaIndex: number
) {
  target[targetRgbaIndex] = source[sourceRgbaIndex];
  target[targetRgbaIndex + 1] = source[sourceRgbaIndex + 1];
  target[targetRgbaIndex + 2] = source[sourceRgbaIndex + 2];
  target[targetRgbaIndex + 3] = source[sourceRgbaIndex + 3];
}

function clearPixel(data: Uint8ClampedArray, rgbaIndex: number) {
  data[rgbaIndex] = 0;
  data[rgbaIndex + 1] = 0;
  data[rgbaIndex + 2] = 0;
  data[rgbaIndex + 3] = 0;
}

function setPixel(
  data: Uint8ClampedArray,
  rgbaIndex: number,
  color: RgbaColor
) {
  data[rgbaIndex] = color.r;
  data[rgbaIndex + 1] = color.g;
  data[rgbaIndex + 2] = color.b;
  data[rgbaIndex + 3] = color.a;
}

function isInsideEllipse(x: number, y: number, width: number, height: number) {
  const rx = width / 2;
  const ry = height / 2;
  const dx = (x + 0.5 - rx) / rx;
  const dy = (y + 0.5 - ry) / ry;

  return dx * dx + dy * dy <= 1;
}

function isSelectedPixel(
  x: number,
  y: number,
  width: number,
  height: number,
  shape: SelectionShape,
  mask?: Uint8Array
) {
  if (shape === 'rectangle') return true;
  if (shape === 'ellipse') return isInsideEllipse(x, y, width, height);

  return mask?.[y * width + x] === 255;
}

function parseHexColor(fillColor: string): RgbaColor {
  return {
    r: parseInt(fillColor.slice(1, 3), 16),
    g: parseInt(fillColor.slice(3, 5), 16),
    b: parseInt(fillColor.slice(5, 7), 16),
    a: 255,
  };
}

export function copyImageDataRegion(
  imageData: ImageData,
  bounds: ContentBounds
) {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const trimmed = new ImageData(width, height);

  forEachPixel(width, height, (x, y, _pixelIndex, rgbaIndex) => {
    const sourcePixelIndex = (bounds.minY + y) * imageData.width + bounds.minX + x;
    copyPixel(imageData.data, sourcePixelIndex * 4, trimmed.data, rgbaIndex);
  });

  return trimmed;
}

export function copyMaskRegion(mask: Uint8Array, sourceWidth: number, bounds: ContentBounds) {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const trimmedMask = new Uint8Array(width * height);

  forEachPixel(width, height, (x, y, pixelIndex) => {
    const sourceIndex = (bounds.minY + y) * sourceWidth + bounds.minX + x;
    trimmedMask[pixelIndex] = mask[sourceIndex];
  });

  return trimmedMask;
}

export function maskPixelsOutsideSelection(
  imageData: ImageData,
  shape: SelectionShape,
  mask?: Uint8Array
) {
  if (shape === 'rectangle' || (shape === 'freeform' && !mask)) return;

  forEachPixel(imageData.width, imageData.height, (x, y, _pixelIndex, rgbaIndex) => {
    if (!isSelectedPixel(x, y, imageData.width, imageData.height, shape, mask)) {
      imageData.data[rgbaIndex + 3] = 0;
    }
  });
}

function visitSelectedPixels(
  imageData: ImageData,
  shape: SelectionShape,
  mask: Uint8Array | undefined,
  visit: SelectedPixelVisitor
) {
  forEachPixel(imageData.width, imageData.height, (x, y, _pixelIndex, rgbaIndex) => {
    if (isSelectedPixel(x, y, imageData.width, imageData.height, shape, mask)) {
      visit(rgbaIndex);
    }
  });
}

function clearSelectedPixels(
  imageData: ImageData,
  shape: SelectionShape,
  mask?: Uint8Array
) {
  visitSelectedPixels(imageData, shape, mask, (rgbaIndex) => {
    clearPixel(imageData.data, rgbaIndex);
  });
}

function fillSelectedPixels(
  imageData: ImageData,
  shape: SelectionShape,
  color: RgbaColor,
  mask?: Uint8Array
) {
  visitSelectedPixels(imageData, shape, mask, (rgbaIndex) => {
    setPixel(imageData.data, rgbaIndex, color);
  });
}

function pastePixelsWithAlpha(
  source: ImageData,
  target: ImageData,
  shape: SelectionShape = 'rectangle'
) {
  forEachPixel(source.width, source.height, (x, y, _pixelIndex, rgbaIndex) => {
    if (
      isSelectedPixel(x, y, source.width, source.height, shape) &&
      hasVisibleAlpha(source.data, rgbaIndex)
    ) {
      copyPixel(source.data, rgbaIndex, target.data, rgbaIndex);
    }
  });
}

export function clearCanvasSelection(
  ctx: CanvasRenderingContext2D,
  bounds: Rect,
  shape: SelectionShape,
  mask?: Uint8Array
) {
  if (shape === 'rectangle') {
    ctx.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
    return;
  }

  const imageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  clearSelectedPixels(imageData, shape, mask);
  ctx.putImageData(imageData, bounds.x, bounds.y);
}

export function fillCanvasSelection(
  ctx: CanvasRenderingContext2D,
  bounds: Rect,
  fillColor: string,
  shape: SelectionShape,
  mask?: Uint8Array
) {
  const imageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);

  fillSelectedPixels(imageData, shape, parseHexColor(fillColor), mask);
  ctx.putImageData(imageData, bounds.x, bounds.y);
}

export function pasteImageDataWithAlpha(
  ctx: CanvasRenderingContext2D,
  source: ImageData,
  x: number,
  y: number,
  shape: SelectionShape = 'rectangle'
) {
  const target = ctx.getImageData(x, y, source.width, source.height);

  pastePixelsWithAlpha(source, target, shape);
  ctx.putImageData(target, x, y);
}

export function flipSelectedPixels(
  imageData: ImageData,
  shape: SelectionShape,
  direction: 'horizontal' | 'vertical',
  mask?: Uint8Array
) {
  const { width, height, data } = imageData;
  const flippedData = new Uint8ClampedArray(data.length);

  forEachPixel(width, height, (x, y, _pixelIndex, rgbaIndex) => {
    const selected = isSelectedPixel(x, y, width, height, shape, mask);
    const destination = getFlipDestination(x, y, width, height, direction, selected);
    const targetRgbaIndex = destination * 4;

    copyPixel(data, rgbaIndex, flippedData, targetRgbaIndex);
  });

  return new ImageData(flippedData, width, height);
}

function getFlipDestination(
  x: number,
  y: number,
  width: number,
  height: number,
  direction: 'horizontal' | 'vertical',
  selected: boolean
) {
  if (!selected) return y * width + x;
  if (direction === 'horizontal') return y * width + (width - 1 - x);

  return (height - 1 - y) * width + x;
}
