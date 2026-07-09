import { BaseTool, type ModifierKeys } from './base-tool';

/**
 * Zoom tool for zooming the viewport.
 * Left click = zoom in, Alt+click or right click = zoom out.
 * Can be activated with Z key.
 */
export class ZoomTool extends BaseTool {
  name = 'zoom';
  cursor = 'zoom-in';

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    const viewport = this.projectContext.viewport;
    // Calculate screen position for zoom-at-point
    const screenX = x * viewport.zoom.value + viewport.panX.value;
    const screenY = y * viewport.zoom.value + viewport.panY.value;

    // Alt+click = zoom out
    if (modifiers?.alt) {
      viewport.zoomOutAt(screenX, screenY);
    } else {
      viewport.zoomInAt(screenX, screenY);
    }
  }

  onDrag(_x: number, _y: number, _modifiers?: ModifierKeys) {
    // Could implement drag-to-zoom-rect in the future
  }

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys) {
    // Nothing to do
  }

  onMove(_x: number, _y: number, modifiers?: ModifierKeys) {
    // Update cursor based on Alt key
    if (this.ctx) {
      this.ctx.canvas.style.cursor = modifiers?.alt ? 'zoom-out' : 'zoom-in';
    }
  }
}
