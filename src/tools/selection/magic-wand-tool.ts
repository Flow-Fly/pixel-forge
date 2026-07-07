import type { ModifierKeys } from '../base-tool';
import { BaseSelectionTool } from './base-selection-tool';
import { selectionStore } from '../../stores/selection';
import { layerStore } from '../../stores/layers';
import { magicWandSettings } from '../../stores/tool-settings';
import { floodFillSelect, type FloodFillOptions } from '../../utils/mask-utils';

// Re-export for backward compatibility

export class MagicWandTool extends BaseSelectionTool {
  name = 'magic-wand';
  cursor = 'crosshair';

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

  protected beginSelection(canvasX: number, canvasY: number, modifiers?: ModifierKeys) {
    // Shrink to content only if Ctrl is held
    const shrinkToContent = modifiers?.ctrl ?? false;
    this.selectRegion(canvasX, canvasY, shrinkToContent);
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
    } else if (currentState.type === 'selected') {
      // Add, subtract, or intersect with existing selection
      const combined = this.combineMasks(currentState, bounds, mask, mode);
      if (combined) {
        selectionStore.finalizeFreeformSelection(combined.bounds, combined.mask, canvas, shrinkToContent);
      } else {
        selectionStore.clear();
      }
    }
  }
}
