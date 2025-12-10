/**
 * Tool Registry
 *
 * Central registry of tool metadata for UI components.
 * This allows the context bar to access tool options without dynamically importing tool classes.
 */

import type { ToolMeta } from "../types/tool-meta";
import type { ToolType } from "../stores/tools";

/**
 * Registry of all tool metadata
 */
export const toolRegistry: Record<ToolType, ToolMeta> = {
  pencil: {
    name: "Pencil",
    icon: "✏️",
    label: "P",
    shortcutKey: "B",
    group: "drawing",
    options: [
      { type: "slider", key: "size", label: "Size", min: 1, max: 50, unit: "px", store: "toolSizes", storeKey: "pencil" },
      {
        type: "slider",
        key: "opacity",
        label: "Opacity",
        min: 0,
        max: 100,
        unit: "%",
        store: "brush",
        storeKey: "opacity",
      },
      {
        type: "checkbox",
        key: "pixelPerfect",
        label: "Pixel Perfect",
        store: "brush",
        storeKey: "pixelPerfect",
      },
    ],
    alternatives: ["eraser", "eyedropper"],
    shortcuts: [
      { key: "shift", action: "Draw straight line", when: "drawing" },
      { key: "ctrl+wheel", action: "Change size" },
    ],
  },

  eraser: {
    name: "Eraser",
    icon: "🧹",
    label: "E",
    shortcutKey: "E",
    group: "drawing",
    options: [
      { type: "slider", key: "size", label: "Size", min: 1, max: 50, unit: "px", store: "toolSizes", storeKey: "eraser" },
    ],
    alternatives: ["pencil", "eyedropper"],
    shortcuts: [
      { key: "shift", action: "Erase straight line", when: "drawing" },
      { key: "ctrl+wheel", action: "Change size" },
      { key: "right-click", action: "Erase to background" },
    ],
  },

  eyedropper: {
    name: "Eyedropper",
    icon: "💧",
    label: "I",
    shortcutKey: "I",
    group: "drawing",
    options: [],
    alternatives: ["pencil", "eraser"],
    shortcuts: [],
  },

  fill: {
    name: "Fill",
    icon: "🪣",
    label: "F",
    shortcutKey: "G",
    group: "fill",
    options: [
      {
        type: "checkbox",
        key: "contiguous",
        label: "Contiguous",
        store: "fill",
        storeKey: "contiguous",
      },
    ],
    alternatives: ["gradient"],
    shortcuts: [],
  },

  gradient: {
    name: "Gradient",
    icon: "▤",
    label: "G",
    shortcutKey: "shift+G",
    group: "fill",
    options: [
      {
        type: "select",
        key: "type",
        label: "Type",
        store: "gradient",
        storeKey: "type",
        options: [
          { value: "linear", label: "Linear" },
          { value: "radial", label: "Radial" },
        ],
      },
    ],
    alternatives: ["fill"],
    shortcuts: [{ key: "shift", action: "Constrain angle", when: "drawing" }],
  },

  line: {
    name: "Line",
    icon: "╱",
    label: "L",
    shortcutKey: "L",
    group: "shape",
    options: [
      {
        type: "slider",
        key: "thickness",
        label: "Thickness",
        min: 1,
        max: 10,
        unit: "px",
        store: "shape",
        storeKey: "thickness",
      },
    ],
    alternatives: ["rectangle", "ellipse"],
    shortcuts: [
      { key: "shift", action: "Constrain to 15\u00b0 angles", when: "drawing" },
      { key: "ctrl+wheel", action: "Change thickness" },
    ],
  },

  rectangle: {
    name: "Rectangle",
    icon: "▢",
    label: "R",
    shortcutKey: "U",
    group: "shape",
    options: [
      {
        type: "checkbox",
        key: "fill",
        label: "Fill",
        store: "shape",
        storeKey: "fill",
      },
      {
        type: "slider",
        key: "thickness",
        label: "Thickness",
        min: 1,
        max: 10,
        unit: "px",
        store: "shape",
        storeKey: "thickness",
      },
    ],
    alternatives: ["ellipse", "line"],
    shortcuts: [
      { key: "shift", action: "Constrain to square", when: "drawing" },
      { key: "alt", action: "Draw from center", when: "drawing" },
      { key: "ctrl+wheel", action: "Change thickness" },
    ],
  },

  ellipse: {
    name: "Ellipse",
    icon: "◯",
    label: "O",
    shortcutKey: "shift+U",
    group: "shape",
    options: [
      {
        type: "checkbox",
        key: "fill",
        label: "Fill",
        store: "shape",
        storeKey: "fill",
      },
      {
        type: "slider",
        key: "thickness",
        label: "Thickness",
        min: 1,
        max: 10,
        unit: "px",
        store: "shape",
        storeKey: "thickness",
      },
    ],
    alternatives: ["rectangle", "line"],
    shortcuts: [
      { key: "shift", action: "Constrain to circle", when: "drawing" },
      { key: "alt", action: "Draw from center", when: "drawing" },
      { key: "ctrl+wheel", action: "Change thickness" },
    ],
  },

  "marquee-rect": {
    name: "Marquee",
    icon: "⬚",
    label: "M",
    shortcutKey: "M",
    group: "selection",
    options: [],
    alternatives: ["lasso", "magic-wand"],
    shortcuts: [
      { key: "shift", action: "Add to selection" },
      { key: "alt", action: "Subtract from selection" },
      { key: "shift+alt", action: "Intersect selection" },
      { key: "mod+d", action: "Deselect" },
      { key: "mod+shift+i", action: "Invert selection" },
    ],
  },

  lasso: {
    name: "Lasso",
    icon: "◯",
    label: "Q",
    shortcutKey: "Q",
    group: "selection",
    options: [],
    alternatives: ["polygonal-lasso", "marquee-rect", "magic-wand"],
    shortcuts: [
      { key: "shift", action: "Add to selection" },
      { key: "alt", action: "Subtract from selection" },
      { key: "mod+d", action: "Deselect" },
    ],
  },

  "polygonal-lasso": {
    name: "Polygonal Lasso",
    icon: "⬡",
    label: "PL",
    shortcutKey: "shift+Q",
    group: "selection",
    options: [],
    alternatives: ["lasso", "marquee-rect", "magic-wand"],
    shortcuts: [
      { key: "shift", action: "Add to selection" },
      { key: "alt", action: "Subtract from selection" },
      { key: "enter", action: "Close selection" },
      { key: "escape", action: "Cancel" },
    ],
  },

  "magic-wand": {
    name: "Magic Wand",
    icon: "✨",
    label: "W",
    shortcutKey: "W",
    group: "selection",
    options: [
      {
        type: "slider",
        key: "tolerance",
        label: "Tolerance",
        min: 0,
        max: 255,
        store: "magicWand",
        storeKey: "tolerance",
      },
      {
        type: "checkbox",
        key: "contiguous",
        label: "Contiguous",
        store: "magicWand",
        storeKey: "contiguous",
      },
      {
        type: "checkbox",
        key: "diagonal",
        label: "Diagonal",
        store: "magicWand",
        storeKey: "diagonal",
      },
    ],
    alternatives: ["marquee-rect", "lasso"],
    shortcuts: [
      { key: "shift", action: "Add to selection" },
      { key: "alt", action: "Subtract from selection" },
      { key: "mod+d", action: "Deselect" },
    ],
  },

  transform: {
    name: "Transform",
    icon: "⤡",
    label: "V",
    shortcutKey: "V",
    group: "utility",
    options: [],
    alternatives: [],
    shortcuts: [
      { key: "shift", action: "Constrain proportions", when: "drawing" },
      { key: "enter", action: "Apply transform" },
      { key: "escape", action: "Cancel" },
    ],
  },

  text: {
    name: "Text",
    icon: "T",
    label: "T",
    shortcutKey: "T",
    group: "utility",
    options: [
      {
        type: "select",
        key: "font",
        label: "Font",
        store: "text",
        storeKey: "font",
        options: [
          { value: "tiny-3x5", label: "Tiny 3x5" },
          { value: "small-5x7", label: "Small 5x7" },
        ],
      },
    ],
    alternatives: [],
    shortcuts: [
      { key: "escape", action: "Commit text" },
      { key: "enter", action: "Commit text" },
    ],
  },

  hand: {
    name: "Hand",
    icon: "✋",
    label: "H",
    shortcutKey: "H",
    group: "navigation",
    options: [],
    alternatives: ["zoom"],
    shortcuts: [{ key: "space", action: "Temporary hand tool" }],
  },

  zoom: {
    name: "Zoom",
    icon: "🔍",
    label: "Z",
    shortcutKey: "Z",
    group: "navigation",
    options: [],
    alternatives: ["hand"],
    shortcuts: [
      { key: "mod+plus", action: "Zoom in" },
      { key: "mod+minus", action: "Zoom out" },
      { key: "mod+0", action: "Fit to window" },
      { key: "mod+1", action: "100% zoom" },
    ],
  },
};

/**
 * Get metadata for a specific tool
 */
export function getToolMeta(tool: ToolType): ToolMeta | undefined {
  return toolRegistry[tool];
}

/**
 * Get the icon for a tool
 */
export function getToolIcon(tool: ToolType): string {
  return toolRegistry[tool]?.icon ?? tool[0].toUpperCase();
}

/**
 * Get the short label for a tool (1-2 chars)
 */
export function getToolLabel(tool: ToolType): string {
  return toolRegistry[tool]?.label ?? tool[0].toUpperCase();
}

/**
 * Get the primary keyboard shortcut key for a tool
 */
export function getToolShortcutKey(tool: ToolType): string {
  return toolRegistry[tool]?.shortcutKey ?? "";
}
