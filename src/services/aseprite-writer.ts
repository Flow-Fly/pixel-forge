import pako from 'pako';
import { animationStore } from '../stores/animation';
import { layerStore } from '../stores/layers';
import { projectStore } from '../stores/project';

/**
 * Aseprite (.ase/.aseprite) file writer
 * Exports as RGBA (32bpp) format for maximum compatibility.
 */

// Chunk types
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;

// Cel types
const CEL_TYPE_COMPRESSED = 2;

// Blend modes (Aseprite uses these values)
const BLEND_MODES: Record<string, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  darken: 4,
  lighten: 5,
};

class AseWriter {
  private offset: number = 0;
  private buffer: ArrayBuffer;

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
  }

  writeByte(value: number) {
    new DataView(this.buffer).setUint8(this.offset++, value);
  }

  writeWord(value: number) {
    new DataView(this.buffer).setUint16(this.offset, value, true);
    this.offset += 2;
  }

  writeShort(value: number) {
    new DataView(this.buffer).setInt16(this.offset, value, true);
    this.offset += 2;
  }

  writeDword(value: number) {
    new DataView(this.buffer).setUint32(this.offset, value, true);
    this.offset += 4;
  }

  writeLong(value: number) {
    new DataView(this.buffer).setInt32(this.offset, value, true);
    this.offset += 4;
  }

  writeBytes(data: Uint8Array) {
    new Uint8Array(this.buffer).set(data, this.offset);
    this.offset += data.length;
  }

  writeString(str: string) {
    const encoded = new TextEncoder().encode(str);
    this.writeWord(encoded.length);
    this.writeBytes(encoded);
  }

  writeZeros(count: number) {
    for (let i = 0; i < count; i++) {
      this.writeByte(0);
    }
  }

  position(): number {
    return this.offset;
  }

  seek(pos: number) {
    this.offset = pos;
  }

  getBuffer(): ArrayBuffer {
    return this.buffer;
  }
}

/**
 * Create layer chunk data.
 */
function createLayerChunk(
  layer: { name: string; visible: boolean; opacity: number; blendMode: string },
  _index: number
): Uint8Array {
  const nameBytes = new TextEncoder().encode(layer.name);
  const chunkSize = 6 + 18 + 2 + nameBytes.length;
  const buffer = new ArrayBuffer(chunkSize);
  const writer = new AseWriter(buffer);

  // Chunk header
  writer.writeDword(chunkSize);
  writer.writeWord(CHUNK_LAYER);

  // Layer data
  const flags = layer.visible ? 1 : 0; // Bit 0 = visible
  writer.writeWord(flags);
  writer.writeWord(0); // Type: normal image layer
  writer.writeWord(0); // Child level
  writer.writeWord(0); // Default width (ignored)
  writer.writeWord(0); // Default height (ignored)
  writer.writeWord(BLEND_MODES[layer.blendMode] || 0);
  writer.writeByte(layer.opacity);
  writer.writeZeros(3); // Reserved
  writer.writeString(layer.name);

  return new Uint8Array(buffer);
}

/**
 * Create cel chunk data with compressed pixels.
 */
function createCelChunk(
  layerIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
  pixels: Uint8Array
): Uint8Array {
  // Compress pixel data
  const compressed = pako.deflate(pixels);

  const celHeaderSize = 16 + 4; // header fields + width/height
  const chunkSize = 6 + celHeaderSize + compressed.length;
  const buffer = new ArrayBuffer(chunkSize);
  const writer = new AseWriter(buffer);

  // Chunk header
  writer.writeDword(chunkSize);
  writer.writeWord(CHUNK_CEL);

  // Cel data
  writer.writeWord(layerIndex);
  writer.writeShort(x);
  writer.writeShort(y);
  writer.writeByte(255); // Opacity (255 = full)
  writer.writeWord(CEL_TYPE_COMPRESSED);
  writer.writeShort(0); // z-index
  writer.writeZeros(5); // Reserved
  writer.writeWord(width);
  writer.writeWord(height);
  writer.writeBytes(compressed);

  return new Uint8Array(buffer);
}

