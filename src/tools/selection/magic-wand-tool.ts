import { BaseTool, type ModifierKeys } from '../base-tool';
import { selectionStore } from '../../stores/selection';
import { layerStore } from '../../stores/layers';
import { historyStore } from '../../stores/history';
import { magicWandSettings } from '../../stores/tool-settings';
import { floodFillSelect, type FloodFillOptions } from '../../utils/mask-utils';
import { CutToFloatCommand, CommitFloatCommand } from '../../commands/selection-commands';

// Re-export for backward compatibility
export { magicWandSettings };

export class MagicWandTool extends BaseTool {
  name = 'magic-wand';
  cursor = 'crosshair';

  private mode: 'idle' | 'dragging' = 'idle';
  private lastDragX = 0;
  private lastDragY = 0;

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
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
    // If we committed, don't immediately make a new selection
    if (this.commitIfTransforming() || this.commitIfFloating()) {
      return;
    }

    // Determine selection mode based on modifiers
    if (modifiers?.shift) {
      selectionStore.setMode('add');
    } else if (modifiers?.alt) {
      selectionStore.setMode('subtract');
    } else {
      selectionStore.setMode('replace');
    }

    // Shrink to content only if Ctrl is held
    const shrinkToContent = modifiers?.ctrl ?? false;
    this.selectRegion(x, y, shrinkToContent);
  }

  onDrag(x: number, y: number, _modifiers?: ModifierKeys) {
    if (this.mode === 'dragging') {
      const canvasX = Math.floor(x);
      const canvasY = Math.floor(y);
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

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys) {
    if (this.mode === 'dragging') {
      this.mode = 'idle';
    } else {
      selectionStore.resetMode();
    }
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

  private selectRegion(x: number, y: number, shrinkToContent: boolean = false) {
    const activeLayerId = layerStore.activeLayerId.value;
    const activeLayer = layerStore.layers.value.find((l) => l.id === activeLayerId);

    if (!activeLayer || !activeLayer.canvas) return;

    const ctx = activeLayer.canvas.getContext('2d');
    if (!ctx) return;

    const startX = Math.floor(x);
    const startY = Math.floor(y);
    const width = activeLayer.canvas.width;
    const height = activeLayer.canvas.height;

    // Bounds check
    if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
      return;
    }

    // Get image data from layer
    const imageData = ctx.getImageData(0, 0, width, height);

    // Get current settings
    const options: FloodFillOptions = {
      tolerance: magicWandSettings.tolerance.value,
      contiguous: magicWandSettings.contiguous.value,
      diagonal: magicWandSettings.diagonal.value,
    };

    // Perform flood fill selection
    const result = floodFillSelect(imageData, startX, startY, options);

    if (!result) {
      // No pixels selected (clicked outside bounds or no matching pixels)
      if (selectionStore.mode.value === 'replace') {
        selectionStore.clear();
      }
      return;
    }

    const { mask, bounds } = result;

    // Handle selection modes (add/subtract/replace)
    const currentState = selectionStore.state.value;
    const mode = selectionStore.mode.value;

    // Pass canvas for content-aware trimming
    const canvas = activeLayer.canvas;

    if (mode === 'replace' || currentState.type === 'none') {
      // Simple replace
      selectionStore.finalizeFreeformSelection(bounds, mask, canvas, shrinkToContent);
    } else if (mode === 'add' && currentState.type === 'selected') {
      // Add to existing selection
      const combined = this.combineMasks(currentState, bounds, mask, 'add');
      if (combined) {
        selectionStore.finalizeFreeformSelection(combined.bounds, combined.mask, canvas, shrinkToContent);
      }
    } else if (mode === 'subtract' && currentState.type === 'selected') {
      // Subtract from existing selection
      const combined = this.combineMasks(currentState, bounds, mask, 'subtract');
      if (combined) {
        selectionStore.finalizeFreeformSelection(combined.bounds, combined.mask, canvas, shrinkToContent);
      } else {
        selectionStore.clear();
      }
    }
  }

  /**
   * Combine two masks with add or subtract operation.
   */
  private combineMasks(
    currentState: { bounds: { x: number; y: number; width: number; height: number }; shape: string; mask?: Uint8Array },
    newBounds: { x: number; y: number; width: number; height: number },
    newMask: Uint8Array,
    operation: 'add' | 'subtract'
  ): { mask: Uint8Array; bounds: { x: number; y: number; width: number; height: number } } | null {
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
