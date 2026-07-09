import type { ReferenceLayerRenderEntry } from './reference-render-plan';

export type ReferenceBitmapDecoder = (entry: ReferenceLayerRenderEntry) => Promise<ImageBitmap>;

interface CachedReferenceBitmap {
  key: string;
  bitmap: ImageBitmap;
}

export class ReferenceBitmapCache {
  private readonly decoder: ReferenceBitmapDecoder;
  private readonly cachedByLayer = new Map<string, CachedReferenceBitmap>();
  private readonly byteIds = new WeakMap<Uint8Array, number>();
  private nextByteId = 1;

  constructor(decoder: ReferenceBitmapDecoder = decodeReferenceBitmap) {
    this.decoder = decoder;
  }

  async get(entry: ReferenceLayerRenderEntry): Promise<ImageBitmap> {
    const key = this.getCacheKey(entry);
    const cached = this.cachedByLayer.get(entry.layerId);

    if (cached?.key === key) {
      return cached.bitmap;
    }

    const bitmap = await this.decoder(entry);
    this.replaceCachedBitmap(entry.layerId, key, bitmap);
    return bitmap;
  }

  invalidateLayer(layerId: string): void {
    const cached = this.cachedByLayer.get(layerId);
    if (!cached) return;

    closeReferenceBitmap(cached.bitmap);
    this.cachedByLayer.delete(layerId);
  }

  clear(): void {
    for (const cached of this.cachedByLayer.values()) {
      closeReferenceBitmap(cached.bitmap);
    }
    this.cachedByLayer.clear();
  }

  get size(): number {
    return this.cachedByLayer.size;
  }

  private replaceCachedBitmap(layerId: string, key: string, bitmap: ImageBitmap): void {
    const cached = this.cachedByLayer.get(layerId);
    if (cached && cached.bitmap !== bitmap) {
      closeReferenceBitmap(cached.bitmap);
    }

    this.cachedByLayer.set(layerId, { key, bitmap });
  }

  private getCacheKey(entry: ReferenceLayerRenderEntry): string {
    return `${entry.layerId}:${entry.mimeType}:${this.getByteId(entry.bytes)}`;
  }

  private getByteId(bytes: Uint8Array): number {
    const existing = this.byteIds.get(bytes);
    if (existing) return existing;

    const id = this.nextByteId;
    this.nextByteId += 1;
    this.byteIds.set(bytes, id);
    return id;
  }
}

async function decodeReferenceBitmap(
  entry: ReferenceLayerRenderEntry
): Promise<ImageBitmap> {
  const blob = new Blob([copyBytes(entry.bytes)], { type: entry.mimeType });
  return createImageBitmap(blob);
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes);
  return copy.buffer;
}

function closeReferenceBitmap(bitmap: ImageBitmap): void {
  bitmap.close();
}
