import type { Command } from './index';
import type { Rect } from '../types/geometry';
import { layerStore } from '../stores/layers';
import { dirtyRectStore } from '../stores/dirty-rect';

/**
 * Command for selective undo (patching out a specific change).
 * Stores the before/after data for the patched region,
 * allowing the patch itself to be undone.
 */
export class PatchCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;

  private layerId: string;
  private bounds: Rect;
  private beforeData: Uint8ClampedArray; // Canvas state before patch
  private afterData: Uint8ClampedArray;  // Canvas state after patch (with pixels restored)

  // Estimated memory usage in bytes (for history limit tracking)
  readonly memorySize: number;

  // Public getters for history preview (same interface as OptimizedDrawingCommand)
  get drawBounds(): Rect { return { ...this.bounds }; }
  get drawPreviousData(): Uint8ClampedArray { return this.beforeData; }
  get drawNewData(): Uint8ClampedArray { return this.afterData; }
  get drawLayerId(): string { return this.layerId; }

  constructor(
    layerId: string,
    bounds: Rect,
    beforeData: Uint8ClampedArray,
    afterData: Uint8ClampedArray,
    originalCommandName: string
  ) {
    this.id = crypto.randomUUID();
    this.name = `Patch out: ${originalCommandName}`;
    this.layerId = layerId;
    this.bounds = { ...bounds };
    this.beforeData = beforeData;
    this.afterData = afterData;
    this.timestamp = Date.now();

    // Calculate memory: 2 arrays + object overhead estimate
    this.memorySize = beforeData.byteLength + afterData.byteLength + 200;
  }

  execute(): void {
    const layer = layerStore.layers.value.find(l => l.id === this.layerId);
    if (!layer?.canvas) return;

    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;

    // Apply the patched state (afterData has the pixels restored)
    const imageData = new ImageData(
      new Uint8ClampedArray(this.afterData),
      this.bounds.width,
      this.bounds.height
    );
    ctx.putImageData(imageData, this.bounds.x, this.bounds.y);

    // Mark dirty for re-render
    dirtyRectStore.markDirty(this.bounds);
  }

  undo(): void {
    const layer = layerStore.layers.value.find(l => l.id === this.layerId);
    if (!layer?.canvas) return;

    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;

    // Revert to the state before the patch
    const imageData = new ImageData(
      new Uint8ClampedArray(this.beforeData),
      this.bounds.width,
      this.bounds.height
    );
    ctx.putImageData(imageData, this.bounds.x, this.bounds.y);

    // Mark dirty for re-render
    dirtyRectStore.markDirty(this.bounds);
  }
}
