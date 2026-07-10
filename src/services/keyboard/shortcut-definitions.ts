/**
 * Centralized shortcut definitions for PixelForge.
 *
 * This is the single source of truth for all keyboard shortcuts.
 * All UI components (menu bar, shortcuts dialog, overlay) should import from here.
 * The register-shortcuts.ts file also uses these definitions.
 *
 * Key format:
 * - "mod" = Cmd on Mac, Ctrl on Windows (for cross-platform)
 * - "ctrl" = always Ctrl (even on Mac, for browser conflict avoidance)
 * - "shift", "alt" = standard modifiers
 * - Combine with "+" e.g., "mod+shift+z"
 */

export interface ShortcutDefinition {
  key: string;           // e.g., "mod+z", "delete", "alt+wheel"
  action: string;        // Human-readable action name
  description?: string;  // Optional longer description
}

export interface ShortcutCategory {
  name: string;
  shortcuts: ShortcutDefinition[];
}

// ============================================
// FILE SHORTCUTS
// ============================================
const fileShortcuts: ShortcutCategory = {
  name: "File",
  shortcuts: [
    { key: "ctrl+n", action: "New project" },
    { key: "mod+o", action: "Open project" },
    { key: "mod+e", action: "Export" },
  ],
};

// ============================================
// WORKSPACE SHORTCUTS
// ============================================
const workspaceShortcuts: ShortcutCategory = {
  name: "Workspace",
  shortcuts: [
    { key: "mod+tab", action: "Next project tab" },
    { key: "ctrl+pagedown", action: "Next project tab" },
    { key: "ctrl+pageup", action: "Previous project tab" },
  ],
};

// ============================================
// EDIT SHORTCUTS
// ============================================
const editShortcuts: ShortcutCategory = {
  name: "Edit",
  shortcuts: [
    { key: "mod+z", action: "Undo" },
    { key: "mod+shift+z", action: "Redo" },
    { key: "ctrl+y", action: "Redo (alt)" },
    { key: "mod+x", action: "Cut" },
    { key: "mod+c", action: "Copy" },
    { key: "mod+v", action: "Paste" },
    { key: "delete", action: "Delete selection" },
    { key: "backspace", action: "Delete selection" },
  ],
};

// ============================================
// SELECTION SHORTCUTS
// ============================================
const selectionShortcuts: ShortcutCategory = {
  name: "Selection",
  shortcuts: [
    { key: "mod+a", action: "Select all" },
    { key: "mod+d", action: "Deselect" },
    { key: "mod+shift+d", action: "Reselect" },
    { key: "ctrl+shift+i", action: "Invert selection" },
    { key: "ctrl+shift+t", action: "Select cel bounds" },
    { key: "enter", action: "Commit floating selection" },
    { key: "escape", action: "Cancel selection" },
    { key: "arrows", action: "Move selection 1px" },
    { key: "shift+arrows", action: "Move selection 10px" },
    { key: "shift+drag", action: "Add to selection" },
    { key: "alt+drag", action: "Subtract from selection" },
    { key: "shift+alt+drag", action: "Intersect selection" },
    { key: "f", action: "Fill selection with foreground" },
  ],
};

// ============================================
// VIEW SHORTCUTS
// ============================================
const viewShortcuts: ShortcutCategory = {
  name: "View",
  shortcuts: [
    { key: "0", action: "Fit to window" },
    { key: "1", action: "Zoom 100%" },
    { key: "2", action: "Zoom 200%" },
    { key: "3", action: "Zoom 400%" },
    { key: "4", action: "Zoom 800%" },
    { key: "5", action: "Zoom 1600%" },
    { key: "6", action: "Zoom 3200%" },
    { key: "+", action: "Zoom in" },
    { key: "-", action: "Zoom out" },
    { key: "tab", action: "Toggle timeline" },
    { key: "shift+g", action: "Toggle guides" },
    { key: "?", action: "Keyboard shortcuts" },
  ],
};

// ============================================
// COLOR & OPACITY SHORTCUTS
// ============================================
const colorShortcuts: ShortcutCategory = {
  name: "Colors & Opacity",
  shortcuts: [
    { key: "x", action: "Swap foreground/background" },
    { key: "mod+1-9", action: "Set opacity 10%-90%" },
    { key: "mod+0", action: "Set opacity 100%" },
  ],
};

// ============================================
// BRUSH SHORTCUTS
// ============================================
const brushShortcuts: ShortcutCategory = {
  name: "Brush",
  shortcuts: [
    { key: "[", action: "Decrease brush size" },
    { key: "]", action: "Increase brush size" },
    { key: "alt+wheel", action: "Change brush size" },
    { key: "mod+b", action: "Capture brush from selection" },
    { key: "mod+shift+b", action: "Toggle pixel perfect mode" },
  ],
};

