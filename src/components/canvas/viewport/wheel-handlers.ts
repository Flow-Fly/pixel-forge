/**
 * Wheel event handlers for the canvas viewport.
 *
 * Handles zoom and pan via mouse wheel and trackpad gestures.
 */

import { viewportStore } from "../../../stores/viewport";
import { toolStore } from "../../../stores/tools";
import { getToolSize, setToolSize } from "../../../stores/tool-settings";
import type { KeyboardState } from "./keyboard-handlers";
import { isClickOnUI } from "./pan-handlers";

export interface WheelHandlerCallbacks {
  requestUpdate: () => void;
  getBoundingClientRect: () => DOMRect;
  contains: (node: Node) => boolean;
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
 * Handle wheel events on the viewport content.
 */
export function handleWheel(
  e: WheelEvent,
  keyboardState: KeyboardState,
  callbacks: WheelHandlerCallbacks
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
    viewportStore.zoomByFactorAt(zoomFactor, screenX, screenY);
    callbacks.requestUpdate();
    return;
  }

  // Trackpad two-finger scroll = pan.
  viewportStore.panBy(-e.deltaX, -e.deltaY);
  callbacks.requestUpdate();
}

/**
 * Global wheel handler to allow trackpad panning from outside the canvas.
 * Only handles trackpad gestures (deltaMode === 0), not mouse wheel.
 */
export function handleGlobalWheel(
  e: WheelEvent,
  callbacks: WheelHandlerCallbacks
): void {
  // Skip if event originated from within this component (already handled by local handler)
  if (callbacks.contains(e.target as Node)) return;

  // Skip if on UI elements
  if (isClickOnUI(e)) return;

  // Skip pinch gestures (ctrlKey is injected by macOS for pinch)
  if (e.ctrlKey) return;

  const absX = Math.abs(e.deltaX);
  const absY = Math.abs(e.deltaY);
  const isWheelLike =
    e.deltaMode === WheelEvent.DOM_DELTA_LINE ||
    e.deltaMode === WheelEvent.DOM_DELTA_PAGE ||
    (e.deltaMode === WheelEvent.DOM_DELTA_PIXEL && absX < 1 && absY >= 40);

  if (isWheelLike) return;

  // Trackpad two-finger scroll = pan
  e.preventDefault();
  viewportStore.panBy(-e.deltaX, -e.deltaY);
  callbacks.requestUpdate();
}
