/**
 * Find the bounding box of non-transparent pixels in ImageData.
 * Returns null if all pixels are transparent.
 */
export function findContentBounds(imageData: ImageData): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const { width, height, data } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null; // All transparent
  }

  return { minX, minY, maxX, maxY };
}

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
    return null; // All transparent
  }

  const { minX, minY, maxX, maxY } = contentBounds;
  const newWidth = maxX - minX + 1;
  const newHeight = maxY - minY + 1;

  // If no trimming needed, return original
  if (minX === 0 && minY === 0 && newWidth === imageData.width && newHeight === imageData.height) {
    return { imageData, offset: { x: 0, y: 0 }, mask };
  }

  // Create trimmed ImageData
  const trimmedData = new ImageData(newWidth, newHeight);
  const srcData = imageData.data;
  const dstData = trimmedData.data;

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcIdx = ((minY + y) * imageData.width + (minX + x)) * 4;
      const dstIdx = (y * newWidth + x) * 4;
      dstData[dstIdx] = srcData[srcIdx];
      dstData[dstIdx + 1] = srcData[srcIdx + 1];
      dstData[dstIdx + 2] = srcData[srcIdx + 2];
      dstData[dstIdx + 3] = srcData[srcIdx + 3];
    }
  }

  // Trim mask if provided
  let trimmedMask: Uint8Array | undefined;
  if (mask) {
    trimmedMask = new Uint8Array(newWidth * newHeight);
    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcIdx = (minY + y) * imageData.width + (minX + x);
        const dstIdx = y * newWidth + x;
        trimmedMask[dstIdx] = mask[srcIdx];
      }
    }
  }

  return {
    imageData: trimmedData,
    offset: { x: minX, y: minY },
    mask: trimmedMask,
  };
}
