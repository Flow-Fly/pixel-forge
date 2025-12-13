import { html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { colorStore } from '../../stores/colors';
import { paletteStore } from '../../stores/palette';
import './pf-lightness-subpalette';
import '../ui/pf-popover';

@customElement('pf-palette-panel')
export class PFPalettePanel extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      padding: var(--pf-spacing-2);
    }

    .toolbar {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      gap: 6px;
    }

    .add-btn {
      width: 28px;
      height: 28px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .add-btn:hover {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-accent, #4a9eff);
    }

    .toolbar-btn {
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      font-size: 10px;
      padding: 4px 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .toolbar-btn:hover {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    /* Popover form styles */
    .add-color-form {
      min-width: 140px;
    }

    .form-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
    }

    .hex-input {
      flex: 1;
      min-width: 0;
      padding: 4px 6px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 11px;
      font-family: monospace;
    }

    .hex-input:focus {
      outline: none;
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .hex-input.invalid {
      border-color: var(--pf-color-accent-red, #e53935);
    }

    .add-hex-btn {
      background: var(--pf-color-accent, #4a9eff);
      border: none;
      border-radius: 3px;
      color: white;
      font-size: 10px;
      padding: 4px 8px;
      cursor: pointer;
    }

    .add-hex-btn:hover {
      opacity: 0.9;
    }

    .divider {
      height: 1px;
      background: var(--pf-color-border, #333);
      margin: 6px 0;
    }

    .native-picker {
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      cursor: pointer;
      background: none;
    }

    .native-picker::-webkit-color-swatch-wrapper {
      padding: 2px;
    }

    .native-picker::-webkit-color-swatch {
      border: none;
      border-radius: 2px;
    }

    .picker-label {
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
    }

    /* Palette grid styles */
    .palette-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 1px;
      background-color: var(--pf-color-border);
      border: 1px solid var(--pf-color-border);
    }

    .swatch {
      aspect-ratio: 1;
      cursor: grab;
      position: relative;
      transition: transform 0.1s ease, opacity 0.1s ease;
    }

    .swatch:hover {
      transform: scale(1.1);
      z-index: 1;
      box-shadow: 0 0 4px rgba(0,0,0,0.5);
    }

    .swatch.dragging {
      opacity: 0.4;
      cursor: grabbing;
    }

    .swatch.insert-before::before,
    .swatch.insert-after::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--pf-color-accent, #4a9eff);
      z-index: 10;
    }

    .swatch.insert-before::before {
      left: -2px;
    }

    .swatch.insert-after::after {
      right: -2px;
    }


    /* Extraction section styles */
    .extraction-section {
      margin-top: 12px;
      border-top: 1px solid var(--pf-color-border, #333);
      padding-top: 8px;
    }

    .extraction-header {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
      padding: 4px 0;
      user-select: none;
    }

    .extraction-header:hover {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .chevron {
      transition: transform 0.2s ease;
      font-size: 10px;
    }

    .chevron.collapsed {
      transform: rotate(-90deg);
    }

    .extraction-content {
      padding: 8px 0;
    }

    .extract-btn {
      width: 100%;
      padding: 6px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      cursor: pointer;
      font-size: 11px;
      transition: all 0.15s ease;
    }

    .extract-btn:hover:not(:disabled) {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .extract-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .extracted-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 2px;
      margin: 8px 0;
      padding: 4px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border-radius: 3px;
    }

    .extracted-swatch {
      aspect-ratio: 1;
      cursor: pointer;
      border-radius: 2px;
      transition: transform 0.1s ease;
    }

    .extracted-swatch:hover {
      transform: scale(1.15);
      z-index: 1;
    }

    .extraction-actions {
      display: flex;
      gap: 6px;
    }

    .extraction-actions .action-btn {
      flex: 1;
      padding: 4px 8px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      font-size: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .extraction-actions .action-btn:hover {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .no-colors-msg {
      font-size: 10px;
      color: var(--pf-color-text-muted, #808080);
      text-align: center;
      padding: 8px;
    }
  `;

  @state() private lightnessTarget: { color: string; x: number; y: number } | null = null;
  @state() private hexInput = '';
  @state() private hexInvalid = false;
  @state() private showAddPopover = false;
  @state() private extractionExpanded = false;
  @state() private addBtnRect: DOMRect | null = null;

  // Drag and drop state
  @state() private draggedIndex: number | null = null;
  @state() private dragOverIndex: number | null = null;
  @state() private insertPosition: 'before' | 'after' | null = null;

  @query('.add-btn') private addButton!: HTMLButtonElement;

  private selectColor(color: string) {
    colorStore.setPrimaryColor(color);
    colorStore.updateLightnessVariations(color);
  }

  private handleSwatchRightClick(e: MouseEvent, color: string) {
    e.preventDefault();
    this.lightnessTarget = {
      color,
      x: e.clientX,
      y: e.clientY
    };
  }

  private closeLightnessSubpalette() {
    this.lightnessTarget = null;
  }

  private resetPalette() {
    paletteStore.resetToDefault();
  }

  // ==========================================
  // Add Color Popover Methods
  // ==========================================

  private toggleAddPopover(e: Event) {
    e.stopPropagation();
    if (!this.showAddPopover) {
      this.addBtnRect = this.addButton.getBoundingClientRect();
    }
    this.showAddPopover = !this.showAddPopover;
  }

  private closeAddPopover() {
    this.showAddPopover = false;
    this.hexInput = '';
    this.hexInvalid = false;
  }

  private handleHexInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this.hexInput = value;
    this.hexInvalid = false;
  }

  private handleHexKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.addHexColor();
    }
  }

  private addHexColor() {
    let hex = this.hexInput.trim();

    // Add # if missing
    if (hex && !hex.startsWith('#')) {
      hex = '#' + hex;
    }

    // Validate hex format
    if (!/^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(hex)) {
      this.hexInvalid = true;
      return;
    }

    // Expand 3-char hex to 6-char
    if (hex.length === 4) {
      hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }

    paletteStore.addColor(hex.toLowerCase());
    this.hexInput = '';
    this.hexInvalid = false;
  }

  private handleColorPicker(e: Event) {
    const color = (e.target as HTMLInputElement).value;
    paletteStore.addColor(color);
  }

  // ==========================================
  // Drag and Drop Methods
  // ==========================================

  private handleDragStart(index: number, e: DragEvent) {
    this.draggedIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }

  private handleDragEnd() {
    this.draggedIndex = null;
    this.dragOverIndex = null;
    this.insertPosition = null;
  }

  private handleDragOver(index: number, e: DragEvent) {
    e.preventDefault();
    if (this.draggedIndex !== null && this.draggedIndex !== index) {
      this.dragOverIndex = index;

      // Determine if we're on the left or right half of the swatch
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      this.insertPosition = e.clientX < midpoint ? 'before' : 'after';
    }
  }

  private handleDragLeave() {
    this.dragOverIndex = null;
    this.insertPosition = null;
  }

  private handleDrop(targetIndex: number, e: DragEvent) {
    e.preventDefault();

    // Check if this is an extracted color being dropped
    const extractedColor = e.dataTransfer?.getData('application/x-palette-color');
    if (extractedColor) {
      paletteStore.addExtractedColor(extractedColor);
      return;
    }

    // Otherwise handle palette reordering
    if (this.draggedIndex === null || this.draggedIndex === targetIndex) return;

    // Calculate the actual insert index based on position
    let insertIndex = targetIndex;
    if (this.insertPosition === 'after') {
      insertIndex = targetIndex + 1;
    }

    // Adjust if dragging from before the target
    if (this.draggedIndex < insertIndex) {
      insertIndex--;
    }

    paletteStore.moveColor(this.draggedIndex, insertIndex);
    this.draggedIndex = null;
    this.dragOverIndex = null;
    this.insertPosition = null;
  }

  // Handle drops on the grid itself (for extracted colors)
  private handleGridDrop(e: DragEvent) {
    e.preventDefault();
    const extractedColor = e.dataTransfer?.getData('application/x-palette-color');
    if (extractedColor) {
      paletteStore.addExtractedColor(extractedColor);
    }
  }

  private handleGridDragOver(e: DragEvent) {
    e.preventDefault();
  }

  // ==========================================
  // Extraction Methods
  // ==========================================

  private toggleExtraction() {
    this.extractionExpanded = !this.extractionExpanded;
  }

  private async handleExtract() {
    await paletteStore.extractFromDrawing();
  }

  private handleExtractedClick(color: string) {
    paletteStore.addExtractedColor(color);
  }

  private handleExtractedDragStart(color: string, e: DragEvent) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/x-palette-color', color);
    }
  }

  private addAllExtracted() {
    paletteStore.addAllExtracted();
  }

  private replaceWithExtracted() {
    paletteStore.replaceWithExtracted();
  }

  render() {
    const colors = paletteStore.colors.value;
    const extractedColors = paletteStore.extractedColors.value;
    const isExtracting = paletteStore.isExtracting.value;

    return html`
      <div class="toolbar">
        <button
          class="add-btn"
          @click=${(e: Event) => this.toggleAddPopover(e)}
          title="Add color"
        >+</button>
        <button
          class="toolbar-btn"
          @click=${this.resetPalette}
          title="Reset to default DB32 palette"
        >
          Reset
        </button>
      </div>

      <pf-popover
        ?open=${this.showAddPopover}
        position="bottom"
        .anchorRect=${this.addBtnRect}
        @close=${this.closeAddPopover}
      >
        <div class="add-color-form">
          <div class="form-row">
            <input
              type="text"
              class="hex-input ${this.hexInvalid ? 'invalid' : ''}"
              placeholder="#hex"
              .value=${this.hexInput}
              @input=${this.handleHexInput}
              @keydown=${this.handleHexKeydown}
            />
            <button class="add-hex-btn" @click=${this.addHexColor}>Add</button>
          </div>
          <div class="divider"></div>
          <div class="form-row">
            <input
              type="color"
              class="native-picker"
              @change=${this.handleColorPicker}
            />
            <span class="picker-label">Pick color</span>
          </div>
        </div>
      </pf-popover>

      <div
        class="palette-grid"
        @dragover=${this.handleGridDragOver}
        @drop=${this.handleGridDrop}
      >
        ${colors.map((color, index) => {
          const isDragging = this.draggedIndex === index;
          const isDropTarget = this.dragOverIndex === index;
          const insertClass = isDropTarget && this.insertPosition ? `insert-${this.insertPosition}` : '';
          return html`
            <div
              class="swatch ${isDragging ? 'dragging' : ''} ${insertClass}"
              style="background-color: ${color}"
              title="${color} - Right-click for variations"
              draggable="true"
              @dragstart=${(e: DragEvent) => this.handleDragStart(index, e)}
              @dragend=${this.handleDragEnd}
              @dragover=${(e: DragEvent) => this.handleDragOver(index, e)}
              @dragleave=${this.handleDragLeave}
              @drop=${(e: DragEvent) => this.handleDrop(index, e)}
              @click=${() => this.selectColor(color)}
              @contextmenu=${(e: MouseEvent) => this.handleSwatchRightClick(e, color)}
            ></div>
          `;
        })}
      </div>

      <div class="extraction-section">
        <div
          class="extraction-header"
          @click=${this.toggleExtraction}
        >
          <span class="chevron ${this.extractionExpanded ? '' : 'collapsed'}">▼</span>
          <span>Extract from Drawing</span>
        </div>
        ${this.extractionExpanded ? html`
          <div class="extraction-content">
            <button
              class="extract-btn"
              @click=${this.handleExtract}
              ?disabled=${isExtracting}
            >
              ${isExtracting ? 'Extracting...' : 'Extract Colors'}
            </button>

            ${extractedColors.length > 0 ? html`
              <div class="extracted-grid">
                ${extractedColors.map(color => html`
                  <div
                    class="extracted-swatch"
                    style="background-color: ${color}"
                    draggable="true"
                    @dragstart=${(e: DragEvent) => this.handleExtractedDragStart(color, e)}
                    @click=${() => this.handleExtractedClick(color)}
                    title="${color} - Click to add, drag to palette"
                  ></div>
                `)}
              </div>
              <div class="extraction-actions">
                <button class="action-btn" @click=${this.addAllExtracted}>Add All</button>
                <button class="action-btn" @click=${this.replaceWithExtracted}>Replace All</button>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>

      ${this.lightnessTarget ? html`
        <pf-lightness-subpalette
          .color=${this.lightnessTarget.color}
          .x=${this.lightnessTarget.x}
          .y=${this.lightnessTarget.y}
          @close=${this.closeLightnessSubpalette}
        ></pf-lightness-subpalette>
      ` : ''}
    `;
  }
}
