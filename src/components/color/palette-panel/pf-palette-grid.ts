import { html, css } from "lit";
import { customElement, state, property } from "lit/decorators.js";
import { BaseComponent } from "../../../core/base-component";
import { colorStore } from "../../../stores/colors";
import { paletteStore } from "../../../stores/palette";

@customElement("pf-palette-grid")
export class PFPaletteGrid extends BaseComponent {
  static styles = css`
    :host {
      display: block;
    }

    .palette-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 1px;
      background-color: var(--pf-color-border);
      border: 1px solid var(--pf-color-border);
    }

    .swatch-container {
      position: relative;
      aspect-ratio: 1;
    }

    .swatch {
      width: 100%;
      height: 100%;
      cursor: pointer;
      position: relative;
      transition: transform 0.1s ease;
    }

    .swatch-container:hover .swatch {
      transform: scale(1.1);
      z-index: 1;
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
    }

    .swatch-delete {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 14px;
      height: 14px;
      background: rgba(197, 48, 48, 0.9);
      border: 1px solid rgba(0, 0, 0, 0.3);
      border-radius: 50%;
      color: white;
      font-size: 10px;
      line-height: 12px;
      text-align: center;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.1s ease;
      z-index: 10;
      padding: 0;
    }

    .swatch-container:hover .swatch-delete {
      opacity: 1;
    }

    .swatch-delete:hover {
      background: #c53030;
      transform: scale(1.1);
    }

    /* Usage indicator */
    .swatch-used::after {
      content: "";
      position: absolute;
      bottom: 2px;
      right: 2px;
      width: 5px;
      height: 5px;
      background: white;
      border-radius: 50%;
      box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
      pointer-events: none;
    }

    /* Drag-drop styles */
    .palette-grid.drag-active {
      outline: 2px dashed var(--pf-color-accent, #4a9eff);
      outline-offset: 2px;
    }

    .swatch-container.drag-before::before {
      content: "";
      position: absolute;
      left: -2px;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--pf-color-accent, #4a9eff);
      border-radius: 1px;
      z-index: 15;
    }

    .swatch-container.drag-after::after {
      content: "";
      position: absolute;
      right: -2px;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--pf-color-accent, #4a9eff);
      border-radius: 1px;
      z-index: 15;
    }

    .swatch-container.dragging {
      opacity: 0.4;
    }

    /* Replace mode */
    @keyframes wiggle {
      0%, 100% { transform: rotate(-2deg); }
      50% { transform: rotate(2deg); }
    }

    .palette-grid.replace-mode .swatch-container .swatch {
      animation: wiggle 0.3s ease-in-out infinite;
      cursor: crosshair;
    }

    .palette-grid.replace-mode .swatch-container .swatch:hover {
      animation: none;
      transform: scale(1.15);
      box-shadow: 0 0 8px rgba(74, 158, 255, 0.6);
    }

    .palette-grid.replace-mode .swatch-delete {
      display: none;
    }
  `;

  @property({ type: Boolean }) replaceMode = false;
  @property({ type: String }) replaceColor: string | null = null;

  @state() private dragOverIndex: number | null = null;
  @state() private isDragging = false;
  @state() private draggedIndex: number | null = null;

  private selectColor(color: string) {
    colorStore.setPrimaryColor(color);
    colorStore.updateLightnessVariations(color);
  }

