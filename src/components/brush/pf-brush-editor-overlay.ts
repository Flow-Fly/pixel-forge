import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Brush, BrushImageData } from "../../types/brush";
import { brushStore } from "../../stores/brush";
import {
  BaseBrushOverlay,
  brushOverlayStyles,
  calculateBrushZoom,
} from "./base-brush-overlay";

@customElement("pf-brush-editor-overlay")
export class PFBrushEditorOverlay extends BaseBrushOverlay {
  static styles = [
    brushOverlayStyles,
    css`
      .btn-save {
        background: var(--pf-color-primary);
        border: 1px solid var(--pf-color-primary);
        color: white;
      }

      .btn-save:hover {
        opacity: 0.9;
      }
    `,
  ];

  @property({ type: Object }) brush!: Brush;

  @state() private name: string = "";

  connectedCallback() {
    super.connectedCallback();
    this.name = this.brush.name;

    if (this.brush.imageData) {
      this.zoom = calculateBrushZoom(
        this.brush.imageData.width,
        this.brush.imageData.height
      );
    }
  }

  protected initializeBrushCanvas() {
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

  protected cancel() {
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
