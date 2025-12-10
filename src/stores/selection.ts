import { signal } from "../core/signal";
import { type SelectionState, type SelectionShape } from "../types/selection";
import { type Rect } from "../types/geometry";
import { isPointInMask } from "../utils/mask-utils";
import {
  rotateCleanEdge,
  calculateRotatedBounds,
  normalizeAngle,
} from "../utils/rotation-utils";

export type SelectionMode = "replace" | "add" | "subtract";

class SelectionStore {
  state = signal<SelectionState>({ type: "none" });
  mode = signal<SelectionMode>("replace");

  // Track the layer we're operating on
  private activeLayerId: string | null = null;

  // Convenience getters
  get isActive(): boolean {
    return this.state.value.type !== "none";
  }

  get isFloating(): boolean {
    return this.state.value.type === "floating";
  }

  get isSelecting(): boolean {
    return this.state.value.type === "selecting";
  }

  get isTransforming(): boolean {
    return this.state.value.type === "transforming";
  }

  get bounds(): Rect | null {
    const s = this.state.value;
    if (s.type === "none") return null;
    if (s.type === "selecting") return s.currentBounds;
    if (s.type === "selected") return s.bounds;
    if (s.type === "floating") {
      return {
        x: s.originalBounds.x + s.currentOffset.x,
        y: s.originalBounds.y + s.currentOffset.y,
        width: s.originalBounds.width,
        height: s.originalBounds.height,
      };
    }
    if (s.type === "transforming") {
      return s.currentBounds;
    }
    return null;
  }

  get rotation(): number {
    const s = this.state.value;
    if (s.type === "transforming") return s.rotation;
    return 0;
  }

  // ============================================
  // Creating selections
  // ============================================

  startSelection(shape: SelectionShape, point: { x: number; y: number }) {
    this.state.value = {
      type: "selecting",
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
    if (s.type !== "selecting") return;

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
   * If a canvas is provided, the bounds will be trimmed to exclude transparent pixels.
   */
  finalizeSelection(canvas?: HTMLCanvasElement) {
    const s = this.state.value;
    if (s.type !== "selecting") return;

    // Don't create selection if too small
    if (s.currentBounds.width < 2 && s.currentBounds.height < 2) {
      this.clear();
      return;
    }

    if (s.shape === "freeform") {
      // Freeform needs finalizeFreeformSelection() with mask
      this.clear();
      return;
    }

    let finalBounds = s.currentBounds;

    // If canvas provided, trim bounds to content
    if (canvas) {
      const trimmed = this.trimBoundsToContent(
        canvas,
        s.currentBounds,
        s.shape
      );
      if (!trimmed) {
        // All transparent - no selection
        this.clear();
        return;
      }
      finalBounds = trimmed;
    }

    this.state.value = {
      type: "selected",
      shape: s.shape as "rectangle" | "ellipse",
      bounds: finalBounds,
    };
  }

  /**
   * Trim selection bounds to exclude transparent pixels.
   * Returns null if all pixels are transparent.
   */
  private trimBoundsToContent(
    canvas: HTMLCanvasElement,
    bounds: Rect,
    shape: SelectionShape
  ): Rect | null {
    const ctx = canvas.getContext("2d");
    if (!ctx) return bounds;

    const imageData = ctx.getImageData(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height
    );
    const { width, height, data } = imageData;

    // For ellipse, we need to consider only pixels inside the ellipse
    const isInSelection = (px: number, py: number): boolean => {
      if (shape === "ellipse") {
        const dx = (px + 0.5 - width / 2) / (width / 2);
        const dy = (py + 0.5 - height / 2) / (height / 2);
        return dx * dx + dy * dy <= 1;
      }
      return true; // Rectangle includes all pixels
    };

    // Find content bounds
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isInSelection(x, y)) continue;

        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // All transparent
    if (maxX < 0 || maxY < 0) {
      return null;
    }

    // No trimming needed
    if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) {
      return bounds;
    }

    // Return trimmed bounds
    return {
      x: bounds.x + minX,
      y: bounds.y + minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  /**
   * Finalize a freeform selection with a mask.
   * Called by lasso and magic wand tools.
   * If a canvas is provided, the bounds will be trimmed to exclude transparent pixels.
   */
  finalizeFreeformSelection(
    bounds: Rect,
    mask: Uint8Array,
    canvas?: HTMLCanvasElement
  ) {
    // Validate mask size matches bounds
    if (mask.length !== bounds.width * bounds.height) {
      console.error("Mask size does not match bounds");
      this.clear();
      return;
    }

    let finalBounds = bounds;
    let finalMask = mask;

    // If canvas provided, trim bounds to content
    if (canvas) {
      const trimmed = this.trimFreeformToContent(canvas, bounds, mask);
      if (!trimmed) {
        // All transparent or empty - no selection
        this.clear();
        return;
      }
      finalBounds = trimmed.bounds;
      finalMask = trimmed.mask;
    }

    this.state.value = {
      type: "selected",
      shape: "freeform",
      bounds: finalBounds,
      mask: finalMask,
    };
  }

  /**
   * Trim freeform selection to exclude transparent pixels.
   * Returns null if all selected pixels are transparent.
   */
  private trimFreeformToContent(
    canvas: HTMLCanvasElement,
    bounds: Rect,
    mask: Uint8Array
  ): { bounds: Rect; mask: Uint8Array } | null {
    const ctx = canvas.getContext("2d");
    if (!ctx) return { bounds, mask };

    const imageData = ctx.getImageData(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height
    );
    const { width, height, data } = imageData;

    // Find content bounds (pixels that are both in mask AND non-transparent)
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (mask[idx] !== 255) continue; // Not in selection

        const alpha = data[idx * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // All transparent
    if (maxX < 0 || maxY < 0) {
      return null;
    }

    // No trimming needed
    if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) {
      return { bounds, mask };
    }

    // Create trimmed mask
    const newWidth = maxX - minX + 1;
    const newHeight = maxY - minY + 1;
    const newMask = new Uint8Array(newWidth * newHeight);

    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcIdx = (minY + y) * width + (minX + x);
        const dstIdx = y * newWidth + x;
        newMask[dstIdx] = mask[srcIdx];
      }
    }

    return {
      bounds: {
        x: bounds.x + minX,
        y: bounds.y + minY,
        width: newWidth,
        height: newHeight,
      },
      mask: newMask,
    };
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
      type: "floating",
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
    if (shape === "freeform" && mask) {
      this.state.value = {
        type: "selected",
        shape: "freeform",
        bounds,
        mask,
      };
    } else {
      this.state.value = {
        type: "selected",
        shape: shape as "rectangle" | "ellipse",
        bounds,
      };
    }
  }

