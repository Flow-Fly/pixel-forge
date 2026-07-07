import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { AnimatedCanvasOverlay } from './animated-canvas-overlay';
import { historyHighlightStore } from '../../stores/history-highlight';
import { viewportStore } from '../../stores/viewport';

/**
 * Transparent canvas overlay that renders animated marching ants
 * to highlight the bounds of a history command.
 */
@customElement('pf-marching-ants-overlay')
export class PFMarchingAntsOverlay extends AnimatedCanvasOverlay {
  static styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 50;
    }

    canvas {
      width: 100%;
      height: 100%;
    }
  `;


  protected draw() {
    const ctx = this.prepareFrame();
    if (!ctx) return;

    // Get the bounds to highlight
    const bounds = historyHighlightStore.highlightBounds.value;
    if (!bounds) return;

    // Convert canvas coordinates to screen coordinates
    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;

    const screenX = bounds.x * zoom + panX;
    const screenY = bounds.y * zoom + panY;
    const screenWidth = bounds.width * zoom;
    const screenHeight = bounds.height * zoom;

    // Draw marching ants (white dashes with black offset dashes)
    this.strokeMarchingAntsRect(ctx, screenX, screenY, screenWidth, screenHeight);
  }

  render() {
    // Access signals to trigger re-render when they change
    void historyHighlightStore.highlightBounds.value;
    void viewportStore.zoom.value;
    void viewportStore.panX.value;
    void viewportStore.panY.value;

    return html`<canvas></canvas>`;
  }
}
