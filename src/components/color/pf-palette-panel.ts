import { html, css, nothing } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { colorStore } from "../../stores/colors";
import { paletteStore } from "../../stores/palette";
import { historyStore } from "../../stores/history";
import { PaletteChangeCommand } from "../../commands/palette-command";
import "../ui/pf-popover";
import "../ui/pf-button";
import "./pf-color-picker-popup";
import "./pf-palette-selector";
import "./pf-save-palette-dialog";
import "./pf-unsaved-changes-dialog";

@customElement("pf-palette-panel")
export class PFPalettePanel extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      padding: var(--pf-spacing-2);
    }

    .toolbar {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      gap: 6px;
    }

    .toolbar pf-palette-selector {
      flex: 1;
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

    /* Save button with dirty indicator */
    .save-btn {
      position: relative;
      width: 28px;
      height: 28px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .save-btn:hover {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-accent, #4a9eff);
    }

    .save-btn.dirty::after {
      content: "";
      position: absolute;
      top: 4px;
      right: 4px;
      width: 6px;
      height: 6px;
      background: var(--pf-color-accent, #4a9eff);
      border-radius: 50%;
    }

    /* Menu button */
    .menu-btn {
      width: 28px;
      height: 28px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .menu-btn:hover {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    /* Menu popover */
    .menu-content {
      min-width: 140px;
    }

    .menu-item {
      padding: 8px 12px;
      font-size: 11px;
      color: var(--pf-color-text-main, #e0e0e0);
      cursor: pointer;
      transition: background 0.1s ease;
    }

    .menu-item:hover:not(.disabled) {
      background: var(--pf-color-bg-surface, #1e1e1e);
    }

    .menu-item.disabled {
      color: var(--pf-color-text-muted, #808080);
      opacity: 0.5;
      cursor: not-allowed;
    }

    .menu-divider {
      height: 1px;
      background: var(--pf-color-border, #333);
      margin: 4px 0;
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

    /* Usage indicator - small dot in corner for colors in use */
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

    .no-colors-msg {
      font-size: 10px;
      color: var(--pf-color-text-muted, #808080);
      text-align: center;
      padding: 8px;
    }

    /* Untracked colors section */
    .untracked-section {
      margin-top: 12px;
      border-top: 1px solid var(--pf-color-border, #333);
      padding-top: 8px;
    }

    .untracked-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .untracked-title {
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
    }

    .untracked-count {
      color: var(--pf-color-accent-cyan, #00e5ff);
    }

    .untracked-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 2px;
      padding: 4px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border-radius: 3px;
      margin-bottom: 6px;
    }

    .untracked-swatch {
      aspect-ratio: 1;
      cursor: pointer;
      border-radius: 2px;
      transition: transform 0.1s ease;
      border: 1px dashed var(--pf-color-border, #444);
    }

    .untracked-swatch:hover {
      transform: scale(1.15);
      z-index: 1;
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .untracked-swatch.selected {
      border: 2px solid var(--pf-color-accent, #4a9eff);
      box-shadow: 0 0 6px rgba(74, 158, 255, 0.5);
    }

    /* Replace mode wiggle animation */
    @keyframes wiggle {
      0%,
      100% {
        transform: rotate(-2deg);
      }
      50% {
        transform: rotate(2deg);
      }
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

    /* Replace mode button */
    .replace-btn {
      padding: 6px 10px;
      background: var(--pf-color-accent, #4a9eff);
      border: none;
      border-radius: 3px;
      color: white;
      font-size: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .replace-btn:hover {
      opacity: 0.9;
    }

    .replace-btn.cancel {
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      color: var(--pf-color-text-muted, #808080);
    }

    .replace-btn.cancel:hover {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .untracked-actions {
      display: flex;
      gap: 6px;
    }
  `;

  @state() private hexInput = "";
  @state() private hexInvalid = false;
  @state() private showAddPopover = false;
  @state() private extractionExpanded = false;
  @state() private addBtnRect: DOMRect | null = null;

  // Color picker popup state
  @state() private showColorPicker = false;
  @state() private editingColor = "";
  @state() private editingIndex = 0;
  @state() private anchorElement: HTMLElement | null = null;

  // Menu popover state
  @state() private showMenuPopover = false;
  @state() private menuBtnRect: DOMRect | null = null;

  // Save dialog state
  @state() private showSaveDialog = false;
  @state() private saveDialogTitle = "Save Palette";
  @state() private saveDialogDefaultName = "";
  @state() private isRenaming = false;

  // Unsaved changes dialog state
  @state() private showUnsavedDialog = false;
  @state() private pendingSwitchAction: (() => void) | null = null;

  // Drag-drop state
  @state() private dragOverIndex: number | null = null;
  @state() private isDraggingPaletteColor: boolean = false;
  @state() private draggedPaletteIndex: number | null = null;

  // Replace mode state
  @state() private selectedUntrackedColor: string | null = null;
  @state() private isReplaceMode: boolean = false;

  @query(".add-btn") private addButton!: HTMLButtonElement;
  @query(".menu-btn") private menuButton!: HTMLButtonElement;

  private selectColor(color: string) {
    colorStore.setPrimaryColor(color);
    colorStore.updateLightnessVariations(color);
  }

  private handleSwatchRightClick(e: MouseEvent, color: string, index: number) {
    e.preventDefault();
    this.editingColor = color;
    this.editingIndex = index;
    this.anchorElement = e.currentTarget as HTMLElement;
    this.showColorPicker = true;
  }

  private handleColorPickerApply(e: CustomEvent) {
    const { color, paletteIndex } = e.detail;
    // paletteIndex is 0-based array index
    const oneBasedIndex = paletteIndex + 1;
    const previousColor = paletteStore.getColorByIndex(oneBasedIndex);

    if (previousColor && previousColor !== color) {
      // Create and execute command for undo/redo support
      const command = new PaletteChangeCommand(
        oneBasedIndex,
        previousColor,
        color
      );
      historyStore.execute(command);
    }

    this.showColorPicker = false;
  }

  private handleColorPickerCancel() {
    this.showColorPicker = false;
  }

  private handleDeleteColor(e: Event, arrayIndex: number) {
    e.stopPropagation(); // Prevent selecting the color
    paletteStore.removeColorToEphemeral(arrayIndex);
  }

  // ==========================================
  // Drag-Drop Methods
  // ==========================================

  private handlePaletteSwatchDragStart(
    index: number,
    color: string,
    e: DragEvent
  ) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-palette-index", String(index));
      e.dataTransfer.setData("application/x-palette-color", color);
    }
    this.isDraggingPaletteColor = true;
    this.draggedPaletteIndex = index;
  }

  private handlePaletteSwatchDragEnd() {
    this.isDraggingPaletteColor = false;
    this.draggedPaletteIndex = null;
    this.dragOverIndex = null;
  }

  private handlePaletteDragOver(index: number, e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    // Only update if changed (prevents flickering)
    if (this.dragOverIndex !== index) {
      this.dragOverIndex = index;
    }
  }

  private handlePaletteDragLeave() {
    this.dragOverIndex = null;
  }

  private handlePaletteDrop(targetIndex: number, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    const paletteIndexStr = e.dataTransfer?.getData(
      "application/x-palette-index"
    );
    const color = e.dataTransfer?.getData("application/x-palette-color");
    const isEphemeral =
      e.dataTransfer?.getData("application/x-ephemeral-color") === "true";

    if (paletteIndexStr !== undefined && paletteIndexStr !== "") {
      // Reordering within palette
      const fromIndex = parseInt(paletteIndexStr, 10);
      if (fromIndex !== targetIndex && fromIndex !== targetIndex - 1) {
        // Adjust target if moving forward (since we're inserting, not swapping)
        const adjustedTarget =
          fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
        paletteStore.moveColor(fromIndex, adjustedTarget);
      }
    } else if (color && isEphemeral) {
      // Inserting from untracked/ephemeral
      paletteStore.removeFromEphemeral(color);
      // Insert at targetIndex (1-based for insertColorAt)
      paletteStore.insertColorAt(targetIndex + 1, color);
      // Dispatch event for index buffer update
      window.dispatchEvent(
        new CustomEvent("palette-color-inserted", {
          detail: { insertedIndex: targetIndex + 1, color },
        })
      );
    }

    // Clean up drag state
    this.isDraggingPaletteColor = false;
    this.draggedPaletteIndex = null;
    this.dragOverIndex = null;
  }

  private handlePaletteGridDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  }

  private handlePaletteGridDrop(e: DragEvent) {
    e.preventDefault();
    const color = e.dataTransfer?.getData("application/x-palette-color");
    const isEphemeral =
      e.dataTransfer?.getData("application/x-ephemeral-color") === "true";
    const paletteIndexStr = e.dataTransfer?.getData(
      "application/x-palette-index"
    );

    // Only handle if dropping on the grid itself (not on a swatch)
    // and it's from ephemeral (insert at end)
    if (color && isEphemeral && !paletteIndexStr) {
      paletteStore.removeFromEphemeral(color);
      paletteStore.addColor(color);
    }

    // Clean up
    this.isDraggingPaletteColor = false;
    this.draggedPaletteIndex = null;
    this.dragOverIndex = null;
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
    this.hexInput = "";
    this.hexInvalid = false;
  }

  private handleHexInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this.hexInput = value;
    this.hexInvalid = false;
  }

  private handleHexKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      this.addHexColor();
    }
  }

  private addHexColor() {
    let hex = this.hexInput.trim();

    // Add # if missing
    if (hex && !hex.startsWith("#")) {
      hex = "#" + hex;
    }

    // Validate hex format
    if (!/^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(hex)) {
      this.hexInvalid = true;
      return;
    }

    // Expand 3-char hex to 6-char
    if (hex.length === 4) {
      hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }

    paletteStore.addColor(hex.toLowerCase());
    this.hexInput = "";
    this.hexInvalid = false;
  }

  private handleColorPicker(e: Event) {
    const color = (e.target as HTMLInputElement).value;
    paletteStore.addColor(color);
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
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("application/x-palette-color", color);
    }
  }

  private addAllExtracted() {
    paletteStore.addAllExtracted();
  }

  private replaceWithExtracted() {
    paletteStore.replaceWithExtracted();
  }

  // ==========================================
  // Untracked Colors Methods
  // ==========================================

  private selectUntrackedColor(color: string) {
    // Toggle selection
    if (this.selectedUntrackedColor === color) {
      this.selectedUntrackedColor = null;
      this.isReplaceMode = false;
    } else {
      this.selectedUntrackedColor = color;
      // Cancel replace mode when selecting a different color
      this.isReplaceMode = false;
    }

    // Also select as foreground
    colorStore.setPrimaryColorFromShade(color);
    colorStore.updateLightnessVariations(color);
  }

  private handleUntrackedRightClick(e: MouseEvent, color: string) {
    e.preventDefault();
    // Promote to main palette
    paletteStore.promoteEphemeralColor(color);
    // Clear selection if this was the selected color
    if (this.selectedUntrackedColor === color) {
      this.selectedUntrackedColor = null;
      this.isReplaceMode = false;
    }
  }

  private enterReplaceMode() {
    if (this.selectedUntrackedColor) {
      this.isReplaceMode = true;
    }
  }

  private cancelReplaceMode() {
    this.isReplaceMode = false;
  }

  private handleReplaceTarget(targetIndex: number, e: Event) {
    e.stopPropagation();
    if (!this.isReplaceMode || !this.selectedUntrackedColor) return;

    // Perform the swap
    paletteStore.swapMainWithEphemeral(
      targetIndex,
      this.selectedUntrackedColor
    );

    // Exit replace mode and clear selection
    this.isReplaceMode = false;
    this.selectedUntrackedColor = null;
  }

  private handleUntrackedDragStart(color: string, e: DragEvent) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("application/x-palette-color", color);
      e.dataTransfer.setData("application/x-ephemeral-color", "true");
    }
  }

  private promoteAllUntracked() {
    paletteStore.promoteAllEphemeralColors();
  }

  private clearUntracked() {
    paletteStore.clearEphemeralColors();
  }

  // ==========================================
  // Save Button & Menu Methods
  // ==========================================

  private async handleSaveClick() {
    const isCustom = paletteStore.isCustomPalette();

    if (isCustom) {
      // Save directly to existing custom palette
      await paletteStore.saveCurrentPalette();
    } else {
      // Open Save As dialog for presets or unsaved palettes
      this.openSaveAsDialog();
    }
  }

  private openSaveAsDialog() {
    this.saveDialogTitle = "Save Palette";
    this.saveDialogDefaultName = paletteStore.getCurrentPaletteName();
    if (this.saveDialogDefaultName === "Untitled Palette") {
      this.saveDialogDefaultName = "";
    }
    this.isRenaming = false;
    this.showSaveDialog = true;
  }

  private openRenameDialog() {
    this.saveDialogTitle = "Rename Palette";
    this.saveDialogDefaultName = paletteStore.getCurrentPaletteName();
    this.isRenaming = true;
    this.showSaveDialog = true;
    this.closeMenu();
  }

  private async handleSaveDialogSave(e: CustomEvent) {
    const { name } = e.detail;

    if (this.isRenaming) {
      // Rename existing custom palette
      const customId = paletteStore.currentCustomPaletteId.value;
      if (customId) {
        await paletteStore.renameCustomPalette(customId, name);
      }
    } else {
      // Save as new custom palette
      await paletteStore.saveAsNewPalette(name);
    }

    this.showSaveDialog = false;
  }

  private handleSaveDialogCancel() {
    this.showSaveDialog = false;
  }

  private toggleMenu(e: Event) {
    e.stopPropagation();
    if (!this.showMenuPopover) {
      this.menuBtnRect = this.menuButton.getBoundingClientRect();
    }
    this.showMenuPopover = !this.showMenuPopover;
  }

  private closeMenu() {
    this.showMenuPopover = false;
  }

  private handleMenuSaveAs() {
    this.openSaveAsDialog();
    this.closeMenu();
  }

  private handleMenuRename() {
    if (paletteStore.isCustomPalette()) {
      this.openRenameDialog();
    }
  }

  private handleMenuReset() {
    if (paletteStore.isPresetPalette() && paletteStore.isDirty.value) {
      paletteStore.resetPresetToOriginal();
      this.closeMenu();
    }
  }

  // ==========================================
  // Unsaved Changes Dialog Methods
  // ==========================================

  private handleRequestSwitch(e: CustomEvent) {
    const { type, id } = e.detail;

    // Create the switch action
    let switchAction: () => void;
    switch (type) {
      case "preset":
        switchAction = () => paletteStore.loadPreset(id);
        break;
      case "custom":
        switchAction = () => paletteStore.loadCustomPalette(id);
        break;
      case "empty":
        switchAction = () => paletteStore.createEmpty();
        break;
      default:
        return;
    }

    // Show unsaved changes dialog
    this.pendingSwitchAction = switchAction;
    this.showUnsavedDialog = true;
  }

  private async handleUnsavedSave() {
    // Save first, then perform pending action
    const isCustom = paletteStore.isCustomPalette();

    if (isCustom) {
      await paletteStore.saveCurrentPalette();
      this.showUnsavedDialog = false;
      if (this.pendingSwitchAction) {
        this.pendingSwitchAction();
        this.pendingSwitchAction = null;
      }
    } else {
      // Need to show Save As dialog
      this.showUnsavedDialog = false;
      this.openSaveAsDialog();
      // Note: pending action will be lost here, but that's acceptable UX
    }
  }

  private handleUnsavedDiscard() {
    this.showUnsavedDialog = false;
    if (this.pendingSwitchAction) {
      this.pendingSwitchAction();
      this.pendingSwitchAction = null;
    }
  }

  private handleUnsavedCancel() {
    this.showUnsavedDialog = false;
    this.pendingSwitchAction = null;
  }

  render() {
    const colors = paletteStore.mainColors.value;
    const ephemeralColors = paletteStore.ephemeralColors.value;
    const extractedColors = paletteStore.extractedColors.value;
    const isExtracting = paletteStore.isExtracting.value;
    const isDirty = paletteStore.isDirty.value;
    const isCustomPalette = paletteStore.isCustomPalette();
    const isPresetPalette = paletteStore.isPresetPalette();
    const canRename = isCustomPalette;
    const canReset = isPresetPalette && isDirty;
    const usedColors = paletteStore.usedColors.value;

    return html`
      <div class="toolbar">
        <pf-palette-selector
          @request-switch=${this.handleRequestSwitch}
        ></pf-palette-selector>
        <button
          class="save-btn ${isDirty ? "dirty" : ""}"
          @click=${this.handleSaveClick}
          title="${isDirty ? "Save palette (unsaved changes)" : "Save palette"}"
        >
          &#128190;
        </button>
        <button
          class="menu-btn"
          @click=${(e: Event) => this.toggleMenu(e)}
          title="Palette options"
        >
          &#8942;
        </button>
        <button
          class="add-btn"
          @click=${(e: Event) => this.toggleAddPopover(e)}
          title="Add color"
        >
          +
        </button>
      </div>

      <!-- Menu Popover -->
      <pf-popover
        ?open=${this.showMenuPopover}
        position="bottom"
        .anchorRect=${this.menuBtnRect}
        @close=${this.closeMenu}
      >
        <div class="menu-content">
          <div class="menu-item" @click=${this.handleMenuSaveAs}>
            Save As...
          </div>
          <div
            class="menu-item ${canRename ? "" : "disabled"}"
            @click=${this.handleMenuRename}
          >
            Rename...
          </div>
          <div class="menu-divider"></div>
          <div
            class="menu-item ${canReset ? "" : "disabled"}"
            @click=${this.handleMenuReset}
          >
            Reset to Original
          </div>
        </div>
      </pf-popover>

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
              class="hex-input ${this.hexInvalid ? "invalid" : ""}"
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
        class="palette-grid ${this.isDraggingPaletteColor ||
        this.dragOverIndex !== null
          ? "drag-active"
          : ""} ${this.isReplaceMode ? "replace-mode" : ""}"
        @dragover=${this.handlePaletteGridDragOver}
        @drop=${this.handlePaletteGridDrop}
      >
        ${colors.map((color, index) => {
          const isUsed = usedColors.has(color.toLowerCase());
          return html`
            <div
              class="swatch-container ${this.dragOverIndex === index
                ? "drag-before"
                : ""} ${this.draggedPaletteIndex === index ? "dragging" : ""}"
              @dragover=${(e: DragEvent) =>
                this.handlePaletteDragOver(index, e)}
              @dragleave=${this.handlePaletteDragLeave}
              @drop=${(e: DragEvent) => this.handlePaletteDrop(index, e)}
            >
              <div
                class="swatch ${isUsed ? "swatch-used" : ""}"
                style="background-color: ${color}"
                title="${this.isReplaceMode
                  ? `Click to replace with ${this.selectedUntrackedColor}`
                  : color}${isUsed ? " (in use)" : ""}"
                draggable="${!this.isReplaceMode}"
                @click=${this.isReplaceMode
                  ? (e: Event) => this.handleReplaceTarget(index, e)
                  : () => this.selectColor(color)}
                @contextmenu=${(e: MouseEvent) =>
                  this.handleSwatchRightClick(e, color, index)}
                @dragstart=${(e: DragEvent) =>
                  this.handlePaletteSwatchDragStart(index, color, e)}
                @dragend=${this.handlePaletteSwatchDragEnd}
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

      ${ephemeralColors.length > 0
        ? html`
            <div class="untracked-section">
              <div class="untracked-header">
                <span class="untracked-title">
                  Untracked
                  <span class="untracked-count"
                    >(${ephemeralColors.length})</span
                  >
                </span>
              </div>
              <div class="untracked-grid">
                ${ephemeralColors.map(
                  (color) => html`
                    <div
                      class="untracked-swatch ${this.selectedUntrackedColor ===
                      color
                        ? "selected"
                        : ""}"
                      style="background-color: ${color}"
                      title="${color} - Click to select, right-click to add to palette"
                      draggable="true"
                      @click=${() => this.selectUntrackedColor(color)}
                      @contextmenu=${(e: MouseEvent) =>
                        this.handleUntrackedRightClick(e, color)}
                      @dragstart=${(e: DragEvent) =>
                        this.handleUntrackedDragStart(color, e)}
                    ></div>
                  `
                )}
              </div>
              <div class="untracked-actions">
                ${this.selectedUntrackedColor && !this.isReplaceMode
                  ? html`
                      <button
                        class="replace-btn"
                        @click=${this.enterReplaceMode}
                      >
                        Replace in Palette
                      </button>
                    `
                  : this.isReplaceMode
                  ? html`
                      <button
                        class="replace-btn cancel"
                        @click=${this.cancelReplaceMode}
                      >
                        Cancel Replace
                      </button>
                    `
                  : nothing}
                <pf-button fill size="sm" @click=${this.promoteAllUntracked}>
                  Add All
                </pf-button>
                <pf-button fill size="sm" @click=${this.clearUntracked}>
                  Clear
                </pf-button>
              </div>
            </div>
          `
        : ""}

      <div class="extraction-section">
        <div class="extraction-header" @click=${this.toggleExtraction}>
          <span class="chevron ${this.extractionExpanded ? "" : "collapsed"}"
            >▼</span
          >
          <span>Extract from Drawing</span>
        </div>
        ${this.extractionExpanded
          ? html`
              <div class="extraction-content">
                <button
                  class="extract-btn"
                  @click=${this.handleExtract}
                  ?disabled=${isExtracting}
                >
                  ${isExtracting ? "Extracting..." : "Extract Colors"}
                </button>

                ${extractedColors.length > 0
                  ? html`
                      <div class="extracted-grid">
                        ${extractedColors.map(
                          (color) => html`
                            <div
                              class="extracted-swatch"
                              style="background-color: ${color}"
                              draggable="true"
                              @dragstart=${(e: DragEvent) =>
                                this.handleExtractedDragStart(color, e)}
                              @click=${() => this.handleExtractedClick(color)}
                              title="${color} - Click to add, drag to palette"
                            ></div>
                          `
                        )}
                      </div>
                      <div class="extraction-actions">
                        <pf-button
                          fill
                          size="sm"
                          @click=${this.addAllExtracted}
                        >
                          Add All
                        </pf-button>
                        <pf-button
                          fill
                          size="sm"
                          @click=${this.replaceWithExtracted}
                        >
                          Replace All
                        </pf-button>
                      </div>
                    `
                  : ""}
              </div>
            `
          : ""}
      </div>

      <pf-color-picker-popup
        ?open=${this.showColorPicker}
        .color=${this.editingColor}
        .paletteIndex=${this.editingIndex}
        .anchorElement=${this.anchorElement}
        @apply=${this.handleColorPickerApply}
        @cancel=${this.handleColorPickerCancel}
      ></pf-color-picker-popup>

      <!-- Save Palette Dialog -->
      <pf-save-palette-dialog
        ?open=${this.showSaveDialog}
        .title=${this.saveDialogTitle}
        .defaultName=${this.saveDialogDefaultName}
        @save=${this.handleSaveDialogSave}
        @cancel=${this.handleSaveDialogCancel}
      ></pf-save-palette-dialog>

      <!-- Unsaved Changes Dialog -->
      <pf-unsaved-changes-dialog
        ?open=${this.showUnsavedDialog}
        .paletteName=${paletteStore.getCurrentPaletteName()}
        @save=${this.handleUnsavedSave}
        @discard=${this.handleUnsavedDiscard}
        @cancel=${this.handleUnsavedCancel}
      ></pf-unsaved-changes-dialog>
    `;
  }
}
