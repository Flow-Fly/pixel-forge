/**
 * Binary conversion utilities for canvas data.
 * Used for efficient IndexedDB storage (avoids ~33% Base64 overhead).
 */

/**
 * Convert an HTMLCanvasElement to a PNG Uint8Array (binary).
 * Uses canvas.toBlob() which is more memory-efficient than toDataURL().
 */
export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create blob from canvas'));
        return;
      }
      blob.arrayBuffer().then(buffer => {
        resolve(new Uint8Array(buffer));
      }).catch(reject);
    }, 'image/png');
  });
}

/**
 * Convert a PNG Uint8Array back to a canvas.
 */
export async function pngBytesToCanvas(
  bytes: Uint8Array,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  const blob = new Blob([bytes], { type: 'image/png' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: true
    });
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load an image from a URL (data URL or blob URL).
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Check if data is a Uint8Array (binary) or string (Base64).
 */
export function isBinaryData(data: string | Uint8Array): data is Uint8Array {
  return data instanceof Uint8Array;
}

/**
 * Load image data to canvas, handling both Base64 and binary formats.
 * Provides backward compatibility for old Base64-format projects.
 */
export async function loadImageDataToCanvas(
  data: string | Uint8Array,
  canvas: HTMLCanvasElement
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (isBinaryData(data)) {
    // Binary format (v2.0.0+) - decode via Blob
    const blob = new Blob([data], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    // Base64 format (v1.x legacy) - decode via data URL
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = () => resolve(); // Silently fail for corrupt data
      img.src = data;
    });
  }
}
