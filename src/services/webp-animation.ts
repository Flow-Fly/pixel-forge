/**
 * Animated WebP export using RIFF container format.
 *
 * WebP animation structure:
 * - RIFF header with "WEBP"
 * - VP8X chunk (extended features)
 * - ANIM chunk (animation params)
 * - ANMF chunks (one per frame)
 */

interface FrameData {
  canvas: HTMLCanvasElement;
  duration: number; // milliseconds
}

/**
 * Convert canvas to WebP blob.
 */
async function canvasToWebP(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create WebP blob'));
        }
      },
      'image/webp',
      quality
    );
  });
}

/**
 * Extract the raw VP8/VP8L bitstream from a WebP blob.
 * WebP files have a RIFF header we need to strip.
 */
async function extractWebPBitstream(blob: Blob): Promise<{ data: Uint8Array; isLossless: boolean }> {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);

  // Verify RIFF header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== 'RIFF') {
    throw new Error('Invalid WebP: not a RIFF file');
  }

  // Verify WEBP signature
  const webp = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (webp !== 'WEBP') {
    throw new Error('Invalid WebP: not a WebP file');
  }

  // Find VP8/VP8L chunk (starts at offset 12)
  let offset = 12;
  while (offset < buffer.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'VP8 ' || chunkId === 'VP8L') {
      // Include chunk header in the data
      const totalSize = 8 + chunkSize + (chunkSize % 2); // Add padding if odd
      const data = new Uint8Array(buffer, offset, Math.min(totalSize, buffer.byteLength - offset));
      return { data, isLossless: chunkId === 'VP8L' };
    }

    // Move to next chunk (size + 8 for header, padded to even)
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  throw new Error('No VP8/VP8L chunk found in WebP');
}

/**
 * Write a 32-bit little-endian integer to a buffer.
 */
function writeUint32LE(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
  buffer[offset + 3] = (value >> 24) & 0xff;
}

/**
 * Write a 24-bit little-endian integer to a buffer.
 */
function writeUint24LE(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
}

/**
 * Create an animated WebP file from multiple frames.
 */
export async function createAnimatedWebP(
  frames: FrameData[],
  loopCount = 0 // 0 = infinite
): Promise<Blob> {
  if (frames.length === 0) {
    throw new Error('No frames provided');
  }

  const width = frames[0].canvas.width;
  const height = frames[0].canvas.height;

  // Convert all frames to WebP and extract bitstreams
  const frameChunks: Array<{ data: Uint8Array; duration: number }> = [];

  for (const frame of frames) {
    const blob = await canvasToWebP(frame.canvas);
    const { data } = await extractWebPBitstream(blob);
    frameChunks.push({ data, duration: frame.duration });
  }

  // Calculate total size
  // RIFF header: 12 bytes
  // VP8X chunk: 18 bytes (8 header + 10 data)
  // ANIM chunk: 14 bytes (8 header + 6 data)
  // ANMF chunks: 24 bytes header + frame data each
  let totalSize = 12 + 18 + 14;
  for (const chunk of frameChunks) {
    totalSize += 24 + chunk.data.length;
    if (chunk.data.length % 2 !== 0) totalSize++; // Padding
  }

  const buffer = new Uint8Array(totalSize);
  let offset = 0;

  // RIFF header
  buffer.set([0x52, 0x49, 0x46, 0x46], offset); // "RIFF"
  offset += 4;
  writeUint32LE(buffer, offset, totalSize - 8); // File size minus 8
  offset += 4;
  buffer.set([0x57, 0x45, 0x42, 0x50], offset); // "WEBP"
  offset += 4;

  // VP8X chunk (extended features)
  buffer.set([0x56, 0x50, 0x38, 0x58], offset); // "VP8X"
  offset += 4;
  writeUint32LE(buffer, offset, 10); // Chunk size
  offset += 4;

  // VP8X flags: bit 1 = animation
  buffer[offset] = 0x02; // Animation flag
  offset += 4; // Flags (4 bytes, but only first byte used)

  // Canvas width - 1 (24-bit)
  writeUint24LE(buffer, offset, width - 1);
  offset += 3;

  // Canvas height - 1 (24-bit)
  writeUint24LE(buffer, offset, height - 1);
  offset += 3;

  // ANIM chunk (animation parameters)
  buffer.set([0x41, 0x4e, 0x49, 0x4d], offset); // "ANIM"
  offset += 4;
  writeUint32LE(buffer, offset, 6); // Chunk size
  offset += 4;

  // Background color (BGRA) - transparent
  writeUint32LE(buffer, offset, 0x00000000);
  offset += 4;

  // Loop count (0 = infinite)
  buffer[offset] = loopCount & 0xff;
  buffer[offset + 1] = (loopCount >> 8) & 0xff;
  offset += 2;

  // ANMF chunks (one per frame)
  for (const chunk of frameChunks) {
    buffer.set([0x41, 0x4e, 0x4d, 0x46], offset); // "ANMF"
    offset += 4;

    // Chunk size: 16 bytes header + frame data
    const anmfDataSize = 16 + chunk.data.length;
    writeUint32LE(buffer, offset, anmfDataSize);
    offset += 4;

    // Frame X position (24-bit, divided by 2)
    writeUint24LE(buffer, offset, 0);
    offset += 3;

    // Frame Y position (24-bit, divided by 2)
    writeUint24LE(buffer, offset, 0);
    offset += 3;

    // Frame width - 1 (24-bit)
    writeUint24LE(buffer, offset, width - 1);
    offset += 3;

    // Frame height - 1 (24-bit)
    writeUint24LE(buffer, offset, height - 1);
    offset += 3;

    // Duration (24-bit, in milliseconds)
    writeUint24LE(buffer, offset, chunk.duration);
    offset += 3;

    // Flags: bit 1 = blending (0 = use alpha), bit 0 = disposal (0 = don't dispose)
    buffer[offset] = 0x02; // Blend with alpha
    offset += 1;

    // Frame data (VP8/VP8L chunk including header)
    buffer.set(chunk.data, offset);
    offset += chunk.data.length;

    // Padding if odd size
    if (chunk.data.length % 2 !== 0) {
      buffer[offset] = 0;
      offset++;
    }
  }

  return new Blob([buffer], { type: 'image/webp' });
}

/**
 * Export frames as animated WebP and trigger download.
 */
export async function exportAnimatedWebP(
  frames: FrameData[],
  filename: string,
  loopCount = 0
): Promise<void> {
  const blob = await createAnimatedWebP(frames, loopCount);
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.webp') ? filename : `${filename}.webp`;
  a.click();

  URL.revokeObjectURL(url);
}
