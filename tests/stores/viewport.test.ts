import { beforeEach, describe, expect, it, vi } from 'vitest';
import { viewportStore } from '../../src/stores/viewport';

const projectStoreMock = vi.hoisted(() => {
  const store = {
    width: { value: 100 },
    height: { value: 50 },
    setSize(width: number, height: number) {
      store.width.value = width;
      store.height.value = height;
    },
  };
  return store;
});

vi.mock('../../src/stores/project', () => ({
  projectStore: projectStoreMock,
}));

describe('viewportStore zoom behavior', () => {
  beforeEach(() => {
    projectStoreMock.setSize(100, 50);
    viewportStore.containerWidth.value = 500;
    viewportStore.containerHeight.value = 250;
    viewportStore.zoom.value = 1;
    viewportStore.panX.value = 0;
    viewportStore.panY.value = 0;
    viewportStore.cursorScreenX.value = null;
    viewportStore.cursorScreenY.value = null;
  });

  it('supports continuous zoom while keeping the focal point stable', () => {
    viewportStore.panX.value = 10;
    viewportStore.panY.value = 20;

    const focalBefore = viewportStore.screenToCanvas(110, 70);

    viewportStore.zoomByFactorAt(1.5, 110, 70);

    expect(viewportStore.zoom.value).toBeCloseTo(1.5);
    expect(viewportStore.screenToCanvas(110, 70).x).toBeCloseTo(focalBefore.x);
    expect(viewportStore.screenToCanvas(110, 70).y).toBeCloseTo(focalBefore.y);
  });

  it('clamps zoom to the supported range', () => {
    viewportStore.zoomAt(0.01, 100, 100);
    expect(viewportStore.zoom.value).toBe(0.125);

    viewportStore.zoomAt(1000, 100, 100);
    expect(viewportStore.zoom.value).toBe(64);
  });

  it('fits the canvas using the actual available scale', () => {
    viewportStore.zoomToFit(500, 250);

    expect(viewportStore.zoom.value).toBe(5);
    expect(viewportStore.panX.value).toBe(0);
    expect(viewportStore.panY.value).toBe(0);
  });
});
