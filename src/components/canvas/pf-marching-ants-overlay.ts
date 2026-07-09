import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { AnimatedCanvasOverlay } from './animated-canvas-overlay';
import { defaultProjectContext, type ProjectContext } from '../../stores/project-context';

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
  private context: ProjectContext = defaultProjectContext;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.requestUpdate();
    });
  }

  protected draw() {
    const ctx = this.prepareFrame();
    if (!ctx) return;

    // Get the bounds to highlight
    const bounds = this.context.historyHighlight.highlightBounds.value;
    if (!bounds) return;

    // Convert canvas coordinates to screen coordinates
    const zoom = this.context.viewport.zoom.value;
    const panX = this.context.viewport.panX.value;
    const panY = this.context.viewport.panY.value;

    const screen = this.toScreenRect(bounds, zoom, panX, panY);

    // Draw marching ants (white dashes with black offset dashes)
    this.strokeMarchingAntsRect(ctx, screen.x, screen.y, screen.width, screen.height);
  }

  render() {
    // Access signals to trigger re-render when they change
    void this.context.historyHighlight.highlightBounds.value;
    void this.context.viewport.zoom.value;
    void this.context.viewport.panX.value;
    void this.context.viewport.panY.value;

    return html`<canvas></canvas>`;
  }
}
