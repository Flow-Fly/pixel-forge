import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { brushStore } from "../../stores/brush";
import type { Brush, BrushImageData } from "../../types/brush";
import {
  canCaptureBrush,
  captureBrushAndAdd,
} from "../../services/brush-capture";
import "./pf-brush-editor-overlay";
import "./pf-brush-create-overlay";

@customElement("pf-brush-panel")
export class PFBrushPanel extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 8px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: var(--pf-color-text-muted);
      margin-bottom: 8px;
      border-bottom: 1px solid var(--pf-color-border);
      padding-bottom: 4px;
    }

    .header-hint {
      font-size: 10px;
      opacity: 0.7;
    }

    .brush-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
      gap: 4px;
      overflow-y: auto;
      flex: 1;
    }

    .brush-item {
      width: 48px;
      height: 48px;
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      background-color: var(--pf-color-bg-hover);
      position: relative;
    }

    .brush-item:hover {
      background-color: gray;
    }

    .brush-item.active {
      border-color: var(--pf-color-primary);
      // background-color: var(--pf-color-bg-active);
    }

    .brush-item.custom::after {
      content: "";
      position: absolute;
      bottom: 2px;
      right: 2px;
      width: 6px;
      height: 6px;
      background: var(--pf-color-primary);
      border-radius: 50%;
    }

    .brush-preview-canvas {
      max-width: 40px;
      max-height: 40px;
      image-rendering: pixelated;
    }

    .actions {
      display: flex;
      gap: 4px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--pf-color-border);
    }

    .action-btn {
      flex: 1;
      padding: 4px 8px;
      font-size: 11px;
      background: var(--pf-color-bg-tertiary);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      color: var(--pf-color-text-primary);
      cursor: pointer;
    }

    .action-btn:hover:not(:disabled) {
      background: var(--pf-color-bg-hover);
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .empty-state {
      text-align: center;
      padding: 16px 8px;
      color: var(--pf-color-text-muted);
      font-size: 11px;
    }

    .brush-options {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--pf-color-border);
      font-size: 11px;
      color: var(--pf-color-text-primary);
    }

    .brush-options label {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    }

    .brush-options input[type="checkbox"] {
      cursor: pointer;
    }
  `;

  @state() private editingBrush: Brush | null = null;
  @state() private showCreateOverlay: boolean = false;

  render() {
    const allBrushes = brushStore.allBrushes;
    const activeBrush = brushStore.activeBrush.value;
    const hasSelection = canCaptureBrush();

    return html`
      <div class="header">
        <span>Brushes</span>
        <span class="header-hint">Ctrl+B to capture</span>
      </div>

      <div class="brush-grid">
        ${allBrushes.map(
          (brush) => html`
            <div
              class="brush-item ${brush.id === activeBrush.id
                ? "active"
                : ""} ${brush.type === "custom" ? "custom" : ""}"
              @click=${() => this.selectBrush(brush)}
              @dblclick=${() => this.editBrush(brush)}
              title="${brush.name}"
            >
              ${this.renderBrushPreview(brush)}
            </div>
          `
        )}
      </div>

      ${allBrushes.length === this.builtinCount
        ? html`<div class="empty-state">
            Select an area and press Ctrl+B to create a custom brush
          </div>`
        : ""}

      <div class="actions">
        <button
          class="action-btn"
          @click=${this.addBrush}
          title="Create new brush or capture from selection (Ctrl+B)"
        >
          + Add
        </button>
        <button
          class="action-btn"
          @click=${this.editCurrentBrush}
          ?disabled=${activeBrush.type !== "custom"}
          title="Edit selected brush"
        >
          Edit
        </button>
        <button
          class="action-btn"
          @click=${this.deleteCurrentBrush}
          ?disabled=${activeBrush.type !== "custom"}
          title="Delete selected brush"
        >
          Delete
        </button>
      </div>

      ${activeBrush.type === "custom"
        ? html`
            <div class="brush-options">
              <label>
                <input
                  type="checkbox"
                  .checked=${activeBrush.useOriginalColors ?? false}
                  @change=${this.toggleUseOriginalColors}
                />
                Use brush colors
              </label>
            </div>
          `
        : ""}

      ${this.editingBrush
        ? html`
            <pf-brush-editor-overlay
              .brush=${this.editingBrush}
              @close=${() => (this.editingBrush = null)}
            ></pf-brush-editor-overlay>
          `
        : ""}
      ${this.showCreateOverlay
        ? html`
            <pf-brush-create-overlay
              @close=${() => (this.showCreateOverlay = false)}
            ></pf-brush-create-overlay>
          `
        : ""}
    `;
  }

  private get builtinCount(): number {
    return brushStore.builtinBrushes.length;
  }

  private renderBrushPreview(brush: Brush) {
    if (brush.type === "builtin" || !brush.imageData) {
      // Render builtin brush as canvas showing actual pixel pattern
      return html`
        <canvas
          class="brush-preview-canvas builtin-brush"
          data-brush-id="${brush.id}"
          data-brush-size="${brush.size}"
          data-brush-shape="${brush.shape}"
        ></canvas>
      `;
    }

    // Render custom brush as canvas
    return html`
      <canvas
        class="brush-preview-canvas"
        width=${brush.imageData.width}
        height=${brush.imageData.height}
      ></canvas>
    `;
  }

  updated() {
    // Draw builtin brush previews
    const builtinCanvases = this.shadowRoot?.querySelectorAll(".builtin-brush");
    builtinCanvases?.forEach((canvas) => {
      const canvasEl = canvas as HTMLCanvasElement;
      const size = parseInt(canvasEl.dataset.brushSize || "1", 10);
      const shape = canvasEl.dataset.brushShape || "square";
      this.drawBuiltinBrushPreview(canvasEl, size, shape);
    });

    // Draw custom brush previews
    const customCanvases = this.shadowRoot?.querySelectorAll(
      ".brush-preview-canvas:not(.builtin-brush)"
    );
    customCanvases?.forEach((canvas) => {
      const brushName = (canvas as HTMLElement)
        .closest(".brush-item")
        ?.getAttribute("title");
      const brush = brushStore.allBrushes.find((b) => b.name === brushName);
      if (brush?.imageData) {
        this.drawBrushPreview(canvas as HTMLCanvasElement, brush.imageData);
      }
    });
  }

  private drawBrushPreview(
    canvas: HTMLCanvasElement,
    imageData: BrushImageData
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Convert stored data to ImageData
    const data = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
    ctx.putImageData(data, 0, 0);
  }

  private drawBuiltinBrushPreview(
    canvas: HTMLCanvasElement,
    size: number,
    shape: string
  ) {
    // Use a fixed pixel size (4px per brush pixel) to show relative size differences
    const pixelSize = 4;
    const displaySize = size * pixelSize;

    // Set canvas dimensions
    canvas.width = displaySize;
    canvas.height = displaySize;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, displaySize, displaySize);

    // Draw the brush pattern (using light color for visibility on dark bg)
    const computedStyle = getComputedStyle(this);
    const textColor = computedStyle.getPropertyValue("--pf-color-text-primary").trim() || "#e0e0e0";
    ctx.fillStyle = textColor;

    if (shape === "circle") {
      // Draw circle pattern
      const centerX = displaySize / 2;
      const centerY = displaySize / 2;
      const radius = displaySize / 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Draw square pattern
      ctx.fillRect(0, 0, displaySize, displaySize);
    }
  }

  private selectBrush(brush: Brush) {
    brushStore.setActiveBrush(brush);
  }

  private editBrush(brush: Brush) {
    if (brush.type !== "custom") return;
    this.editingBrush = brush;
  }

  private async addBrush() {
    if (canCaptureBrush()) {
      await captureBrushAndAdd();
    } else {
      this.showCreateOverlay = true;
    }
  }

  private editCurrentBrush() {
    const brush = brushStore.activeBrush.value;
    if (brush.type === "custom") {
      this.editBrush(brush);
    }
  }

  private async deleteCurrentBrush() {
    const brush = brushStore.activeBrush.value;
    if (brush.type !== "custom") return;

    await brushStore.deleteCustomBrush(brush.id);
  }

  private async toggleUseOriginalColors() {
    await brushStore.toggleUseOriginalColors();
  }
}
