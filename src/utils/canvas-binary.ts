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
 * Load current-format PNG bytes to a canvas.
 */
export async function loadImageDataToCanvas(
  data: Uint8Array,
  canvas: HTMLCanvasElement
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const blob = new Blob([data as BlobPart], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  } finally {
    URL.revokeObjectURL(url);
  }
}
