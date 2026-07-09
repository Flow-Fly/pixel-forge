import { defaultProjectContext, type ProjectContext } from '../project-context';
import type { Layer } from '../../types/layer';
import type { Rect } from '../../types/geometry';
import type { SelectionShape } from '../../types/selection';

type SelectedLayerContext = Pick<ProjectContext, 'layers' | 'selection'>;

/**
 * Resolve the current 'selected' selection together with the active
 * layer's canvas, plus the freeform mask when present. Returns null when
 * nothing is selected or the active layer has no canvas.
 */
export function getSelectedLayerSelection(context: SelectedLayerContext = defaultProjectContext): {
  layer: Layer;
  canvas: HTMLCanvasElement;
  bounds: Rect;
  shape: SelectionShape;
  mask?: Uint8Array;
} | null {
  const { layers, selection } = context;
  const state = selection.state.value;
  if (state.type !== 'selected') return null;

  const activeLayerId = layers.activeLayerId.value;
  const layer = layers.layers.value.find((l) => l.id === activeLayerId);
  if (!layer?.canvas) return null;

  const mask = state.shape === 'freeform' ? (state as { mask: Uint8Array }).mask : undefined;

  return { layer, canvas: layer.canvas, bounds: state.bounds, shape: state.shape, mask };
}
