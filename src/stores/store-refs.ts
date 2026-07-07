/**
 * Late-bound references between mutually dependent stores.
 *
 * The animation, palette, and project stores call into each other at
 * runtime. Importing each other directly creates import cycles, so the
 * stores register themselves here at module-initialization time and
 * consumers resolve the reference at call time instead.
 */

interface ReadableRef<T> {
  readonly value: T;
}

/** Subset of the animation store the palette store depends on. */
export interface AnimationSource {
  currentFrameId: ReadableRef<string>;
  cels: ReadableRef<
    Map<string, { canvas: HTMLCanvasElement | null; layerId: string; frameId: string }>
  >;
  getCelKey(layerId: string, frameId: string): string;
  scanUsedColors(): Set<string>;
  scanUsedColorsFromCanvas(): Set<string>;
}

/** Subset of the project store the animation store depends on. */
export interface CanvasSizeSource {
  width: ReadableRef<number>;
  height: ReadableRef<number>;
}

let animationSource: AnimationSource | null = null;
let canvasSizeSource: CanvasSizeSource | null = null;

export function registerAnimationSource(source: AnimationSource): void {
  animationSource = source;
}

/** Null until the animation store module has been evaluated. */
export function getAnimationSource(): AnimationSource | null {
  return animationSource;
}

export function registerCanvasSizeSource(source: CanvasSizeSource): void {
  canvasSizeSource = source;
}

/**
 * Current project canvas size. Falls back to the project store's initial
 * 64x64 size when the project store module has not been evaluated yet
 * (only reachable from isolated unit tests).
 */
export function getCanvasSize(): { width: number; height: number } {
  return {
    width: canvasSizeSource?.width.value ?? 64,
    height: canvasSizeSource?.height.value ?? 64,
  };
}
