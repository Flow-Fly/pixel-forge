/**
 * Pan and drag handlers for the canvas viewport.
 *
 * Handles mouse-based panning, quick eyedropper, and lightness shifting.
 */

import { toolStore } from '../../../stores/tools';
import { getActiveProjectContext, type ProjectContext } from '../../../stores/project-context';

type PanContext = Pick<ProjectContext, 'colors' | 'viewport'>;

export interface PanState {
  isDragging: boolean;
  lastMouseX: number;
  lastMouseY: number;
}

export interface PanHandlerCallbacks {
  requestUpdate: () => void;
  querySelector: (selector: string) => Element | null;
  getBoundingClientRect?: () => DOMRect;
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
  return (
    target.closest(
      'pf-toolbar, pf-tool-group-menu, pf-sidebar, pf-timeline, pf-layers-panel, [role="dialog"], .context-bar, pf-menu-bar, pf-context-bar, pf-palette-panel, pf-brush-panel'
    ) !== null
  );
}

/**
 * Handle global mousedown to allow starting pan from outside the canvas.
 */
export function handleGlobalMouseDown(
  e: MouseEvent,
  state: PanState,
  startDragging: (e: MouseEvent) => void,
  context: PanContext = getActiveProjectContext()
): void {
  // Skip if already dragging
  if (state.isDragging) return;

  // Check if clicking on UI elements
  if (isClickOnUI(e)) return;

  const currentTool = toolStore.activeTool.value;

  // Hand tool: pan from anywhere (like spacebar)
  if (currentTool === 'hand' && e.button === 0) {
    startDragging(e);
    return;
  }

  // Middle-click pan from anywhere
  if (e.button === 1) {
    startDragging(e);
    return;
  }

  // Spacebar + left-click pan from anywhere
  if (context.viewport.isSpacebarDown.value && e.button === 0) {
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
  startDragging: (e: MouseEvent) => void,
  context: PanContext = getActiveProjectContext()
): void {
  // Check if current tool is a selection tool (needs Alt for subtract mode, Ctrl for shrink-to-content)
  const currentTool = toolStore.activeTool.value;
  const isSelectionTool = ['marquee-rect', 'lasso', 'polygonal-lasso', 'magic-wand'].includes(
    currentTool
  );

  // Hand tool: pan on left-click (works at viewport level, doesn't need active layer)
  if (currentTool === 'hand' && e.button === 0) {
    startDragging(e);
    return;
  }

  // Zoom tool: zoom in/out on click (works at viewport level)
  if (currentTool === 'zoom' && (e.button === 0 || e.button === 2)) {
    e.preventDefault();
    e.stopPropagation();
    triggerZoom(e, callbacks, e.altKey || e.button === 2, context);
    return;
  }

  // Alt or Cmd/Meta + Click = Quick Eyedropper (but not for selection tools - they use Alt for subtract)
  // Left click: pick to foreground, Right click: pick to background
  if ((e.altKey || e.metaKey) && !isSelectionTool) {
    e.preventDefault();
    e.stopPropagation();
    triggerQuickEyedropper(e, callbacks, context);
    return;
  }

  // Ctrl+Click for lightness shifting (Ctrl only, not Meta) - but not for selection tools
  if (e.ctrlKey && !isSelectionTool) {
    if (e.button === 0) {
      // Left click: shift darker
      e.preventDefault();
      e.stopPropagation();
      context.colors.shiftLightnessDarker();
      return;
    }
    if (e.button === 2) {
      // Right click: shift lighter
      e.preventDefault();
      e.stopPropagation();
      context.colors.shiftLightnessLighter();
      return;
    }
  }

  // Spacebar pan mode
  if (context.viewport.isSpacebarDown.value) {
    startDragging(e);
    return;
  }

  // Middle click to pan (Alt is now used for eyedropper)
  if (e.button === 1) {
    startDragging(e);
  }
}

/**
 * Zoom at a specific screen position.
 * @param zoomOut - If true, zoom out; otherwise zoom in
 */
function triggerZoom(
  e: MouseEvent,
  callbacks: PanHandlerCallbacks,
  zoomOut: boolean,
  context: PanContext = getActiveProjectContext()
): void {
  const { viewport } = context;
  let screenX: number;
  let screenY: number;

  // Try to use getBoundingClientRect if available
  if (callbacks.getBoundingClientRect) {
    const rect = callbacks.getBoundingClientRect();
    screenX = e.clientX - rect.left;
    screenY = e.clientY - rect.top;
  } else {
    // Fallback: use stored cursor position or center
    const storedX = viewport.cursorScreenX.value;
    const storedY = viewport.cursorScreenY.value;

    if (storedX !== null && storedY !== null) {
      screenX = storedX;
      screenY = storedY;
    } else {
      // Last fallback: center of container
      screenX = viewport.containerWidth.value / 2;
      screenY = viewport.containerHeight.value / 2;
    }
  }

  if (zoomOut) {
    viewport.zoomOutAt(screenX, screenY);
  } else {
    viewport.zoomInAt(screenX, screenY);
  }

  callbacks.requestUpdate();
}

/**
 * Quick eyedropper: pick color from canvas at mouse position.
 */
function triggerQuickEyedropper(
  e: MouseEvent,
  callbacks: PanHandlerCallbacks,
  context: PanContext = getActiveProjectContext()
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
    context.colors.setSecondaryColor(hex);
  } else {
    // Left click: pick to primary/foreground color
    context.colors.setPrimaryColor(hex);
    context.colors.updateLightnessVariations(hex);
  }
}

/**
 * Start a drag operation.
 */
export function startDragging(
  e: MouseEvent,
  state: PanState,
  callbacks: PanHandlerCallbacks,
  addGlobalListeners: () => void,
  context: PanContext = getActiveProjectContext()
): void {
  state.isDragging = true;
  context.viewport.isPanning.value = true;
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
  callbacks: PanHandlerCallbacks,
  context: PanContext = getActiveProjectContext()
): void {
  if (!state.isDragging) return;

  const dx = e.clientX - state.lastMouseX;
  const dy = e.clientY - state.lastMouseY;

  context.viewport.panBy(dx, dy);

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
  removeGlobalListeners: () => void,
  context: PanContext = getActiveProjectContext()
): void {
  if (!state.isDragging) return;

  state.isDragging = false;
  context.viewport.isPanning.value = false;

  // Rubber band: snap back to valid bounds
  context.viewport.clampPanToBounds();

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
  getBoundingClientRect: () => DOMRect,
  context: PanContext = getActiveProjectContext()
): void {
  // Track cursor position for keyboard zoom (only when not dragging globally)
  if (!state.isDragging) {
    const rect = getBoundingClientRect();
    context.viewport.cursorScreenX.value = e.clientX - rect.left;
    context.viewport.cursorScreenY.value = e.clientY - rect.top;
  }
}

/**
 * Handle mouse leave viewport.
 */
export function handleMouseLeave(
  state: PanState,
  context: PanContext = getActiveProjectContext()
): void {
  // Clear cursor position when leaving viewport (but not during drag)
  if (!state.isDragging) {
    context.viewport.cursorScreenX.value = null;
    context.viewport.cursorScreenY.value = null;
  }
}

/**
 * Handle context menu (prevent default).
 */
export function handleContextMenu(e: MouseEvent): void {
  // Always prevent context menu on canvas
  e.preventDefault();
}
