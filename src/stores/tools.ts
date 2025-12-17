import { signal } from '../core/signal';
import { selectionStore } from './selection';
import { layerStore } from './layers';
import { animationStore } from './animation';

export type ToolType =
  | 'pencil'
  | 'eraser'
  | 'eyedropper'
  | 'marquee-rect'
  | 'lasso'
  | 'polygonal-lasso'
  | 'magic-wand'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'fill'
  | 'gradient'
  | 'transform'
  | 'text'
  | 'hand'
  | 'zoom';

export interface CanvasTransform {
  screenX: number;      // Top-left position on screen
  screenY: number;
  zoom: number;         // Canvas zoom level
  width: number;        // Canvas width in pixels
  height: number;       // Canvas height in pixels
}

class ToolStore {
  activeTool = signal<ToolType>('pencil');
  previousTool = signal<ToolType | null>(null);

  // Override canvas for brush editing mode
  // When set, tools draw to this canvas instead of active layer
  overrideCanvas = signal<HTMLCanvasElement | null>(null);
  overrideCanvasTransform = signal<CanvasTransform | null>(null);

  /**
   * Set override canvas for brush editing mode
   */
  setOverrideCanvas(canvas: HTMLCanvasElement | null, transform: CanvasTransform | null) {
    this.overrideCanvas.value = canvas;
    this.overrideCanvasTransform.value = transform;
  }

  /**
   * Clear override canvas, returning to normal mode
   */
  clearOverrideCanvas() {
    this.overrideCanvas.value = null;
    this.overrideCanvasTransform.value = null;
  }

  /**
   * Check if in brush editing mode
   */
  isOverrideActive(): boolean {
    return this.overrideCanvas.value !== null;
  }

  setActiveTool(tool: ToolType) {
    this.activeTool.value = tool;

    // Auto-select layer content when switching to transform tool
    if (tool === 'transform') {
      this.autoSelectForTransform();
    }
  }

  /**
   * Auto-select layer content when switching to transform tool.
   * Only activates if there's no current selection.
   */
  private autoSelectForTransform() {
    // Skip if there's already an active selection
    if (selectionStore.isActive) return;

    const activeLayerId = layerStore.activeLayerId.value;
    if (!activeLayerId) return;

    const currentFrameId = animationStore.currentFrameId.value;
    const canvas = animationStore.getCelCanvas(currentFrameId, activeLayerId);
    if (!canvas) return;

    selectionStore.selectLayerContent(canvas);
  }

  /**
   * Set a quick tool (temporary while key held).
   * Saves current tool to restore later.
   */
  setQuickTool(tool: ToolType) {
    // Only save if not already in quick-tool mode
    if (this.previousTool.value === null) {
      this.previousTool.value = this.activeTool.value;
    }
    this.activeTool.value = tool;
  }

  /**
   * Restore the previous tool after quick-tool release.
   */
  restorePreviousTool() {
    if (this.previousTool.value !== null) {
      this.activeTool.value = this.previousTool.value;
      this.previousTool.value = null;
    }
  }

  /**
   * Check if currently in quick-tool mode.
   */
  isQuickToolActive(): boolean {
    return this.previousTool.value !== null;
  }
}

export const toolStore = new ToolStore();
