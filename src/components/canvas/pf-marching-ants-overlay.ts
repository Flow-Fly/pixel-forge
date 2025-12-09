import { html, css } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { historyHighlightStore } from '../../stores/history-highlight';
import { viewportStore } from '../../stores/viewport';

/**
 * Transparent canvas overlay that renders animated marching ants
 * to highlight the bounds of a history command.
 */
@customElement('pf-marching-ants-overlay')
export class PFMarchingAntsOverlay extends BaseComponent {
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

  @query('canvas') canvas!: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId = 0;
  private dashOffset = 0;
  private lastTimestamp = 0;
  private resizeObserver: ResizeObserver | null = null;

  connectedCallback() {
    super.connectedCallback();
    // Use ResizeObserver to detect size changes from flex layout (e.g., timeline resize)
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  firstUpdated() {
    this.initCanvas();
    this.startAnimationLoop();
  }

  private initCanvas() {
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
  }

  private handleResize = () => {
    this.resizeCanvas();
  };

  private resizeCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.clientWidth * dpr;
    this.canvas.height = this.clientHeight * dpr;
  }

  private startAnimationLoop() {
    const animate = (timestamp: number) => {
      // Calculate delta time for smooth animation
      const delta = timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;

      // Update dash offset for animation (move ~60 pixels per second)
      this.dashOffset = (this.dashOffset + delta * 0.06) % 16;

      this.draw();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  private draw() {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    // Clear the canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(dpr, dpr);

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
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // White dashes
    ctx.strokeStyle = 'white';
    ctx.lineDashOffset = -this.dashOffset;
    ctx.strokeRect(
      Math.round(screenX) + 0.5,
      Math.round(screenY) + 0.5,
      Math.round(screenWidth) - 1,
      Math.round(screenHeight) - 1
    );

    // Black dashes (offset by 4 to fill gaps)
    ctx.strokeStyle = 'black';
    ctx.lineDashOffset = -this.dashOffset + 4;
    ctx.strokeRect(
      Math.round(screenX) + 0.5,
      Math.round(screenY) + 0.5,
      Math.round(screenWidth) - 1,
      Math.round(screenHeight) - 1
    );

    ctx.restore();
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
