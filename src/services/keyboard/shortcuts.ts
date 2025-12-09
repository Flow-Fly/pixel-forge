import { signal } from '../../core/signal';

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
   * Check if the event originated from an input element, including inside Shadow DOM.
   */
  private isTypingInInput(e: KeyboardEvent): boolean {
    // Fast path: check direct target first (covers most cases)
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return true;
    }
    if (target instanceof HTMLElement && target.isContentEditable) {
      return true;
    }

    // Shadow DOM: check first few elements of composed path
    // Inputs are always near the start, no need to traverse entire path
    const path = e.composedPath();
    const checkDepth = Math.min(path.length, 5);
    for (let i = 0; i < checkDepth; i++) {
      const el = path[i];
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return true;
      }
      if (el instanceof HTMLElement && el.isContentEditable) {
        return true;
      }
    }
    return false;
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.enabled.get()) return;

    // Ignore if typing in an input (including inside Shadow DOM)
    if (this.isTypingInInput(e)) {
      return;
    }

    const modifiers: string[] = [];
    if (e.ctrlKey) modifiers.push('ctrl');
    if (e.metaKey) modifiers.push('meta');
    if (e.shiftKey) modifiers.push('shift');
    if (e.altKey) modifiers.push('alt');

    const id = this.getShortcutId(e.key, modifiers);

    const shortcut = this.shortcuts.get(id);
    if (shortcut) {
      e.preventDefault();

      // For quick tools, track that this key is held and only fire once
      if (shortcut.quick) {
        if (this.activeQuickKeys.has(id)) {
          return; // Already activated, don't repeat
        }
        this.activeQuickKeys.add(id);
      }

      shortcut.action();
    }
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
