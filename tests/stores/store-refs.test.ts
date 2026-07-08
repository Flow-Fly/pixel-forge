import { describe, expect, it } from "vitest";
import {
  createStoreRefs,
  type AnimationSource,
  type CanvasSizeSource,
} from "../../src/stores/store-refs";

function readableRef<T>(value: T): { readonly value: T } {
  return { value };
}

function createCanvasSizeSource(width: number, height: number): CanvasSizeSource {
  return {
    width: readableRef(width),
    height: readableRef(height),
  };
}

function createAnimationSource(frameId: string): AnimationSource {
  return {
    currentFrameId: readableRef(frameId),
    cels: readableRef(new Map()),
    getCelKey(layerId: string, frameId: string) {
      return `${layerId}:${frameId}`;
    },
    scanUsedColors() {
      return new Set([frameId]);
    },
    scanUsedColorsFromCanvas() {
      return new Set([`${frameId}:canvas`]);
    },
  };
}

describe("store refs", () => {
  it("keeps animation and canvas-size sources local to each holder", () => {
    const refsA = createStoreRefs();
    const refsB = createStoreRefs();

    refsA.registerCanvasSizeSource(createCanvasSizeSource(16, 24));
    refsB.registerCanvasSizeSource(createCanvasSizeSource(48, 64));

    refsA.registerAnimationSource(createAnimationSource("frame-a"));
    refsB.registerAnimationSource(createAnimationSource("frame-b"));

    expect(refsA.getCanvasSize()).toEqual({ width: 16, height: 24 });
    expect(refsB.getCanvasSize()).toEqual({ width: 48, height: 64 });

    expect(refsA.getAnimationSource()?.currentFrameId.value).toBe("frame-a");
    expect(refsB.getAnimationSource()?.currentFrameId.value).toBe("frame-b");
    expect(refsA.getAnimationSource()?.scanUsedColors()).toEqual(new Set(["frame-a"]));
    expect(refsB.getAnimationSource()?.scanUsedColorsFromCanvas()).toEqual(
      new Set(["frame-b:canvas"])
    );
  });

  it("falls back to the default project size before a canvas source registers", () => {
    const refs = createStoreRefs();

    expect(refs.getCanvasSize()).toEqual({ width: 64, height: 64 });
    expect(refs.getAnimationSource()).toBeNull();
  });
});
