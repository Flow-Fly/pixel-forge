/**
 * Cel selection management.
 *
 * Handles selecting, deselecting, and range-selecting cels
 * in the animation timeline.
 */

import type { Frame } from '../../types/animation';
import type { Layer } from '../../types/layer';
import { getCelKey, parseCelKey } from './types';

export interface SelectionState {
  selectedCelKeys: Set<string>;
  selectionAnchor: { layerId: string; frameId: string } | null;
}

/**
 * Select a cel. If additive is false, clears previous selection.
 */
export function selectCel(
  state: SelectionState,
  layerId: string,
  frameId: string,
  additive: boolean = false
): SelectionState {
  const key = getCelKey(layerId, frameId);
  const newSelection = additive ? new Set(state.selectedCelKeys) : new Set<string>();

  if (additive && newSelection.has(key)) {
    newSelection.delete(key);
  } else {
    newSelection.add(key);
  }

  return {
    ...state,
    selectedCelKeys: newSelection
  };
}

/**
 * Deselect a specific cel.
 */
export function deselectCel(
  state: SelectionState,
  layerId: string,
  frameId: string
): SelectionState {
  const key = getCelKey(layerId, frameId);
  const newSelection = new Set(state.selectedCelKeys);
  newSelection.delete(key);

  return {
    ...state,
    selectedCelKeys: newSelection
  };
}

/**
 * Clear all cel selection.
 */
export function clearCelSelection(state: SelectionState): SelectionState {
  return {
    ...state,
    selectedCelKeys: new Set()
  };
}

/**
 * Set the selection anchor point.
 */
export function setSelectionAnchor(
  state: SelectionState,
  layerId: string,
  frameId: string
): SelectionState {
  return {
    ...state,
    selectionAnchor: { layerId, frameId }
  };
}

/**
 * Toggle a cel in/out of selection without affecting anchor.
 */
export function toggleCel(
  state: SelectionState,
  layerId: string,
  frameId: string
): SelectionState {
  const key = getCelKey(layerId, frameId);
  const newSelection = new Set(state.selectedCelKeys);

  if (newSelection.has(key)) {
    newSelection.delete(key);
  } else {
    newSelection.add(key);
  }

  return {
    ...state,
    selectedCelKeys: newSelection
  };
}

/**
 * Select all cels in a rectangular range between two cells.
 */
export function selectCelRange(
  layers: Layer[],
  frames: Frame[],
  fromLayerId: string,
  fromFrameId: string,
  toLayerId: string,
  toFrameId: string
): Set<string> {
  const fromLayerIndex = layers.findIndex(l => l.id === fromLayerId);
  const toLayerIndex = layers.findIndex(l => l.id === toLayerId);
  const fromFrameIndex = frames.findIndex(f => f.id === fromFrameId);
  const toFrameIndex = frames.findIndex(f => f.id === toFrameId);

  const minLayerIndex = Math.min(fromLayerIndex, toLayerIndex);
  const maxLayerIndex = Math.max(fromLayerIndex, toLayerIndex);
  const minFrameIndex = Math.min(fromFrameIndex, toFrameIndex);
  const maxFrameIndex = Math.max(fromFrameIndex, toFrameIndex);

  const newSelection = new Set<string>();

  for (let li = minLayerIndex; li <= maxLayerIndex; li++) {
    for (let fi = minFrameIndex; fi <= maxFrameIndex; fi++) {
      const layer = layers[li];
      const frame = frames[fi];
      if (layer && frame) {
        newSelection.add(getCelKey(layer.id, frame.id));
      }
    }
  }

  return newSelection;
}

/**
 * Check if a cel is selected.
 */
export function isCelSelected(
  selectedCelKeys: Set<string>,
  layerId: string,
  frameId: string
): boolean {
  const key = getCelKey(layerId, frameId);
  return selectedCelKeys.has(key);
}

/**
 * Get all selected cels as an array of {layerId, frameId}.
 */
export function getSelectedCels(
  selectedCelKeys: Set<string>
): Array<{ layerId: string; frameId: string }> {
  return Array.from(selectedCelKeys).map(key => parseCelKey(key));
}
