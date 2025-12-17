/**
 * Selection Store - Main state management for selections.
 *
 * Manages selection state machine:
 * none → selecting → selected → floating → transforming
 */

import { signal } from '../../core/signal';
import type { SelectionState, SelectionShape } from '../../types/selection';
import type { Rect } from '../../types/geometry';
import type { SelectionMode } from './types';
import { trimBoundsToContent, trimFreeformToContent } from './bounds-utils';
import { isPointInBounds, isPointInRotatedBounds } from './hit-testing';
import {
  rotateCleanEdge,
  calculateRotatedBounds,
  normalizeAngle,
} from '../../utils/rotation';

class SelectionStore {
  state = signal<SelectionState>({ type: 'none' });
  mode = signal<SelectionMode>('replace');

  // Track previous selection for visual feedback during add/subtract operations
  previousSelectionForVisual = signal<{
    bounds: { x: number; y: number; width: number; height: number };
    shape: SelectionShape;
    mask?: Uint8Array;
  } | null>(null);

  // Track last selection for reselect functionality (Mod+Shift+D)
  private lastSelection = signal<{
    bounds: Rect;
    shape: SelectionShape;
    mask?: Uint8Array;
  } | null>(null);

  // Track the layer we're operating on
  private activeLayerId: string | null = null;

  // Rotation performance optimization: rAF throttling
  private pendingRotation: number | null = null;
  private rotationRafId: number | null = null;
  private isRotationDragging = false;

  // ============================================
  // Convenience getters
  // ============================================

  get isActive(): boolean {
    return this.state.value.type !== 'none';
  }

  get isFloating(): boolean {
    return this.state.value.type === 'floating';
  }

  get isSelecting(): boolean {
    return this.state.value.type === 'selecting';
  }

  get isTransforming(): boolean {
    return this.state.value.type === 'transforming';
  }

  get bounds(): Rect | null {
    const s = this.state.value;
    if (s.type === 'none') return null;
    if (s.type === 'selecting') return s.currentBounds;
    if (s.type === 'selected') return s.bounds;
    if (s.type === 'floating') {
      return {
        x: s.originalBounds.x + s.currentOffset.x,
        y: s.originalBounds.y + s.currentOffset.y,
        width: s.originalBounds.width,
        height: s.originalBounds.height,
      };
    }
    if (s.type === 'transforming') {
      return s.currentBounds;
    }
    return null;
  }

  get rotation(): number {
    const s = this.state.value;
    if (s.type === 'transforming') return s.rotation;
    return 0;
  }

  // ============================================
  // Creating selections
  // ============================================

  startSelection(shape: SelectionShape, point: { x: number; y: number }) {
    this.state.value = {
      type: 'selecting',
      shape,
      startPoint: point,
      currentBounds: { x: point.x, y: point.y, width: 1, height: 1 },
    };
  }

  updateSelection(
    currentPoint: { x: number; y: number },
    modifiers?: { shift?: boolean }
  ) {
    const s = this.state.value;
    if (s.type !== 'selecting') return;

    let width = Math.abs(currentPoint.x - s.startPoint.x) + 1;
    let height = Math.abs(currentPoint.y - s.startPoint.y) + 1;
    const x = Math.min(s.startPoint.x, currentPoint.x);
    const y = Math.min(s.startPoint.y, currentPoint.y);

    // Shift = square aspect ratio
    if (modifiers?.shift) {
      const size = Math.max(width, height);
      width = size;
      height = size;
    }

    this.state.value = {
      ...s,
      currentBounds: { x, y, width, height },
    };
  }

