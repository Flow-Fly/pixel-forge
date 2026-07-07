import { CanvasOverlay } from './canvas-overlay';

/**
 * Canvas overlay that continuously redraws on an animation loop
 * (marching ants): a requestAnimationFrame loop advances the shared
 * dash offset before each draw() call.
 */
export abstract class AnimatedCanvasOverlay extends CanvasOverlay {
  protected animationFrameId = 0;
  protected dashOffset = 0;
  protected lastTimestamp = 0;

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  firstUpdated() {
    super.firstUpdated();
    this.startAnimationLoop();
  }

  /** Render the overlay content for the current frame. */
  protected abstract draw(): void;

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
