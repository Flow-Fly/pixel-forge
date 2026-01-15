import { html, css, type PropertyValueMap } from "lit";
import { customElement, query } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { tilemapStore } from "../../stores/tilemap";
import { modeStore } from "../../stores/mode";
import { dirtyRectStore } from "../../stores/dirty-rect";

/**
 * pf-tilemap-canvas - Canvas component for tilemap rendering
 *
 * A separate canvas component for tilemap mode that:
 * - Renders the tilemap at the correct pixel dimensions
 * - Supports dirty rect tracking for efficient rendering
 * - Uses pixelated rendering for crisp tiles
 *
 * This component does NOT extend pf-drawing-canvas as the Architecture doc states:
 * "Create separate pf-tilemap-canvas component (not extending pf-drawing-canvas)"
 * "Fundamentally different rendering logic (tile grid vs pixel buffer)"
 */
@customElement("pf-tilemap-canvas")
export class PFTilemapCanvas extends BaseComponent {
  @query("canvas") canvas!: HTMLCanvasElement;

  static styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      background-color: var(--pf-color-bg-dark, #2a2a2a);
      overflow: hidden;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    }

    canvas {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      image-rendering: pixelated;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
      cursor: crosshair;
    }

    /* Inherit cursor from host during pan mode (set by viewport) */
    :host([pan-cursor="grab"]) canvas {
      cursor: grab !important;
    }
    :host([pan-cursor="grabbing"]) canvas {
      cursor: grabbing !important;
    }
  `;

  private ctx!: CanvasRenderingContext2D;

  /**
   * Get the total width of the tilemap in pixels
   */
  private get pixelWidth(): number {
    return tilemapStore.pixelWidth;
  }

  /**
   * Get the total height of the tilemap in pixels
   */
  private get pixelHeight(): number {
    return tilemapStore.pixelHeight;
  }

  protected firstUpdated(_changedProperties: PropertyValueMap<any>): void {
    super.firstUpdated(_changedProperties);

    // Get context with performance hints
    const ctx = this.canvas.getContext("2d", {
      alpha: true,
      desynchronized: true, // Hint for lower latency
      willReadFrequently: false,
    });

    if (ctx) {
      this.ctx = ctx;
      // Critical for pixel art - disable anti-aliasing
      this.ctx.imageSmoothingEnabled = false;
    }

    // Initial canvas setup
    this.resizeCanvas();
    this.renderCanvas();
  }

  protected updated(
    _changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>
  ): void {
    super.updated(_changedProperties);

    // Check if tilemap dimensions changed and resize if needed
    if (
      this.canvas &&
      (this.canvas.width !== this.pixelWidth ||
        this.canvas.height !== this.pixelHeight)
    ) {
      this.resizeCanvas();
    }

    // Request full redraw for signal-triggered updates
    dirtyRectStore.requestFullRedraw();
    this.renderCanvas();
  }

  /**
   * Resize the canvas to match the tilemap dimensions
   */
  resizeCanvas(): void {
    if (!this.canvas) return;

    // Set canvas to logical pixel dimensions
    this.canvas.width = this.pixelWidth;
    this.canvas.height = this.pixelHeight;

    // Display size matches logical size - viewport scales it
    this.canvas.style.width = `${this.pixelWidth}px`;
    this.canvas.style.height = `${this.pixelHeight}px`;

    // Host matches canvas size
    this.style.width = `${this.pixelWidth}px`;
    this.style.height = `${this.pixelHeight}px`;

    // Re-apply context settings after resize (context may be reset)
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  /**
   * Render the tilemap canvas
   *
   * For now, this just clears the canvas (empty tilemap).
   * Tile data rendering will be added in Story 3.1.
   */
  renderCanvas(): void {
    if (!this.ctx) return;

    const fullRedraw = dirtyRectStore.consumeFullRedraw();

    if (fullRedraw) {
      // Full redraw - clear entire canvas
      this.ctx.clearRect(0, 0, this.pixelWidth, this.pixelHeight);

      // Render tilemap content
      // For now, render an empty canvas with a subtle background
      // to distinguish from the drawing canvas
      // (Tile data rendering will be added in Story 3.1)
    }
  }

  render() {
    // Access signals to register them with SignalWatcher for reactive updates
    void modeStore.mode.value;
    void tilemapStore.width.value;
    void tilemapStore.height.value;
    void tilemapStore.tileWidth.value;
    void tilemapStore.tileHeight.value;

    return html`<canvas></canvas>`;
  }
}
