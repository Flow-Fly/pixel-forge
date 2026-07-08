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

export interface StoreRefs {
  registerAnimationSource(source: AnimationSource): void;
  getAnimationSource(): AnimationSource | null;
  registerCanvasSizeSource(source: CanvasSizeSource): void;
  getCanvasSize(): { width: number; height: number };
}

export function createStoreRefs(): StoreRefs {
  let contextAnimationSource: AnimationSource | null = null;
  let contextCanvasSizeSource: CanvasSizeSource | null = null;

  return {
    registerAnimationSource(source: AnimationSource): void {
      contextAnimationSource = source;
    },

    getAnimationSource(): AnimationSource | null {
      return contextAnimationSource;
    },

    registerCanvasSizeSource(source: CanvasSizeSource): void {
      contextCanvasSizeSource = source;
    },

    getCanvasSize(): { width: number; height: number } {
      return {
        width: contextCanvasSizeSource?.width.value ?? 64,
        height: contextCanvasSizeSource?.height.value ?? 64,
      };
    },
  };
}

export const defaultStoreRefs = createStoreRefs();

// fallow-ignore-next-line unused-export -- compatibility path for singleton store registration during ProjectContext migration.
export function registerAnimationSource(source: AnimationSource): void {
  defaultStoreRefs.registerAnimationSource(source);
}

/** Null until the animation store module has been evaluated. */
// fallow-ignore-next-line unused-export -- compatibility path for singleton animation lookups during ProjectContext migration.
export function getAnimationSource(): AnimationSource | null {
  return defaultStoreRefs.getAnimationSource();
}

// fallow-ignore-next-line unused-export -- compatibility path for singleton canvas-size registration during ProjectContext migration.
export function registerCanvasSizeSource(source: CanvasSizeSource): void {
  defaultStoreRefs.registerCanvasSizeSource(source);
}

/**
 * Current project canvas size. Falls back to the project store's initial
 * 64x64 size when the project store module has not been evaluated yet
 * (only reachable from isolated unit tests).
 */
export function getCanvasSize(): { width: number; height: number } {
  return defaultStoreRefs.getCanvasSize();
}
