import { signal } from '../core/signal';

export type ToolType =
  | 'pencil'
  | 'eraser'
  | 'eyedropper'
  | 'marquee-rect'
  | 'lasso'
  | 'magic-wand'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'fill'
  | 'gradient'
  | 'transform'
  | 'hand'
  | 'zoom';

class ToolStore {
  activeTool = signal<ToolType>('pencil');
  previousTool = signal<ToolType | null>(null);

  setActiveTool(tool: ToolType) {
    this.activeTool.value = tool;
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
