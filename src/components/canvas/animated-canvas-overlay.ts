import { query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';

/**
 * Base for transparent canvas overlays that continuously redraw on an
 * animation loop (marching ants). Owns the canvas sizing (DPR-aware,
 * kept in sync via ResizeObserver) and the requestAnimationFrame loop
 * that advances the shared dash offset before each draw() call.
 */
export abstract class AnimatedCanvasOverlay extends BaseComponent {
  @query('canvas') canvas!: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D | null = null;
  protected animationFrameId = 0;
  protected dashOffset = 0;
  protected lastTimestamp = 0;
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

  /** Render the overlay content for the current frame. */
  protected abstract draw(): void;

  /**
   * Clear the canvas and apply the device-pixel-ratio transform.
   * Returns the 2D context ready for drawing, or null when unavailable.
   */
  protected prepareFrame(): CanvasRenderingContext2D | null {
    if (!this.ctx || !this.canvas) return null;

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(dpr, dpr);
    return ctx;
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

  /**
   * Stroke the same geometry twice — white dashes, then black dashes
   * offset by half the dash period — producing the marching-ants effect.
   * Handles save/restore and dash setup. `setup` runs after save so extra
   * transforms (e.g. rotation) apply to both strokes and are restored.
   */
  protected strokeMarchingAnts(
    ctx: CanvasRenderingContext2D,
    strokeGeometry: (ctx: CanvasRenderingContext2D) => void,
    setup?: (ctx: CanvasRenderingContext2D) => void
  ) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    setup?.(ctx);

    // White dashes
    ctx.strokeStyle = 'white';
    ctx.lineDashOffset = -this.dashOffset;
    strokeGeometry(ctx);

    // Black dashes (offset by 4 to fill gaps)
    ctx.strokeStyle = 'black';
    ctx.lineDashOffset = -this.dashOffset + 4;
    strokeGeometry(ctx);

    ctx.restore();
  }

  /**
   * Stroke an animated dashed rectangle at screen coordinates.
   */
  protected strokeMarchingAntsRect(
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    screenWidth: number,
    screenHeight: number
  ) {
    this.strokeMarchingAnts(ctx, (c) =>
      c.strokeRect(
        Math.round(screenX) + 0.5,
        Math.round(screenY) + 0.5,
        Math.round(screenWidth) - 1,
        Math.round(screenHeight) - 1
      )
    );
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

      // Update dash offset for marching ants animation (move ~60 pixels per second)
      this.dashOffset = (this.dashOffset + delta * 0.06) % 16;

      this.draw();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }
}
