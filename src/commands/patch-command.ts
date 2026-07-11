import type { Command } from './index';
import type { Rect } from '../types/geometry';
import { getActiveProjectContext, type ProjectContext } from '../stores/project-context';

type PatchCommandContext = Pick<ProjectContext, 'animation' | 'dirtyRect'>;

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
  private frameId: string;
  private bounds: Rect;
  private beforeData: Uint8ClampedArray; // Canvas state before patch
  private afterData: Uint8ClampedArray; // Canvas state after patch (with pixels restored)
  private readonly context: PatchCommandContext;

  // Estimated memory usage in bytes (for history limit tracking)
  readonly memorySize: number;

  // Public getters for history preview (same interface as OptimizedDrawingCommand)
  get drawBounds(): Rect {
    return { ...this.bounds };
  }
  get drawPreviousData(): Uint8ClampedArray {
    return this.beforeData;
  }
  get drawNewData(): Uint8ClampedArray {
    return this.afterData;
  }
  get drawLayerId(): string {
    return this.layerId;
  }
  get drawFrameId(): string {
    return this.frameId;
  }

  constructor(
    layerId: string,
    frameId: string,
    bounds: Rect,
    beforeData: Uint8ClampedArray,
    afterData: Uint8ClampedArray,
    originalCommandName: string,
    context: PatchCommandContext = getActiveProjectContext()
  ) {
    this.id = crypto.randomUUID();
    this.name = `Patch out: ${originalCommandName}`;
    this.context = context;
    this.layerId = layerId;
    this.frameId = frameId;
    this.bounds = { ...bounds };
    this.beforeData = beforeData;
    this.afterData = afterData;
    this.timestamp = Date.now();

    // Calculate memory: 2 arrays + object overhead estimate
    this.memorySize = beforeData.byteLength + afterData.byteLength + 200;
  }

  execute(): void {
    this.applyData(this.afterData);
  }

  undo(): void {
    this.applyData(this.beforeData);
  }

  private applyData(data: Uint8ClampedArray): void {
    const canvas = this.context.animation.getEditableCelCanvas(this.layerId, this.frameId);
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    // Rebuild ImageData from the stored array before writing it back.
    const imageData = new ImageData(
      new Uint8ClampedArray(data),
      this.bounds.width,
      this.bounds.height
    );
    ctx.putImageData(imageData, this.bounds.x, this.bounds.y);

    // Mark dirty for re-render
    this.context.dirtyRect.markDirty(this.bounds);
  }
}
