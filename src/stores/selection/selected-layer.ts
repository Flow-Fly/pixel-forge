import { selectionStore } from './store';
import { layerStore } from '../layers';
import type { Layer } from '../../types/layer';
import type { Rect } from '../../types/geometry';
import type { SelectionShape } from '../../types/selection';

/**
 * Resolve the current 'selected' selection together with the active
 * layer's canvas, plus the freeform mask when present. Returns null when
 * nothing is selected or the active layer has no canvas.
 */
export function getSelectedLayerSelection(): {
  layer: Layer;
  canvas: HTMLCanvasElement;
  bounds: Rect;
  shape: SelectionShape;
  mask?: Uint8Array;
} | null {
  const state = selectionStore.state.value;
  if (state.type !== 'selected') return null;

  const activeLayerId = layerStore.activeLayerId.value;
  const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
  if (!layer?.canvas) return null;

  const mask =
    state.shape === 'freeform'
      ? (state as { mask: Uint8Array }).mask
      : undefined;

  return { layer, canvas: layer.canvas, bounds: state.bounds, shape: state.shape, mask };
}
