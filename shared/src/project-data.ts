import type { LegacyProjectImageData, ProjectFile, ProjectFileInput } from './project.js';

declare function atob(data: string): string;

const LEGACY_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?|[A-Za-z0-9+/]{4})?$/;

export function normalizeProjectFileImageData(file: ProjectFileInput): ProjectFile {
  return {
    ...file,
    layers: file.layers.map((layer) => ({
      ...layer,
      data: normalizeProjectImageData(layer.data),
      referenceData: layer.referenceData
        ? {
            ...layer.referenceData,
            bytes: normalizeProjectImageData(layer.referenceData.bytes),
          }
        : undefined,
    })),
    frames: file.frames.map((frame) => ({
      ...frame,
      cels: frame.cels.map((cel) => ({
        ...cel,
        data: normalizeProjectImageData(cel.data),
      })),
    })),
  };
}

export function normalizeProjectImageData(data: LegacyProjectImageData): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return decodeLegacyBase64ImageData(data);
  if (!isSerializedProjectImageData(data)) {
    throw new TypeError('Invalid serialized project image data');
  }
  return serializedBytesToUint8Array(data);
}

function isProjectByte(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
}

export function isProjectByteArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isProjectByte);
}

export function isSerializedProjectImageData(value: unknown): value is Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  // Serialized Uint8Arrays have contiguous 0..length-1 keys. Requiring that
  // shape keeps normalization allocations bounded by the supplied entries.
  return Object.entries(value).every(
    ([key, byte], index) => key === String(index) && isProjectByte(byte)
  );
}

export function hasProjectImageData(data: Uint8Array): boolean {
  return data.length > 0;
}

function serializedBytesToUint8Array(data: Record<string, number>): Uint8Array {
  return Uint8Array.from(Object.values(data));
}

function decodeLegacyBase64ImageData(data: string): Uint8Array {
  const base64 = getBase64Payload(data.trim());
  if (!base64) {
    throw new TypeError('Legacy project image data is empty');
  }

  try {
    return base64ToUint8Array(base64);
  } catch (error) {
    throw new TypeError('Invalid legacy base64 project image data', { cause: error });
  }
}

function getBase64Payload(data: string): string {
  if (!data) return '';
  if (!data.startsWith('data:')) return data;

  const commaIndex = data.indexOf(',');
  if (commaIndex === -1) {
    throw new TypeError('Invalid legacy base64 data URL');
  }

  const metadata = data.slice(0, commaIndex).toLowerCase();
  if (!metadata.includes(';base64')) {
    throw new TypeError('Unsupported legacy image data URL: expected base64');
  }
  return data.slice(commaIndex + 1);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const compactBase64 = base64.replace(/\s/g, '');
  if (!LEGACY_BASE64_PATTERN.test(compactBase64)) {
    throw new TypeError('Invalid base64 payload');
  }

  const binary = atob(compactBase64);
  if (binary.length === 0) throw new TypeError('Empty base64 payload');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
