import { BaseTool, type Point, type ModifierKeys } from '../base-tool';
import { selectionStore } from '../../stores/selection';
import { projectStore } from '../../stores/project';
import { historyStore } from '../../stores/history';
import { layerStore } from '../../stores/layers';
import { polygonToMask } from '../../utils/mask-utils';
import { CutToFloatCommand, CommitFloatCommand } from '../../commands/selection-commands';

/**
 * Polygonal Lasso Tool
 * Click to add vertices, double-click or Enter to close.
 * Click near start point (< 5px) to close.
 */
export class PolygonalLassoTool extends BaseTool {
  name = 'polygonal-lasso';
  cursor = 'crosshair';

  private vertices: Point[] = [];
  private currentMousePos: Point | null = null;
  private isActive = false;
  private lastClickTime = 0;
  private mode: 'idle' | 'selecting' | 'dragging' = 'idle';
  private lastDragX = 0;
  private lastDragY = 0;

  constructor(_context: CanvasRenderingContext2D) {
    super();
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);
    const point = { x: canvasX, y: canvasY };
    const now = Date.now();

    // If not actively drawing a polygon, check if clicking inside selection (for dragging)
    if (!this.isActive && selectionStore.isPointInSelection(canvasX, canvasY)) {
      this.startDragging(canvasX, canvasY);
      return;
    }

    // Check for double-click (< 300ms between clicks)
    if (now - this.lastClickTime < 300 && this.vertices.length >= 3) {
      this.closePolygon();
      this.lastClickTime = 0;
      return;
    }
    this.lastClickTime = now;

    if (!this.isActive) {
      // Clicking outside - commit any transform/floating selection first
      // If we committed, don't immediately start a new selection
      if (this.commitIfTransforming() || this.commitIfFloating()) {
        return;
      }

      // Start new polygon
      this.isActive = true;
      this.mode = 'selecting';
      this.vertices = [point];

      // Set selection mode based on modifiers
      if (modifiers?.shift) {
        selectionStore.setMode('add');
      } else if (modifiers?.alt) {
        selectionStore.setMode('subtract');
      } else {
        selectionStore.setMode('replace');
      }

      this.updateSelectingState();
    } else {
      // Check if clicking near start point to close
      if (this.vertices.length >= 3) {
        const start = this.vertices[0];
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 5) {
          this.closePolygon();
          return;
        }
      }

      // Add new vertex
      this.vertices.push(point);
      this.updateSelectingState();
    }
  }

  onDrag(x: number, y: number, _modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    if (this.mode === 'dragging') {
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
    } else {
      // Update current mouse position for preview line
      this.currentMousePos = { x: canvasX, y: canvasY };
    }
  }

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys) {
    // If dragging, stay floating (wait for commit on next click outside)
    if (this.mode === 'dragging') {
      this.mode = 'idle';
    }
    // For selecting mode, wait for polygon to be closed (via double-click, Enter, or click near start)
  }

  onMove(x: number, y: number) {
    if (this.isActive) {
      this.currentMousePos = { x: Math.floor(x), y: Math.floor(y) };
      // Update state to trigger re-render with new cursor position
      this.updateSelectingState();
    }
  }

  /**
   * Handle keyboard events (Enter to close, Escape to cancel)
   */
  onKeyDown(key: string) {
    if (key === 'Enter' && this.vertices.length >= 3) {
      this.closePolygon();
    } else if (key === 'Escape') {
      this.cancel();
    }
  }

  /**
   * Get current vertices for visual preview.
   */
  getVertices(): Point[] {
    return this.vertices;
  }

  /**
   * Get current mouse position for preview line.
   */
  getCurrentMousePos(): Point | null {
    return this.currentMousePos;
  }

  /**
   * Check if tool is actively drawing.
   */
  getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * Cancel the current polygon.
   */
  cancel() {
    this.isActive = false;
    this.mode = 'idle';
    this.vertices = [];
    this.currentMousePos = null;
    selectionStore.clear();
    selectionStore.resetMode();
  }

  private closePolygon() {
    if (this.vertices.length < 3) {
      this.cancel();
      return;
    }

    // Get canvas dimensions
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;

    // Convert polygon to mask
    const result = polygonToMask(this.vertices, canvasWidth, canvasHeight);

    if (!result) {
      this.cancel();
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
        selectionStore.finalizeFreeformSelection(combined.bounds, combined.mask, canvas);
      } else {
        selectionStore.clear();
      }
    } else {
      selectionStore.finalizeFreeformSelection(bounds, mask, canvas);
    }

    selectionStore.resetMode();

    // Reset state
    this.isActive = false;
    this.mode = 'idle';
    this.vertices = [];
    this.currentMousePos = null;
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

  private updateSelectingState() {
    if (this.vertices.length === 0) return;

    // Build preview path: all vertices + current mouse position (for live preview line)
    const previewPath = [...this.vertices];
    if (this.currentMousePos) {
      previewPath.push(this.currentMousePos);
    }

    const xs = previewPath.map((p) => p.x);
    const ys = previewPath.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    selectionStore.state.value = {
      type: 'selecting',
      shape: 'freeform',
      startPoint: this.vertices[0],
      currentBounds: {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX + 1),
        height: Math.max(1, maxY - minY + 1),
      },
      previewPath,
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
