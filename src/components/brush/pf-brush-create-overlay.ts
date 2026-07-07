import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { BrushImageData } from "../../types/brush";
import { brushStore } from "../../stores/brush";
import {
  BaseBrushOverlay,
  brushOverlayStyles,
  calculateBrushZoom,
} from "./base-brush-overlay";

@customElement("pf-brush-create-overlay")
export class PFBrushCreateOverlay extends BaseBrushOverlay {
  static styles = [
    brushOverlayStyles,
    css`
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

      .tool-hint {
        font-size: 10px;
        color: var(--pf-color-text-muted);
        margin-bottom: 8px;
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
    `,
  ];

  @state() private name: string = "New Brush";
  @state() private width: number = 8;
  @state() private height: number = 8;
  @state() private hasContent: boolean = false;

  constructor() {
    super();
    this.zoom = 16;
  }

  protected initializeBrushCanvas() {
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

  protected onPixelDrawn() {
    this.checkForContent();
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

  protected cancel() {
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
