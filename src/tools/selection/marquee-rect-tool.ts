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

  constructor(_context: CanvasRenderingContext2D) {
    super();
  }

  onDown(x: number, y: number, _modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    // Check if clicking inside existing selection
    if (selectionStore.isPointInSelection(canvasX, canvasY)) {
      this.startDragging(canvasX, canvasY);
    } else {
      // Clicking outside - commit any transform/floating selection first
      // If we committed, don't immediately start a new selection
      if (this.commitIfTransforming() || this.commitIfFloating()) {
        return;
      }
      this.startNewSelection(canvasX, canvasY);
    }
  }

  onDrag(x: number, y: number, modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    if (this.mode === 'selecting') {
      selectionStore.updateSelection({ x: canvasX, y: canvasY }, { shift: modifiers?.shift });
    } else if (this.mode === 'dragging') {
      const dx = canvasX - this.lastDragX;
      const dy = canvasY - this.lastDragY;
      selectionStore.moveFloat(dx, dy);
      this.lastDragX = canvasX;
      this.lastDragY = canvasY;
    }
  }

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys) {
    if (this.mode === 'selecting') {
      // Get active layer canvas for content-aware trimming
      const activeLayerId = layerStore.activeLayerId.value;
      const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
      selectionStore.finalizeSelection(layer?.canvas);
    }
    // If dragging, stay floating (wait for commit)

    this.mode = 'idle';
  }

  private startNewSelection(x: number, y: number) {
    this.mode = 'selecting';
    selectionStore.startSelection('rectangle', { x, y });
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
}
