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
    group: "drawing",
    options: [
      { type: "slider", key: "size", label: "Size", min: 1, max: 50, unit: "px", store: "brush", storeKey: "size" },
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
      {
        type: "checkbox",
        key: "bigPixelMode",
        label: "Big Pixel",
        store: "brush",
        storeKey: "bigPixelMode",
      },
    ],
    alternatives: ["eraser", "eyedropper"],
    shortcuts: [
      { key: "shift", action: "Draw straight line", when: "drawing" },
      { key: "[", action: "Decrease size" },
      { key: "]", action: "Increase size" },
      { key: "alt", action: "Eyedropper" },
    ],
  },

  eraser: {
    name: "Eraser",
    group: "drawing",
    options: [
      { type: "slider", key: "size", label: "Size", min: 1, max: 50, unit: "px", store: "brush", storeKey: "size" },
      {
        type: "select",
        key: "mode",
        label: "Mode",
        store: "eraser",
        storeKey: "mode",
        options: [
          { value: "transparent", label: "To Transparent" },
          { value: "background", label: "To Background" },
        ],
      },
      {
        type: "checkbox",
        key: "pixelPerfect",
        label: "Pixel Perfect",
        store: "brush",
        storeKey: "pixelPerfect",
      },
      {
        type: "checkbox",
        key: "bigPixelMode",
        label: "Big Pixel",
        store: "brush",
        storeKey: "bigPixelMode",
      },
    ],
    alternatives: ["pencil", "eyedropper"],
    shortcuts: [
      { key: "shift", action: "Erase straight line", when: "drawing" },
      { key: "[", action: "Decrease size" },
      { key: "]", action: "Increase size" },
    ],
  },

  eyedropper: {
    name: "Eyedropper",
    group: "drawing",
    options: [],
    alternatives: ["pencil", "eraser"],
    shortcuts: [{ key: "alt", action: "Sample from any layer" }],
  },

  fill: {
    name: "Fill",
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
    shortcuts: [{ key: "shift", action: "Constrain to 15\u00b0 angles", when: "drawing" }],
  },

  rectangle: {
    name: "Rectangle",
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
    ],
  },

  ellipse: {
    name: "Ellipse",
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
    ],
  },

  "marquee-rect": {
    name: "Marquee",
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
    group: "utility",
    options: [],
    alternatives: [],
    shortcuts: [
      { key: "shift", action: "Constrain proportions", when: "drawing" },
      { key: "enter", action: "Apply transform" },
      { key: "escape", action: "Cancel" },
    ],
  },

  hand: {
    name: "Hand",
    group: "navigation",
    options: [],
    alternatives: ["zoom"],
    shortcuts: [{ key: "space", action: "Temporary hand tool" }],
  },

  zoom: {
    name: "Zoom",
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