  /**
   * Finalize the current selection.
   * @param canvas - Optional canvas for content-aware trimming
   * @param shrinkToContent - If true and canvas provided, trim bounds to exclude transparent pixels
   */
  finalizeSelection(canvas?: HTMLCanvasElement, shrinkToContent: boolean = false) {
    const s = this.state.value;
    if (s.type !== 'selecting') return;

    // Don't create selection if too small
    if (s.currentBounds.width < 2 && s.currentBounds.height < 2) {
      this.clear();
      return;
    }

    if (s.shape === 'freeform') {
      // Freeform needs finalizeFreeformSelection() with mask
      this.clear();
      return;
    }

    let finalBounds = s.currentBounds;

    // If shrinkToContent is true and canvas provided, trim bounds to content
    if (shrinkToContent && canvas) {
      const trimmed = trimBoundsToContent(canvas, s.currentBounds, s.shape);
      if (!trimmed) {
        // All transparent - no selection
        this.clear();
        return;
      }
      finalBounds = trimmed;
    }

    this.state.value = {
      type: 'selected',
      shape: s.shape as 'rectangle' | 'ellipse',
      bounds: finalBounds,
    };
  }

  /**
   * Finalize a freeform selection with a mask.
   * Called by lasso and magic wand tools.
   * @param bounds - The bounds of the selection
   * @param mask - The selection mask
   * @param canvas - Optional canvas for content-aware trimming
   * @param shrinkToContent - If true and canvas provided, trim bounds to exclude transparent pixels
   */
  finalizeFreeformSelection(
    bounds: Rect,
    mask: Uint8Array,
    canvas?: HTMLCanvasElement,
    shrinkToContent: boolean = false
  ) {
    // Validate mask size matches bounds
    if (mask.length !== bounds.width * bounds.height) {
      console.error('Mask size does not match bounds');
      this.clear();
      return;
    }

    let finalBounds = bounds;
    let finalMask = mask;

    // If shrinkToContent is true and canvas provided, trim bounds to content
    if (shrinkToContent && canvas) {
      const trimmed = trimFreeformToContent(canvas, bounds, mask);
      if (!trimmed) {
        // All transparent or empty - no selection
        this.clear();
        return;
      }
      finalBounds = trimmed.bounds;
      finalMask = trimmed.mask;
    }

    this.state.value = {
      type: 'selected',
      shape: 'freeform',
      bounds: finalBounds,
      mask: finalMask,
    };
  }

  /**
   * Shrink the current selection to fit its content.
   * Called by context bar button.
   */
  shrinkToContent(canvas: HTMLCanvasElement) {
    const s = this.state.value;
    if (s.type !== 'selected') return;

    if (s.shape === 'freeform') {
      const trimmed = trimFreeformToContent(canvas, s.bounds, s.mask);
      if (trimmed) {
        this.state.value = {
          type: 'selected',
          shape: 'freeform',
          bounds: trimmed.bounds,
          mask: trimmed.mask,
        };
      }
    } else {
      const trimmed = trimBoundsToContent(canvas, s.bounds, s.shape);
      if (trimmed) {
        this.state.value = {
          type: 'selected',
          shape: s.shape,
          bounds: trimmed,
        };
      }
    }
  }

  // ============================================
  // Floating operations
  // ============================================

  /**
   * Called by CutToFloatCommand.execute()
   * Transitions from 'selected' to 'floating' with the cut pixels
   */
  setFloating(
    imageData: ImageData,
    originalBounds: Rect,
    shape: SelectionShape,
    mask?: Uint8Array
  ) {
    this.state.value = {
      type: 'floating',
      imageData,
      originalBounds,
      currentOffset: { x: 0, y: 0 },
      shape,
      mask,
    };
  }

  /**
   * Called by CutToFloatCommand.undo()
   * Transitions from 'floating' back to 'selected'
   */
  setSelected(bounds: Rect, shape: SelectionShape, mask?: Uint8Array) {
    if (shape === 'freeform' && mask) {
      this.state.value = {
        type: 'selected',
        shape: 'freeform',
        bounds,
        mask,
      };
    } else {
      this.state.value = {
        type: 'selected',
        shape: shape as 'rectangle' | 'ellipse',
        bounds,
      };
    }
  }