/**
 * Export current project as Aseprite file.
 */
export function writeAseFile(): ArrayBuffer {
  const layers = layerStore.layers.value;
  const frames = animationStore.frames.value;
  const width = projectStore.width.value;
  const height = projectStore.height.value;

  // Collect all chunks first to calculate exact size
  const frameData: Array<{
    duration: number;
    chunks: Uint8Array[];
  }> = [];

  frames.forEach((frame, frameIndex) => {
    const chunks: Uint8Array[] = [];

    // Layer chunks only in first frame
    if (frameIndex === 0) {
      layers.forEach((layer, layerIdx) => {
        chunks.push(
          createLayerChunk(
            {
              name: layer.name,
              visible: layer.visible,
              opacity: layer.opacity,
              blendMode: layer.blendMode,
            },
            layerIdx
          )
        );
      });
    }

    // Cel chunks
    layers.forEach((layer, layerIdx) => {
      const celCanvas = animationStore.getCelCanvas(frame.id, layer.id);
      if (celCanvas) {
        const ctx = celCanvas.getContext('2d')!;
        const imageData = ctx.getImageData(0, 0, width, height);

        // Check if cel has any non-transparent pixels
        const hasContent = imageData.data.some((v, i) => i % 4 === 3 && v > 0);
        if (hasContent) {
          // Convert Uint8ClampedArray to Uint8Array for pako compression
          const pixelData = new Uint8Array(imageData.data);
          chunks.push(createCelChunk(layerIdx, 0, 0, width, height, pixelData));
        }
      }
    });

    frameData.push({ duration: frame.duration, chunks });
  });

  // Calculate total size
  let totalSize = 128; // Header
  frameData.forEach((fd) => {
    totalSize += 16; // Frame header
    fd.chunks.forEach((chunk) => {
      totalSize += chunk.length;
    });
  });

  // Write file
  const buffer = new ArrayBuffer(totalSize);
  const writer = new AseWriter(buffer);

  // Write header
  writer.writeDword(totalSize); // File size
  writer.writeWord(0xa5e0); // Magic number
  writer.writeWord(frames.length); // Number of frames
  writer.writeWord(width);
  writer.writeWord(height);
  writer.writeWord(32); // Color depth: RGBA
  writer.writeDword(1); // Flags: layer opacity valid
  writer.writeWord(100); // Speed (deprecated)
  writer.writeDword(0); // Reserved
  writer.writeDword(0); // Reserved
  writer.writeByte(0); // Transparent color index (not used for RGBA)
  writer.writeZeros(3); // Reserved
  writer.writeWord(0); // Number of colors (0 for non-indexed)
  writer.writeByte(1); // Pixel width
  writer.writeByte(1); // Pixel height
  writer.writeShort(0); // X position of grid
  writer.writeShort(0); // Y position of grid
  writer.writeWord(16); // Grid width
  writer.writeWord(16); // Grid height
  writer.writeZeros(84); // Reserved

  // Write frames
  frameData.forEach((fd) => {
    const frameStart = writer.position();

    // Frame header (16 bytes)
    writer.writeDword(0); // Frame size (will fill in later)
    writer.writeWord(0xf1fa); // Frame magic
    const chunkCount = fd.chunks.length;
    writer.writeWord(chunkCount < 0xffff ? chunkCount : 0xffff);
    writer.writeWord(fd.duration);
    writer.writeZeros(2); // Reserved
    writer.writeDword(chunkCount >= 0xffff ? chunkCount : 0);

    // Write chunks
    fd.chunks.forEach((chunk) => {
      writer.writeBytes(chunk);
    });

    // Fill in frame size
    const frameEnd = writer.position();
    const frameSize = frameEnd - frameStart;
    writer.seek(frameStart);
    writer.writeDword(frameSize);
    writer.seek(frameEnd);
  });

  return buffer;
}

/**
 * Export and download as .ase file.
 */
export function exportAseFile(filename: string) {
  const buffer = writeAseFile();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ase') ? filename : `${filename}.ase`;
  a.click();

  URL.revokeObjectURL(url);
}
