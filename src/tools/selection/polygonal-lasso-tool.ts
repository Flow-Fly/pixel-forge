import type { Point, ModifierKeys } from '../base-tool';
import { BaseSelectionTool } from './base-selection-tool';
import { selectionStore } from '../../stores/selection';
import { projectStore } from '../../stores/project';
import { layerStore } from '../../stores/layers';
import { polygonToMask } from '../../utils/mask-utils';
import type { SelectionShape } from '../../types/selection';

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

  // Store previous selection for add/subtract operations
  private previousSelection: {
    bounds: { x: number; y: number; width: number; height: number };
    shape: SelectionShape;
    mask?: Uint8Array;
  } | null = null;

  constructor(_context: CanvasRenderingContext2D) {
    super();
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);
    const point = { x: canvasX, y: canvasY };
    const now = Date.now();

    // If not actively drawing a polygon, check if clicking inside selection (for dragging)
    // Only drag if no add/subtract modifiers are pressed
    const isAddOrSubtract = modifiers?.shift || modifiers?.alt;
    if (!this.isActive && !isAddOrSubtract && selectionStore.isPointInSelection(canvasX, canvasY)) {
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

      // Set selection mode based on modifiers
      // Shift+Alt = intersect, Shift = add, Alt = subtract
      if (modifiers?.shift && modifiers?.alt) {
        selectionStore.setMode('intersect');
      } else if (modifiers?.shift) {
        selectionStore.setMode('add');
      } else if (modifiers?.alt) {
        selectionStore.setMode('subtract');
      } else {
        selectionStore.setMode('replace');
      }

      // Save previous selection for add/subtract operations
      const currentState = selectionStore.state.value;
      const mode = selectionStore.mode.value;
      if (currentState.type === 'selected') {
        this.previousSelection = {
          bounds: { ...currentState.bounds },
          shape: currentState.shape,
          mask: currentState.shape === 'freeform'
            ? (currentState as { mask: Uint8Array }).mask
            : undefined,
        };
        // Set visual signal for marching ants overlay (only in add/subtract mode)
        if (mode !== 'replace') {
          selectionStore.previousSelectionForVisual.value = this.previousSelection;
        }
      } else {
        this.previousSelection = null;
        selectionStore.previousSelectionForVisual.value = null;
      }

      // Start new polygon
      this.isActive = true;
      this.mode = 'selecting';
      this.vertices = [point];

      this.updateSelectingState();
    } else {
      // Check if clicking near start point to close
      if (this.vertices.length >= 3) {
        const start = this.vertices[0];
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 5) {
          // Shrink to content only if Ctrl is held
          const shrinkToContent = modifiers?.ctrl ?? false;
          this.closePolygon(shrinkToContent);
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
    selectionStore.previousSelectionForVisual.value = null;
    this.previousSelection = null;
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
