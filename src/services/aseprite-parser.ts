import pako from 'pako';

/**
 * Aseprite (.ase/.aseprite) file parser
 * Based on: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
 */

// Chunk types
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;
const CHUNK_TAGS = 0x2018;
const CHUNK_PALETTE = 0x2019;

// Cel types
const CEL_TYPE_RAW = 0;
const CEL_TYPE_LINKED = 1;
const CEL_TYPE_COMPRESSED = 2;

export interface AseHeader {
  fileSize: number;
  magic: number;
  frames: number;
  width: number;
  height: number;
  colorDepth: number; // 8 (indexed), 16 (grayscale), 32 (RGBA)
  flags: number;
  speed: number; // deprecated, use frame duration
  transparentIndex: number;
  numColors: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface AseLayer {
  flags: number;
  type: number; // 0=normal, 1=group, 2=tilemap
  childLevel: number;
  name: string;
  opacity: number;
  blendMode: number;
}

export interface AseCel {
  layerIndex: number;
  x: number;
  y: number;
  opacity: number;
  celType: number;
  linkedFrame?: number;
  width?: number;
  height?: number;
  pixels?: Uint8Array;
}

export interface AseFrame {
  duration: number;
  cels: AseCel[];
}

export interface AsePaletteEntry {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface AseTag {
  fromFrame: number;
  toFrame: number;
  loopDirection: number; // 0=forward, 1=reverse, 2=ping-pong, 3=ping-pong-reverse
  repeatCount: number;
  color: { r: number; g: number; b: number };
  name: string;
}

export interface AseFile {
  header: AseHeader;
  layers: AseLayer[];
  frames: AseFrame[];
  palette: AsePaletteEntry[];
  tags: AseTag[];
}

class AseReader {
  private view: DataView;
  private offset: number = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  readByte(): number {
    return this.view.getUint8(this.offset++);
  }

  readWord(): number {
    const val = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return val;
  }

  readShort(): number {
    const val = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return val;
  }