  moveFloat(dx: number, dy: number) {
    const s = this.state.value;
    if (s.type !== 'floating') return;

    this.state.value = {
      ...s,
      currentOffset: {
        x: s.currentOffset.x + dx,
        y: s.currentOffset.y + dy,
      },
    };
  }

  /**
   * Called by CommitFloatCommand - just clears state
   * The command handles the actual pixel operations
   */
  clearAfterCommit() {
    this.state.value = { type: 'none' };
  }

  /**
   * Cancel floating selection (triggers undo externally)
   */
  cancelFloat() {
    // This is handled by historyStore.undo() externally
    // Just a placeholder for documentation
  }

  // ============================================
  // Transform operations (rotation)
  // ============================================

  /**
   * Enter transform mode from floating state.
   * Called when user starts dragging a rotation handle.
   */
  startTransform(
    imageData: ImageData,
    bounds: Rect,
    shape: SelectionShape,
    mask?: Uint8Array
  ) {
    this.state.value = {
      type: 'transforming',
      imageData,
      originalBounds: bounds,
      currentBounds: { ...bounds },
      currentOffset: { x: 0, y: 0 },
      rotation: 0,
      previewData: null,
      shape,
      mask,
    };
  }

  /**
   * Start rotation drag - enables draft quality and rAF throttling.
   * Called when user starts dragging a rotation handle.
   */
  startRotationDrag() {
    this.isRotationDragging = true;
  }

  /**
   * End rotation drag - regenerates preview at full quality.
   * Called when user releases the rotation handle.
   */
  endRotationDrag() {
    this.isRotationDragging = false;

    // Cancel any pending rAF
    if (this.rotationRafId !== null) {
      cancelAnimationFrame(this.rotationRafId);
      this.rotationRafId = null;
    }

    // If there's a pending rotation, apply it at full quality
    if (this.pendingRotation !== null) {
      this._applyRotation(this.pendingRotation, 'final');
      this.pendingRotation = null;
    } else {
      // Regenerate current rotation at full quality
      const s = this.state.value;
      if (s.type === 'transforming' && s.rotation !== 0) {
        this._applyRotation(s.rotation, 'final');
      }
    }
  }

  /**
   * Update rotation angle and regenerate preview.
   * Called during drag or when context bar slider changes.
   * Uses rAF throttling during drag to prevent frame drops.
   * Uses CleanEdge algorithm for high-quality pixel art rotation.
   */
  updateRotation(angleDegrees: number) {
    const s = this.state.value;
    if (s.type !== 'transforming') return;

    // If dragging, use rAF throttling to batch updates
    if (this.isRotationDragging) {
      this.pendingRotation = angleDegrees;

      if (this.rotationRafId === null) {
        this.rotationRafId = requestAnimationFrame(() => {
          this.rotationRafId = null;
          if (this.pendingRotation !== null) {
            this._applyRotation(this.pendingRotation, 'draft');
            this.pendingRotation = null;
          }
        });
      }
    } else {
      // Not dragging (e.g., slider or direct input) - apply immediately at full quality
      this._applyRotation(angleDegrees, 'final');
    }
  }

  /**
   * Internal method to apply rotation at specified quality.
   */
  private _applyRotation(
    angleDegrees: number,
    quality: 'draft' | 'final'
  ) {
    const s = this.state.value;
    if (s.type !== 'transforming') return;

    const normalizedAngle = normalizeAngle(angleDegrees);

    // Generate preview using CleanEdge
    let previewData: ImageData | null = null;
    let newBounds = s.originalBounds;

    if (normalizedAngle !== 0) {
      previewData = rotateCleanEdge(s.imageData, normalizedAngle, { quality });
      newBounds = calculateRotatedBounds(s.originalBounds, normalizedAngle);
      // Ensure bounds dimensions match preview
      newBounds.width = previewData.width;
      newBounds.height = previewData.height;
    } else {
      // No rotation - use original
      previewData = s.imageData;
      newBounds = { ...s.originalBounds };
    }

    this.state.value = {
      ...s,
      rotation: normalizedAngle,
      previewData,
      currentBounds: newBounds,
    };
  }

