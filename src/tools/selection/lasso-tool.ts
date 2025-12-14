import { BaseTool, type Point, type ModifierKeys } from '../base-tool';
import { selectionStore } from '../../stores/selection';
import { projectStore } from '../../stores/project';
import { historyStore } from '../../stores/history';
import { layerStore } from '../../stores/layers';
import { polygonToMask, simplifyPath } from '../../utils/mask-utils';
import { CutToFloatCommand, CommitFloatCommand } from '../../commands/selection-commands';

/**
 * Freeform Lasso Tool
 * Click and drag to draw a freehand selection path.
 * Path auto-closes on mouse up.
 */
export class LassoTool extends BaseTool {
  name = 'lasso';
  cursor = 'crosshair';

  private points: Point[] = [];
  private mode: 'idle' | 'selecting' | 'dragging' = 'idle';
  private lastDragX = 0;
  private lastDragY = 0;

  constructor(_context: CanvasRenderingContext2D) {
    super();
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    // Check if clicking inside existing selection (for dragging)
    if (selectionStore.isPointInSelection(canvasX, canvasY)) {
      this.startDragging(canvasX, canvasY);
      return;
    }

    // Clicking outside - commit any transform/floating selection first
    // If we committed, don't immediately start a new selection
    if (this.commitIfTransforming() || this.commitIfFloating()) {
      return;
    }

    // Set selection mode based on modifiers
    if (modifiers?.shift) {
      selectionStore.setMode('add');
    } else if (modifiers?.alt) {
      selectionStore.setMode('subtract');
    } else {
      selectionStore.setMode('replace');
    }

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
      return;
    }

    // Simplify path to reduce points
    const simplified = simplifyPath(this.points, 0.5);

    if (simplified.length < 3) {
      selectionStore.clear();
      selectionStore.resetMode();
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
      return;
    }

    const { mask, bounds } = result;

    // Get active layer canvas for content-aware trimming
    const activeLayerId = layerStore.activeLayerId.value;
    const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
    const canvas = layer?.canvas;

    // Handle selection modes
    const currentState = selectionStore.state.value;
    const mode = selectionStore.mode.value;

    // For add/subtract, we need to combine with existing selection
    if (mode !== 'replace' && currentState.type === 'selected') {
      const combined = this.combineMasks(currentState, bounds, mask, mode);
      if (combined) {
        selectionStore.finalizeFreeformSelection(combined.bounds, combined.mask, canvas, shrinkToContent);
      } else {
        selectionStore.clear();
      }
    } else {
      selectionStore.finalizeFreeformSelection(bounds, mask, canvas, shrinkToContent);
    }

