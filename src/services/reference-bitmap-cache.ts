import type { ReferenceLayerRenderEntry } from './reference-render-plan';

type ClosableBitmap = { close?: () => void };

export type ReferenceBitmapDecoder<TBitmap extends ClosableBitmap = ImageBitmap> = (
  entry: ReferenceLayerRenderEntry
) => Promise<TBitmap>;

export interface ReferenceBitmapCacheOptions<TBitmap extends ClosableBitmap = ImageBitmap> {
  decode?: ReferenceBitmapDecoder<TBitmap>;
}

interface CacheRecord<TBitmap extends ClosableBitmap> {
  key: string;
  bitmap?: TBitmap;
  promise?: Promise<TBitmap>;
}

function hashBytes(bytes: Uint8Array): string {
  let hash = 2166136261;

  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function createCacheKey(entry: ReferenceLayerRenderEntry): string {
  return `${entry.layerId}:${entry.mimeType}:${entry.bytes.length}:${hashBytes(entry.bytes)}`;
}

function closeBitmap(bitmap: ClosableBitmap | undefined): void {
  bitmap?.close?.();
}

async function decodeReferenceBitmap(entry: ReferenceLayerRenderEntry): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('createImageBitmap is not available in this environment');
  }

  const bytes = new ArrayBuffer(entry.bytes.byteLength);
  new Uint8Array(bytes).set(entry.bytes);
  const blob = new Blob([bytes], { type: entry.mimeType });
  return createImageBitmap(blob);
}

export class ReferenceBitmapCache<TBitmap extends ClosableBitmap = ImageBitmap> {
  private readonly decode: ReferenceBitmapDecoder<TBitmap>;
  private readonly records = new Map<string, CacheRecord<TBitmap>>();

  constructor(options: ReferenceBitmapCacheOptions<TBitmap> = {}) {
    this.decode =
      options.decode ??
      (decodeReferenceBitmap as unknown as ReferenceBitmapDecoder<TBitmap>);
  }

  get size(): number {
    return this.records.size;
  }

  get(entry: ReferenceLayerRenderEntry): Promise<TBitmap> {
    const key = createCacheKey(entry);
    const cached = this.records.get(entry.layerId);

    if (cached?.key === key) {
      if (cached.bitmap) return Promise.resolve(cached.bitmap);
      if (cached.promise) return cached.promise;
    }

    if (cached && cached.key !== key) {
      closeBitmap(cached.bitmap);
    }

    const record: CacheRecord<TBitmap> = { key };
    record.promise = this.decode(entry).then((bitmap) => {
      if (this.records.get(entry.layerId) !== record) {
        closeBitmap(bitmap);
        return bitmap;
      }

      record.bitmap = bitmap;
      record.promise = undefined;
      return bitmap;
    });
    this.records.set(entry.layerId, record);

    return record.promise;
  }

  clear(): void {
    for (const record of this.records.values()) {
      closeBitmap(record.bitmap);
    }

    this.records.clear();
  }
}
