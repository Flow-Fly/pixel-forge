import { signal } from '../../core/signal';

type ShortcutAction = () => void;

interface Shortcut {
  key: string;
  modifiers: string[];
  action: ShortcutAction;
  description: string;
}

class KeyboardService {
  private shortcuts: Map<string, Shortcut> = new Map();
  
  // Signal to track if shortcuts are enabled (e.g. disable when typing in input)
  enabled = signal(true);

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  register(key: string, modifiers: string[], action: ShortcutAction, description: string) {
    const id = this.getShortcutId(key, modifiers);
    this.shortcuts.set(id, { key, modifiers, action, description });
  }

  unregister(key: string, modifiers: string[]) {
    const id = this.getShortcutId(key, modifiers);
    this.shortcuts.delete(id);
  }

  private getShortcutId(key: string, modifiers: string[]): string {
    return [...modifiers.sort(), key.toLowerCase()].join('+');
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.enabled.get()) return;
    
    // Ignore if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const modifiers = [];
    if (e.ctrlKey) modifiers.push('ctrl');
    if (e.metaKey) modifiers.push('meta');
    if (e.shiftKey) modifiers.push('shift');
    if (e.altKey) modifiers.push('alt');

    const id = this.getShortcutId(e.key, modifiers);
    
    const shortcut = this.shortcuts.get(id);
    if (shortcut) {
      e.preventDefault();
      shortcut.action();
    }
  }
}

export const keyboardService = new KeyboardService();
