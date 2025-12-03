import { BaseTool, type Point, type ModifierKeys } from '../base-tool';
import { selectionStore } from '../../stores/selection';

export class LassoTool extends BaseTool {
  name = 'lasso';
  cursor = 'crosshair';

  private points: Point[] = [];
  private isSelecting = false;

  constructor(_context: CanvasRenderingContext2D) {
    super();
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    this.isSelecting = true;
    this.points = [{ x, y }];

    // Determine selection mode based on modifiers
    if (modifiers?.shift) {
      // Shift = add to selection
      selectionStore.setMode('add');
    } else if (modifiers?.alt) {
      // Alt = subtract from selection
      selectionStore.setMode('subtract');
    } else {
      // No modifiers = replace selection
      selectionStore.setMode('replace');
      selectionStore.clearSelection();
    }
  }

  onDrag(x: number, y: number, _modifiers?: ModifierKeys) {
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
      mask: null, // TODO: Generate mask from polygon and apply mode (add/subtract/replace)
      bounds: {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY
      }
    });
  }

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys) {
    this.isSelecting = false;
    // Finalize selection (close loop, generate mask)
    // Reset mode to 'replace' after selection is finalized
    selectionStore.resetMode();
  }
}
