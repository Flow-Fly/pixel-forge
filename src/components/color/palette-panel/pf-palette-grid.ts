import { html, css } from "lit";
import { customElement, state, property } from "lit/decorators.js";
import { BaseComponent } from "../../../core/base-component";
import { colorStore } from "../../../stores/colors";
import { paletteStore } from "../../../stores/palette";
import type { DisplayColor } from "../../../stores/palette";

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

    /* Usage indicator - solid dot for current frame */
    .swatch-used-current::after {
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

    /* Usage indicator - hollow dot for other frames only */
    .swatch-used-other::after {
      content: "";
      position: absolute;
      bottom: 1px;
      right: 1px;
      width: 7px;
      height: 7px;
      background: transparent;
      border: 1px solid white;
      border-radius: 50%;
      box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
      pointer-events: none;
      box-sizing: border-box;
    }

    /* Foreground color indicator - corner triangle top-left */
    .indicator-fg {
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 10px 10px 0 0;
      border-color: var(--pf-color-accent, #4a9eff) transparent transparent transparent;
      filter: drop-shadow(1px 1px 0 rgba(0, 0, 0, 0.7));
      pointer-events: none;
      z-index: 5;
    }

    /* Background color indicator - corner triangle bottom-right */
    .indicator-bg {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 0 0 10px 10px;
      border-color: transparent transparent var(--pf-color-accent, #4a9eff) transparent;
      filter: drop-shadow(-1px -1px 0 rgba(0, 0, 0, 0.7));
      pointer-events: none;
      z-index: 5;
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

    /* Drag modifier mode indicators */
    .palette-grid.drag-copy .swatch-container.drag-before::before {
      background: var(--pf-color-ember-white, #fef3c7); /* Copy indicator */
    }

    .palette-grid.drag-swap .swatch-container.drag-before::before {
      background: var(--pf-color-ember-hot, #f97316); /* Swap indicator */
      width: 100%;
      left: 0;
      border-radius: 0;
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

    /* Uncommitted (ephemeral) swatch styles */
    .swatch-uncommitted {
      border: 1px dashed var(--pf-color-border, #444);
      box-sizing: border-box;
    }

    .swatch-uncommitted:hover {
      border-color: var(--pf-color-accent, #4a9eff);
    }

    /* Commit button (+) for uncommitted swatches */
    .swatch-commit {
      position: absolute;
      top: -4px;
      right: 10px;
      width: 14px;
      height: 14px;
      background: rgba(72, 187, 120, 0.9);
      border: 1px solid rgba(0, 0, 0, 0.3);
      border-radius: 50%;
      color: white;
      font-size: 12px;
      line-height: 12px;
      text-align: center;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.1s ease;
      z-index: 10;
      padding: 0;
    }

    .swatch-container:hover .swatch-commit {
      opacity: 1;
    }

    .swatch-commit:hover {
      background: #48bb78;
      transform: scale(1.1);
    }

    .swatch-commit:focus,
    .swatch-discard:focus {
      outline: 2px solid var(--pf-color-accent, #4a9eff);
      outline-offset: 1px;
      opacity: 1;
    }

    /* Discard button (x) for uncommitted swatches - reuses swatch-delete styling */
    .swatch-discard {
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

    .swatch-container:hover .swatch-discard {
      opacity: 1;
    }

    .swatch-discard:hover {
      background: #c53030;
      transform: scale(1.1);
    }

    /* Hue group visual separation - left border on first item of each group */
    .swatch-container.hue-group-start {
      position: relative;
    }

    .swatch-container.hue-group-start::before {
      content: "";
      position: absolute;
      left: -1px;
      top: 2px;
      bottom: 2px;
      width: 2px;
      background: var(--pf-color-accent, #4a9eff);
      border-radius: 1px;
      z-index: 5;
    }

  `;

  @property({ type: Boolean }) replaceMode = false;
  @property({ type: String }) replaceColor: string | null = null;

  @state() private dragOverIndex: number | null = null;
  @state() private isDragging = false;
  @state() private draggedIndex: number | null = null;
  @state() private dragModifier: 'move' | 'copy' | 'swap' = 'move';

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

  private handleSwatchRightClick(e: MouseEvent, color: string) {
    e.preventDefault();
    // Right-click selects as background color (standard pixel editor pattern)
    colorStore.setSecondaryColor(color);
  }

  private handleSwatchDoubleClick(e: MouseEvent, color: string, index: number) {
    e.preventDefault();
    // Double-click opens color editor
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

  private handleCommitColor(e: Event, color: string) {
    e.stopPropagation();
    paletteStore.promoteEphemeralColor(color);
  }

  private handleDiscardColor(e: Event, color: string) {
    e.stopPropagation();
    paletteStore.removeFromEphemeral(color);
  }

  private handleEphemeralRightClick(e: MouseEvent, color: string) {
    e.preventDefault();
    // Right-click on ephemeral = promote to main palette
    paletteStore.promoteEphemeralColor(color);
  }

  private handleButtonKeydown(e: KeyboardEvent, action: () => void) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  }

  // Drag-drop handlers
  private getModifierFromEvent(e: DragEvent | MouseEvent): 'move' | 'copy' | 'swap' {
    // Ctrl (or Cmd on Mac) = copy, Shift = swap, neither = move
    if (e.ctrlKey || e.metaKey) return 'copy';
    if (e.shiftKey) return 'swap';
    return 'move';
  }

  private handleDragStart(index: number, color: string, e: DragEvent) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copyMove";
      e.dataTransfer.setData("application/x-palette-index", String(index));
      e.dataTransfer.setData("application/x-palette-color", color);
    }
    this.isDragging = true;
    this.draggedIndex = index;
    this.dragModifier = this.getModifierFromEvent(e);
  }

  private resetDragState() {
    this.isDragging = false;
    this.draggedIndex = null;
    this.dragOverIndex = null;
    this.dragModifier = 'move';
  }

  private handleDragEnd() {
    this.resetDragState();
  }

  private handleDragOver(index: number, e: DragEvent) {
    e.preventDefault();
    const modifier = this.getModifierFromEvent(e);
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = modifier === 'copy' ? 'copy' : 'move';
    }
    if (this.dragOverIndex !== index) {
      this.dragOverIndex = index;
    }
    if (this.dragModifier !== modifier) {
      this.dragModifier = modifier;
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
    const modifier = this.getModifierFromEvent(e);

    if (paletteIndexStr !== undefined && paletteIndexStr !== "") {
      const fromIndex = parseInt(paletteIndexStr, 10);

      if (modifier === 'swap') {
        // Shift+drop: Swap positions directly
        if (fromIndex !== targetIndex) {
          paletteStore.swapColors(fromIndex, targetIndex);
        }
      } else if (modifier === 'copy') {
        // Ctrl+drop: Duplicate color at target position
        paletteStore.duplicateColor(fromIndex, targetIndex);
      } else {
        // Normal drop: Move color
        if (fromIndex !== targetIndex && fromIndex !== targetIndex - 1) {
          const adjustedTarget = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
          paletteStore.moveColor(fromIndex, adjustedTarget);
        }
      }
    } else if (color && isEphemeral) {
      paletteStore.removeFromEphemeral(color);
      paletteStore.insertColorAt(targetIndex + 1, color);
      window.dispatchEvent(new CustomEvent("palette-color-inserted", {
        detail: { insertedIndex: targetIndex + 1, color },
      }));
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
    const isEphemeral = e.dataTransfer?.getData("application/x-ephemeral-color") === "true";
    const paletteIndexStr = e.dataTransfer?.getData("application/x-palette-index");

    if (color && isEphemeral && !paletteIndexStr) {
      paletteStore.removeFromEphemeral(color);
      paletteStore.addColor(color);
    }

    this.resetDragState();
  }

  private normalizeColor(color: string): string {
    return color.toLowerCase();
  }

  private getUsageClass(normalizedColor: string): string {
    const usedInCurrent = paletteStore.usedColorsInCurrentFrame.value.has(normalizedColor);
    const usedInOther = paletteStore.usedColorsInOtherFrames.value.has(normalizedColor);

    if (usedInCurrent) {
      return "swatch-used-current";
    } else if (usedInOther) {
      return "swatch-used-other";
    }
    return "";
  }

  private getUsageTitle(normalizedColor: string): string {
    const usedInCurrent = paletteStore.usedColorsInCurrentFrame.value.has(normalizedColor);
    const usedInOther = paletteStore.usedColorsInOtherFrames.value.has(normalizedColor);

    if (usedInCurrent && usedInOther) {
      return " (used in current + other frames)";
    } else if (usedInCurrent) {
      return " (used in current frame)";
    } else if (usedInOther) {
      return " (used in other frames)";
    }
    return "";
  }

  private renderSwatch(displayColor: DisplayColor, visualIndex: number) {
    const { color, isEphemeral, originalIndex, groupStart, hueFamily } = displayColor;
    const normalizedColor = this.normalizeColor(color);
    const usageClass = this.getUsageClass(normalizedColor);
    const usageTitle = this.getUsageTitle(normalizedColor);
    const fgColor = this.normalizeColor(colorStore.primaryColor.value);
    const bgColor = this.normalizeColor(colorStore.secondaryColor.value);
    const isFg = normalizedColor === fgColor;
    const isBg = normalizedColor === bgColor;

    // Build container classes
    const containerClasses = [
      "swatch-container",
      this.dragOverIndex === visualIndex ? "drag-before" : "",
      this.draggedIndex === visualIndex ? "dragging" : "",
      groupStart ? "hue-group-start" : "",
    ].filter(Boolean).join(" ");

    // Build swatch classes
    const swatchClasses = [
      "swatch",
      usageClass,
      isEphemeral ? "swatch-uncommitted" : "",
    ].filter(Boolean).join(" ");

    // Build title
    const title = isEphemeral
      ? `${color} (uncommitted) - Click + to add to palette${usageTitle}`
      : `${this.replaceMode ? `Click to replace with ${this.replaceColor}` : color}${usageTitle}${isFg ? " (FG)" : ""}${isBg ? " (BG)" : ""}`;

    return html`
      <div
        class="${containerClasses}"
        @dragover=${(e: DragEvent) => this.handleDragOver(visualIndex, e)}
        @dragleave=${this.handleDragLeave}
        @drop=${(e: DragEvent) => this.handleDrop(visualIndex, e)}
      >
        <div
          class="${swatchClasses}"
          style="background-color: ${color}"
          title="${title}"
          draggable="${!this.replaceMode}"
          @click=${(e: Event) => isEphemeral
            ? this.selectColor(color)
            : this.handleSwatchClick(color, originalIndex, e)}
          @dblclick=${(e: MouseEvent) => isEphemeral
            ? null
            : this.handleSwatchDoubleClick(e, color, originalIndex)}
          @contextmenu=${(e: MouseEvent) => isEphemeral
            ? this.handleEphemeralRightClick(e, color)
            : this.handleSwatchRightClick(e, color)}
          @dragstart=${(e: DragEvent) => this.handleSwatchDragStart(displayColor, visualIndex, e)}
          @dragend=${this.handleDragEnd}
        >
          ${isFg ? html`<span class="indicator-fg"></span>` : ""}
          ${isBg ? html`<span class="indicator-bg"></span>` : ""}
        </div>
        ${isEphemeral ? html`
          <button
            class="swatch-commit"
            tabindex="0"
            @click=${(e: Event) => this.handleCommitColor(e, color)}
            @keydown=${(e: KeyboardEvent) => this.handleButtonKeydown(e, () => paletteStore.promoteEphemeralColor(color))}
            title="Add to palette"
          >
            +
          </button>
          <button
            class="swatch-discard"
            tabindex="0"
            @click=${(e: Event) => this.handleDiscardColor(e, color)}
            @keydown=${(e: KeyboardEvent) => this.handleButtonKeydown(e, () => paletteStore.removeFromEphemeral(color))}
            title="Discard"
          >
            ×
          </button>
        ` : html`
          <button
            class="swatch-delete"
            @click=${(e: Event) => this.handleDeleteColor(e, originalIndex)}
            title="Remove from palette (move to untracked)"
          >
            ×
          </button>
        `}
      </div>
    `;
  }

  private handleSwatchDragStart(displayColor: DisplayColor, visualIndex: number, e: DragEvent) {
    const { color, isEphemeral, originalIndex } = displayColor;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copyMove";
      if (!isEphemeral) {
        e.dataTransfer.setData("application/x-palette-index", String(originalIndex));
      }
      e.dataTransfer.setData("application/x-palette-color", color);
      e.dataTransfer.setData("application/x-ephemeral-color", String(isEphemeral));
    }
    this.isDragging = true;
    this.draggedIndex = visualIndex;
    this.dragModifier = this.getModifierFromEvent(e);
  }

  render() {
    const displayColors = paletteStore.displayColors.value;
    const dragModeClass = this.isDragging && this.dragModifier !== 'move' ? `drag-${this.dragModifier}` : '';

    return html`
      <div
        class="palette-grid ${this.isDragging || this.dragOverIndex !== null ? "drag-active" : ""} ${this.replaceMode ? "replace-mode" : ""} ${dragModeClass}"
        @dragover=${this.handleGridDragOver}
        @drop=${this.handleGridDrop}
      >
        ${displayColors.map((displayColor, visualIndex) =>
          this.renderSwatch(displayColor, visualIndex)
        )}
      </div>
    `;
  }
}
