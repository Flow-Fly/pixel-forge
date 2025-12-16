/**
 * Keyboard event handlers for the canvas viewport.
 *
 * Handles spacebar pan mode, zoom keys, grid toggles, and transform shortcuts.
 */

import { viewportStore } from '../../../stores/viewport';
import { gridStore } from '../../../stores/grid';
import { selectionStore } from '../../../stores/selection';

export interface KeyboardState {
  isCtrlActuallyPressed: boolean;
  isMetaActuallyPressed: boolean;
}

export interface KeyboardHandlerCallbacks {
  requestUpdate: () => void;
  getClientWidth: () => number;
  getClientHeight: () => number;
  commitTransform: () => void;
  setDragging: (value: boolean) => void;
  getDragging: () => boolean;
}

/**
 * Create keyboard state tracker.
 */
export function createKeyboardState(): KeyboardState {
  return {
    isCtrlActuallyPressed: false,
    isMetaActuallyPressed: false,
  };
}

/**
 * Handle keydown events.
 */
export function handleKeyDown(
  e: KeyboardEvent,
  state: KeyboardState,
  callbacks: KeyboardHandlerCallbacks
): void {
  // Track actual modifier key presses (to distinguish from macOS pinch injection)
  if (e.key === 'Control') state.isCtrlActuallyPressed = true;
  if (e.key === 'Meta') state.isMetaActuallyPressed = true;

  // Skip if typing in an input
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  // Spacebar for pan mode
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    viewportStore.isSpacebarDown.value = true;
    callbacks.requestUpdate();
    return;
  }

  // Zoom keys 1-6
  if (e.key >= '1' && e.key <= '6') {
    viewportStore.zoomToLevel(parseInt(e.key) as 1 | 2 | 3 | 4 | 5 | 6);
    callbacks.requestUpdate();
    return;
  }

  // +/- for zoom in/out
  if (e.key === '+' || e.key === '=') {
    viewportStore.zoomIn();
    callbacks.requestUpdate();
  } else if (e.key === '-') {
    viewportStore.zoomOut();
    callbacks.requestUpdate();
  } else if (e.key === '0') {
    viewportStore.zoomToFit(callbacks.getClientWidth(), callbacks.getClientHeight());
    callbacks.requestUpdate();
  } else if (e.key === 'Home') {
    viewportStore.resetView();
    callbacks.requestUpdate();
  }

  // Ctrl+G for pixel grid toggle
  if (e.key === 'g' && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    gridStore.togglePixelGrid();
    return;
  }

  // Ctrl+Shift+G for tile grid toggle
  if (e.key === 'G' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    gridStore.toggleTileGrid();
    return;
  }

  // Note: Shift+G for guide visibility is handled by keyboardService

  // Handle transform state Enter/Escape
  const selectionState = selectionStore.state.value;
  if (selectionState.type === 'transforming') {
    if (e.key === 'Enter') {
      e.preventDefault();
      callbacks.commitTransform();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      selectionStore.cancelTransform();
    }
  }
}

/**
 * Handle keyup events.
 */
export function handleKeyUp(
  e: KeyboardEvent,
  state: KeyboardState,
  callbacks: KeyboardHandlerCallbacks
): void {
  // Track actual modifier key releases
  if (e.key === 'Control') state.isCtrlActuallyPressed = false;
  if (e.key === 'Meta') state.isMetaActuallyPressed = false;

  if (e.code === 'Space') {
    viewportStore.isSpacebarDown.value = false;

    // If we were panning with spacebar, clamp to bounds
    if (viewportStore.isPanning.value || callbacks.getDragging()) {
      viewportStore.clampPanToBounds();
    }

    viewportStore.isPanning.value = false;
    callbacks.setDragging(false);
    callbacks.requestUpdate();
  }
}

/**
 * Handle window blur - reset modifier tracking.
 */
export function handleWindowBlur(state: KeyboardState): void {
  state.isCtrlActuallyPressed = false;
  state.isMetaActuallyPressed = false;
}
