import { rgbToHex, type RGB } from '../../stores/palette/color-utils';

export const MAX_GUIDE_COLORS = 255;
export const DEFAULT_GUIDE_COLOR_COUNT = 12;

export interface NumberedGuide {
  palette: string[];
  target: Uint8Array;
  width: number;
  height: number;
}

interface ColorBox {
  pixels: RGB[];
  redRange: number;
  greenRange: number;
  blueRange: number;
}

export function generateNumberedGuide(
  sampledImage: ImageData,
  maxColors: number = DEFAULT_GUIDE_COLOR_COUNT,
): NumberedGuide {
  const colorLimit = clampColorCount(maxColors);
  const pixels = collectOpaquePixels(sampledImage);
  const palette = buildGeneratedPalette(pixels, colorLimit);
  const target = mapImageToPalette(sampledImage, palette);

  return {
    palette: palette.map((color) => rgbToHex(color.r, color.g, color.b)),
    target,
    width: sampledImage.width,
    height: sampledImage.height,
  };
}

export function perceptualColorDistance(left: RGB, right: RGB): number {
  const redMean = (left.r + right.r) / 2;
  const red = left.r - right.r;
  const green = left.g - right.g;
  const blue = left.b - right.b;

  return Math.sqrt(
    (2 + redMean / 256) * red * red
      + 4 * green * green
      + (2 + (255 - redMean) / 256) * blue * blue,
  );
}

function collectOpaquePixels(image: ImageData): RGB[] {
  const pixels: RGB[] = [];

  for (let index = 0; index < image.data.length; index += 4) {
    if (image.data[index + 3] < 128) continue;

    pixels.push({
      r: image.data[index],
      g: image.data[index + 1],
      b: image.data[index + 2],
    });
  }

  return pixels;
}

function buildGeneratedPalette(pixels: RGB[], colorLimit: number): RGB[] {
  if (pixels.length === 0) return [];

  const exactColors = getExactColors(pixels);
  if (exactColors.length <= colorLimit) {
    return sortPalette(exactColors);
  }

  const boxes: ColorBox[] = [createColorBox(pixels)];

  while (boxes.length < colorLimit) {
    const boxIndex = findBoxToSplit(boxes);
    if (boxIndex === -1) break;

    const [box] = boxes.splice(boxIndex, 1);
    const split = splitColorBox(box);
    if (!split) {
      boxes.push(box);
      break;
    }

    boxes.push(...split);
  }

  return sortPalette(dedupeColors(boxes.map(averageBoxColor)));
}

function getExactColors(pixels: RGB[]): RGB[] {
  const colors = new Map<string, RGB>();

  for (const pixel of pixels) {
    const key = `${pixel.r},${pixel.g},${pixel.b}`;
    if (!colors.has(key)) colors.set(key, pixel);
  }

  return [...colors.values()];
}

function createColorBox(pixels: RGB[]): ColorBox {
  let minRed = 255;
  let minGreen = 255;
  let minBlue = 255;
  let maxRed = 0;
  let maxGreen = 0;
  let maxBlue = 0;

  for (const pixel of pixels) {
    minRed = Math.min(minRed, pixel.r);
    minGreen = Math.min(minGreen, pixel.g);
    minBlue = Math.min(minBlue, pixel.b);
    maxRed = Math.max(maxRed, pixel.r);
    maxGreen = Math.max(maxGreen, pixel.g);
    maxBlue = Math.max(maxBlue, pixel.b);
  }

  return {
    pixels,
    redRange: maxRed - minRed,
    greenRange: maxGreen - minGreen,
    blueRange: maxBlue - minBlue,
  };
}

function findBoxToSplit(boxes: ColorBox[]): number {
  let bestIndex = -1;
  let bestScore = -1;

  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    if (box.pixels.length < 2) continue;

    const largestRange = Math.max(box.redRange, box.greenRange, box.blueRange);
    const score = largestRange * box.pixels.length;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }

  return bestIndex;
}

function splitColorBox(box: ColorBox): [ColorBox, ColorBox] | null {
  const channel = getSplitChannel(box);
  const sortedPixels = [...box.pixels].sort((left, right) => {
    const difference = left[channel] - right[channel];
    if (difference !== 0) return difference;
    if (left.r !== right.r) return left.r - right.r;
    if (left.g !== right.g) return left.g - right.g;
    return left.b - right.b;
  });
  const splitIndex = Math.floor(sortedPixels.length / 2);
  if (splitIndex === 0 || splitIndex === sortedPixels.length) return null;

  return [
    createColorBox(sortedPixels.slice(0, splitIndex)),
    createColorBox(sortedPixels.slice(splitIndex)),
  ];
}

function getSplitChannel(box: ColorBox): keyof RGB {
  if (box.redRange >= box.greenRange && box.redRange >= box.blueRange) {
    return 'r';
  }
  if (box.greenRange >= box.blueRange) return 'g';
  return 'b';
}

function averageBoxColor(box: ColorBox): RGB {
  let red = 0;
  let green = 0;
  let blue = 0;

  for (const pixel of box.pixels) {
    red += pixel.r;
    green += pixel.g;
    blue += pixel.b;
  }

  return {
    r: Math.round(red / box.pixels.length),
    g: Math.round(green / box.pixels.length),
    b: Math.round(blue / box.pixels.length),
  };
}

function dedupeColors(colors: RGB[]): RGB[] {
  const unique = new Map<string, RGB>();

  for (const color of colors) {
    unique.set(`${color.r},${color.g},${color.b}`, color);
  }

  return [...unique.values()];
}

function sortPalette(colors: RGB[]): RGB[] {
  return [...colors].sort((left, right) => {
    const luminanceDifference = relativeLuminance(left) - relativeLuminance(right);
    if (luminanceDifference !== 0) return luminanceDifference;
    if (left.r !== right.r) return left.r - right.r;
    if (left.g !== right.g) return left.g - right.g;
    return left.b - right.b;
  });
}

function relativeLuminance(color: RGB): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function mapImageToPalette(image: ImageData, palette: RGB[]): Uint8Array {
  const target = new Uint8Array(image.width * image.height);
  if (palette.length === 0) return target;

  for (let pixelIndex = 0; pixelIndex < target.length; pixelIndex += 1) {
    const dataIndex = pixelIndex * 4;
    if (image.data[dataIndex + 3] < 128) continue;

    const color = {
      r: image.data[dataIndex],
      g: image.data[dataIndex + 1],
      b: image.data[dataIndex + 2],
    };
    target[pixelIndex] = findClosestPaletteIndex(color, palette);
  }

  return target;
}

function findClosestPaletteIndex(color: RGB, palette: RGB[]): number {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < palette.length; index += 1) {
    const distance = perceptualColorDistance(color, palette[index]);
    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  }

  return closestIndex + 1;
}

function clampColorCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GUIDE_COLOR_COUNT;
  return Math.max(1, Math.min(MAX_GUIDE_COLORS, Math.round(value)));
}
