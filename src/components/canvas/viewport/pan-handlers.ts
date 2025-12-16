/**
 * Pan and drag handlers for the canvas viewport.
 *
 * Handles mouse-based panning, quick eyedropper, and lightness shifting.
 */

import { viewportStore } from '../../../stores/viewport';
import { colorStore } from '../../../stores/colors';
import { toolStore } from '../../../stores/tools';

export interface PanState {
  isDragging: boolean;
  lastMouseX: number;
  lastMouseY: number;
}

export interface PanHandlerCallbacks {
  requestUpdate: () => void;
  querySelector: (selector: string) => Element | null;
}

/**
 * Create pan state tracker.
 */
export function createPanState(): PanState {
  return {
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
  };
}

/**
 * Check if the click target is a UI element that should not trigger pan.
 */
export function isClickOnUI(e: MouseEvent | WheelEvent): boolean {
  const target = e.target as HTMLElement;
  // Check if click is on toolbar, sidebar, timeline, dialogs, context bar, menu bar, or panels
  return target.closest(
    'pf-toolbar, pf-sidebar, pf-timeline, pf-layers-panel, [role="dialog"], .context-bar, pf-menu-bar, pf-context-bar, pf-palette-panel, pf-brush-panel'
  ) !== null;
}

/**
 * Handle global mousedown to allow starting pan from outside the canvas.
 */
export function handleGlobalMouseDown(
  e: MouseEvent,
  state: PanState,
  startDragging: (e: MouseEvent) => void
): void {
  // Skip if already dragging
  if (state.isDragging) return;

  // Check if clicking on UI elements
  if (isClickOnUI(e)) return;

  // Middle-click pan from anywhere
  if (e.button === 1) {
    startDragging(e);
    return;
  }

  // Spacebar + left-click pan from anywhere
  if (viewportStore.isSpacebarDown.value && e.button === 0) {
    startDragging(e);
    return;
  }
}

/**
 * Handle mousedown on the viewport content.
 */
export function handleMouseDown(
  e: MouseEvent,
  _state: PanState,
  callbacks: PanHandlerCallbacks,
  startDragging: (e: MouseEvent) => void
): void {
  // Check if current tool is a selection tool (needs Alt for subtract mode, Ctrl for shrink-to-content)
  const currentTool = toolStore.activeTool.value;
  const isSelectionTool = ['marquee-rect', 'lasso', 'polygonal-lasso', 'magic-wand'].includes(currentTool);

  // Alt or Cmd/Meta + Click = Quick Eyedropper (but not for selection tools - they use Alt for subtract)
  // Left click: pick to foreground, Right click: pick to background
  if ((e.altKey || e.metaKey) && !isSelectionTool) {
    e.preventDefault();
    e.stopPropagation();
    triggerQuickEyedropper(e, callbacks);
    return;
  }

  // Ctrl+Click for lightness shifting (Ctrl only, not Meta) - but not for selection tools
  if (e.ctrlKey && !isSelectionTool) {
    if (e.button === 0) {
      // Left click: shift darker
      e.preventDefault();
      e.stopPropagation();
      colorStore.shiftLightnessDarker();
      return;
    }
    if (e.button === 2) {
      // Right click: shift lighter
      e.preventDefault();
      e.stopPropagation();
      colorStore.shiftLightnessLighter();
      return;
    }
  }

  // Spacebar pan mode
  if (viewportStore.isSpacebarDown.value) {
    startDragging(e);
    return;
  }

  // Middle click to pan (Alt is now used for eyedropper)
  if (e.button === 1) {
    startDragging(e);
  }
}

/**
 * Quick eyedropper: pick color from canvas at mouse position.
 */
function triggerQuickEyedropper(
  e: MouseEvent,
  callbacks: PanHandlerCallbacks
): void {
  const drawingCanvas = callbacks.querySelector('pf-drawing-canvas') as any;
  if (!drawingCanvas?.canvas) return;

  const canvasEl = drawingCanvas.canvas as HTMLCanvasElement;
  const rect = canvasEl.getBoundingClientRect();
  const scaleX = canvasEl.width / rect.width;
  const scaleY = canvasEl.height / rect.height;

  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top) * scaleY);

  // Bounds check
  if (x < 0 || x >= canvasEl.width || y < 0 || y >= canvasEl.height) return;

  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;

  const pixel = ctx.getImageData(x, y, 1, 1).data;
  const hex =
    '#' +
    pixel[0].toString(16).padStart(2, '0') +
    pixel[1].toString(16).padStart(2, '0') +
    pixel[2].toString(16).padStart(2, '0');

  if (e.button === 2) {
    // Right click: pick to secondary/background color
    colorStore.setSecondaryColor(hex);
  } else {
    // Left click: pick to primary/foreground color
    colorStore.setPrimaryColor(hex);
    colorStore.updateLightnessVariations(hex);
  }
}

/**
 * Start a drag operation.
 */
export function startDragging(
  e: MouseEvent,
  state: PanState,
  callbacks: PanHandlerCallbacks,
  addGlobalListeners: () => void
): void {
  state.isDragging = true;
  viewportStore.isPanning.value = true;
  state.lastMouseX = e.clientX;
  state.lastMouseY = e.clientY;
  e.preventDefault();

  // Attach global listeners to track mouse even outside viewport
  addGlobalListeners();

  callbacks.requestUpdate();
}

/**
 * Handle global mouse move during drag.
 */
export function handleGlobalMouseMove(
  e: MouseEvent,
  state: PanState,
  callbacks: PanHandlerCallbacks
): void {
  if (!state.isDragging) return;

  const dx = e.clientX - state.lastMouseX;
  const dy = e.clientY - state.lastMouseY;

  viewportStore.panBy(dx, dy);

  state.lastMouseX = e.clientX;
  state.lastMouseY = e.clientY;
  callbacks.requestUpdate();
}

/**
 * Handle global mouse up to end drag.
 */
export function handleGlobalMouseUp(
  state: PanState,
  callbacks: PanHandlerCallbacks,
  removeGlobalListeners: () => void
): void {
  if (!state.isDragging) return;

  state.isDragging = false;
  viewportStore.isPanning.value = false;

  // Rubber band: snap back to valid bounds
  viewportStore.clampPanToBounds();

  // Remove global listeners
  removeGlobalListeners();

  callbacks.requestUpdate();
}

/**
 * Handle mouse move on viewport (cursor tracking).
 */
export function handleMouseMove(
  e: MouseEvent,
  state: PanState,
  getBoundingClientRect: () => DOMRect
): void {
  // Track cursor position for keyboard zoom (only when not dragging globally)
  if (!state.isDragging) {
    const rect = getBoundingClientRect();
    viewportStore.cursorScreenX.value = e.clientX - rect.left;
    viewportStore.cursorScreenY.value = e.clientY - rect.top;
  }
}

/**
 * Handle mouse leave viewport.
 */
export function handleMouseLeave(state: PanState): void {
  // Clear cursor position when leaving viewport (but not during drag)
  if (!state.isDragging) {
    viewportStore.cursorScreenX.value = null;
    viewportStore.cursorScreenY.value = null;
  }
}

/**
 * Handle context menu (prevent default).
 */
export function handleContextMenu(e: MouseEvent): void {
  // Always prevent context menu on canvas - right-click is used for:
  // - Drawing with secondary color (pencil)
  // - Erasing to background color (eraser)
  // - Ctrl+RightClick lightness shifting
  e.preventDefault();
}
