import { BaseTool, type ModifierKeys } from '../base-tool';
import { selectionStore } from '../../stores/selection';
import { layerStore } from '../../stores/layers';
import { historyStore } from '../../stores/history';
import type { Rect } from '../../types/geometry';
import type { SelectionShape } from '../../types/selection';
import {
  combineMasks,
  type MaskCombineOperation,
  type MaskSelectionState,
} from '../../utils/mask-utils';
import { CutToFloatCommand, CommitFloatCommand } from '../../commands/selection-commands';

/**
 * Shared behavior for selection tools (marquee, lasso, polygonal lasso,
 * magic wand): dragging an existing selection, cut-to-float, committing
 * floating/transforming selections, and mask combination.
 */
export abstract class BaseSelectionTool extends BaseTool {
  protected mode: 'idle' | 'selecting' | 'dragging' = 'idle';
  protected lastDragX = 0;
  protected lastDragY = 0;

  // Previous selection saved for add/subtract/intersect operations
  protected previousSelection: {
    bounds: Rect;
    shape: SelectionShape;
    mask?: Uint8Array;
  } | null = null;

  /**
   * Map modifier keys to the selection combine mode.
   * Shift+Alt = intersect, Shift = add, Alt = subtract.
   */
  protected applySelectionModeFromModifiers(modifiers?: ModifierKeys) {
    if (modifiers?.shift && modifiers?.alt) {
      selectionStore.setMode('intersect');
    } else if (modifiers?.shift) {
      selectionStore.setMode('add');
    } else if (modifiers?.alt) {
      selectionStore.setMode('subtract');
    } else {
      selectionStore.setMode('replace');
    }
  }

  /**
   * Save the current selection for later combination and expose it to the
   * marching-ants overlay while the new selection is drawn.
   */
  protected capturePreviousSelection() {
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
      this.clearPreviousSelection();
    }
  }

  /** Forget the saved selection and hide its overlay visual. */
  protected clearPreviousSelection() {
    this.previousSelection = null;
    selectionStore.previousSelectionForVisual.value = null;
  }

  protected startDragging(x: number, y: number) {
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

  protected cutToFloat() {
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

  protected commitIfTransforming(): boolean {
    const state = selectionStore.state.value;
    if (state.type !== 'transforming') return false;

    // Dispatch event to trigger commit in viewport
    window.dispatchEvent(new CustomEvent('commit-transform'));
    return true;
  }

  protected commitIfFloating(): boolean {
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

  /**
   * Combine two masks with add, subtract, or intersect operation.
   */
  protected combineMasks(
    currentState: MaskSelectionState,
    newBounds: Rect,
    newMask: Uint8Array,
    operation: MaskCombineOperation
  ): { mask: Uint8Array; bounds: Rect } | null {
    return combineMasks(currentState, newBounds, newMask, operation);
  }
}
