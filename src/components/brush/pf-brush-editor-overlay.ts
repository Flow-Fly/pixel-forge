import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import type { Brush, BrushImageData } from "../../types/brush";
import { brushStore } from "../../stores/brush";
import { toolStore } from "../../stores/tools";
import { colorStore } from "../../stores/colors";

/**
 * Calculate optimal zoom level for brush editing
 */
function calculateBrushZoom(brushWidth: number, brushHeight: number): number {
  const maxDisplaySize = 280;
  const maxBrushDimension = Math.max(brushWidth, brushHeight);
  const idealZoom = maxDisplaySize / maxBrushDimension;
  return Math.min(32, Math.max(4, Math.floor(idealZoom)));
}

@customElement("pf-brush-editor-overlay")
export class PFBrushEditorOverlay extends BaseComponent {
  static styles = css`
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

    .btn-save {
      background: var(--pf-color-primary);
      border: 1px solid var(--pf-color-primary);
      color: white;
    }

    .btn-save:hover {
      opacity: 0.9;
    }
  `;

  @property({ type: Object }) brush!: Brush;

  @state() private name: string = "";
  @state() private zoom: number = 8;
  @state() private isDrawing: boolean = false;

  private brushCanvas: HTMLCanvasElement | null = null;
  private lastDrawnPixel: { x: number; y: number } | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.name = this.brush.name;

    if (this.brush.imageData) {
      this.zoom = calculateBrushZoom(
        this.brush.imageData.width,
        this.brush.imageData.height
      );
    }

    // Handle escape key
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

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      this.cancel();
    }
  };


  private initializeBrushCanvas() {
    if (!this.brush.imageData) return;

    // Create the brush editing canvas
    const canvas = document.createElement("canvas");
    canvas.width = this.brush.imageData.width;
    canvas.height = this.brush.imageData.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw existing brush data
    const imageData = new ImageData(
      new Uint8ClampedArray(this.brush.imageData.data),
      this.brush.imageData.width,
      this.brush.imageData.height
    );
    ctx.putImageData(imageData, 0, 0);

    this.brushCanvas = canvas;
  }

  updated() {
    this.redrawDisplayCanvas();
  }

  private redrawDisplayCanvas() {
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

  private isInBounds(x: number, y: number): boolean {
    if (!this.brush.imageData) return false;
    return x >= 0 && x < this.brush.imageData.width &&
           y >= 0 && y < this.brush.imageData.height;
  }

  private handleCanvasMouseDown = (e: MouseEvent) => {
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
    if (!this.brushCanvas || !this.brush.imageData) return;

    const { x, y } = this.getBrushCoordinates(e);

    // Skip if same pixel as last drawn (avoid duplicate draws)
    if (this.lastDrawnPixel &&
        this.lastDrawnPixel.x === x &&
        this.lastDrawnPixel.y === y) {
      return;
    }

    if (!this.isInBounds(x, y)) return;

    const ctx = this.brushCanvas.getContext("2d");
    if (!ctx) return;

    const activeTool = toolStore.activeTool.value;

    // Draw or erase based on active tool
    if (activeTool === "eraser") {
      ctx.clearRect(x, y, 1, 1);
    } else {
      // Use primary color for drawing
      ctx.fillStyle = colorStore.primaryColor.value;
      ctx.fillRect(x, y, 1, 1);
    }

    this.lastDrawnPixel = { x, y };
    this.redrawDisplayCanvas();
  }

  private async save() {
    if (!this.brushCanvas) return;

    const ctx = this.brushCanvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(
      0,
      0,
      this.brushCanvas.width,
      this.brushCanvas.height
    );

    const updatedImageData: BrushImageData = {
      width: imageData.width,
      height: imageData.height,
      data: Array.from(imageData.data),
    };

    // Update the brush
    await brushStore.updateCustomBrush(this.brush.id, {
      name: this.name,
      imageData: updatedImageData,
    });

    this.dispatchEvent(new CustomEvent("close"));
  }

  private cancel() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  render() {
    if (!this.brush.imageData) {
      return html`
        <div class="editor-card">No brush data</div>
      `;
    }

    const displayWidth = this.brush.imageData.width * this.zoom;
    const displayHeight = this.brush.imageData.height * this.zoom;

    return html`
      <div class="editor-card">
        <div class="header">
          <input
            type="text"
            class="name-input"
            .value=${this.name}
            @input=${(e: Event) =>
              (this.name = (e.target as HTMLInputElement).value)}
            placeholder="Brush name"
          />
        </div>

        <div class="canvas-container">
          <canvas
            class="brush-canvas"
            width=${displayWidth}
            height=${displayHeight}
            @mousedown=${this.handleCanvasMouseDown}
          ></canvas>
        </div>

        <div class="info">
          <span>${this.brush.imageData.width} x ${this.brush.imageData.height} px</span>
          <span>Zoom: ${this.zoom}x</span>
        </div>

        <div class="actions">
          <button class="btn-cancel" @click=${this.cancel}>Cancel</button>
          <button class="btn-save" @click=${this.save}>Save</button>
        </div>
      </div>
    `;
  }
}
