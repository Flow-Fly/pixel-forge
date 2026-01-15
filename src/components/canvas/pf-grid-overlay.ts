import { html, css, type PropertyValueMap } from "lit";
import { customElement, query } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { tilemapStore } from "../../stores/tilemap";

/**
 * Grid Overlay Component
 *
 * A transparent canvas overlay that renders grid lines over the tilemap canvas.
 * Uses dual-color stroke technique for visibility on both light and dark tiles.
 *
 * Story 1-4: Grid Overlay System
 * - AC #1: Shows tile boundaries matching configured tile size
 * - AC #3: Dual-color grid lines for contrast on any tile color
 * - AC #4: Scales proportionally with viewport zoom
 * - AC #5: G key toggles visibility
 */
@customElement("pf-grid-overlay")
export class PfGridOverlay extends BaseComponent {
  @query("canvas") canvas!: HTMLCanvasElement;

  static styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none; /* Click-through to tilemap */
    }

    canvas {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
    }
  `;

  private ctx!: CanvasRenderingContext2D;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    super();
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.boundHandleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.boundHandleKeyDown);
    super.disconnectedCallback();
  }

  /**
   * Handle G key shortcut for grid toggle (AC #5)
   * Follows same pattern as pf-mode-toggle.ts
   */
  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === "g" || e.key === "G") {
      const activeEl = document.activeElement;
      const tagName = activeEl?.tagName?.toUpperCase();

      // Don't trigger if user is typing in an input or textarea
      if (tagName === "INPUT" || tagName === "TEXTAREA") {
        return;
      }

      // Also check for contenteditable elements
      if (activeEl instanceof HTMLElement && activeEl.isContentEditable) {
        return;
      }

      e.preventDefault();
      tilemapStore.toggleGrid();
    }
  }

  protected firstUpdated(_changedProperties: PropertyValueMap<unknown>): void {
    super.firstUpdated(_changedProperties);
    this.ctx = this.canvas.getContext("2d")!;
    this.resizeCanvas();
    this.renderGrid();
  }

  protected updated(): void {
    // Check if tilemap dimensions changed and resize if needed
    if (
      this.canvas &&
      (this.canvas.width !== tilemapStore.pixelWidth ||
        this.canvas.height !== tilemapStore.pixelHeight)
    ) {
      this.resizeCanvas();
    }
    this.renderGrid();
  }

  /**
   * Resize the canvas to match the tilemap dimensions
   */
  private resizeCanvas(): void {
    if (!this.canvas) return;

    const width = tilemapStore.pixelWidth;
    const height = tilemapStore.pixelHeight;

    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Render grid lines on the canvas
   * Uses dual-stroke technique for contrast on any tile color (AC #3, NFR20)
   */
  private renderGrid() {
    if (!this.ctx || !this.canvas) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const tileW = tilemapStore.tileWidth.value;
    const tileH = tilemapStore.tileHeight.value;

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    // Draw grid lines with dual-stroke for contrast (NFR20)
    // First stroke: dark shadow
    this.ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.lineWidth = 1;
    this.drawGridLines(width, height, tileW, tileH, 0.5);

    // Second stroke: light line
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    this.ctx.lineWidth = 1;
    this.drawGridLines(width, height, tileW, tileH, 0);
  }

  /**
   * Draw horizontal and vertical grid lines
   */
  private drawGridLines(
    width: number,
    height: number,
    tileW: number,
    tileH: number,
    offset: number
  ) {
    this.ctx.beginPath();

    // Vertical lines
    for (let x = tileW; x < width; x += tileW) {
      this.ctx.moveTo(x + offset, 0);
      this.ctx.lineTo(x + offset, height);
    }

    // Horizontal lines
    for (let y = tileH; y < height; y += tileH) {
      this.ctx.moveTo(0, y + offset);
      this.ctx.lineTo(width, y + offset);
    }

    this.ctx.stroke();
  }

  render() {
    // Subscribe to signals for reactivity
    void tilemapStore.width.value;
    void tilemapStore.height.value;
    void tilemapStore.tileWidth.value;
    void tilemapStore.tileHeight.value;

    return html`<canvas aria-hidden="true"></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-grid-overlay": PfGridOverlay;
  }
}
