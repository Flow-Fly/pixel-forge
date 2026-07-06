import type { ModifierKeys, BaseTool, Point } from "./base-tool";
import type { ToolType } from "../stores/tools";
import { log } from "../utils/log";

type ToolConstructor = new (ctx: CanvasRenderingContext2D) => BaseTool;
type ToolLoader = () => Promise<ToolConstructor>;

const TOOL_LOADERS: Partial<Record<ToolType, ToolLoader>> = {
  pencil: async () => (await import("./pencil-tool")).PencilTool,
  eraser: async () => (await import("./eraser-tool")).EraserTool,
  eyedropper: async () => (await import("./eyedropper-tool")).EyedropperTool,
  "marquee-rect": async () =>
    (await import("./selection/marquee-rect-tool")).MarqueeRectTool,
  lasso: async () => (await import("./selection/lasso-tool")).LassoTool,
  "polygonal-lasso": async () =>
    (await import("./selection/polygonal-lasso-tool")).PolygonalLassoTool,
  "magic-wand": async () =>
    (await import("./selection/magic-wand-tool")).MagicWandTool,
  line: async () => (await import("./shape-tool")).LineTool,
  rectangle: async () => (await import("./shape-tool")).RectangleTool,
  ellipse: async () => (await import("./shape-tool")).EllipseTool,
  fill: async () => (await import("./fill-tool")).FillTool,
  gradient: async () => (await import("./gradient-tool")).GradientTool,
  transform: async () => (await import("./transform-tool")).TransformTool,
  text: async () => (await import("./text-tool")).TextTool,
  hand: async () => (await import("./hand-tool")).HandTool,
  zoom: async () => (await import("./zoom-tool")).ZoomTool,
};

export class ToolController {
  private activeTool: BaseTool | null = null;
  private activeToolName: ToolType | null = null;
  private readonly fallbackContext: CanvasRenderingContext2D;

  constructor(fallbackContext: CanvasRenderingContext2D) {
    this.fallbackContext = fallbackContext;
  }

  get activeName(): ToolType | null {
    return this.activeToolName;
  }

  get cursor(): string | null {
    return this.activeTool?.cursor ?? null;
  }

  get hasActiveTool(): boolean {
    return this.activeTool !== null;
  }

  isActive(toolName: ToolType): boolean {
    return this.activeToolName === toolName;
  }

  async load(toolName: ToolType): Promise<boolean> {
    const loadToolClass = TOOL_LOADERS[toolName];
    if (!loadToolClass) {
      log.warn(`Unknown tool: ${toolName}`);
      return false;
    }

    const ToolClass = await loadToolClass();
    this.activeTool = new ToolClass(this.fallbackContext);
    this.activeToolName = toolName;
    return true;
  }

  onDown(
    ctx: CanvasRenderingContext2D,
    point: Point,
    modifiers?: ModifierKeys
  ): void {
    if (!this.activeTool) return;

    this.activeTool.setContext(ctx);
    this.activeTool.onDown(point.x, point.y, modifiers);
  }

  onDrag(point: Point, modifiers?: ModifierKeys): void {
    this.activeTool?.onDrag(point.x, point.y, modifiers);
  }

  onUp(point: Point, modifiers?: ModifierKeys): void {
    this.activeTool?.onUp(point.x, point.y, modifiers);
  }

  onMove(point: Point, modifiers?: ModifierKeys): void {
    this.activeTool?.onMove(point.x, point.y, modifiers);
  }
}
