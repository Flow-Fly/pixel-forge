import type { Point, ModifierKeys } from '../base-tool';
import { BaseSelectionTool } from './base-selection-tool';
import { selectionStore } from '../../stores/selection';
import { projectStore } from '../../stores/project';
import { polygonToMask, simplifyPath } from '../../utils/mask-utils';

/**
 * Freeform Lasso Tool
 * Click and drag to draw a freehand selection path.
 * Path auto-closes on mouse up.
 */
export class LassoTool extends BaseSelectionTool {
  name = 'lasso';
  cursor = 'crosshair';

  private points: Point[] = [];


  protected beginSelection(canvasX: number, canvasY: number) {
    this.capturePreviousSelection();

    this.mode = 'selecting';
    this.points = [{ x: canvasX, y: canvasY }];

    // Start selecting state for visual feedback
    const startPoint = this.points[0];
    selectionStore.state.value = {
      type: 'selecting',
      shape: 'freeform',
      startPoint,
      currentBounds: { x: startPoint.x, y: startPoint.y, width: 1, height: 1 },
      previewPath: [...this.points],
    };
  }

  onDrag(x: number, y: number, _modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    if (this.mode === 'selecting') {
      const newPoint = { x: canvasX, y: canvasY };

      // Only add point if it's at least 1px away from last point
      const last = this.points[this.points.length - 1];
      const dx = newPoint.x - last.x;
      const dy = newPoint.y - last.y;
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
        this.points.push(newPoint);
      }

      // Update bounds for visual feedback
      this.updateSelectingBounds();
    } else if (this.mode === 'dragging') {
      const dx = canvasX - this.lastDragX;
      const dy = canvasY - this.lastDragY;
      const state = selectionStore.state.value;
      if (state.type === 'transforming') {
        selectionStore.moveTransform(dx, dy);
      } else {
        selectionStore.moveFloat(dx, dy);
      }
      this.lastDragX = canvasX;
      this.lastDragY = canvasY;
    }
  }

  onUp(_x: number, _y: number, modifiers?: ModifierKeys) {
    if (this.mode === 'selecting') {
      // Shrink to content only if Ctrl is held
      const shrinkToContent = modifiers?.ctrl ?? false;
      this.finalizeSelection(shrinkToContent);
    }
    // If dragging, stay floating (wait for commit on next click outside)

    this.mode = 'idle';
  }

  private finalizeSelection(shrinkToContent: boolean = false) {
    // Need at least 3 points for a polygon
    if (this.points.length < 3) {
      selectionStore.clear();
      selectionStore.resetMode();
      selectionStore.previousSelectionForVisual.value = null;
      this.previousSelection = null;
      return;
    }

    // Simplify path to reduce points
    const simplified = simplifyPath(this.points, 0.5);

    if (simplified.length < 3) {
      selectionStore.clear();
      selectionStore.resetMode();
      selectionStore.previousSelectionForVisual.value = null;
      this.previousSelection = null;
      return;
    }

    // Get canvas dimensions
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;

    // Convert polygon to mask
    const result = polygonToMask(simplified, canvasWidth, canvasHeight);

    if (!result) {
      selectionStore.clear();
      selectionStore.resetMode();
      selectionStore.previousSelectionForVisual.value = null;
      this.previousSelection = null;
      return;
    }

    const { mask, bounds } = result;

    this.finalizeMaskSelection(bounds, mask, shrinkToContent);
    this.points = [];
  }

  /**
   * Get the current lasso points for visual preview.
   */
  getPoints(): Point[] {
    return this.points;
  }

  private updateSelectingBounds() {
    if (this.points.length === 0) return;

    const xs = this.points.map((p) => p.x);
    const ys = this.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

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
      previewPath: [...this.points],
    };
  }
}
