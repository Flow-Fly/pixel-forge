import { html, css } from "lit";
import { customElement, state, property, query } from "lit/decorators.js";
import { BaseComponent } from "../../../core/base-component";
import {
  DeletePaletteColorCommand,
  type DeletePaletteColorReplacement,
} from "../../../commands/palette-command";
import { historyStore } from "../../../stores/history";
import { animationStore } from "../../../stores/animation";
import { colorStore } from "../../../stores/colors";
import { paletteStore } from "../../../stores/palette";
import { findClosestColorIndex } from "../../../stores/palette/indexed-color";

interface PendingDeleteColor {
  paletteIndex: number;
  color: string;
  pixelCount: number;
  frameCount: number;
  nearestColor: string | null;
}

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
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.035) inset;
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
      border-radius: var(--pf-radius-sm);
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
      box-shadow: var(--pf-shadow-glow-hover);
    }

    .palette-grid.replace-mode .swatch-delete {
      display: none;
    }

    .delete-dialog {
      width: min(320px, calc(100vw - 32px));
      padding: 16px;
      color: var(--pf-color-text-main);
      background: rgba(13, 16, 21, 0.98);
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-md);
      box-shadow: var(--pf-shadow-lg);
    }

    .delete-dialog::backdrop {
      background: rgba(0, 0, 0, 0.64);
      backdrop-filter: blur(4px);
    }

    .delete-dialog form {
      display: grid;
      gap: 12px;
    }

    .delete-dialog h2,
    .delete-dialog p {
      margin: 0;
    }

    .delete-dialog h2 {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .delete-dialog p {
      color: var(--pf-color-text-muted);
      font-size: 12px;
      line-height: 1.4;
    }

    .delete-actions {
      display: grid;
      gap: 8px;
    }

    .delete-actions button {
      min-height: 30px;
      padding: 6px 10px;
      color: var(--pf-color-text-main);
      background: var(--pf-color-bg);
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      cursor: pointer;
      text-align: left;
    }

    .delete-actions button:hover,
    .delete-actions button:focus-visible {
      border-color: var(--pf-color-accent);
    }

    .delete-actions button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .delete-actions .cancel {
      text-align: center;
    }
  `;

  @property({ type: Boolean }) replaceMode = false;
  @property({ type: String }) replaceColor: string | null = null;

  @state() private dragOverIndex: number | null = null;
  @state() private isDragging = false;
  @state() private draggedIndex: number | null = null;
  @state() private pendingDelete: PendingDeleteColor | null = null;

  @query(".delete-dialog") private deleteDialog?: HTMLDialogElement;

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

  private async handleDeleteColor(e: Event, index: number) {
    e.stopPropagation();
    const paletteIndex = index + 1;
    const usage = animationStore.scanPaletteIndexUsage(paletteIndex);

    if (usage.pixelCount === 0) {
      void historyStore.execute(
        new DeletePaletteColorCommand(paletteIndex, "transparent")
      );
      return;
    }

    this.pendingDelete = this.getPendingDeleteColor(
      index,
      usage.pixelCount,
      usage.frameIds.length
    );
    await this.updateComplete;

    if (this.deleteDialog && !this.deleteDialog.open) {
      this.deleteDialog.returnValue = "cancel";
      this.deleteDialog.showModal();
    }
  }

  private getPendingDeleteColor(
    index: number,
    pixelCount: number,
    frameCount: number
  ): PendingDeleteColor {
    const color = paletteStore.mainColors.value[index];
    const remainingColors = paletteStore.mainColors.value.filter(
      (_, colorIndex) => colorIndex !== index
    );
    const nearestIndex = remainingColors.length > 0
      ? findClosestColorIndex(color, remainingColors)
      : 0;

    return {
      paletteIndex: index + 1,
      color,
      pixelCount,
      frameCount,
      nearestColor: nearestIndex > 0 ? remainingColors[nearestIndex - 1] : null,
    };
  }

  private handleDeleteDialogClose() {
    const command = this.getDeleteDialogCommand(this.deleteDialog?.returnValue);
    this.pendingDelete = null;

    if (command) {
      void historyStore.execute(command);
    }
  }

  private getDeleteDialogCommand(choice: string | undefined) {
    const pendingDelete = this.pendingDelete;
    const replacement = this.getDeleteDialogReplacement(choice);

    if (!pendingDelete || !replacement) return null;

    return new DeletePaletteColorCommand(pendingDelete.paletteIndex, replacement);
  }

  private getDeleteDialogReplacement(choice: string | undefined): DeletePaletteColorReplacement | null {
    if (choice === "transparent") return "transparent";
    if (choice === "nearest" && this.pendingDelete?.nearestColor) return "nearest";
    return null;
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

    const fromIndex = this.getDroppedPaletteIndex(e);

    if (fromIndex !== null) {
      this.moveDroppedPaletteColor(fromIndex, targetIndex);
    } else {
      this.insertDroppedColor(e, targetIndex);
    }

    this.resetDragState();
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
    const paletteIndexStr = e.dataTransfer?.getData("application/x-palette-index");

    if (color && !paletteIndexStr) {
      paletteStore.addColor(color);
    }

    this.resetDragState();
  }

  private resetDragState() {
    this.isDragging = false;
    this.draggedIndex = null;
    this.dragOverIndex = null;
  }

  private getDroppedPaletteIndex(e: DragEvent): number | null {
    const value = e.dataTransfer?.getData("application/x-palette-index");
    if (!value) return null;

    return Number.parseInt(value, 10);
  }

  private moveDroppedPaletteColor(fromIndex: number, targetIndex: number) {
    if (fromIndex === targetIndex || fromIndex === targetIndex - 1) return;

    const adjustedTarget = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
    paletteStore.moveColor(fromIndex, adjustedTarget);
  }

  private insertDroppedColor(e: DragEvent, targetIndex: number) {
    const color = e.dataTransfer?.getData("application/x-palette-color");
    if (color) {
      paletteStore.insertColorAt(targetIndex + 1, color);
    }
  }

  private renderSwatch(color: string, index: number, usedColors: Set<string>) {
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
          title="${this.getSwatchTitle(color, isUsed)}"
          draggable="${!this.replaceMode}"
          @click=${(e: Event) => this.handleSwatchClick(color, index, e)}
          @contextmenu=${(e: MouseEvent) => this.handleSwatchRightClick(e, color, index)}
          @dragstart=${(e: DragEvent) => this.handleDragStart(index, color, e)}
          @dragend=${this.handleDragEnd}
        ></div>
        <button
          class="swatch-delete"
          @click=${(e: Event) => this.handleDeleteColor(e, index)}
          title="Remove from palette"
          aria-label="Remove ${color} from palette"
        >
          ×
        </button>
      </div>
    `;
  }

  private getSwatchTitle(color: string, isUsed: boolean): string {
    const label = this.replaceMode ? `Click to replace with ${this.replaceColor}` : color;
    return isUsed ? `${label} (in use)` : label;
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
        ${colors.map((color, index) => this.renderSwatch(color, index, usedColors))}
      </div>
      ${this.renderDeleteDialog()}
    `;
  }

  private renderDeleteDialog() {
    const pendingDelete = this.pendingDelete ?? {
      paletteIndex: 0,
      color: "",
      pixelCount: 0,
      frameCount: 0,
      nearestColor: null,
    };
    const nearestLabel = pendingDelete.nearestColor
      ? `Replace with nearest palette color (${pendingDelete.nearestColor})`
      : "Replace with nearest palette color";

    return html`
      <dialog
        class="delete-dialog"
        aria-labelledby="delete-color-title"
        aria-describedby="delete-color-summary"
        @close=${this.handleDeleteDialogClose}
      >
        <form method="dialog">
          <h2 id="delete-color-title">Delete palette color</h2>
          <p id="delete-color-summary">
            Used in ${pendingDelete.pixelCount} pixels across
            ${pendingDelete.frameCount} frames.
          </p>
          <div class="delete-actions">
            <button
              value="nearest"
              ?disabled=${!pendingDelete.nearestColor}
            >
              ${nearestLabel}
            </button>
            <button value="transparent">Replace with transparency</button>
            <button class="cancel" value="cancel">Cancel</button>
          </div>
        </form>
      </dialog>
    `;
  }
}
