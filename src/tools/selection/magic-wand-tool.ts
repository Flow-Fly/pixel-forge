import type { ModifierKeys } from '../base-tool';
import { BaseSelectionTool } from './base-selection-tool';
import { magicWandSettings } from '../../stores/tool-settings';
import {
  floodFillSelect,
  type FloodFillOptions,
} from '../../utils/mask-utils';
import { isPaintableLayer } from '../../utils/layer-capabilities';

// Re-export for backward compatibility

type FloodSelectionResult = NonNullable<ReturnType<typeof floodFillSelect>>;

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
    const selection = this.projectContext.selection;
    if (this.mode === 'dragging') {
      const canvasX = Math.floor(x);
      const canvasY = Math.floor(y);
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
    }
  }

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys) {
    if (this.mode === 'dragging') {
      this.mode = 'idle';
    } else {
      this.projectContext.selection.resetMode();
    }
  }

  private selectRegion(x: number, y: number, shrinkToContent: boolean = false) {
    const sample = this.readSelectionSample(x, y);
    if (!sample) return;

    const result = floodFillSelect(sample.imageData, sample.x, sample.y, this.options());

    if (!result) {
      this.clearEmptyReplaceSelection();
      return;
    }

    this.applySelectionResult(result, sample.canvas, shrinkToContent);
  }

  private readSelectionSample(x: number, y: number): {
    imageData: ImageData;
    canvas: HTMLCanvasElement;
    x: number;
    y: number;
  } | null {
    const activeLayerId = this.projectContext.layers.activeLayerId.value;
    const activeLayer = this.projectContext.layers.layers.value.find((l) => l.id === activeLayerId);

    if (!isPaintableLayer(activeLayer)) return null;

    const ctx = activeLayer.canvas.getContext('2d');
    if (!ctx) return null;

    const startX = Math.floor(x);
    const startY = Math.floor(y);
    const width = activeLayer.canvas.width;
    const height = activeLayer.canvas.height;

    // Bounds check
    if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
      return null;
    }

    return {
      imageData: ctx.getImageData(0, 0, width, height),
      canvas: activeLayer.canvas,
      x: startX,
      y: startY,
    };
  }

  private options(): FloodFillOptions {
    return {
      tolerance: magicWandSettings.tolerance.value,
      contiguous: magicWandSettings.contiguous.value,
      diagonal: magicWandSettings.diagonal.value,
    };
  }

  private clearEmptyReplaceSelection() {
    const selection = this.projectContext.selection;
    if (selection.mode.value === 'replace') {
      selection.clear();
    }
  }

  private applySelectionResult(
    result: FloodSelectionResult,
    canvas: HTMLCanvasElement,
    shrinkToContent: boolean
  ) {
    const selection = this.projectContext.selection;
    const { mask, bounds } = result;

    // Handle selection modes (add/subtract/replace)
    const currentState = selection.state.value;
    const mode = selection.mode.value;

    if (mode === 'replace' || currentState.type === 'none') {
      // Simple replace
      selection.finalizeFreeformSelection(bounds, mask, canvas, shrinkToContent);
    } else if (currentState.type === 'selected') {
      // Add, subtract, or intersect with existing selection
      const combined = this.combineMasks(currentState, bounds, mask, mode);
      if (combined) {
        selection.finalizeFreeformSelection(combined.bounds, combined.mask, canvas, shrinkToContent);
      } else {
        selection.clear();
      }
    }
  }
}
