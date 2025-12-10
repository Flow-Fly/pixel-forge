/**
 * Tool Settings Store
 *
 * Centralized storage for tool-specific settings that the context bar can access
 * without importing tool classes directly (avoiding circular dependencies).
 */

import { signal } from "../core/signal";
import { shapeStore } from "./shape";
import type { ToolType } from "./tools";

/**
 * Per-tool size storage
 * Each drawing tool remembers its own size independently
 */
export const toolSizes = {
  pencil: signal(1),
  eraser: signal(1),
  // Shapes use shapeStore.strokeWidth
};

/**
 * Get the current size for a tool
 */
export function getToolSize(tool: ToolType): number {
  if (tool === "pencil") return toolSizes.pencil.value;
  if (tool === "eraser") return toolSizes.eraser.value;
  if (tool === "line" || tool === "rectangle" || tool === "ellipse") {
    return shapeStore.strokeWidth.value;
  }
  return 1;
}

/**
 * Set the size for a tool
 */
export function setToolSize(tool: ToolType, size: number): void {
  const clamped = Math.max(1, Math.min(50, size));
  if (tool === "pencil") {
    toolSizes.pencil.value = clamped;
  } else if (tool === "eraser") {
    toolSizes.eraser.value = clamped;
  } else if (tool === "line" || tool === "rectangle" || tool === "ellipse") {
    shapeStore.setStrokeWidth(clamped);
  }
}

/**
 * Eraser tool settings
 */
export type EraserMode = "transparent" | "background";

export const eraserSettings = {
  mode: signal<EraserMode>("transparent"),
};

/**
 * Magic Wand tool settings
 */
export const magicWandSettings = {
  tolerance: signal(0), // 0-255, 0 = exact match
  contiguous: signal(true), // true = connected pixels only
  diagonal: signal(false), // true = 8-way connectivity
};

/**
 * Shape tool settings
 */
export const shapeSettings = {
  fill: signal(false),
  thickness: signal(1),
};

/**
 * Fill tool settings
 */
export const fillSettings = {
  contiguous: signal(true),
};

/**
 * Gradient tool settings
 */
export const gradientSettings = {
  type: signal<"linear" | "radial">("linear"),
};

/**
 * Text tool settings
 */
export const textSettings = {
  font: signal("small-5x7"), // Default font
  color: signal("#ffffff"),  // Default text color (uses foreground if not set)
};
