import { afterEach, describe, expect, it, vi } from 'vitest';
import { keyboardService } from '../../../src/services/keyboard/shortcuts';

const TEST_SHORTCUTS = [
  { key: 'Enter', code: 'Enter' },
  { key: ' ', code: 'Space' },
] as const;

function keyDown(target: HTMLElement, key: string, code: string) {
  const event = new KeyboardEvent('keydown', {
    key,
    code,
    bubbles: true,
    composed: true,
    cancelable: true,
  });

  target.dispatchEvent(event);
  return event;
}

describe('keyboard service native control behavior', () => {
  afterEach(() => {
    document.body.replaceChildren();
    for (const shortcut of TEST_SHORTCUTS) {
      keyboardService.unregister(shortcut.key, []);
    }
    keyboardService.unregister('x', []);
    keyboardService.unregister('1', []);
  });

  it.each(TEST_SHORTCUTS)(
    'leaves $code activation to a button inside a shadow root',
    ({ key, code }) => {
      const action = vi.fn();
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      const button = document.createElement('button');
      shadowRoot.append(button);
      document.body.append(host);
      keyboardService.register(key, [], action, `Test ${code}`);

      const event = keyDown(button, key, code);

      expect(action).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    }
  );

  it.each(TEST_SHORTCUTS)('keeps the $code shortcut active away from controls', ({ key, code }) => {
    const action = vi.fn();
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    keyboardService.register(key, [], action, `Test ${code}`);

    const event = keyDown(canvas, key, code);

    expect(action).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps application shortcuts disabled in text-entry controls', () => {
    const action = vi.fn();
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    shadowRoot.append(input);
    document.body.append(host);
    keyboardService.register('x', [], action, 'Test text entry');

    const event = keyDown(input, 'x', 'KeyX');

    expect(action).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('matches an opted-in physical digit code across keyboard layouts', () => {
    const action = vi.fn();
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    keyboardService.register('1', [], action, 'Test physical digit', {
      physicalCode: 'Digit1',
    });

    const qwertyEvent = keyDown(canvas, '1', 'Digit1');
    const azertyEvent = keyDown(canvas, '&', 'Digit1');

    expect(action).toHaveBeenCalledTimes(2);
    expect(qwertyEvent.defaultPrevented).toBe(true);
    expect(azertyEvent.defaultPrevented).toBe(true);
  });

  it('does not apply an unmodified physical digit shortcut to modified input', () => {
    const action = vi.fn();
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    keyboardService.register('1', [], action, 'Test physical digit', {
      physicalCode: 'Digit1',
    });
    const event = new KeyboardEvent('keydown', {
      key: '&',
      code: 'Digit1',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    canvas.dispatchEvent(event);

    expect(action).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('preserves text-entry behavior for an opted-in physical digit code', () => {
    const action = vi.fn();
    const input = document.createElement('input');
    document.body.append(input);
    keyboardService.register('1', [], action, 'Test physical digit', {
      physicalCode: 'Digit1',
    });

    const event = keyDown(input, '&', 'Digit1');

    expect(action).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
