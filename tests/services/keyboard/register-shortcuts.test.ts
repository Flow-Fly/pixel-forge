import { describe, expect, it, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { MOD_PRIMARY } from '../../../src/utils/platform';
import { toolRegistry } from '../../../src/tools/tool-registry';

const keyboardServiceMock = vi.hoisted(() => ({
  register: vi.fn(),
}));

vi.mock('../../../src/services/keyboard/shortcuts', () => ({
  keyboardService: keyboardServiceMock,
}));

import { registerShortcuts } from '../../../src/services/keyboard/register-shortcuts';

type RegisterCall = [
  key: string,
  modifiers: string[],
  action: () => void,
  description: string,
  options?: { quick?: boolean; releaseAction?: () => void },
];

function comboFromCall([key, modifiers]: RegisterCall): string {
  return [...modifiers, key].join('+');
}

describe('registerShortcuts', () => {
  beforeEach(() => {
    keyboardServiceMock.register.mockClear();
  });

  it('registers tool shortcuts from the registry first', () => {
    registerShortcuts();

    const toolShortcutCount = Object.values(toolRegistry).filter((meta) => meta.shortcutKey).length;
    const toolCalls = keyboardServiceMock.register.mock.calls.slice(
      0,
      toolShortcutCount
    ) as RegisterCall[];

    expect(toolCalls.map(comboFromCall)).toEqual(
      Object.values(toolRegistry).map((meta) => meta.shortcutKey.toLowerCase())
    );
  });

  it('keeps the behavior-sensitive registration order stable', () => {
    registerShortcuts();

    const calls = keyboardServiceMock.register.mock.calls as RegisterCall[];
    const descriptionsByCombo = new Map(calls.map((call) => [comboFromCall(call), call[3]]));

    expect(keyboardServiceMock.register).toHaveBeenCalledTimes(77);
    expect(descriptionsByCombo.get('Alt')).toBe('Quick eyedropper');
    expect(descriptionsByCombo.get('0')).toBe('Fit to window');
    expect(descriptionsByCombo.get(`${MOD_PRIMARY}+0`)).toBe('Opacity 100%');
    expect(descriptionsByCombo.get('shift+g')).toBe('Toggle guides');
    expect(descriptionsByCombo.get(`${MOD_PRIMARY}+z`)).toBe('Undo');
    expect(descriptionsByCombo.get('ctrl+y')).toBe('Redo');
    expect(descriptionsByCombo.get('ctrl+n')).toBe('New project');
    expect(descriptionsByCombo.get(`${MOD_PRIMARY}+g`)).toBe('Group layers');
    expect(descriptionsByCombo.get('?')).toBe('Keyboard shortcuts');

    const enterDescriptions = calls
      .filter((call) => comboFromCall(call) === 'Enter')
      .map((call) => call[3]);
    expect(enterDescriptions).toEqual(['Play/Stop', 'Commit selection']);
  });
});
