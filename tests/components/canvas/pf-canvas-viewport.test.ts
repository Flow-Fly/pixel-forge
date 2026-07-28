import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../../src/components/canvas/pf-canvas-viewport';
import { defaultProjectContext } from '../../../src/stores/project-context';

describe('pf-canvas-viewport input ownership', () => {
  beforeEach(() => {
    defaultProjectContext.viewport.panX.value = 0;
    defaultProjectContext.viewport.panY.value = 0;
  });

  afterEach(() => {
    document.body.replaceChildren();
    defaultProjectContext.viewport.isSpacebarDown.value = false;
  });

  it('leaves Space available to activate a focused button inside a shadow root', async () => {
    const viewport = document.createElement('pf-canvas-viewport');
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const button = document.createElement('button');
    shadowRoot.append(button);
    document.body.append(viewport, host);
    await viewport.updateComplete;

    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(defaultProjectContext.viewport.isSpacebarDown.value).toBe(false);
  });

  it('does not consume trackpad gestures from outside the canvas viewport', async () => {
    const viewport = document.createElement('pf-canvas-viewport');
    const outsideUi = document.createElement('div');
    document.body.append(viewport, outsideUi);
    await viewport.updateComplete;

    const event = new WheelEvent('wheel', {
      deltaX: 12,
      deltaY: 8,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    outsideUi.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(defaultProjectContext.viewport.panX.value).toBe(0);
    expect(defaultProjectContext.viewport.panY.value).toBe(0);
  });

  it('pans from a trackpad gesture on the empty canvas viewport background', async () => {
    const viewport = document.createElement('pf-canvas-viewport');
    document.body.append(viewport);
    await viewport.updateComplete;

    const event = new WheelEvent('wheel', {
      deltaX: 12,
      deltaY: 8,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    viewport.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(defaultProjectContext.viewport.panX.value).toBe(-12);
    expect(defaultProjectContext.viewport.panY.value).toBe(-8);
  });
});
