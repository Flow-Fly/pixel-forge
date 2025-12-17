import { BaseTool, type ModifierKeys } from '../base-tool';
import { selectionStore } from '../../stores/selection';
import { historyStore } from '../../stores/history';
import { layerStore } from '../../stores/layers';
import { CutToFloatCommand, CommitFloatCommand } from '../../commands/selection-commands';

export class MarqueeRectTool extends BaseTool {
  name = 'marquee-rect';
  cursor = 'crosshair';

  private mode: 'idle' | 'selecting' | 'dragging' = 'idle';
  private lastDragX = 0;
  private lastDragY = 0;

  // Store previous selection for add/subtract operations
  private previousSelection: {
    bounds: { x: number; y: number; width: number; height: number };
    shape: string;
    mask?: Uint8Array;
  } | null = null;

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

    this.startNewSelection(canvasX, canvasY);
  }

  onDrag(x: number, y: number, modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    if (this.mode === 'selecting') {
      selectionStore.updateSelection({ x: canvasX, y: canvasY }, { shift: modifiers?.shift });
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
    // If dragging, stay floating (wait for commit)

    this.mode = 'idle';
  }

  private finalizeSelection(shrinkToContent: boolean) {
    const s = selectionStore.state.value;
    if (s.type !== 'selecting') {
      selectionStore.resetMode();
      this.previousSelection = null;
      return;
    }

    // Don't create selection if too small
    if (s.currentBounds.width < 2 && s.currentBounds.height < 2) {
      selectionStore.clear();
      selectionStore.resetMode();
      this.previousSelection = null;
      return;
    }

    // Get active layer canvas for content-aware trimming
    const activeLayerId = layerStore.activeLayerId.value;
    const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
    const canvas = layer?.canvas;

    // Check selection mode
    const mode = selectionStore.mode.value;

    // For add/subtract, combine with previous selection
    if (mode !== 'replace' && this.previousSelection) {
      // Create a mask for the new rectangle (all 255s within bounds)
      const newBounds = s.currentBounds;
      const newMask = new Uint8Array(newBounds.width * newBounds.height);
      newMask.fill(255);

      // Combine with previous selection
      const combined = this.combineMasks(
        this.previousSelection,
        newBounds,
        newMask,
        mode
      );

      if (combined) {
        selectionStore.finalizeFreeformSelection(
          combined.bounds,
          combined.mask,
          canvas,
          shrinkToContent
        );
      } else {
        selectionStore.clear();
      }
    } else {
      // Standard finalization (replace mode or no previous selection)
      selectionStore.finalizeSelection(canvas, shrinkToContent);
    }

    selectionStore.resetMode();
    selectionStore.previousSelectionForVisual.value = null;
    this.previousSelection = null;
  }

  /**
   * Combine two masks with add, subtract, or intersect operation.
   */
  private combineMasks(
    previousState: { bounds: { x: number; y: number; width: number; height: number }; shape: string; mask?: Uint8Array },
    newBounds: { x: number; y: number; width: number; height: number },
    newMask: Uint8Array,
    operation: 'add' | 'subtract' | 'replace' | 'intersect'
  ): { mask: Uint8Array; bounds: { x: number; y: number; width: number; height: number } } | null {
    if (operation === 'replace') {
      return { mask: newMask, bounds: newBounds };
    }

    const oldBounds = previousState.bounds;

    // Calculate combined bounds based on operation
    let minX: number, minY: number, maxX: number, maxY: number;

    if (operation === 'add') {
      // Union of bounds
      minX = Math.min(oldBounds.x, newBounds.x);
      minY = Math.min(oldBounds.y, newBounds.y);
      maxX = Math.max(oldBounds.x + oldBounds.width, newBounds.x + newBounds.width);
      maxY = Math.max(oldBounds.y + oldBounds.height, newBounds.y + newBounds.height);
    } else if (operation === 'intersect') {
      // Intersection of bounds
      minX = Math.max(oldBounds.x, newBounds.x);
      minY = Math.max(oldBounds.y, newBounds.y);
      maxX = Math.min(oldBounds.x + oldBounds.width, newBounds.x + newBounds.width);
      maxY = Math.min(oldBounds.y + oldBounds.height, newBounds.y + newBounds.height);

      // If no overlap, return null
      if (minX >= maxX || minY >= maxY) {
        return null;
      }
    } else {
      // Subtract - use old bounds
      minX = oldBounds.x;
      minY = oldBounds.y;
      maxX = oldBounds.x + oldBounds.width;
      maxY = oldBounds.y + oldBounds.height;
    }

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
          previousState.shape === 'freeform' ? previousState.mask : undefined,
          oldBounds,
          x,
          y,
          previousState.shape
        );
        // newMask is always a rectangle mask
        const newValue = getMaskValue(newMask, newBounds, x, y, 'rectangle');

        let finalValue: boolean;
        if (operation === 'add') {
          finalValue = oldValue || newValue;
        } else if (operation === 'intersect') {
          finalValue = oldValue && newValue;
        } else {
          // subtract
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

  private startNewSelection(x: number, y: number) {
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

    this.mode = 'selecting';
    selectionStore.startSelection('rectangle', { x, y });
  }

  private startDragging(x: number, y: number) {
    const state = selectionStore.state.value;

    // If selected (not floating or transforming), cut to float first
    if (state.type === 'selected') {
      this.cutToFloat();
    }
    // For floating and transforming states, just start dragging

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
}