    selectionStore.resetMode();
    this.points = [];
  }

  /**
   * Get the current lasso points for visual preview.
   */
  getPoints(): Point[] {
    return this.points;
  }

  private startDragging(x: number, y: number) {
    const state = selectionStore.state.value;

    // If selected (not floating), cut to float first
    if (state.type === 'selected') {
      this.cutToFloat();
    }

    this.mode = 'dragging';
    this.lastDragX = x;
    this.lastDragY = y;
  }

  private cutToFloat() {
    const state = selectionStore.state.value;
    if (state.type !== 'selected') return;

    const activeLayerId = layerStore.activeLayerId.value;
    const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
    if (!layer?.canvas) return;

    const command = new CutToFloatCommand(
      layer.canvas,
      layer.id,
      state.bounds,
      state.shape,
      state.shape === 'freeform' ? (state as { mask: Uint8Array }).mask : undefined
    );

    historyStore.execute(command);
  }

  private commitIfTransforming(): boolean {
    const state = selectionStore.state.value;
    if (state.type !== 'transforming') return false;

    // Dispatch event to trigger commit in viewport
    window.dispatchEvent(new CustomEvent('commit-transform'));
    return true;
  }

  private commitIfFloating(): boolean {
    const state = selectionStore.state.value;
    if (state.type !== 'floating') return false;

    const activeLayerId = layerStore.activeLayerId.value;
    const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
    if (!layer?.canvas) return false;

    const command = new CommitFloatCommand(
      layer.canvas,
      layer.id,
      state.imageData,
      state.originalBounds,
      state.currentOffset,
      state.shape,
      state.mask
    );

    historyStore.execute(command);
    return true;
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

  /**
   * Combine two masks with add or subtract operation.
   */
  private combineMasks(
    currentState: { bounds: { x: number; y: number; width: number; height: number }; shape: string; mask?: Uint8Array },
    newBounds: { x: number; y: number; width: number; height: number },
    newMask: Uint8Array,
    operation: 'add' | 'subtract' | 'replace'
  ): { mask: Uint8Array; bounds: { x: number; y: number; width: number; height: number } } | null {
    if (operation === 'replace') {
      return { mask: newMask, bounds: newBounds };
    }

    const oldBounds = currentState.bounds;

    // Calculate combined bounds
    const minX = operation === 'add'
      ? Math.min(oldBounds.x, newBounds.x)
      : oldBounds.x;
    const minY = operation === 'add'
      ? Math.min(oldBounds.y, newBounds.y)
      : oldBounds.y;
    const maxX = operation === 'add'
      ? Math.max(oldBounds.x + oldBounds.width, newBounds.x + newBounds.width)
      : oldBounds.x + oldBounds.width;
    const maxY = operation === 'add'
      ? Math.max(oldBounds.y + oldBounds.height, newBounds.y + newBounds.height)
      : oldBounds.y + oldBounds.height;

    const combinedBounds = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };

    const combinedMask = new Uint8Array(combinedBounds.width * combinedBounds.height);

    // Helper to get value from a mask
    const getMaskValue = (
      mask: Uint8Array | undefined,
      bounds: { x: number; y: number; width: number; height: number },
      x: number,
      y: number,
      shape: string
    ): boolean => {
      if (x < bounds.x || x >= bounds.x + bounds.width || y < bounds.y || y >= bounds.y + bounds.height) {
        return false;
      }

      if (shape === 'rectangle') {
        return true;
      }

      if (shape === 'ellipse') {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        return dx * dx + dy * dy <= 1;
      }

      if (mask) {
        const idx = (y - bounds.y) * bounds.width + (x - bounds.x);
        return mask[idx] === 255;
      }

      return false;
    };

    // Fill combined mask
    let hasAnyPixel = false;
    for (let y = combinedBounds.y; y < combinedBounds.y + combinedBounds.height; y++) {
      for (let x = combinedBounds.x; x < combinedBounds.x + combinedBounds.width; x++) {
        const oldValue = getMaskValue(
          currentState.shape === 'freeform' ? currentState.mask : undefined,
          oldBounds,
          x,
          y,
          currentState.shape
        );
        const newValue = getMaskValue(newMask, newBounds, x, y, 'freeform');

        let finalValue: boolean;
        if (operation === 'add') {
          finalValue = oldValue || newValue;
        } else {
          finalValue = oldValue && !newValue;
        }

        if (finalValue) {
          const idx = (y - combinedBounds.y) * combinedBounds.width + (x - combinedBounds.x);
          combinedMask[idx] = 255;
          hasAnyPixel = true;
        }
      }
    }

    if (!hasAnyPixel) return null;

    // Shrink bounds to fit actual selection
    let actualMinX = combinedBounds.width, actualMinY = combinedBounds.height;
    let actualMaxX = -1, actualMaxY = -1;

    for (let y = 0; y < combinedBounds.height; y++) {
      for (let x = 0; x < combinedBounds.width; x++) {
        if (combinedMask[y * combinedBounds.width + x] === 255) {
          actualMinX = Math.min(actualMinX, x);
          actualMinY = Math.min(actualMinY, y);
          actualMaxX = Math.max(actualMaxX, x);
          actualMaxY = Math.max(actualMaxY, y);
        }
      }
    }

    if (actualMaxX < 0) return null;

    // Create tight bounds mask
    const tightBounds = {
      x: combinedBounds.x + actualMinX,
      y: combinedBounds.y + actualMinY,
      width: actualMaxX - actualMinX + 1,
      height: actualMaxY - actualMinY + 1,
    };

    const tightMask = new Uint8Array(tightBounds.width * tightBounds.height);
    for (let y = 0; y < tightBounds.height; y++) {
      for (let x = 0; x < tightBounds.width; x++) {
        const srcIdx = (actualMinY + y) * combinedBounds.width + (actualMinX + x);
        const dstIdx = y * tightBounds.width + x;
        tightMask[dstIdx] = combinedMask[srcIdx];
      }
    }

    return { mask: tightMask, bounds: tightBounds };
  }
}
