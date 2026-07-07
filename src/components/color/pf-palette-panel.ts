import { html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { paletteStore } from "../../stores/palette";
import { historyStore } from "../../stores/history";
import { PaletteChangeCommand } from "../../commands/palette-command";
import "../ui/pf-popover";
import "./pf-color-picker-popup";
import "./pf-palette-selector";
import "./pf-save-palette-dialog";
import "./pf-unsaved-changes-dialog";
import "./palette-panel/pf-palette-toolbar";
import "./palette-panel/pf-palette-grid";
import "./palette-panel/pf-extraction-section";

@customElement("pf-palette-panel")
export class PFPalettePanel extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      padding: var(--pf-spacing-2);
    }

    .toolbar {
      margin-bottom: 8px;
    }

    .new-marks {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 8px;
    }

    .clear-new-marks {
      min-block-size: 24px;
      padding: 4px 8px;
      background: var(--pf-color-bg-input, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: var(--pf-radius-sm);
      color: var(--pf-color-text-muted, #808080);
      cursor: pointer;
      font-size: 11px;
    }

    .clear-new-marks:hover {
      background: var(--pf-color-bg-hover, #141414);
      border-color: var(--pf-color-border-strong);
      color: var(--pf-color-accent, #4a9eff);
    }

    .clear-new-marks:focus-visible {
      outline: 2px solid var(--pf-color-accent, #4a9eff);
      outline-offset: 2px;
    }
  `;

  // Color picker popup state
  @state() private showColorPicker = false;
  @state() private editingColor = "";
  @state() private editingIndex = 0;
  @state() private anchorElement: HTMLElement | null = null;

  // Save dialog state
  @state() private showSaveDialog = false;
  @state() private saveDialogTitle = "Save Palette";
  @state() private saveDialogDefaultName = "";
  @state() private isRenaming = false;

  // Unsaved changes dialog state
  @state() private showUnsavedDialog = false;
  @state() private pendingSwitchAction: (() => void) | null = null;

  // ==========================================
  // Toolbar event handlers
  // ==========================================

  private async handleSaveClick() {
    if (paletteStore.isCustomPalette()) {
      await paletteStore.saveCurrentPalette();
    } else {
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
  }

  private handleMenuReset() {
    if (paletteStore.isPresetPalette() && paletteStore.isDirty.value) {
      paletteStore.resetPresetToOriginal();
    }
  }

  // ==========================================
  // Save dialog handlers
  // ==========================================

  private async handleSaveDialogSave(e: CustomEvent) {
    const { name } = e.detail;

    if (this.isRenaming) {
      const customId = paletteStore.currentCustomPaletteId.value;
      if (customId) {
        await paletteStore.renameCustomPalette(customId, name);
      }
    } else {
      await paletteStore.saveAsNewPalette(name);
    }

    this.showSaveDialog = false;
  }

  private handleSaveDialogCancel() {
    this.showSaveDialog = false;
  }

  // ==========================================
  // Unsaved changes dialog handlers
  // ==========================================

  private handleRequestSwitch(e: CustomEvent) {
    const { type, id } = e.detail;

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

    this.pendingSwitchAction = switchAction;
    this.showUnsavedDialog = true;
  }

  private async handleUnsavedSave() {
    if (paletteStore.isCustomPalette()) {
      await paletteStore.saveCurrentPalette();
      this.showUnsavedDialog = false;
      if (this.pendingSwitchAction) {
        this.pendingSwitchAction();
        this.pendingSwitchAction = null;
      }
    } else {
      this.showUnsavedDialog = false;
      this.openSaveAsDialog();
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

  // ==========================================
  // Color picker handlers
  // ==========================================

  private handleSwatchEdit(e: CustomEvent) {
    const { color, index, anchor } = e.detail;
    this.editingColor = color;
    this.editingIndex = index;
    this.anchorElement = anchor;
    this.showColorPicker = true;
  }

  private handleColorPickerApply(e: CustomEvent) {
    const { color, paletteIndex } = e.detail;
    const oneBasedIndex = paletteIndex + 1;
    const previousColor = paletteStore.getColorByIndex(oneBasedIndex);

    if (previousColor && previousColor !== color) {
      const command = new PaletteChangeCommand(oneBasedIndex, previousColor, color);
      historyStore.execute(command);
    }

    this.showColorPicker = false;
  }

  private handleColorPickerCancel() {
    this.showColorPicker = false;
  }

  private handleClearAllNewMarks() {
    paletteStore.clearAllNewFlags();
  }

  render() {
    const hasNewMarks = paletteStore.newColorFlags.value.size > 0;

    return html`
      <pf-palette-toolbar
        class="toolbar"
        @save-click=${this.handleSaveClick}
        @menu-save-as=${this.openSaveAsDialog}
        @menu-rename=${this.openRenameDialog}
        @menu-reset=${this.handleMenuReset}
      >
        <pf-palette-selector
          @request-switch=${this.handleRequestSwitch}
        ></pf-palette-selector>
      </pf-palette-toolbar>

      <pf-palette-grid
        @swatch-edit=${this.handleSwatchEdit}
      ></pf-palette-grid>

      ${hasNewMarks
        ? html`
            <div class="new-marks">
              <button
                class="clear-new-marks"
                @click=${this.handleClearAllNewMarks}
              >
                Clear all new marks
              </button>
            </div>
          `
        : nothing}

      <pf-extraction-section></pf-extraction-section>

      <pf-color-picker-popup
        ?open=${this.showColorPicker}
        .color=${this.editingColor}
        .paletteIndex=${this.editingIndex}
        .anchorElement=${this.anchorElement}
        @apply=${this.handleColorPickerApply}
        @cancel=${this.handleColorPickerCancel}
      ></pf-color-picker-popup>

      <pf-save-palette-dialog
        ?open=${this.showSaveDialog}
        .title=${this.saveDialogTitle}
        .defaultName=${this.saveDialogDefaultName}
        @save=${this.handleSaveDialogSave}
        @cancel=${this.handleSaveDialogCancel}
      ></pf-save-palette-dialog>

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
