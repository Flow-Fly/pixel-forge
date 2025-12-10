/**
 * Tool Metadata Types
 *
 * Defines the structure for tool options, shortcuts, and metadata
 * that the context bar uses for generic rendering.
 */

/**
 * Base interface for all tool options
 */
export interface ToolOptionBase {
  key: string;
  label: string;
  store: "brush" | "magicWand" | "shape" | "fill" | "gradient" | "eraser" | "toolSizes" | "text";
  storeKey: string;
}

/**
 * Slider option for numeric values
 */
export interface ToolOptionSlider extends ToolOptionBase {
  type: "slider";
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

/**
 * Checkbox option for boolean values
 */
export interface ToolOptionCheckbox extends ToolOptionBase {
  type: "checkbox";
}

/**
 * Select option for enum/dropdown values
 */
export interface ToolOptionSelect extends ToolOptionBase {
  type: "select";
  options: { value: string; label: string }[];
}

/**
 * Union type for all tool options
 */
export type ToolOption = ToolOptionSlider | ToolOptionCheckbox | ToolOptionSelect;

/**
 * Keyboard shortcut definition
 */
export interface ToolShortcut {
  /** Key or key combination (e.g., 'shift', 'mod+z', '[', ']') */
  key: string;
  /** Human-readable description of what the shortcut does */
  action: string;
  /** Context when this shortcut is active */
  when?: "always" | "drawing" | "idle" | "selection";
}

/**
 * Complete tool metadata
 */
export interface ToolMeta {
  /** Display name for the tool */
  name: string;
  /** Emoji icon for the tool */
  icon: string;
  /** Short label (1-2 chars) for compact display */
  label: string;
  /** Primary keyboard shortcut key (e.g., "B" for pencil) */
  shortcutKey: string;
  /** Tool group for categorization */
  group: "drawing" | "selection" | "shape" | "fill" | "navigation" | "utility";
  /** Tool options to display in context bar */
  options: ToolOption[];
  /** Alternative tools for quick-switching */
  alternatives: string[];
  /** Keyboard shortcuts for this tool */
  shortcuts: ToolShortcut[];
}
