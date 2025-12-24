/**
 * Tool Loader Factory
 *
 * Centralizes dynamic tool imports and instantiation.
 * Replaces the large switch statement in pf-drawing-canvas.ts.
 */

import type { ToolType } from "../stores/tools";
import type { BaseTool } from "./base-tool";

/**
 * Tool constructor type - takes a canvas context.
 */
type ToolConstructor = new (context: CanvasRenderingContext2D) => BaseTool;

/**
 * Tool loader configuration.
 * Maps tool names to their dynamic import functions.
 */
const TOOL_LOADERS: Record<ToolType, () => Promise<ToolConstructor>> = {
  pencil: async () => (await import("./pencil-tool")).PencilTool,
  eraser: async () => (await import("./eraser-tool")).EraserTool,
  eyedropper: async () => (await import("./eyedropper-tool")).EyedropperTool,
  fill: async () => (await import("./fill-tool")).FillTool,
  gradient: async () => (await import("./gradient-tool")).GradientTool,
  line: async () => (await import("./shape-tool")).LineTool,
  rectangle: async () => (await import("./shape-tool")).RectangleTool,
  ellipse: async () => (await import("./shape-tool")).EllipseTool,
  "marquee-rect": async () =>
    (await import("./selection/marquee-rect-tool")).MarqueeRectTool,
  lasso: async () => (await import("./selection/lasso-tool")).LassoTool,
  "polygonal-lasso": async () =>
    (await import("./selection/polygonal-lasso-tool")).PolygonalLassoTool,
  "magic-wand": async () =>
    (await import("./selection/magic-wand-tool")).MagicWandTool,
  transform: async () => (await import("./transform-tool")).TransformTool,
  text: async () => (await import("./text-tool")).TextTool,
  hand: async () => (await import("./hand-tool")).HandTool,
  zoom: async () => (await import("./zoom-tool")).ZoomTool,
};

/**
 * Load and instantiate a tool by name.
 *
 * @param toolName - The tool type to load
 * @param context - The canvas rendering context
 * @returns The instantiated tool, or null if not found
 */
export async function loadTool(
  toolName: ToolType,
  context: CanvasRenderingContext2D
): Promise<BaseTool | null> {
  const loader = TOOL_LOADERS[toolName];

  if (!loader) {
    console.warn(`Unknown tool: ${toolName}`);
    return null;
  }

  const ToolClass = await loader();
  return new ToolClass(context);
}

/**
 * Drawing tools that should auto-commit floating selections.
 */
export const DRAWING_TOOLS: readonly ToolType[] = [
  "pencil",
  "eraser",
  "fill",
  "gradient",
  "line",
  "rectangle",
  "ellipse",
] as const;

/**
 * Selection tools.
 */
export const SELECTION_TOOLS: readonly ToolType[] = [
  "marquee-rect",
  "lasso",
  "polygonal-lasso",
  "magic-wand",
] as const;

/**
 * Check if a tool is a drawing tool.
 */
export function isDrawingTool(toolName: ToolType): boolean {
  return DRAWING_TOOLS.includes(toolName);
}

/**
 * Check if a tool is a selection tool.
 */
export function isSelectionTool(toolName: ToolType): boolean {
  return SELECTION_TOOLS.includes(toolName);
}
