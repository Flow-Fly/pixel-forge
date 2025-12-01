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
  | 'transform';

class ToolStore {
  activeTool = signal<ToolType>('pencil');

  setActiveTool(tool: ToolType) {
    this.activeTool.value = tool;
  }
}

export const toolStore = new ToolStore();
