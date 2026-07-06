import {
  copyImageDataRegion,
  copyMaskRegion,
  findContentBounds,
  isWholeImageBounds,
} from './pixels';

/**
 * Trim transparent pixels from ImageData and return the cropped result.
 * Returns the trimmed ImageData, the offset from original bounds, and updated mask if provided.
 */
export function trimTransparentPixels(
  imageData: ImageData,
  mask?: Uint8Array
): {
  imageData: ImageData;
  offset: { x: number; y: number };
  mask?: Uint8Array;
} | null {
  const contentBounds = findContentBounds(imageData);

  if (!contentBounds) {
    return null;
  }

  if (isWholeImageBounds(contentBounds, imageData.width, imageData.height)) {
    return { imageData, offset: { x: 0, y: 0 }, mask };
  }

  return {
    imageData: copyImageDataRegion(imageData, contentBounds),
    offset: { x: contentBounds.minX, y: contentBounds.minY },
    mask: mask ? copyMaskRegion(mask, imageData.width, contentBounds) : undefined,
  };
}
