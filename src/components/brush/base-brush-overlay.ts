import { css } from "lit";
import { state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { toolStore } from "../../stores/tools";
import { colorStore } from "../../stores/colors";

function isPixelInCanvas(canvas: HTMLCanvasElement, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < canvas.width && y < canvas.height;
}

/**
 * Calculate optimal zoom level for brush editing
 */
export function calculateBrushZoom(brushWidth: number, brushHeight: number): number {
  const maxDisplaySize = 280;
  const maxBrushDimension = Math.max(brushWidth, brushHeight);
  const idealZoom = maxDisplaySize / maxBrushDimension;
  return Math.min(32, Math.max(4, Math.floor(idealZoom)));
}

/** Styles shared by the brush create and edit overlays. */
export const brushOverlayStyles = css`
  :host {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 100;
    pointer-events: none;
  }

  .editor-card {
    position: relative;
    background-color: var(--pf-color-bg-panel);
    border: 1px solid var(--pf-color-border);
    border-radius: 8px;
    padding: 16px;
    min-width: 320px;
    max-width: 500px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    pointer-events: auto;
  }

  .header {
    margin-bottom: 12px;
  }

  .name-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--pf-color-border);
    border-radius: 4px;
    background: var(--pf-color-bg-dark);
    color: var(--pf-color-text-primary);
    font-size: 14px;
    box-sizing: border-box;
  }

  .name-input:focus {
    outline: none;
    border-color: var(--pf-color-primary);
  }

  .canvas-container {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--pf-color-bg-dark);
    background-image: linear-gradient(45deg, #333 25%, transparent 25%),
      linear-gradient(-45deg, #333 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #333 75%),
      linear-gradient(-45deg, transparent 75%, #333 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
    border: 1px solid var(--pf-color-border);
    border-radius: 4px;
    padding: 24px;
    margin-bottom: 12px;
    min-height: 200px;
  }

  .brush-canvas {
    image-rendering: pixelated;
    cursor: crosshair;
  }

  .info {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--pf-color-text-muted);
    margin-bottom: 12px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--pf-color-border);
  }

  .actions button {
    padding: 8px 20px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-cancel {
    background: var(--pf-color-bg-tertiary);
    border: 1px solid var(--pf-color-border);
    color: var(--pf-color-text-primary);
  }

  .btn-cancel:hover {
    background: var(--pf-color-bg-hover);
  }
`;

/**
 * Shared behavior for the brush create and edit overlays: escape-to-cancel,
 * a zoomed pixel-editing canvas, and pencil/eraser drawing driven by the
 * active tool and primary color.
 */
export abstract class BaseBrushOverlay extends BaseComponent {
  @state() protected zoom: number = 8;
  @state() protected isDrawing: boolean = false;

  protected brushCanvas: HTMLCanvasElement | null = null;
  protected lastDrawnPixel: { x: number; y: number } | null = null;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.handleKeyDown);

    // Clean up document listeners if still attached
    document.removeEventListener("mousemove", this.handleDocumentMouseMove);
    document.removeEventListener("mouseup", this.handleDocumentMouseUp);
  }

  firstUpdated() {
    this.initializeBrushCanvas();
  }

  updated() {
    this.redrawDisplayCanvas();
  }

  protected abstract initializeBrushCanvas(): void;

  protected abstract cancel(): void;

  /** Called after each pixel is drawn or erased. */
  protected onPixelDrawn(): void {}

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      this.cancel();
    }
  };

  protected redrawDisplayCanvas() {
    if (!this.brushCanvas) return;

    const displayCanvas = this.shadowRoot?.querySelector(
      ".brush-canvas"
    ) as HTMLCanvasElement;
    if (!displayCanvas) return;

    const ctx = displayCanvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    ctx.drawImage(
      this.brushCanvas,
      0,
      0,
      displayCanvas.width,
      displayCanvas.height
    );
  }

  // ===== Mouse Event Handling for Drawing =====

  private getBrushCoordinates(e: MouseEvent): { x: number; y: number } {
    const displayCanvas = this.shadowRoot?.querySelector(
      ".brush-canvas"
    ) as HTMLCanvasElement;
    if (!displayCanvas) return { x: -1, y: -1 };

    const rect = displayCanvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / this.zoom);
    const y = Math.floor((e.clientY - rect.top) / this.zoom);
    return { x, y };
  }

  protected handleCanvasMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return; // Left click only

    this.isDrawing = true;
    this.lastDrawnPixel = null;
    this.drawAtPosition(e);

    // Add document-level listeners for drawing outside canvas
    document.addEventListener("mousemove", this.handleDocumentMouseMove);
    document.addEventListener("mouseup", this.handleDocumentMouseUp);
  };

  private handleDocumentMouseMove = (e: MouseEvent) => {
    if (!this.isDrawing) return;
    this.drawAtPosition(e);
  };

  private handleDocumentMouseUp = () => {
    this.isDrawing = false;
    this.lastDrawnPixel = null;
    document.removeEventListener("mousemove", this.handleDocumentMouseMove);
    document.removeEventListener("mouseup", this.handleDocumentMouseUp);
  };

  private drawAtPosition(e: MouseEvent) {
    const { x, y } = this.getBrushCoordinates(e);
    const ctx = this.paintTargetAt(x, y);
    if (!ctx) return;

    this.paintPixel(ctx, x, y);
    this.lastDrawnPixel = { x, y };
    this.onPixelDrawn();
    this.redrawDisplayCanvas();
  }

  /**
   * Context to paint (x, y) into, or null when the pixel repeats the last
   * drawn one or lies outside the brush canvas.
   */
  private paintTargetAt(x: number, y: number): CanvasRenderingContext2D | null {
    if (this.isRepeatPixel(x, y)) return null;

    const canvas = this.brushCanvas;
    if (!canvas || !isPixelInCanvas(canvas, x, y)) return null;

    return canvas.getContext("2d");
  }

  /** Same pixel as last drawn (avoid duplicate draws). */
  private isRepeatPixel(x: number, y: number): boolean {
    const last = this.lastDrawnPixel;
    return last !== null && last.x === x && last.y === y;
  }

  /** Draw or erase one pixel based on the active tool. */
  private paintPixel(ctx: CanvasRenderingContext2D, x: number, y: number) {
    if (toolStore.activeTool.value === "eraser") {
      ctx.clearRect(x, y, 1, 1);
    } else {
      // Use primary color for drawing
      ctx.fillStyle = colorStore.primaryColor.value;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