  /**
   * Move the selection while in transform mode.
   * Called when user drags the selection (not a rotation handle).
   */
  moveTransform(dx: number, dy: number) {
    const s = this.state.value;
    if (s.type !== 'transforming') return;

    this.state.value = {
      ...s,
      currentOffset: {
        x: s.currentOffset.x + dx,
        y: s.currentOffset.y + dy,
      },
    };
  }

  /**
   * Get the original (unrotated) image data for committing.
   */
  getTransformImageData(): ImageData | null {
    const s = this.state.value;
    if (s.type !== 'transforming') return null;
    return s.imageData;
  }

  /**
   * Get the preview image data for rendering.
   */
  getTransformPreview(): ImageData | null {
    const s = this.state.value;
    if (s.type !== 'transforming') return null;
    return s.previewData ?? s.imageData;
  }

  /**
   * Get transform state details for command creation.
   */
  getTransformState(): {
    imageData: ImageData;
    originalBounds: Rect;
    currentBounds: Rect;
    currentOffset: { x: number; y: number };
    rotation: number;
    shape: SelectionShape;
    mask?: Uint8Array;
  } | null {
    const s = this.state.value;
    if (s.type !== 'transforming') return null;
    return {
      imageData: s.imageData,
      originalBounds: s.originalBounds,
      currentBounds: s.currentBounds,
      currentOffset: s.currentOffset,
      rotation: s.rotation,
      shape: s.shape,
      mask: s.mask,
    };
  }

  /**
   * Cancel transform and restore to floating state.
   */
  cancelTransform() {
    const s = this.state.value;
    if (s.type !== 'transforming') return;

    // Restore to floating at original position
    this.state.value = {
      type: 'floating',
      imageData: s.imageData,
      originalBounds: s.originalBounds,
      currentOffset: { x: 0, y: 0 },
      shape: s.shape,
      mask: s.mask,
    };
  }

  /**
   * Clear state after transform commit.
   * The actual pixel operations are handled by the command.
   */
  clearAfterTransform() {
    this.state.value = { type: 'none' };
  }

  // ============================================
  // Utilities
  // ============================================

  clear() {
    // Save current selection before clearing for reselect functionality
    const currentState = this.state.value;
    if (currentState.type === 'selected') {
      this.lastSelection.value = {
        bounds: { ...currentState.bounds },
        shape: currentState.shape,
        mask: currentState.shape === 'freeform' ? (currentState as { mask: Uint8Array }).mask : undefined,
      };
    }
    this.state.value = { type: 'none' };
  }

  /**
   * Reselect the last cleared selection.
   * Used by Mod+Shift+D shortcut.
   */
  reselect() {
    const last = this.lastSelection.value;
    if (!last) return false;

    if (last.shape === 'freeform' && last.mask) {
      this.state.value = {
        type: 'selected',
        shape: 'freeform',
        bounds: { ...last.bounds },
        mask: last.mask,
      };
    } else {
      this.state.value = {
        type: 'selected',
        shape: last.shape as 'rectangle' | 'ellipse',
        bounds: { ...last.bounds },
      };
    }
    return true;
  }

  /**
   * Check if there is a last selection to restore.
   */
  get hasLastSelection(): boolean {
    return this.lastSelection.value !== null;
  }

  /**
   * Select all non-transparent pixels on a canvas.
   * Used by transform tool auto-select on tool switch.
   * Returns true if content was found and selected, false otherwise.
   */
  selectLayerContent(canvas: HTMLCanvasElement): boolean {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Find non-transparent bounds
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // No content found
    if (maxX < 0 || maxY < 0) {
      return false;
    }

    // Create selection from bounds
    this.state.value = {
      type: 'selected',
      shape: 'rectangle',
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      },
    };

