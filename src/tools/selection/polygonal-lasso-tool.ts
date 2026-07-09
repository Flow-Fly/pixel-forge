import type { Point, ModifierKeys } from '../base-tool';
import { BaseSelectionTool } from './base-selection-tool';
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


  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    const point = { x: Math.floor(x), y: Math.floor(y) };

    // If not actively drawing a polygon, check if clicking inside selection (for dragging)
    // Only drag if no add/subtract modifiers are pressed
    const isAddOrSubtract = modifiers?.shift || modifiers?.alt;
    if (!this.isActive && !isAddOrSubtract && this.projectContext.selection.isPointInSelection(point.x, point.y)) {
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
    const selection = this.projectContext.selection;
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    if (this.mode === 'dragging') {
      const dx = canvasX - this.lastDragX;
      const dy = canvasY - this.lastDragY;
      const state = selection.state.value;
      if (state.type === 'transforming') {
        selection.moveTransform(dx, dy);
      } else {
        selection.moveFloat(dx, dy);
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
    this.projectContext.selection.clear();
    this.projectContext.selection.resetMode();
  }

  private closePolygon(shrinkToContent: boolean = false) {
    if (this.vertices.length < 3) {
      this.cancel();
      return;
    }

    // Get canvas dimensions
    const canvasWidth = this.projectContext.project.width.value;
    const canvasHeight = this.projectContext.project.height.value;

    // Convert polygon to mask
    const result = polygonToMask(this.vertices, canvasWidth, canvasHeight);

    if (!result) {
      this.cancel();
      return;
    }

    const { mask, bounds } = result;

    this.finalizeMaskSelection(bounds, mask, shrinkToContent);

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

    this.projectContext.selection.state.value = {
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