  moveFloat(dx: number, dy: number) {
    const s = this.state.value;
    if (s.type !== "floating") return;

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
    this.state.value = { type: "none" };
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
      type: "transforming",
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
   * Update rotation angle and regenerate preview.
   * Called during drag or when context bar slider changes.
   * Uses CleanEdge algorithm for high-quality pixel art rotation.
   */
  updateRotation(angleDegrees: number) {
    const s = this.state.value;
    if (s.type !== "transforming") return;

    const normalizedAngle = normalizeAngle(angleDegrees);

    // Generate preview using CleanEdge (high quality)
    let previewData: ImageData | null = null;
    let newBounds = s.originalBounds;

    if (normalizedAngle !== 0) {
      previewData = rotateCleanEdge(s.imageData, normalizedAngle);
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
    if (s.type !== "transforming") return;

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
    if (s.type !== "transforming") return null;
    return s.imageData;
  }

  /**
   * Get the preview image data for rendering.
   */
  getTransformPreview(): ImageData | null {
    const s = this.state.value;
    if (s.type !== "transforming") return null;
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
    if (s.type !== "transforming") return null;
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
    if (s.type !== "transforming") return;

    // Restore to floating at original position
    this.state.value = {
      type: "floating",
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
    this.state.value = { type: "none" };
  }

  // ============================================
  // Utilities
  // ============================================

  clear() {
    this.state.value = { type: "none" };
  }

  isPointInSelection(x: number, y: number): boolean {
    const s = this.state.value;

    if (s.type === "selected") {
      const mask = s.shape === "freeform" ? s.mask : undefined;
      return this.isPointInBounds(x, y, s.bounds, s.shape, mask);
    }

    if (s.type === "floating") {
      const floatBounds = {
        x: s.originalBounds.x + s.currentOffset.x,
        y: s.originalBounds.y + s.currentOffset.y,
        width: s.originalBounds.width,
        height: s.originalBounds.height,
      };
      return this.isPointInBounds(x, y, floatBounds, s.shape, s.mask);
    }

    if (s.type === "transforming") {
      // For transforming, check against the current (rotated) bounds
      // Use simple rectangle check since rotated shapes become complex
      const { currentBounds } = s;
      return (
        x >= currentBounds.x &&
        x < currentBounds.x + currentBounds.width &&
        y >= currentBounds.y &&
        y < currentBounds.y + currentBounds.height
      );
    }

    return false;
  }

  private isPointInBounds(
    x: number,
    y: number,
    bounds: Rect,
    shape: SelectionShape,
    mask?: Uint8Array
  ): boolean {
    const { x: bx, y: by, width: bw, height: bh } = bounds;

    if (x < bx || x >= bx + bw || y < by || y >= by + bh) {
      return false;
    }

    if (shape === "rectangle") {
      return true;
    }

    if (shape === "ellipse") {
      // Point in ellipse test
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      const rx = bw / 2;
      const ry = bh / 2;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      return dx * dx + dy * dy <= 1;
    }

    if (shape === "freeform" && mask) {
      return isPointInMask(x, y, mask, bounds);
    }

    // Fallback: treat as rectangle
    return true;
  }

  setActiveLayerId(layerId: string) {
    this.activeLayerId = layerId;
  }

  getActiveLayerId(): string | null {
    return this.activeLayerId;
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
    this.mode.value = "replace";
  }
}

export const selectionStore = new SelectionStore();
