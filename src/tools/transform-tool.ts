import { BaseTool } from './base-tool';
import { selectionStore } from '../stores/selection';
import { historyStore } from '../stores/history';
import { layerStore } from '../stores/layers';
import { TransformSelectionCommand } from '../commands/selection-commands';

export class TransformTool extends BaseTool {
  name = 'transform';
  cursor = 'move';

  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private mode: 'move' | 'scale' | 'rotate' = 'move';

  onDown(x: number, y: number) {
    const state = selectionStore.state.value;
    if (state.type === 'none') return;

    // If we're in transforming state and click outside the selection, commit
    if (state.type === 'transforming') {
      if (!selectionStore.isPointInSelection(Math.floor(x), Math.floor(y))) {
        this.commitTransform();
        return;
      }
    }

    this.isDragging = true;
    this.startX = x;
    this.startY = y;

    // Determine mode based on where user clicked
    this.mode = 'move';
  }

  onDrag(x: number, y: number) {
    if (!this.isDragging) return;

    const dx = x - this.startX;
    const dy = y - this.startY;

    if (this.mode === 'move') {
      const state = selectionStore.state.value;
      if (state.type === 'floating') {
        // Move floating selection
        selectionStore.moveFloat(dx, dy);
      }
      // For 'selected' state, would need to cut to float first
    }

    this.startX = x;
    this.startY = y;
  }

  onUp(_x: number, _y: number) {
    this.isDragging = false;
  }

  onKeyDown(e: KeyboardEvent) {
    const state = selectionStore.state.value;

    if (state.type === 'transforming') {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitTransform();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        selectionStore.cancelTransform();
      }
    }
  }

  private commitTransform() {
    const transformState = selectionStore.getTransformState();
    if (!transformState) return;

    const { imageData, originalBounds, currentBounds, rotation, shape, mask } = transformState;

    // If rotation is 0, just cancel (no change)
    if (rotation === 0) {
      selectionStore.cancelTransform();
      return;
    }

    // Use already-computed preview data (same CleanEdge algorithm)
    const rotatedImageData = selectionStore.getTransformPreview();
    if (!rotatedImageData) {
      selectionStore.cancelTransform();
      return;
    }

    // Get the active layer's canvas
    const activeLayerId = layerStore.activeLayerId.value;
    const activeLayer = layerStore.layers.value.find(l => l.id === activeLayerId);
    if (!activeLayer?.canvas) {
      console.error('Active layer canvas not found');
      selectionStore.cancelTransform();
      return;
    }

    const canvas = activeLayer.canvas;

    // Create and execute the transform command
    const command = new TransformSelectionCommand(
      canvas,
      imageData,
      originalBounds,
      rotatedImageData,
      currentBounds,
      rotation,
      shape,
      mask
    );

    historyStore.execute(command);
  }
}
