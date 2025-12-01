import { signal } from '../core/signal';
import { type Selection } from '../types/selection';

class SelectionStore {
  selection = signal<Selection>({
    type: 'none',
    mask: null,
    bounds: null
  });

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
}

export const selectionStore = new SelectionStore();
