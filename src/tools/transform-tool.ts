import { BaseTool } from './base-tool';
import { selectionStore } from '../stores/selection';

export class TransformTool extends BaseTool {
  name = 'transform';
  cursor = 'move';

  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private mode: 'move' | 'scale' | 'rotate' = 'move';

  onDown(x: number, y: number) {
    const state = selectionStore.state.value;
    if (state.type === 'none') return;

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
      const state = selectionStore.state.value;
      if (state.type === 'floating') {
        // Move floating selection
        selectionStore.moveFloat(dx, dy);
      }
      // For 'selected' state, would need to cut to float first
    }

    this.startX = x;
    this.startY = y;
  }

  onUp(_x: number, _y: number) {
    this.isDragging = false;
    // Commit transformation
  }
}
