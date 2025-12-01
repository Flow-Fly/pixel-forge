import { BaseTool } from './base-tool';
import { selectionStore } from '../stores/selection';

export class TransformTool extends BaseTool {
  name = 'transform';
  cursor = 'move';
  
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private mode: 'move' | 'scale' | 'rotate' = 'move';
  
  // Temporary state for transformation
  private transform = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0
  };

  onDown(x: number, y: number) {
    const selection = selectionStore.selection.value;
    if (selection.type === 'none' || !selection.bounds) return;

    this.isDragging = true;
    this.startX = x;
    this.startY = y;
    
    // Determine mode based on where user clicked (corners = scale, outside = rotate, inside = move)
    // For simplicity, we'll just implement move for now
    this.mode = 'move';
  }

  onDrag(x: number, y: number) {
    if (!this.isDragging) return;

    const dx = x - this.startX;
    const dy = y - this.startY;

    if (this.mode === 'move') {
      // Update selection bounds visual
      // In a real implementation, we'd update a transformation matrix
      // and render the selected content with that matrix.
      // For now, we'll just move the selection bounds.
      const selection = selectionStore.selection.value;
      if (selection.bounds) {
        // This is a bit hacky, directly modifying the store value
        // Ideally we should have a method on the store or a separate transform state
        // selectionStore.updateBounds(...)
      }
    }
    
    this.startX = x;
    this.startY = y;
  }

  onUp(_x: number, _y: number) {
    this.isDragging = false;
    // Commit transformation
  }
}
