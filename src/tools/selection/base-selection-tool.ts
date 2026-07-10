import { BaseTool, type ModifierKeys } from '../base-tool';
import { getSelectedLayerSelection } from '../../stores/selection/selected-layer';
import type { Rect } from '../../types/geometry';
import type { SelectionShape } from '../../types/selection';
import {
  combineMasks,
  type MaskCombineOperation,
  type MaskSelectionState,
} from '../../utils/mask-utils';
import { CutToFloatCommand, CommitFloatCommand } from '../../commands/selection-commands';
import { isPaintableLayer } from '../../utils/layer-capabilities';

/**
 * Shared behavior for selection tools (marquee, lasso, polygonal lasso,
 * magic wand): dragging an existing selection, cut-to-float, committing
 * floating/transforming selections, and mask combination.
 */
export abstract class BaseSelectionTool extends BaseTool {
  protected mode: 'idle' | 'selecting' | 'dragging' = 'idle';

  // Selection tools do not draw on the layer context directly; the
  // context argument exists to satisfy the shared tool-factory shape.
  constructor(_context?: CanvasRenderingContext2D) {
    super();
  }
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
    const selection = this.projectContext.selection;
    if (modifiers?.shift && modifiers?.alt) {
      selection.setMode('intersect');
    } else if (modifiers?.shift) {
      selection.setMode('add');
    } else if (modifiers?.alt) {
      selection.setMode('subtract');
    } else {
      selection.setMode('replace');
    }
  }

  /**
   * Save the current selection for later combination and expose it to the
   * marching-ants overlay while the new selection is drawn.
   */
  protected capturePreviousSelection() {
    const selection = this.projectContext.selection;
    const currentState = selection.state.value;
    const mode = selection.mode.value;
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
        selection.previousSelectionForVisual.value = this.previousSelection;
      }
    } else {
      this.clearPreviousSelection();
    }
  }

  /** Forget the saved selection and hide its overlay visual. */
  protected clearPreviousSelection() {
    this.previousSelection = null;
    this.projectContext.selection.previousSelectionForVisual.value = null;
  }

  /**
   * Shared pointer-down flow: drag the existing selection when clicking
   * inside it, commit any floating/transforming selection, set the
   * combine mode, then hand off to the tool's beginSelection. Tools with
   * a multi-click flow (polygonal lasso) override onDown instead.
   */
  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    const canvasX = Math.floor(x);
    const canvasY = Math.floor(y);

    if (this.handleSelectionPointerDown(canvasX, canvasY, modifiers)) {
      return;
    }

    this.beginSelection(canvasX, canvasY, modifiers);
  }

  /** Start the tool-specific selection gesture at the given canvas point. */
  protected beginSelection(_x: number, _y: number, _modifiers?: ModifierKeys): void {}

  /**
   * Shared onDown prologue: drag the existing selection when clicking
   * inside it (without add/subtract modifiers), otherwise commit any
   * floating/transforming selection and set the combine mode. Returns
   * true when the event was consumed and no new selection should start.
   */
  protected handleSelectionPointerDown(
    canvasX: number,
    canvasY: number,
    modifiers?: ModifierKeys
  ): boolean {
    const selection = this.projectContext.selection;
    const isAddOrSubtract = modifiers?.shift || modifiers?.alt;
    if (!isAddOrSubtract && selection.isPointInSelection(canvasX, canvasY)) {
      this.startDragging(canvasX, canvasY);
      return true;
    }

    // Clicking outside - commit any transform/floating selection first
    // If we committed, don't immediately start a new selection
    if (this.commitIfTransforming() || this.commitIfFloating()) {
      return true;
    }

    this.applySelectionModeFromModifiers(modifiers);
    return false;
  }

  /**
   * Finalize a freeform mask selection, combining it with the saved
   * previous selection in add/subtract/intersect mode, then reset the
   * combine mode and the saved selection.
   */
  protected finalizeMaskSelection(bounds: Rect, mask: Uint8Array, shrinkToContent: boolean) {
    const { layers, selection } = this.projectContext;
    // Get active layer canvas for content-aware trimming
    const activeLayerId = layers.activeLayerId.value;
    const layer = layers.layers.value.find((l) => l.id === activeLayerId);
    const canvas = isPaintableLayer(layer) ? layer.canvas : undefined;

    const mode = selection.mode.value;

    // For add/subtract, combine with the saved previous selection
    if (mode !== 'replace' && this.previousSelection) {
      const combined = this.combineMasks(this.previousSelection, bounds, mask, mode);
      if (combined) {
        selection.finalizeFreeformSelection(combined.bounds, combined.mask, canvas, shrinkToContent);
      } else {
        selection.clear();
      }
    } else {
      selection.finalizeFreeformSelection(bounds, mask, canvas, shrinkToContent);
    }

    selection.resetMode();
    this.clearPreviousSelection();
  }

  protected startDragging(x: number, y: number) {
    const state = this.projectContext.selection.state.value;

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
    const selected = getSelectedLayerSelection(this.projectContext);
    if (!selected) return;

    const command = new CutToFloatCommand(
      selected.canvas,
      selected.layer.id,
      selected.bounds,
      selected.shape,
      selected.mask,
      this.projectContext
    );

    this.projectContext.history.execute(command);
  }

  protected commitIfTransforming(): boolean {
    const state = this.projectContext.selection.state.value;
    if (state.type !== 'transforming') return false;

    // Dispatch event to trigger commit in viewport
    window.dispatchEvent(new CustomEvent('commit-transform'));
    return true;
  }

  protected commitIfFloating(): boolean {
    const { history, layers, selection } = this.projectContext;
    const state = selection.state.value;
    if (state.type !== 'floating') return false;

    const activeLayerId = layers.activeLayerId.value;
    const layer = layers.layers.value.find((l) => l.id === activeLayerId);
    if (!isPaintableLayer(layer)) return false;

    const command = new CommitFloatCommand(
      layer.canvas,
      layer.id,
      state.imageData,
      state.originalBounds,
      state.currentOffset,
      state.shape,
      state.mask,
      this.projectContext
    );

    history.execute(command);
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
