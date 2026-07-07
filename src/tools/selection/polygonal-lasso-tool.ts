import type { Point, ModifierKeys } from '../base-tool';
import { BaseSelectionTool } from './base-selection-tool';
import { selectionStore } from '../../stores/selection';
import { projectStore } from '../../stores/project';
import { layerStore } from '../../stores/layers';
import { polygonToMask } from '../../utils/mask-utils';

/**
 * Polygonal Lasso Tool
 * Click to add vertices, double-click or Enter to close.
 * Click near start point (< 5px) to close.
 */
export class PolygonalLassoTool extends BaseSelectionTool {
  name = 'polygonal-lasso';
  cursor = 'crosshair';

  private vertices: Point[] = [];
  private currentMousePos: Point | null = null;
  private isActive = false;
  private lastClickTime = 0;


  constructor(_context: CanvasRenderingContext2D) {
    super();
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    const point = { x: Math.floor(x), y: Math.floor(y) };

    // If not actively drawing a polygon, check if clicking inside selection (for dragging)
    // Only drag if no add/subtract modifiers are pressed
    const isAddOrSubtract = modifiers?.shift || modifiers?.alt;
    if (!this.isActive && !isAddOrSubtract && selectionStore.isPointInSelection(point.x, point.y)) {
      this.startDragging(point.x, point.y);
      return;
    }

    if (this.isDoubleClick()) {
      this.closePolygon();
      return;
    }

    if (this.isActive) {
      this.addVertex(point, modifiers);
    } else {
      this.beginPolygon(point, modifiers);
    }
  }

  /** Detect a double-click (< 300ms between clicks) on a closable polygon. */
  private isDoubleClick(): boolean {
    const now = Date.now();
    if (now - this.lastClickTime < 300 && this.vertices.length >= 3) {
      this.lastClickTime = 0;
      return true;
    }
    this.lastClickTime = now;
    return false;
  }

  private beginPolygon(point: Point, modifiers?: ModifierKeys) {
    // Clicking outside - commit any transform/floating selection first
    // If we committed, don't immediately start a new selection
    if (this.commitIfTransforming() || this.commitIfFloating()) {
      return;
    }

    this.applySelectionModeFromModifiers(modifiers);
    this.capturePreviousSelection();

    // Start new polygon
    this.isActive = true;
    this.mode = 'selecting';
    this.vertices = [point];

    this.updateSelectingState();
  }

  private addVertex(point: Point, modifiers?: ModifierKeys) {
    // Clicking near the start point (< 5px) closes the polygon
    if (this.vertices.length >= 3) {
      const start = this.vertices[0];
      const dist = Math.hypot(point.x - start.x, point.y - start.y);
      if (dist < 5) {
        // Shrink to content only if Ctrl is held
        this.closePolygon(modifiers?.ctrl ?? false);
        return;
      }
    }

    this.vertices.push(point);
    this.updateSelectingState();
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
  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && this.vertices.length >= 3) {
      this.closePolygon();
    } else if (e.key === 'Escape') {
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
    this.clearPreviousSelection();
    selectionStore.clear();
    selectionStore.resetMode();
  }

  private closePolygon(shrinkToContent: boolean = false) {
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
    selectionStore.previousSelectionForVisual.value = null;

    // Reset state
    this.isActive = false;
    this.mode = 'idle';
    this.vertices = [];
    this.currentMousePos = null;
    this.previousSelection = null;
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
}