    return true;
  }

  isPointInSelection(x: number, y: number): boolean {
    const s = this.state.value;

    if (s.type === 'selected') {
      const mask = s.shape === 'freeform' ? s.mask : undefined;
      return isPointInBounds(x, y, s.bounds, s.shape, mask);
    }

    if (s.type === 'floating') {
      const floatBounds = {
        x: s.originalBounds.x + s.currentOffset.x,
        y: s.originalBounds.y + s.currentOffset.y,
        width: s.originalBounds.width,
        height: s.originalBounds.height,
      };
      return isPointInBounds(x, y, floatBounds, s.shape, s.mask);
    }

    if (s.type === 'transforming') {
      return isPointInRotatedBounds(
        x,
        y,
        s.originalBounds,
        s.currentOffset,
        s.rotation
      );
    }

    return false;
  }

  setActiveLayerId(layerId: string) {
    this.activeLayerId = layerId;
  }

  getActiveLayerId(): string | null {
    return this.activeLayerId;
  }

  /**
   * Invert the current selection.
   * What was selected becomes deselected, and vice versa.
   */
  invertSelection(canvasWidth: number, canvasHeight: number) {
    const s = this.state.value;
    if (s.type !== 'selected') return;

    // Create a full-canvas mask with everything selected
    const fullMask = new Uint8Array(canvasWidth * canvasHeight);
    fullMask.fill(255);

    // Subtract the current selection
    const { bounds, shape } = s;
    const currentMask = shape === 'freeform' ? (s as { mask: Uint8Array }).mask : null;

    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        const idx = y * canvasWidth + x;

        // Check if point is in current selection
        let inSelection = false;

        if (x >= bounds.x && x < bounds.x + bounds.width &&
            y >= bounds.y && y < bounds.y + bounds.height) {
          if (shape === 'rectangle') {
            inSelection = true;
          } else if (shape === 'ellipse') {
            const cx = bounds.x + bounds.width / 2;
            const cy = bounds.y + bounds.height / 2;
            const rx = bounds.width / 2;
            const ry = bounds.height / 2;
            const dx = (x - cx) / rx;
            const dy = (y - cy) / ry;
            inSelection = dx * dx + dy * dy <= 1;
          } else if (shape === 'freeform' && currentMask) {
            const localX = x - bounds.x;
            const localY = y - bounds.y;
            const maskIdx = localY * bounds.width + localX;
            inSelection = currentMask[maskIdx] === 255;
          }
        }

        // Invert: if in selection, clear; if not, keep selected
        if (inSelection) {
          fullMask[idx] = 0;
        }
      }
    }

    // Find the bounds of the inverted selection
    let minX = canvasWidth, minY = canvasHeight;
    let maxX = -1, maxY = -1;

    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        if (fullMask[y * canvasWidth + x] === 255) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    // If nothing selected after inversion, clear
    if (maxX < 0) {
      this.clear();
      return;
    }

    // Create tight bounds and mask
    const newBounds = {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };

    const newMask = new Uint8Array(newBounds.width * newBounds.height);
    for (let y = 0; y < newBounds.height; y++) {
      for (let x = 0; x < newBounds.width; x++) {
        const srcIdx = (minY + y) * canvasWidth + (minX + x);
        const dstIdx = y * newBounds.width + x;
        newMask[dstIdx] = fullMask[srcIdx];
      }
    }

    // Set the inverted selection
    this.state.value = {
      type: 'selected',
      shape: 'freeform',
      bounds: newBounds,
      mask: newMask,
    };
  }

  /**
   * Set the selection mode for the next selection operation.
   */
  setMode(mode: SelectionMode) {
    this.mode.value = mode;
  }

  /**
   * Reset mode to 'replace' after selection is finalized.
   */
  resetMode() {
    this.mode.value = 'replace';
  }
}

export const selectionStore = new SelectionStore();
