import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleWheel } from '../../../../src/components/canvas/viewport/wheel-handlers';
import type { KeyboardState } from '../../../../src/components/canvas/viewport/keyboard-handlers';
import { viewportStore } from '../../../../src/stores/viewport';

const projectStoreMock = vi.hoisted(() => {
  const store = {
    width: { value: 100 },
    height: { value: 100 },
    setSize(width: number, height: number) {
      store.width.value = width;
      store.height.value = height;
    },
  };
  return store;
});

vi.mock('../../../../src/stores/project', () => ({
  projectStore: projectStoreMock,
}));

vi.mock('../../../../src/stores/tools', () => ({
  toolStore: {
    activeTool: { value: 'pencil' },
  },
}));

vi.mock('../../../../src/stores/tool-settings', () => ({
  getToolSize: () => 1,
  setToolSize: () => undefined,
}));

function createKeyboardState(overrides: Partial<KeyboardState> = {}): KeyboardState {
  return {
    isAltActuallyPressed: false,
    isCtrlActuallyPressed: false,
    isMetaActuallyPressed: false,
    ...overrides,
  };
}

function createCallbacks() {
  return {
    requestUpdate: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 } as DOMRect),
    contains: () => false,
  };
}

describe('viewport wheel handlers', () => {
  beforeEach(() => {
    projectStoreMock.setSize(100, 100);
    viewportStore.containerWidth.value = 400;
    viewportStore.containerHeight.value = 300;
    viewportStore.zoom.value = 8;
    viewportStore.panX.value = 0;
    viewportStore.panY.value = 0;
  });

  it('uses continuous zoom for mouse wheel events', () => {
    const callbacks = createCallbacks();
    const event = new WheelEvent('wheel', {
      deltaY: 1,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      clientX: 120,
      clientY: 80,
    });

    handleWheel(event, createKeyboardState(), callbacks);

    expect(viewportStore.zoom.value).toBeCloseTo(8 * Math.exp(-16 * 0.0025));
    expect(callbacks.requestUpdate).toHaveBeenCalledOnce();
  });

  it('uses continuous zoom for trackpad pinch events', () => {
    const callbacks = createCallbacks();
    const event = new WheelEvent('wheel', {
      deltaY: -10,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      clientX: 120,
      clientY: 80,
    });
    Object.defineProperty(event, 'ctrlKey', { value: true });

    handleWheel(event, createKeyboardState(), callbacks);

    expect(viewportStore.zoom.value).toBeCloseTo(8 * Math.exp(10 * 0.0035));
    expect(callbacks.requestUpdate).toHaveBeenCalledOnce();
  });

  it('pans for pixel-mode trackpad gestures', () => {
    const callbacks = createCallbacks();
    const trackpadPan = new WheelEvent('wheel', {
      deltaX: 12,
      deltaY: 8,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    });

    handleWheel(trackpadPan, createKeyboardState(), callbacks);

    expect(viewportStore.panX.value).toBe(-12);
    expect(viewportStore.panY.value).toBe(-8);
    expect(callbacks.requestUpdate).toHaveBeenCalledOnce();
  });
});
