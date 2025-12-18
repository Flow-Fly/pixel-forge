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
  const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
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
 * Check if data is binary (Uint8Array or serialized object from JSON).
 * JSON.stringify converts Uint8Array to {"0": 137, "1": 80, ...} format,
 * so we need to handle both cases.
 */
export function isBinaryData(data: string | Uint8Array | Record<string, number>): data is Uint8Array | Record<string, number> {
  if (data instanceof Uint8Array) return true;
  // Check if it's an object with numeric keys (serialized Uint8Array from JSON)
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const keys = Object.keys(data);
    return keys.length > 0 && keys.every(k => /^\d+$/.test(k));
  }
  return false;
}

/**
 * Convert a serialized Uint8Array (from JSON) back to a real Uint8Array.
 */
function toUint8Array(data: Uint8Array | Record<string, number>): Uint8Array {
  if (data instanceof Uint8Array) return data;
  // Convert object with numeric keys to Uint8Array
  const keys = Object.keys(data).map(Number).sort((a, b) => a - b);
  const arr = new Uint8Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    arr[i] = data[keys[i]];
  }
  return arr;
}

/**
 * Load image data to canvas, handling both Base64 and binary formats.
 * Provides backward compatibility for old Base64-format projects.
 */
export async function loadImageDataToCanvas(
  data: string | Uint8Array | Record<string, number>,
  canvas: HTMLCanvasElement
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (isBinaryData(data)) {
    // Binary format (v2.0.0+) - decode via Blob
    // Convert to Uint8Array if it's a serialized object from JSON
    const bytes = toUint8Array(data);
    const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
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
      img.src = data as string;
    });
  }
}
