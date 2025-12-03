import { signal } from '../core/signal';
import { type Selection } from '../types/selection';

export type SelectionMode = 'replace' | 'add' | 'subtract';

class SelectionStore {
  selection = signal<Selection>({
    type: 'none',
    mask: null,
    bounds: null
  });

  /**
   * Current selection mode: 'replace', 'add', or 'subtract'.
   * Controlled by Shift (add) and Alt (subtract) modifiers.
   */
  mode = signal<SelectionMode>('replace');

  clearSelection() {
    this.selection.value = {
      type: 'none',
      mask: null,
      bounds: null
    };
  }

  setSelection(selection: Selection) {
    this.selection.value = selection;
  }

  /**
   * Set the selection mode for the next selection operation.
   */
  setMode(mode: SelectionMode) {
    this.mode.value = mode;
  }

  /**
   * Reset mode to 'replace' after selection is finalized.
   */
  resetMode() {
    this.mode.value = 'replace';
  }
}

export const selectionStore = new SelectionStore();
