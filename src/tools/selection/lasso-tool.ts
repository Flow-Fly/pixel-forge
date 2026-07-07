import type { Point, ModifierKeys } from '../base-tool';
import { BaseSelectionTool } from './base-selection-tool';
import { selectionStore } from '../../stores/selection';
import { projectStore } from '../../stores/project';
import { layerStore } from '../../stores/layers';
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


  constructor(_context: CanvasRenderingContext2D) {
    super();
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    // Check if clicking inside existing selection (for dragging)
    // Only drag if no add/subtract modifiers are pressed
    const isAddOrSubtract = modifiers?.shift || modifiers?.alt;
    if (!isAddOrSubtract && selectionStore.isPointInSelection(canvasX, canvasY)) {
      this.startDragging(canvasX, canvasY);
      return;
    }

    // Clicking outside - commit any transform/floating selection first
    // If we committed, don't immediately start a new selection
    if (this.commitIfTransforming() || this.commitIfFloating()) {
      return;
    }

    this.applySelectionModeFromModifiers(modifiers);

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

    // Get active layer canvas for content-aware trimming
    const activeLayerId = layerStore.activeLayerId.value;
    const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
    const canvas = layer?.canvas;

    // Handle selection modes
    const mode = selectionStore.mode.value;

    // For add/subtract, we need to combine with saved previous selection
    if (mode !== 'replace' && this.previousSelection) {
      const combined = this.combineMasks(this.previousSelection, bounds, mask, mode);
      if (combined) {
        selectionStore.finalizeFreeformSelection(combined.bounds, combined.mask, canvas, shrinkToContent);
      } else {
        selectionStore.clear();
      }
    } else {
      selectionStore.finalizeFreeformSelection(bounds, mask, canvas, shrinkToContent);
    }

    selectionStore.resetMode();
    this.clearPreviousSelection();
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
