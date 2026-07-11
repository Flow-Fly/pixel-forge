import type { Command } from './index';
import type { Rect } from '../types/geometry';
import { getActiveProjectContext, type ProjectContext } from '../stores/project-context';
import { writeIndexRegion } from '../utils/buffer-region';

type DrawingCommandContext = Pick<ProjectContext, 'animation' | 'dirtyRect'>;

/**
 * Memory-efficient drawing command that stores only the dirty region.
 * Uses raw Uint8ClampedArray instead of full ImageData for reduced overhead.
 * Also stores index buffer changes for indexed color mode.
 */
export class OptimizedDrawingCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;

  private layerId: string;
  private frameId: string;
  private bounds: Rect;
  private previousData: Uint8ClampedArray;
  private newData: Uint8ClampedArray;

  // Index buffer data for indexed color mode
  private previousIndexData: Uint8Array | null = null;
  private newIndexData: Uint8Array | null = null;
  private canvasWidth: number = 0;
  private readonly context: DrawingCommandContext;

  // Estimated memory usage in bytes (for history limit tracking)
  readonly memorySize: number;

  // Public getters for accessing private drawing data (used by history preview)
  get drawBounds(): Rect {
    return { ...this.bounds };
  }
  get drawPreviousData(): Uint8ClampedArray {
    return this.previousData;
  }
  get drawNewData(): Uint8ClampedArray {
    return this.newData;
  }
  get drawLayerId(): string {
    return this.layerId;
  }
  get drawFrameId(): string {
    return this.frameId;
  }

  constructor(
    layerId: string,
    bounds: Rect,
    previousData: Uint8ClampedArray,
    newData: Uint8ClampedArray,
    name: string = 'Drawing',
    indexBufferData?: {
      frameId: string;
      canvasWidth: number;
      previousIndexData: Uint8Array;
      newIndexData: Uint8Array;
    },
    context: DrawingCommandContext = getActiveProjectContext()
  ) {
    this.id = crypto.randomUUID();
    this.name = name;
    this.context = context;
    this.layerId = layerId;
    this.frameId = indexBufferData?.frameId ?? this.context.animation.currentFrameId.value;
    this.bounds = { ...bounds }; // Copy to avoid reference issues
    this.previousData = previousData;
    this.newData = newData;
    this.timestamp = Date.now();

    // Store index buffer data if provided
    if (indexBufferData) {
      this.canvasWidth = indexBufferData.canvasWidth;
      this.previousIndexData = indexBufferData.previousIndexData;
      this.newIndexData = indexBufferData.newIndexData;
    }

    // Calculate memory: 2 RGBA arrays + 2 index arrays (if present) + object overhead
    let indexMemory = 0;
    if (this.previousIndexData && this.newIndexData) {
      indexMemory = this.previousIndexData.byteLength + this.newIndexData.byteLength;
    }
    this.memorySize = previousData.byteLength + newData.byteLength + indexMemory + 200;
  }

  execute(): void {
    this.applyData(this.newData, this.newIndexData);
  }

  undo(): void {
    this.applyData(this.previousData, this.previousIndexData);
  }

  private applyData(pixelData: Uint8ClampedArray, indexData: Uint8Array | null): void {
    const canvas = this.context.animation.getEditableCelCanvas(this.layerId, this.frameId);
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const imageData = new ImageData(
      new Uint8ClampedArray(pixelData),
      this.bounds.width,
      this.bounds.height
    );
    ctx.putImageData(imageData, this.bounds.x, this.bounds.y);

    if (indexData) {
      this.restoreIndexBufferRegion(indexData);
    }

    this.context.dirtyRect.markDirty(this.bounds);
  }

  /**
   * Restore a region of the index buffer from stored data.
   */
  private restoreIndexBufferRegion(indexData: Uint8Array): void {
    const indexBuffer = this.context.animation.getCelIndexBuffer(this.layerId, this.frameId);
    if (!indexBuffer || this.canvasWidth === 0) return;

    writeIndexRegion(indexBuffer, this.canvasWidth, this.bounds, indexData);
  }
}
