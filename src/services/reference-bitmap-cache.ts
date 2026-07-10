import type { ReferenceLayerRenderEntry } from './reference-render-plan';

export type ReferenceBitmapDecoder = (entry: ReferenceLayerRenderEntry) => Promise<ImageBitmap>;

interface ReferenceBitmapRecord {
  key: string;
  bitmap?: ImageBitmap;
  promise?: Promise<ImageBitmap>;
}

export class ReferenceBitmapCache {
  private readonly decoder: ReferenceBitmapDecoder;
  private readonly cachedByLayer = new Map<string, ReferenceBitmapRecord>();
  private readonly byteIds = new WeakMap<Uint8Array, number>();
  private nextByteId = 1;

  constructor(decoder: ReferenceBitmapDecoder = decodeReferenceBitmap) {
    this.decoder = decoder;
  }

  get(entry: ReferenceLayerRenderEntry): Promise<ImageBitmap> {
    const key = this.getCacheKey(entry);
    const cached = this.cachedByLayer.get(entry.layerId);

    if (cached?.key === key) {
      if (cached.bitmap) return Promise.resolve(cached.bitmap);
      if (cached.promise) return cached.promise;
    }

    const record = this.createPendingRecord(entry.layerId, key, entry);
    this.replaceCachedRecord(entry.layerId, record);
    return record.promise!;
  }

  getCached(entry: ReferenceLayerRenderEntry): ImageBitmap | null {
    const key = this.getCacheKey(entry);
    const cached = this.cachedByLayer.get(entry.layerId);

    if (cached?.key !== key) return null;
    return cached.bitmap ?? null;
  }

  invalidateLayer(layerId: string): void {
    const cached = this.cachedByLayer.get(layerId);
    if (!cached) return;

    closeCachedBitmap(cached);
    this.cachedByLayer.delete(layerId);
  }

  clear(): void {
    for (const cached of this.cachedByLayer.values()) {
      closeCachedBitmap(cached);
    }
    this.cachedByLayer.clear();
  }

  get size(): number {
    return this.cachedByLayer.size;
  }

  private createPendingRecord(
    layerId: string,
    key: string,
    entry: ReferenceLayerRenderEntry
  ): ReferenceBitmapRecord {
    const record: ReferenceBitmapRecord = { key };

    record.promise = this.decoder(entry)
      .then((bitmap) => {
        if (this.cachedByLayer.get(layerId) !== record) {
          closeReferenceBitmap(bitmap);
          return bitmap;
        }

        record.bitmap = bitmap;
        record.promise = undefined;
        return bitmap;
      })
      .catch((error: unknown) => {
        if (this.cachedByLayer.get(layerId) === record) {
          this.cachedByLayer.delete(layerId);
        }

        throw error;
      });

    return record;
  }

  private replaceCachedRecord(layerId: string, record: ReferenceBitmapRecord): void {
    const cached = this.cachedByLayer.get(layerId);
    if (cached && cached !== record) {
      closeCachedBitmap(cached);
    }

    this.cachedByLayer.set(layerId, record);
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

function closeCachedBitmap(record: ReferenceBitmapRecord): void {
  if (record.bitmap) {
    closeReferenceBitmap(record.bitmap);
  }
}

function closeReferenceBitmap(bitmap: ImageBitmap): void {
  bitmap.close();
}