// ============================================
// QUICK TOOL SHORTCUTS
// ============================================
const quickToolShortcuts: ShortcutCategory = {
  name: "Quick Tools",
  shortcuts: [
    { key: "alt (hold)", action: "Eyedropper" },
    { key: "space (hold)", action: "Pan" },
  ],
};

// ============================================
// LAYER SHORTCUTS
// ============================================
const layerShortcuts: ShortcutCategory = {
  name: "Layers",
  shortcuts: [
    { key: "mod+g", action: "Group layers" },
    { key: "mod+shift+g", action: "Ungroup layers" },
  ],
};

// ============================================
// ANIMATION / FRAME SHORTCUTS
// ============================================
const animationPlaybackShortcuts: ShortcutCategory = {
  name: "Playback",
  shortcuts: [
    { key: "enter", action: "Play/Stop" },
  ],
};

const animationNavigationShortcuts: ShortcutCategory = {
  name: "Navigation",
  shortcuts: [
    { key: "left", action: "Previous frame" },
    { key: "right", action: "Next frame" },
    { key: "home", action: "First frame" },
    { key: "end", action: "Last frame" },
  ],
};

const animationFrameShortcuts: ShortcutCategory = {
  name: "Frames",
  shortcuts: [
    { key: "alt+n", action: "New frame" },
  ],
};

// ============================================
// CANVAS SHORTCUTS
// ============================================
const canvasShortcuts: ShortcutCategory = {
  name: "Canvas",
  shortcuts: [
    { key: "c", action: "Canvas resize" },
  ],
};

// ============================================
// CONTEXT-AWARE SHORTCUTS (for overlay)
// ============================================
export const contextShortcuts = {
  // When there's an active selection
  selectionActive: [
    { key: "mod+d", action: "Deselect" },
    { key: "ctrl+shift+i", action: "Invert" },
    { key: "f", action: "Fill" },
    { key: "delete", action: "Clear" },
    { key: "mod+x", action: "Cut" },
    { key: "mod+c", action: "Copy" },
  ],

  // When there's a floating selection
  floatingSelection: [
    { key: "enter", action: "Commit" },
    { key: "escape", action: "Cancel" },
    { key: "up", action: "Nudge up" },
    { key: "down", action: "Nudge down" },
    { key: "left", action: "Nudge left" },
    { key: "right", action: "Nudge right" },
  ],

  // Global shortcuts always available (minimal set for overlay)
  global: [
    { key: "mod+z", action: "Undo" },
    { key: "mod+shift+z", action: "Redo" },
    { key: "space", action: "Pan" },
  ],
};

// ============================================
// GROUPED EXPORTS FOR UI COMPONENTS
// ============================================

/**
 * All global shortcuts for the keyboard shortcuts dialog
 */
export const globalShortcutCategories: ShortcutCategory[] = [
  editShortcuts,
  selectionShortcuts,
  viewShortcuts,
  colorShortcuts,
  brushShortcuts,
  quickToolShortcuts,
  layerShortcuts,
  canvasShortcuts,
  fileShortcuts,
  workspaceShortcuts,
];

/**
 * Animation-related shortcuts for the keyboard shortcuts dialog
 */
export const animationShortcutCategories: ShortcutCategory[] = [
  animationPlaybackShortcuts,
  animationNavigationShortcuts,
  animationFrameShortcuts,
];

// ============================================
// MENU BAR SHORTCUT LOOKUP
// ============================================

/**
 * Specific menu shortcuts lookup for common menu items
 */
export const menuShortcuts = {
  // File menu
  newProject: fileShortcuts.shortcuts.find(s => s.action === "New project")?.key ?? "ctrl+n",
  open: fileShortcuts.shortcuts.find(s => s.action === "Open project")?.key ?? "mod+o",
  export: fileShortcuts.shortcuts.find(s => s.action === "Export")?.key ?? "mod+e",

  // Edit menu
  undo: editShortcuts.shortcuts.find(s => s.action === "Undo")?.key ?? "mod+z",
  redo: editShortcuts.shortcuts.find(s => s.action === "Redo")?.key ?? "mod+shift+z",
  cut: editShortcuts.shortcuts.find(s => s.action === "Cut")?.key ?? "mod+x",
  copy: editShortcuts.shortcuts.find(s => s.action === "Copy")?.key ?? "mod+c",
  paste: editShortcuts.shortcuts.find(s => s.action === "Paste")?.key ?? "mod+v",

  // View menu
  zoomIn: "+",
  zoomOut: "-",
  zoom100: "1",
  keyboardShortcuts: "?",
};
