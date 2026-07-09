import {
  drawReferenceImage,
  type ReferenceDrawableImage,
} from './reference-canvas-draw';
import { ReferenceBitmapCache } from './reference-bitmap-cache';
import type { ReferenceLayerRenderEntry } from './reference-render-plan';

export type ReferenceImageDrawer = (
  context: CanvasRenderingContext2D,
  entry: ReferenceLayerRenderEntry,
  image: ReferenceDrawableImage
) => void;

export interface ReferenceViewportRendererOptions {
  cache: ReferenceBitmapCache;
  requestRedraw: () => void;
  drawImage?: ReferenceImageDrawer;
}

export class ReferenceViewportRenderer {
  private readonly cache: ReferenceBitmapCache;
  private readonly drawImage: ReferenceImageDrawer;
  private readonly pendingLoads = new Set<Promise<ImageBitmap>>();
  private readonly requestRedraw: () => void;

  constructor(options: ReferenceViewportRendererOptions) {
    this.cache = options.cache;
    this.drawImage = options.drawImage ?? drawReferenceImage;
    this.requestRedraw = options.requestRedraw;
  }

  render(
    context: CanvasRenderingContext2D,
    entries: readonly ReferenceLayerRenderEntry[]
  ): void {
    for (const entry of entries) {
      const bitmap = this.cache.getCached(entry);

      if (bitmap) {
        this.drawImage(context, entry, bitmap);
      } else {
        this.loadMissingBitmap(entry);
      }
    }
  }

  private loadMissingBitmap(entry: ReferenceLayerRenderEntry): void {
    let promise: Promise<ImageBitmap>;

    try {
      promise = this.cache.get(entry);
    } catch {
      return;
    }

    if (this.pendingLoads.has(promise)) return;

    this.pendingLoads.add(promise);
    void promise.then(
      () => {
        this.pendingLoads.delete(promise);
        this.requestRedraw();
      },
      () => {
        this.pendingLoads.delete(promise);
      }
    );
  }
}
