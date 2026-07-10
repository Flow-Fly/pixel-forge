import type { ModifierKeys } from '../base-tool';
import { BaseSelectionTool } from './base-selection-tool';
import { isPaintableLayer } from '../../utils/layer-capabilities';

export class MarqueeRectTool extends BaseSelectionTool {
  name = 'marquee-rect';
  cursor = 'crosshair';


  protected beginSelection(canvasX: number, canvasY: number) {
    this.startNewSelection(canvasX, canvasY);
  }

  onDrag(x: number, y: number, modifiers?: ModifierKeys) {
    const selection = this.projectContext.selection;
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    if (this.mode === 'selecting') {
      selection.updateSelection({ x: canvasX, y: canvasY }, { shift: modifiers?.shift });
    } else if (this.mode === 'dragging') {
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
    const { layers, selection } = this.projectContext;
    const s = selection.state.value;
    if (s.type !== 'selecting') {
      selection.resetMode();
      this.previousSelection = null;
      return;
    }

    // Don't create selection if too small
    if (s.currentBounds.width < 2 && s.currentBounds.height < 2) {
      selection.clear();
      selection.resetMode();
      this.previousSelection = null;
      return;
    }

    // For add/subtract, combine with previous selection
    const mode = selection.mode.value;
    if (mode !== 'replace' && this.previousSelection) {
      // Create a mask for the new rectangle (all 255s within bounds)
      const newBounds = s.currentBounds;
      const newMask = new Uint8Array(newBounds.width * newBounds.height);
      newMask.fill(255);
      this.finalizeMaskSelection(newBounds, newMask, shrinkToContent);
      return;
    }

    // Standard finalization (replace mode or no previous selection);
    // pass the active layer canvas for content-aware trimming
    const activeLayerId = layers.activeLayerId.value;
    const layer = layers.layers.value.find((l) => l.id === activeLayerId);
    selection.finalizeSelection(
      isPaintableLayer(layer) ? layer.canvas : undefined,
      shrinkToContent
    );
    selection.resetMode();
    this.clearPreviousSelection();
  }
  private startNewSelection(x: number, y: number) {
    this.capturePreviousSelection();

    this.mode = 'selecting';
    this.projectContext.selection.startSelection('rectangle', { x, y });
  }

}
