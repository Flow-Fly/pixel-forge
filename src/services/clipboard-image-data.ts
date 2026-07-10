import { hexToRgb, normalizeHex, type RGB } from '../stores/palette/color-utils';

export interface ClipboardImageDataOptions {
  indexData: Uint8Array;
  targetColors: string[];
  width: number;
  height: number;
  mask?: Uint8Array;
}

function isVisiblePixel(mask: Uint8Array | undefined, pixelIndex: number): boolean {
  return !mask || mask[pixelIndex] !== 0;
}

function getTargetRgb(paletteIndex: number, targetColors: string[]): RGB | null {
  if (paletteIndex === 0) return null;

  const color = targetColors[paletteIndex - 1];
  if (!color) return null;

  return hexToRgb(normalizeHex(color));
}

function paintPixel(data: Uint8ClampedArray, pixelIndex: number, color: RGB): void {
  const offset = pixelIndex * 4;
  data[offset] = color.r;
  data[offset + 1] = color.g;
  data[offset + 2] = color.b;
  data[offset + 3] = 255;
}

function createImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  if (typeof ImageData !== 'undefined') {
    const imageDataArray = new Uint8ClampedArray(data.length);
    imageDataArray.set(data);
    return new ImageData(imageDataArray, width, height);
  }

  return { data, width, height } as ImageData;
}

export function createClipboardImageDataFromIndices({
  indexData,
  targetColors,
  width,
  height,
  mask,
}: ClipboardImageDataOptions): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex++) {
    if (!isVisiblePixel(mask, pixelIndex)) continue;

    const paletteIndex = indexData[pixelIndex] ?? 0;
    const color = getTargetRgb(paletteIndex, targetColors);
    if (color) {
      paintPixel(data, pixelIndex, color);
    }
  }

  return createImageData(data, width, height);
}
