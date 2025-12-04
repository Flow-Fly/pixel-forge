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
    this.points = [{ x: Math.floor(x), y: Math.floor(y) }];
    selectionStore.clear();
  }

  onDrag(x: number, y: number) {
    if (!this.isSelecting) return;
    this.points.push({ x: Math.floor(x), y: Math.floor(y) });

    // Calculate bounds dynamically
    const xs = this.points.map((p) => p.x);
    const ys = this.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    // Update selection state with current bounds
    // Note: freeform selection with mask not fully implemented yet
    selectionStore.state.value = {
      type: 'selecting',
      shape: 'freeform',
      startPoint: this.points[0],
      currentBounds: {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      },
    };
  }

  onUp(_x: number, _y: number) {
    this.isSelecting = false;
    // Finalize selection (close loop, generate mask)
    // For now, just clear since freeform mask generation is not implemented
    selectionStore.clear();
  }
}
