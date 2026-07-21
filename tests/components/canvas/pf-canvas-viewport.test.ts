import { afterEach, describe, expect, it } from 'vitest';
import '../../../src/components/canvas/pf-canvas-viewport';
import { defaultProjectContext } from '../../../src/stores/project-context';

describe('pf-canvas-viewport keyboard behavior', () => {
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
});
