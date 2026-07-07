import type {
  LegacyProjectImageData,
  ProjectFile,
  ProjectFileInput,
} from '../types/project';

export function normalizeProjectFileImageData(
  file: ProjectFileInput
): ProjectFile {
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

export function normalizeProjectImageData(
  data: LegacyProjectImageData
): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') return decodeLegacyBase64ImageData(data);
  return serializedBytesToUint8Array(data);
}

export function hasProjectImageData(data: Uint8Array): boolean {
  return data.length > 0;
}

function serializedBytesToUint8Array(data: Record<string, number>): Uint8Array {
  const keys = Object.keys(data)
    .map(Number)
    .filter((key) => Number.isInteger(key) && key >= 0)
    .sort((a, b) => a - b);

  if (keys.length === 0) return new Uint8Array(0);

  const bytes = new Uint8Array(keys[keys.length - 1] + 1);
  for (const key of keys) {
    bytes[key] = data[String(key)] ?? 0;
  }
  return bytes;
}

function decodeLegacyBase64ImageData(data: string): Uint8Array {
  const base64 = getBase64Payload(data.trim());
  if (!base64) return new Uint8Array(0);

  try {
    return base64ToUint8Array(base64);
  } catch {
    return new Uint8Array(0);
  }
}

function getBase64Payload(data: string): string {
  if (!data) return '';
  if (!data.startsWith('data:')) return data;

  const commaIndex = data.indexOf(',');
  if (commaIndex === -1) return '';

  const metadata = data.slice(0, commaIndex).toLowerCase();
  return metadata.includes(';base64') ? data.slice(commaIndex + 1) : '';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
