import { BaseTool, type ModifierKeys } from './base-tool';
import { viewportStore } from '../stores/viewport';

/**
 * Zoom tool for zooming the viewport.
 * Left click = zoom in, Alt+click or right click = zoom out.
 * Can be activated with Z key.
 */
export class ZoomTool extends BaseTool {
  name = 'zoom';
  cursor = 'zoom-in';

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    // Calculate screen position for zoom-at-point
    const screenX = x * viewportStore.zoom.value + viewportStore.panX.value;
    const screenY = y * viewportStore.zoom.value + viewportStore.panY.value;

    // Alt+click = zoom out
    if (modifiers?.alt) {
      viewportStore.zoomOutAt(screenX, screenY);
    } else {
      viewportStore.zoomInAt(screenX, screenY);
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
