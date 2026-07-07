import type { ModifierKeys } from '../base-tool';
import { BaseSelectionTool } from './base-selection-tool';
import { selectionStore } from '../../stores/selection';
import { layerStore } from '../../stores/layers';

export class MarqueeRectTool extends BaseSelectionTool {
  name = 'marquee-rect';
  cursor = 'crosshair';


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

    this.applySelectionModeFromModifiers(modifiers);

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
    this.clearPreviousSelection();
  }
  private startNewSelection(x: number, y: number) {
    this.capturePreviousSelection();

    this.mode = 'selecting';
    selectionStore.startSelection('rectangle', { x, y });
  }

}
