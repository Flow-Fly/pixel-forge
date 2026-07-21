import { signal } from '../../core/signal';
import { shouldPreserveNativeKeyboardBehavior } from './native-keyboard-behavior';

type ShortcutAction = () => void;

interface Shortcut {
  key: string;
  modifiers: string[];
  action: ShortcutAction;
  description: string;
  quick?: boolean;           // If true, tool is temporary while key held
  releaseAction?: ShortcutAction; // Called on key release (for quick tools)
}

class KeyboardService {
  private shortcuts: Map<string, Shortcut> = new Map();
  private activeQuickKeys: Set<string> = new Set(); // Track held quick-tool keys

  // Signal to track if shortcuts are enabled (e.g. disable when typing in input)
  enabled = signal(true);

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  register(
    key: string,
    modifiers: string[],
    action: ShortcutAction,
    description: string,
    options?: { quick?: boolean; releaseAction?: ShortcutAction }
  ) {
    const id = this.getShortcutId(key, modifiers);
    this.shortcuts.set(id, {
      key,
      modifiers,
      action,
      description,
      quick: options?.quick,
      releaseAction: options?.releaseAction,
    });
  }

  unregister(key: string, modifiers: string[]) {
    const id = this.getShortcutId(key, modifiers);
    this.shortcuts.delete(id);
  }

  private getShortcutId(key: string, modifiers: string[]): string {
    return [...modifiers.sort(), key.toLowerCase()].join('+');
  }

  /**
   * Get the logical key from a keyboard event.
   * On Mac, Alt+key produces special characters (e.g., Alt+1 = ¡).
   * We use e.code to get the physical key when Alt is pressed.
   */
  private getLogicalKey(e: KeyboardEvent): string {
    // When Alt is pressed on Mac, e.key might be a special character
    // Use e.code to map back to the physical key
    if (e.altKey && e.code) {
      // Map key codes to logical keys for common cases
      if (e.code.startsWith('Digit')) {
        return e.code.replace('Digit', '');
      }
      if (e.code.startsWith('Key')) {
        return e.code.replace('Key', '').toLowerCase();
      }
      // For bracket keys
      if (e.code === 'BracketLeft') return '[';
      if (e.code === 'BracketRight') return ']';
    }
    return e.key;
  }

  private getShortcutForEvent(e: KeyboardEvent): { id: string; shortcut: Shortcut } | null {
    const modifiers: string[] = [];
    if (e.ctrlKey) modifiers.push('ctrl');
    if (e.metaKey) modifiers.push('meta');
    if (e.shiftKey) modifiers.push('shift');
    if (e.altKey) modifiers.push('alt');

    const id = this.getShortcutId(this.getLogicalKey(e), modifiers);
    const shortcut = this.shortcuts.get(id);
    return shortcut ? { id, shortcut } : null;
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.enabled.get()) return;

    if (shouldPreserveNativeKeyboardBehavior(e)) return;

    const match = this.getShortcutForEvent(e);
    if (!match) return;

    e.preventDefault();

    // For quick tools, track that this key is held and only fire once
    if (match.shortcut.quick) {
      if (this.activeQuickKeys.has(match.id)) return;
      this.activeQuickKeys.add(match.id);
    }

    match.shortcut.action();
  }

  private handleKeyUp(e: KeyboardEvent) {
    if (!this.enabled.get()) return;

    // Build the same ID we would have built on keydown
    // Note: On keyup, modifier keys may have changed, so we check with no modifiers
    // For quick tools, we typically use single keys without modifiers
    const id = this.getShortcutId(e.key, []);

    // Check if this was an active quick-tool key
    if (this.activeQuickKeys.has(id)) {
      this.activeQuickKeys.delete(id);

      const shortcut = this.shortcuts.get(id);
      if (shortcut?.releaseAction) {
        shortcut.releaseAction();
      }
    }
  }
}

export const keyboardService = new KeyboardService();
