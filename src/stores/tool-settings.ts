/**
 * Tool Settings Store
 *
 * Centralized storage for tool-specific settings that the context bar can access
 * without importing tool classes directly (avoiding circular dependencies).
 */

import { signal } from "../core/signal";

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
