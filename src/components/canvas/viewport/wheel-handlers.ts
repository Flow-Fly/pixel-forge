/**
 * Wheel event handlers for the canvas viewport.
 *
 * Handles zoom and pan via mouse wheel and trackpad gestures.
 */

import { toolStore } from '../../../stores/tools';
import { getToolSize, setToolSize } from '../../../stores/tool-settings';
import { getActiveProjectContext, type ProjectContext } from '../../../stores/project-context';
import type { KeyboardState } from './keyboard-handlers';

type WheelContext = Pick<ProjectContext, 'viewport'>;

export interface WheelHandlerCallbacks {
  requestUpdate: () => void;
  getBoundingClientRect: () => DOMRect;
}

function normalizeWheelDelta(delta: number, deltaMode: number): number {
  switch (deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return delta * 16;
    case WheelEvent.DOM_DELTA_PAGE:
      return delta * 120;
    default:
      return delta;
  }
}

/**
 * Handle wheel events on the viewport host.
 */
export function handleWheel(
  e: WheelEvent,
  keyboardState: KeyboardState,
  callbacks: WheelHandlerCallbacks,
  context: WheelContext = getActiveProjectContext()
): void {
  e.preventDefault();

  const isPinchGesture = e.ctrlKey && !keyboardState.isCtrlActuallyPressed;

  // Alt+Wheel = adjust brush size / thickness (for tools that support it)
  if (keyboardState.isAltActuallyPressed) {
    const tool = toolStore.activeTool.value;
    const currentSize = getToolSize(tool);
    const scrollDelta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    const delta = scrollDelta > 0 ? 1 : -1;
    setToolSize(tool, currentSize + delta);
    return;
  }

  const rect = callbacks.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  const absX = Math.abs(e.deltaX);
  const absY = Math.abs(e.deltaY);
  const isLineWheel = e.deltaMode === WheelEvent.DOM_DELTA_LINE;
  const isPageWheel = e.deltaMode === WheelEvent.DOM_DELTA_PAGE;
  const isLargePixelStep = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL && absX < 1 && absY >= 40;
  const shouldZoom = isPinchGesture || isLineWheel || isPageWheel || isLargePixelStep;

  if (shouldZoom) {
    const normalizedDelta = normalizeWheelDelta(e.deltaY, e.deltaMode);
    const zoomFactor = Math.exp(-normalizedDelta * (isPinchGesture ? 0.0035 : 0.0025));
    context.viewport.zoomByFactorAt(zoomFactor, screenX, screenY);
    callbacks.requestUpdate();
    return;
  }

  // Trackpad two-finger scroll = pan.
  context.viewport.panBy(-e.deltaX, -e.deltaY);
  callbacks.requestUpdate();
}