  private handleSwatchClick(color: string, index: number, e: Event) {
    if (this.replaceMode) {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent("replace-target", {
        detail: { index },
        bubbles: true,
        composed: true,
      }));
    } else {
      this.selectColor(color);
    }
  }

  private handleSwatchRightClick(e: MouseEvent, color: string, index: number) {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent("swatch-edit", {
      detail: { color, index, anchor: e.currentTarget },
      bubbles: true,
      composed: true,
    }));
  }

  private handleDeleteColor(e: Event, index: number) {
    e.stopPropagation();
    paletteStore.removeColorToEphemeral(index);
  }

  // Drag-drop handlers
  private handleDragStart(index: number, color: string, e: DragEvent) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-palette-index", String(index));
      e.dataTransfer.setData("application/x-palette-color", color);
    }
    this.isDragging = true;
    this.draggedIndex = index;
  }

  private handleDragEnd() {
    this.isDragging = false;
    this.draggedIndex = null;
    this.dragOverIndex = null;
  }

  private handleDragOver(index: number, e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    if (this.dragOverIndex !== index) {
      this.dragOverIndex = index;
    }
  }

  private handleDragLeave() {
    this.dragOverIndex = null;
  }

  private handleDrop(targetIndex: number, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    const paletteIndexStr = e.dataTransfer?.getData("application/x-palette-index");
    const color = e.dataTransfer?.getData("application/x-palette-color");
    const isEphemeral = e.dataTransfer?.getData("application/x-ephemeral-color") === "true";

    if (paletteIndexStr !== undefined && paletteIndexStr !== "") {
      const fromIndex = parseInt(paletteIndexStr, 10);
      if (fromIndex !== targetIndex && fromIndex !== targetIndex - 1) {
        const adjustedTarget = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
        paletteStore.moveColor(fromIndex, adjustedTarget);
      }
    } else if (color && isEphemeral) {
      paletteStore.removeFromEphemeral(color);
      paletteStore.insertColorAt(targetIndex + 1, color);
      window.dispatchEvent(new CustomEvent("palette-color-inserted", {
        detail: { insertedIndex: targetIndex + 1, color },
      }));
    }

    this.isDragging = false;
    this.draggedIndex = null;
    this.dragOverIndex = null;
  }

  private handleGridDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  }

  private handleGridDrop(e: DragEvent) {
    e.preventDefault();
    const color = e.dataTransfer?.getData("application/x-palette-color");
    const isEphemeral = e.dataTransfer?.getData("application/x-ephemeral-color") === "true";
    const paletteIndexStr = e.dataTransfer?.getData("application/x-palette-index");

    if (color && isEphemeral && !paletteIndexStr) {
      paletteStore.removeFromEphemeral(color);
      paletteStore.addColor(color);
    }

    this.isDragging = false;
    this.draggedIndex = null;
    this.dragOverIndex = null;
  }

  render() {
    const colors = paletteStore.mainColors.value;
    const usedColors = paletteStore.usedColors.value;

    return html`
      <div
        class="palette-grid ${this.isDragging || this.dragOverIndex !== null ? "drag-active" : ""} ${this.replaceMode ? "replace-mode" : ""}"
        @dragover=${this.handleGridDragOver}
        @drop=${this.handleGridDrop}
      >
        ${colors.map((color, index) => {
          const isUsed = usedColors.has(color.toLowerCase());
          return html`
            <div
              class="swatch-container ${this.dragOverIndex === index ? "drag-before" : ""} ${this.draggedIndex === index ? "dragging" : ""}"
              @dragover=${(e: DragEvent) => this.handleDragOver(index, e)}
              @dragleave=${this.handleDragLeave}
              @drop=${(e: DragEvent) => this.handleDrop(index, e)}
            >
              <div
                class="swatch ${isUsed ? "swatch-used" : ""}"
                style="background-color: ${color}"
                title="${this.replaceMode ? `Click to replace with ${this.replaceColor}` : color}${isUsed ? " (in use)" : ""}"
                draggable="${!this.replaceMode}"
                @click=${(e: Event) => this.handleSwatchClick(color, index, e)}
                @contextmenu=${(e: MouseEvent) => this.handleSwatchRightClick(e, color, index)}
                @dragstart=${(e: DragEvent) => this.handleDragStart(index, color, e)}
                @dragend=${this.handleDragEnd}
              ></div>
              <button
                class="swatch-delete"
                @click=${(e: Event) => this.handleDeleteColor(e, index)}
                title="Remove from palette (move to untracked)"
              >
                ×
              </button>
            </div>
          `;
        })}
      </div>
    `;
  }
}
