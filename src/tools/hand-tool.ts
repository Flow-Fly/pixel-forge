import { BaseTool, type ModifierKeys } from './base-tool';

/**
 * Hand tool for panning the viewport.
 * Can be activated with H key or held temporarily with Space.
 */
export class HandTool extends BaseTool {
  name = 'hand';
  cursor = 'grab';

  private isPanning = false;
  private lastScreenX = 0;
  private lastScreenY = 0;

  onDown(x: number, y: number, _modifiers?: ModifierKeys) {
    this.isPanning = true;
    const viewport = this.projectContext.viewport;

    // Convert canvas coordinates to screen coordinates for delta calculation
    // Note: x, y are canvas coords, but we need screen coords for panning
    this.lastScreenX = x * viewport.zoom.value + viewport.panX.value;
    this.lastScreenY = y * viewport.zoom.value + viewport.panY.value;

    // Change cursor while dragging
    if (this.ctx) {
      this.ctx.canvas.style.cursor = 'grabbing';
    }
  }

  onDrag(x: number, y: number, _modifiers?: ModifierKeys) {
    if (!this.isPanning) return;
    const viewport = this.projectContext.viewport;

    // Convert current canvas position to screen coordinates
    const screenX = x * viewport.zoom.value + viewport.panX.value;
    const screenY = y * viewport.zoom.value + viewport.panY.value;

    // Calculate delta in screen space
    const deltaX = screenX - this.lastScreenX;
    const deltaY = screenY - this.lastScreenY;

    // Pan the viewport
    viewport.panBy(deltaX, deltaY);

    // Update last position
    this.lastScreenX = screenX;
    this.lastScreenY = screenY;
  }

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys) {
    this.isPanning = false;

    // Restore cursor
    if (this.ctx) {
      this.ctx.canvas.style.cursor = this.cursor;
    }
  }

  onMove(_x: number, _y: number, _modifiers?: ModifierKeys) {
    // Nothing special on hover
  }
}
