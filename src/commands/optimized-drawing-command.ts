import type { Command } from './index';
import type { Rect } from '../types/geometry';
import { layerStore } from '../stores/layers';
import { dirtyRectStore } from '../stores/dirty-rect';

/**
 * Memory-efficient drawing command that stores only the dirty region.
 * Uses raw Uint8ClampedArray instead of full ImageData for reduced overhead.
 */
export class OptimizedDrawingCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;

  private layerId: string;
  private bounds: Rect;
  private previousData: Uint8ClampedArray;
  private newData: Uint8ClampedArray;

  // Estimated memory usage in bytes (for history limit tracking)
  readonly memorySize: number;

  // Public getters for accessing private drawing data (used by history preview)
  get drawBounds(): Rect { return { ...this.bounds }; }
  get drawPreviousData(): Uint8ClampedArray { return this.previousData; }
  get drawNewData(): Uint8ClampedArray { return this.newData; }
  get drawLayerId(): string { return this.layerId; }

  constructor(
    layerId: string,
    bounds: Rect,
    previousData: Uint8ClampedArray,
    newData: Uint8ClampedArray,
    name: string = 'Drawing'
  ) {
    this.id = crypto.randomUUID();
    this.name = name;
    this.layerId = layerId;
    this.bounds = { ...bounds }; // Copy to avoid reference issues
    this.previousData = previousData;
    this.newData = newData;
    this.timestamp = Date.now();

    // Calculate memory: 2 arrays + object overhead estimate
    this.memorySize = previousData.byteLength + newData.byteLength + 200;
  }

  execute(): void {
    const layer = layerStore.layers.value.find(l => l.id === this.layerId);
    if (!layer?.canvas) return;

    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;

    // Create ImageData from stored array
    const imageData = new ImageData(
      new Uint8ClampedArray(this.newData), // Clone to create valid ImageData
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

    // Create ImageData from stored array
    const imageData = new ImageData(
      new Uint8ClampedArray(this.previousData), // Clone to create valid ImageData
      this.bounds.width,
      this.bounds.height
    );
    ctx.putImageData(imageData, this.bounds.x, this.bounds.y);

    // Mark dirty for re-render
    dirtyRectStore.markDirty(this.bounds);
  }
}

/**
 * Optimized brush stroke command.
 */
export class OptimizedBrushCommand extends OptimizedDrawingCommand {
  constructor(
    layerId: string,
    bounds: Rect,
    previousData: Uint8ClampedArray,
    newData: Uint8ClampedArray
  ) {
    super(layerId, bounds, previousData, newData, 'Brush Stroke');
  }
}

/**
 * Optimized fill command.
 */
export class OptimizedFillCommand extends OptimizedDrawingCommand {
  constructor(
    layerId: string,
    bounds: Rect,
    previousData: Uint8ClampedArray,
    newData: Uint8ClampedArray
  ) {
    super(layerId, bounds, previousData, newData, 'Fill');
  }
}

/**
 * Optimized shape command.
 */
export class OptimizedShapeCommand extends OptimizedDrawingCommand {
  constructor(
    layerId: string,
    bounds: Rect,
    previousData: Uint8ClampedArray,
    newData: Uint8ClampedArray,
    shapeType: 'Line' | 'Rectangle' | 'Ellipse'
  ) {
    super(layerId, bounds, previousData, newData, `Draw ${shapeType}`);
  }
}
