import { beforeEach, describe, expect, it, vi } from 'vitest';

const context = {
  grid: {
    togglePixelGrid: vi.fn(),
    toggleTileGrid: vi.fn(),
  },
  selection: {
    state: { value: { type: 'none' } },
    cancelTransform: vi.fn(),
  },
  viewport: {
    isSpacebarDown: { value: false },
    isPanning: { value: false },
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetView: vi.fn(),
    clampPanToBounds: vi.fn(),
  },
};

vi.mock('../../../../src/stores/project-context', () => ({
  getActiveProjectContext: () => context,
}));

import {
  createKeyboardState,
  handleKeyDown,
} from '../../../../src/components/canvas/viewport/keyboard-handlers';

const callbacks = {
  requestUpdate: vi.fn(),
  getClientWidth: () => 0,
  getClientHeight: () => 0,
  commitTransform: vi.fn(),
  setDragging: vi.fn(),
  getDragging: () => false,
};

function dispatchSpace(target: HTMLElement) {
  const state = createKeyboardState();
  let handledEvent: KeyboardEvent | undefined;

  target.addEventListener('keydown', (event) => {
    handledEvent = event;
    handleKeyDown(event, state, callbacks);
  });

  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      composed: true,
      cancelable: true,
    })
  );

  return handledEvent;
}

describe('viewport keyboard handlers', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    context.viewport.isSpacebarDown.value = false;
    callbacks.requestUpdate.mockClear();
  });

  it('keeps Space pan mode active away from controls', () => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);

    const event = dispatchSpace(canvas);

    expect(event?.defaultPrevented).toBe(true);
    expect(context.viewport.isSpacebarDown.value).toBe(true);
    expect(callbacks.requestUpdate).toHaveBeenCalledOnce();
  });
});
