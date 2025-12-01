import { BaseTool } from '../base-tool';
import { selectionStore } from '../../stores/selection';

export class MarqueeRectTool extends BaseTool {
  name = 'marquee-rect';
  cursor = 'crosshair';
  
  private startX = 0;
  private startY = 0;
  private isSelecting = false;
  constructor(_context: CanvasRenderingContext2D) {
    super();
  }

  onDown(x: number, y: number) {
    this.isSelecting = true;
    this.startX = Math.floor(x);
    this.startY = Math.floor(y);
    
    // Clear previous selection on new start
    selectionStore.clearSelection();
  }

  onDrag(x: number, y: number) {
    if (!this.isSelecting) return;
    
    const currentX = Math.floor(x);
    const currentY = Math.floor(y);
    
    const w = Math.abs(currentX - this.startX) + 1;
    const h = Math.abs(currentY - this.startY) + 1;
    const rx = Math.min(this.startX, currentX);
    const ry = Math.min(this.startY, currentY);

    // Update selection store with new bounds
    // In a real app, we would also generate the mask here
    selectionStore.setSelection({
      type: 'rectangle',
      mask: null, // TODO: Generate mask
      bounds: { x: rx, y: ry, w, h }
    });

    // TODO: Draw selection overlay (marching ants)
    this.drawSelectionOverlay(rx, ry, w, h);
  }

  onUp(_x: number, _y: number) {
    this.isSelecting = false;
  }

  private drawSelectionOverlay(x: number, y: number, w: number, h: number) {
    // This is a temporary visualization
    // In reality, the canvas component should listen to selectionStore and render the overlay
    console.log(`Selection: ${x}, ${y}, ${w}x${h}`);
  }
}