  readDword(): number {
    const val = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readLong(): number {
    const val = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readBytes(count: number): Uint8Array {
    const data = new Uint8Array(this.view.buffer, this.offset, count);
    this.offset += count;
    return data;
  }

  readString(): string {
    const length = this.readWord();
    const bytes = this.readBytes(length);
    return new TextDecoder('utf-8').decode(bytes);
  }

  skip(count: number) {
    this.offset += count;
  }

  seek(position: number) {
    this.offset = position;
  }

  position(): number {
    return this.offset;
  }
}

export function parseAseFile(buffer: ArrayBuffer): AseFile {
  const reader = new AseReader(buffer);

  // Read header (128 bytes)
  const header = readHeader(reader);

  if (header.magic !== 0xa5e0) {
    throw new Error('Invalid Aseprite file: bad magic number');
  }

  const layers: AseLayer[] = [];
  const frames: AseFrame[] = [];
  const palette: AsePaletteEntry[] = [];
  const tags: AseTag[] = [];

  // Read frames
  for (let i = 0; i < header.frames; i++) {
    const frame = readFrame(reader, header, layers, palette, tags, i === 0);
    frames.push(frame);
  }

  return { header, layers, frames, palette, tags };
}

function readHeader(reader: AseReader): AseHeader {
  const fileSize = reader.readDword();
  const magic = reader.readWord();
  const frames = reader.readWord();
  const width = reader.readWord();
  const height = reader.readWord();
  const colorDepth = reader.readWord();
  const flags = reader.readDword();
  const speed = reader.readWord();
  reader.skip(8); // Reserved
  const transparentIndex = reader.readByte();
  reader.skip(3); // Reserved
  const numColors = reader.readWord();
  const pixelWidth = reader.readByte();
  const pixelHeight = reader.readByte();
  reader.skip(92); // Rest of header

  return {
    fileSize,
    magic,
    frames,
    width,
    height,
    colorDepth,
    flags,
    speed,
    transparentIndex,
    numColors: numColors || 256,
    pixelWidth: pixelWidth || 1,
    pixelHeight: pixelHeight || 1,
  };
}

function readFrame(
  reader: AseReader,
  header: AseHeader,
  layers: AseLayer[],
  palette: AsePaletteEntry[],
  tags: AseTag[],
  isFirstFrame: boolean
): AseFrame {
  const frameStart = reader.position();

  reader.readDword(); // Frame size
  const frameMagic = reader.readWord();
  if (frameMagic !== 0xf1fa) {
    throw new Error('Invalid frame magic');
  }

  let chunkCount = reader.readWord();
  const duration = reader.readWord() || header.speed;
  reader.skip(2); // Reserved

  const newChunkCount = reader.readDword();
  if (newChunkCount !== 0) {
    chunkCount = newChunkCount;
  }

  const cels: AseCel[] = [];

  // Read chunks
  for (let i = 0; i < chunkCount; i++) {
    const chunkStart = reader.position();
    const chunkSize = reader.readDword();
    const chunkType = reader.readWord();

    switch (chunkType) {
      case CHUNK_LAYER:
        if (isFirstFrame) {
          layers.push(readLayerChunk(reader));
        }
        break;
      case CHUNK_CEL:
        cels.push(readCelChunk(reader, header, chunkSize - 6));
        break;
      case CHUNK_TAGS:
        if (isFirstFrame) {
          readTagsChunk(reader, tags);
        }
        break;
      case CHUNK_PALETTE:
        if (isFirstFrame) {
          readPaletteChunk(reader, palette);
        }
        break;
      default:
        // Skip unknown chunks
        break;
    }

    // Jump to next chunk
    reader.seek(chunkStart + chunkSize);
  }

  return { duration, cels };
}

function readLayerChunk(reader: AseReader): AseLayer {
  const flags = reader.readWord();
  const type = reader.readWord();
  const childLevel = reader.readWord();
  reader.readWord(); // Default width (ignored)
  reader.readWord(); // Default height (ignored)
  const blendMode = reader.readWord();
  const opacity = reader.readByte();
  reader.skip(3); // Reserved
  const name = reader.readString();

  return { flags, type, childLevel, name, opacity, blendMode };
}

function readCelChunk(reader: AseReader, header: AseHeader, dataSize: number): AseCel {
  const layerIndex = reader.readWord();
  const x = reader.readShort();
  const y = reader.readShort();
  const opacity = reader.readByte();
  const celType = reader.readWord();
  const zIndex = reader.readShort(); // z-index (we ignore for now)
  reader.skip(5); // Reserved

  const cel: AseCel = {
    layerIndex,
    x,
    y,
    opacity,
    celType,
  };

  if (celType === CEL_TYPE_LINKED) {
    cel.linkedFrame = reader.readWord();
  } else if (celType === CEL_TYPE_RAW || celType === CEL_TYPE_COMPRESSED) {
    cel.width = reader.readWord();
    cel.height = reader.readWord();

    const headerBytes = 2 + 2 + 2 + 1 + 2 + 2 + 5 + 2 + 2; // Everything we've read so far
    const pixelDataSize = dataSize - headerBytes;

    if (celType === CEL_TYPE_COMPRESSED) {
      const compressedData = reader.readBytes(pixelDataSize);
      cel.pixels = pako.inflate(compressedData);
    } else {
      cel.pixels = reader.readBytes(pixelDataSize);
    }
  }

  return cel;
}

function readPaletteChunk(reader: AseReader, palette: AsePaletteEntry[]) {
  const numEntries = reader.readDword();
  const firstIndex = reader.readDword();
  const lastIndex = reader.readDword();
  reader.skip(8); // Reserved

  for (let i = firstIndex; i <= lastIndex; i++) {
    const flags = reader.readWord();
    const r = reader.readByte();
    const g = reader.readByte();
    const b = reader.readByte();
    const a = reader.readByte();

    if (flags & 1) {
      // Has name
      reader.readString();
    }

    palette[i] = { r, g, b, a };
  }
}

function readTagsChunk(reader: AseReader, tags: AseTag[]) {
  const numTags = reader.readWord();
  reader.skip(8); // Reserved

  for (let i = 0; i < numTags; i++) {
    const fromFrame = reader.readWord();
    const toFrame = reader.readWord();
    const loopDirection = reader.readByte();
    const repeatCount = reader.readWord();
    reader.skip(6); // Reserved (was 10 bytes total, but repeatCount is 2 bytes)
    const r = reader.readByte();
    const g = reader.readByte();
    const b = reader.readByte();
    reader.skip(1); // Extra byte (padding)
    const name = reader.readString();

    tags.push({
      fromFrame,
      toFrame,
      loopDirection,
      repeatCount,
      color: { r, g, b },
      name,
    });
  }
}

/**
 * Convert Aseprite pixels to RGBA canvas ImageData.
 */
export function celToImageData(
  cel: AseCel,
  header: AseHeader,
  palette: AsePaletteEntry[]
): ImageData | null {
  if (!cel.pixels || !cel.width || !cel.height) {
    return null;
  }

  const imageData = new ImageData(cel.width, cel.height);
  const data = imageData.data;
  const pixels = cel.pixels;

  if (header.colorDepth === 32) {
    // RGBA - direct copy
    for (let i = 0; i < pixels.length; i++) {
      data[i] = pixels[i];
    }
  } else if (header.colorDepth === 16) {
    // Grayscale with alpha
    for (let i = 0; i < pixels.length / 2; i++) {
      const gray = pixels[i * 2];
      const alpha = pixels[i * 2 + 1];
      const j = i * 4;
      data[j] = gray;
      data[j + 1] = gray;
      data[j + 2] = gray;
      data[j + 3] = alpha;
    }
  } else if (header.colorDepth === 8) {
    // Indexed
    for (let i = 0; i < pixels.length; i++) {
      const index = pixels[i];
      const j = i * 4;

      if (index === header.transparentIndex) {
        data[j] = 0;
        data[j + 1] = 0;
        data[j + 2] = 0;
        data[j + 3] = 0;
      } else {
        const color = palette[index] || { r: 0, g: 0, b: 0, a: 255 };
        data[j] = color.r;
        data[j + 1] = color.g;
        data[j + 2] = color.b;
        data[j + 3] = color.a;
      }
    }
  }

  return imageData;
}
