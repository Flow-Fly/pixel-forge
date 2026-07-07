import { query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { clearCanvasForDpr } from '../../utils/canvas-utils';

/**
 * Base for transparent DPR-aware canvas overlays. Owns the <canvas> 2D
 * context and keeps the backing store sized to the host element via a
 * ResizeObserver (detects size changes from flex layout, e.g. timeline
 * resize).
 */
export abstract class CanvasOverlay extends BaseComponent {
  @query('canvas') canvas!: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D | null = null;
  private resizeObserver: ResizeObserver | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
    });
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  firstUpdated() {
    this.initCanvas();
  }

  protected initCanvas() {
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
  }

  protected resizeCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.clientWidth * dpr;
    this.canvas.height = this.clientHeight * dpr;
  }

  /**
   * Clear the canvas and apply the device-pixel-ratio transform.
   * Returns the 2D context ready for drawing, or null when unavailable.
   */
  protected prepareFrame(): CanvasRenderingContext2D | null {
    if (!this.ctx || !this.canvas) return null;
    clearCanvasForDpr(this.ctx, this.canvas);
    return this.ctx;
  }

  /** Convert canvas-space bounds to screen-space pixels. */
  protected toScreenRect(
    bounds: { x: number; y: number; width: number; height: number },
    zoom: number,
    panX: number,
    panY: number
  ): { x: number; y: number; width: number; height: number } {
    return {
      x: bounds.x * zoom + panX,
      y: bounds.y * zoom + panY,
      width: bounds.width * zoom,
      height: bounds.height * zoom,
    };
  }
}
