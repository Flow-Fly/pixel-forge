import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import type { BrushImageData } from "../../types/brush";
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

@customElement("pf-brush-create-overlay")
export class PFBrushCreateOverlay extends BaseComponent {
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

    .size-section {
      margin-bottom: 12px;
    }

    .size-label {
      font-size: 12px;
      color: var(--pf-color-text-muted);
      margin-bottom: 8px;
    }

    .size-presets {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    .preset-btn {
      padding: 6px 12px;
      font-size: 12px;
      background: var(--pf-color-bg-tertiary);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      color: var(--pf-color-text-primary);
      cursor: pointer;
    }

    .preset-btn:hover {
      background: var(--pf-color-bg-hover);
    }

    .preset-btn.active {
      border-color: var(--pf-color-primary);
      background: var(--pf-color-primary);
      color: white;
    }

    .custom-size {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .size-input {
      width: 60px;
      padding: 4px 8px;
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      background: var(--pf-color-bg-dark);
      color: var(--pf-color-text-primary);
      font-size: 12px;
    }

    .size-input:focus {
      outline: none;
      border-color: var(--pf-color-primary);
    }

    .size-separator {
      color: var(--pf-color-text-muted);
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

    .tool-hint {
      font-size: 10px;
      color: var(--pf-color-text-muted);
      margin-bottom: 8px;
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

    .btn-create {
      background: var(--pf-color-primary);
      border: 1px solid var(--pf-color-primary);
      color: white;
    }

    .btn-create:hover:not(:disabled) {
      opacity: 0.9;
    }

    .btn-create:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  @state() private name: string = "New Brush";
  @state() private width: number = 8;
  @state() private height: number = 8;
  @state() private zoom: number = 16;
  @state() private isDrawing: boolean = false;
  @state() private hasContent: boolean = false;

  private brushCanvas: HTMLCanvasElement | null = null;
  private lastDrawnPixel: { x: number; y: number } | null = null;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.handleKeyDown);
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
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    this.brushCanvas = canvas;
    this.zoom = calculateBrushZoom(this.width, this.height);
    this.requestUpdate();
  }

  private resizeCanvas(newWidth: number, newHeight: number) {
    // Validate bounds
    newWidth = Math.max(1, Math.min(64, newWidth));
    newHeight = Math.max(1, Math.min(64, newHeight));

    if (newWidth === this.width && newHeight === this.height) return;

    // Create new canvas
    const newCanvas = document.createElement("canvas");
    newCanvas.width = newWidth;
    newCanvas.height = newHeight;

    // Copy existing content if any
    if (this.brushCanvas) {
      const ctx = newCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(this.brushCanvas, 0, 0);
      }
    }

    this.brushCanvas = newCanvas;
    this.width = newWidth;
    this.height = newHeight;
    this.zoom = calculateBrushZoom(newWidth, newHeight);
    this.checkForContent();
    this.requestUpdate();
  }

  private setPresetSize(size: number) {
    this.resizeCanvas(size, size);
  }

  private handleWidthChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.resizeCanvas(value, this.height);
    }
  }

  private handleHeightChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.resizeCanvas(this.width, value);
    }
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
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  private handleCanvasMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;

    this.isDrawing = true;
    this.lastDrawnPixel = null;
    this.drawAtPosition(e);

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
    if (!this.brushCanvas) return;

    const { x, y } = this.getBrushCoordinates(e);

    if (
      this.lastDrawnPixel &&
      this.lastDrawnPixel.x === x &&
      this.lastDrawnPixel.y === y
    ) {
      return;
    }

    if (!this.isInBounds(x, y)) return;

    const ctx = this.brushCanvas.getContext("2d");
    if (!ctx) return;

    const activeTool = toolStore.activeTool.value;

    if (activeTool === "eraser") {
      ctx.clearRect(x, y, 1, 1);
    } else {
      ctx.fillStyle = colorStore.primaryColor.value;
      ctx.fillRect(x, y, 1, 1);
    }

    this.lastDrawnPixel = { x, y };
    this.checkForContent();
    this.redrawDisplayCanvas();
  }

  private checkForContent() {
    if (!this.brushCanvas) {
      this.hasContent = false;
      return;
    }

    const ctx = this.brushCanvas.getContext("2d");
    if (!ctx) {
      this.hasContent = false;
      return;
    }

    const imageData = ctx.getImageData(0, 0, this.width, this.height);
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0) {
        this.hasContent = true;
        return;
      }
    }
    this.hasContent = false;
  }

  private async create() {
    if (!this.brushCanvas || !this.hasContent) return;

    const ctx = this.brushCanvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, this.width, this.height);

    const brushImageData: BrushImageData = {
      width: this.width,
      height: this.height,
      data: Array.from(imageData.data),
    };

    const brush = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: this.name || `Brush ${this.width}x${this.height}`,
      type: "custom" as const,
      size: Math.max(this.width, this.height),
      shape: "square" as const,
      opacity: 1,
      pixelPerfect: false,
      spacing: "match" as const,
      imageData: brushImageData,
      useOriginalColors: false,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };

    await brushStore.addCustomBrush(brush);
    brushStore.setActiveBrush(brush);

    this.dispatchEvent(new CustomEvent("close"));
  }

  private cancel() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  render() {
    const displayWidth = this.width * this.zoom;
    const displayHeight = this.height * this.zoom;

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

        <div class="size-section">
          <div class="size-label">Size</div>
          <div class="size-presets">
            <button
              class="preset-btn ${this.width === 8 && this.height === 8
                ? "active"
                : ""}"
              @click=${() => this.setPresetSize(8)}
            >
              8x8
            </button>
            <button
              class="preset-btn ${this.width === 16 && this.height === 16
                ? "active"
                : ""}"
              @click=${() => this.setPresetSize(16)}
            >
              16x16
            </button>
            <button
              class="preset-btn ${this.width === 32 && this.height === 32
                ? "active"
                : ""}"
              @click=${() => this.setPresetSize(32)}
            >
              32x32
            </button>
          </div>
          <div class="custom-size">
            <input
              type="number"
              class="size-input"
              .value=${this.width.toString()}
              @change=${this.handleWidthChange}
              min="1"
              max="64"
            />
            <span class="size-separator">x</span>
            <input
              type="number"
              class="size-input"
              .value=${this.height.toString()}
              @change=${this.handleHeightChange}
              min="1"
              max="64"
            />
            <span class="size-separator">px</span>
          </div>
        </div>

        <div class="canvas-container">
          <canvas
            class="brush-canvas"
            width=${displayWidth}
            height=${displayHeight}
            @mousedown=${this.handleCanvasMouseDown}
          ></canvas>
        </div>

        <div class="tool-hint">
          Draw with pencil tool, erase with eraser tool
        </div>

        <div class="info">
          <span>${this.width} x ${this.height} px</span>
          <span>Zoom: ${this.zoom}x</span>
        </div>

        <div class="actions">
          <button class="btn-cancel" @click=${this.cancel}>Cancel</button>
          <button
            class="btn-create"
            @click=${this.create}
            ?disabled=${!this.hasContent}
            title=${this.hasContent
              ? "Create brush"
              : "Draw something first"}
          >
            Create
          </button>
        </div>
      </div>
    `;
  }
}
