/**
 * Platform Detection and Keyboard Shortcut Formatting
 *
 * Provides OS-aware keyboard shortcut labels for the UI.
 */

/**
 * Detect if the user is on macOS
 */
export const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");

/**
 * Platform-specific key labels
 */
export const keyLabels = {
  mod: isMac ? "\u2318" : "Ctrl",
  alt: isMac ? "\u2325" : "Alt",
  shift: "\u21e7",
  ctrl: isMac ? "\u2303" : "Ctrl",
  enter: "\u21b5",
  escape: "Esc",
  delete: isMac ? "\u232b" : "Del",
  backspace: "\u232b",
  tab: "\u21e5",
  up: "\u2191",
  down: "\u2193",
  left: "\u2190",
  right: "\u2192",
  space: "Space",
} as const;

/**
 * Map of special key names to their display labels
 */
const keyMap: Record<string, string> = {
  mod: keyLabels.mod,
  alt: keyLabels.alt,
  shift: keyLabels.shift,
  ctrl: keyLabels.ctrl,
  enter: keyLabels.enter,
  escape: keyLabels.escape,
  esc: keyLabels.escape,
  delete: keyLabels.delete,
  del: keyLabels.delete,
  backspace: keyLabels.backspace,
  tab: keyLabels.tab,
  up: keyLabels.up,
  down: keyLabels.down,
  left: keyLabels.left,
  right: keyLabels.right,
  space: keyLabels.space,
};

/**
 * Format a shortcut string for display
 *
 * @param shortcut - Shortcut string like 'mod+s', 'shift', 'alt+click'
 * @returns Formatted string like '⌘S' or 'Ctrl+S'
 *
 * @example
 * formatShortcut('mod+s') // '⌘S' on Mac, 'Ctrl+S' on Windows
 * formatShortcut('shift') // '⇧'
 * formatShortcut('alt+click') // '⌥+Click' on Mac, 'Alt+Click' on Windows
 */
export function formatShortcut(shortcut: string): string {
  const parts = shortcut.toLowerCase().split("+");
  const formatted = parts.map((part) => {
    const trimmed = part.trim();
    if (keyMap[trimmed]) {
      return keyMap[trimmed];
    }
    // Capitalize single letters, title case for words
    if (trimmed.length === 1) {
      return trimmed.toUpperCase();
    }
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  });

  // On Mac, modifiers are typically shown without + separator
  if (isMac) {
    return formatted.join("");
  }
  return formatted.join("+");
}

/**
 * Format a shortcut for display with the action
 *
 * @param key - The shortcut key
 * @param action - The action description
 * @returns Formatted string like '⇧ Line' or 'Shift: Line'
 */
export function formatShortcutWithAction(key: string, action: string): string {
  const formattedKey = formatShortcut(key);
  return `${formattedKey}: ${action}`;
}
