import { beforeEach, describe, expect, it } from "vitest";
import { createViewportStore } from "../../src/stores/viewport";

const canvasSize = {
  width: { value: 100 },
  height: { value: 50 },
  setSize(width: number, height: number) {
    canvasSize.width.value = width;
    canvasSize.height.value = height;
  },
};

const viewportStore = createViewportStore(canvasSize);

describe("viewportStore zoom behavior", () => {
  beforeEach(() => {
    canvasSize.setSize(100, 50);
    viewportStore.containerWidth.value = 500;
    viewportStore.containerHeight.value = 250;
    viewportStore.zoom.value = 1;
    viewportStore.panX.value = 0;
    viewportStore.panY.value = 0;
    viewportStore.cursorScreenX.value = null;
    viewportStore.cursorScreenY.value = null;
  });

  it("format zoom as whole percentage for values above 100% and fractional percentage for values below 100%", () => {
    viewportStore.zoom.value = 1.001; // 100,1%
    expect(viewportStore.formattedZoom()).toBe(100);
    viewportStore.zoom.value = 1.006; // 100,6%
    expect(viewportStore.formattedZoom()).toBe(101);
    viewportStore.zoom.value = 0.7575; // 75,75%
    expect(viewportStore.formattedZoom()).toBe(75.75);
    viewportStore.zoom.value = 1;
  });

  it("supports continuous zoom while keeping the focal point stable", () => {
    viewportStore.panX.value = 10;
    viewportStore.panY.value = 20;

    const focalBefore = viewportStore.screenToCanvas(110, 70);

    viewportStore.zoomByFactorAt(1.5, 110, 70);

    expect(viewportStore.zoom.value).toBeCloseTo(1.5);
    expect(viewportStore.screenToCanvas(110, 70).x).toBeCloseTo(focalBefore.x);
    expect(viewportStore.screenToCanvas(110, 70).y).toBeCloseTo(focalBefore.y);
  });

  it("clamps zoom to the supported range", () => {
    viewportStore.zoomAt(0.01, 100, 100);
    expect(viewportStore.zoom.value).toBe(0.125);

    viewportStore.zoomAt(1000, 100, 100);
    expect(viewportStore.zoom.value).toBe(64);
  });

  it("fits the canvas using the actual available scale", () => {
    viewportStore.zoomToFit(500, 250);

    expect(viewportStore.zoom.value).toBe(5);
    expect(viewportStore.panX.value).toBe(0);
    expect(viewportStore.panY.value).toBe(0);
  });
});
