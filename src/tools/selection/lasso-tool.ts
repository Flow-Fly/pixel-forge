import { BaseTool, type Point } from '../base-tool';
import { selectionStore } from '../../stores/selection';

export class LassoTool extends BaseTool {
  name = 'lasso';
  cursor = 'crosshair';
  
  private points: Point[] = [];
  private isSelecting = false;

  constructor(_context: CanvasRenderingContext2D) {
    super();
  }

  onDown(x: number, y: number) {
    this.isSelecting = true;
    this.points = [{ x, y }];
    selectionStore.clearSelection();
  }

  onDrag(x: number, y: number) {
    if (!this.isSelecting) return;
    this.points.push({ x, y });
    
    // Calculate bounds dynamically
    const xs = this.points.map(p => p.x);
    const ys = this.points.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    selectionStore.setSelection({
      type: 'lasso',
      mask: null, // TODO: Generate mask from polygon
      bounds: {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY
      }
    });
  }

  onUp(_x: number, _y: number) {
    this.isSelecting = false;
    // Finalize selection (close loop, generate mask)
  }
}
