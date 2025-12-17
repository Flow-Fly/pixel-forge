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
    // Positive deltaY (natural scroll up on Mac, traditional scroll down) = increase
    // Negative deltaY = decrease
    const delta = scrollDelta > 0 ? 1 : -1;
    setToolSize(tool, currentSize + delta);
    return;
  }

  // Pinch gesture = zoom at cursor position
  if (isPinchGesture) {
    const rect = callbacks.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (e.deltaY < 0) {
      viewportStore.zoomInAt(screenX, screenY);
    } else if (e.deltaY > 0) {
      viewportStore.zoomOutAt(screenX, screenY);
    }

    callbacks.requestUpdate();
    return;
  }

  // Distinguish mouse wheel from trackpad two-finger scroll:
  // - deltaMode === 1 (LINE) = definitely mouse wheel → zoom
  // - deltaMode === 0 (PIXEL) with horizontal component = trackpad → pan
  // - deltaMode === 0 (PIXEL) Y-only = likely mouse wheel → zoom
  // On macOS, both use deltaMode === 0, but trackpad usually has deltaX due to finger imprecision
  const isMouseWheel =
    e.deltaMode === 1 || // LINE mode is definitely mouse wheel
    (e.deltaMode === 0 && e.deltaX === 0); // Y-only scroll = likely mouse wheel

  if (isMouseWheel) {
    // Mouse wheel = zoom at cursor position
    const rect = callbacks.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (e.deltaY < 0) {
      viewportStore.zoomInAt(screenX, screenY);
    } else if (e.deltaY > 0) {
      viewportStore.zoomOutAt(screenX, screenY);
    }
  } else {
    // Trackpad two-finger scroll = pan
    viewportStore.panBy(-e.deltaX, -e.deltaY);
  }

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

  // Only handle trackpad (has horizontal component), not mouse wheel
  // Mouse wheels have deltaMode === 1 OR Y-only scroll (deltaX === 0)
  const isMouseWheel =
    e.deltaMode === 1 || (e.deltaMode === 0 && e.deltaX === 0);
  if (isMouseWheel) return;

  // Trackpad two-finger scroll = pan
  e.preventDefault();
  viewportStore.panBy(-e.deltaX, -e.deltaY);
  callbacks.requestUpdate();
}
