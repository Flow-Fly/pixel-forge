import { html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { defaultProjectContext, type ProjectContext } from '../../stores/project-context';
import { PaletteChangeCommand } from '../../commands/palette-command';
import '../ui/pf-popover';
import './pf-color-picker-popup';
import './pf-palette-selector';
import './pf-save-palette-dialog';
import './pf-unsaved-changes-dialog';
import './palette-panel/pf-palette-toolbar';
import './palette-panel/pf-palette-grid';
import './palette-panel/pf-extraction-section';

@customElement('pf-palette-panel')
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
  @state() private editingColor = '';
  @state() private editingIndex = 0;
  @state() private anchorElement: HTMLElement | null = null;

  // Save dialog state
  @state() private showSaveDialog = false;
  @state() private saveDialogTitle = 'Save Palette';
  @state() private saveDialogDefaultName = '';
  @state() private isRenaming = false;

  // Unsaved changes dialog state
  @state() private showUnsavedDialog = false;
  @state() private pendingSwitchAction: (() => void) | null = null;
  private pendingSwitchContext: ProjectContext | null = null;

  private context = defaultProjectContext;
  private editingContext = defaultProjectContext;
  private saveDialogContext = defaultProjectContext;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.requestUpdate();
    });
  }

  private get palette() {
    return this.context.palette;
  }

  // ==========================================
  // Toolbar event handlers
  // ==========================================

  private async handleSaveClick() {
    if (this.palette.isCustomPalette()) {
      await this.palette.saveCurrentPalette();
    } else {
      this.openSaveAsDialog(this.context);
    }
  }

  private openSaveAsDialog(context: ProjectContext = this.context) {
    const palette = context.palette;

    this.saveDialogContext = context;
    this.saveDialogTitle = 'Save Palette';
    this.saveDialogDefaultName = palette.getCurrentPaletteName();
    if (this.saveDialogDefaultName === 'Untitled Palette') {
      this.saveDialogDefaultName = '';
    }
    this.isRenaming = false;
    this.showSaveDialog = true;
  }

  private openRenameDialog(context: ProjectContext = this.context) {
    this.saveDialogContext = context;
    this.saveDialogTitle = 'Rename Palette';
    this.saveDialogDefaultName = context.palette.getCurrentPaletteName();
    this.isRenaming = true;
    this.showSaveDialog = true;
  }

  private handleMenuReset() {
    if (this.palette.isPresetPalette() && this.palette.isDirty.value) {
      this.palette.resetPresetToOriginal();
    }
  }

  // ==========================================
  // Save dialog handlers
  // ==========================================

  private async handleSaveDialogSave(e: CustomEvent) {
    const { name } = e.detail;
    const palette = this.saveDialogContext.palette;

    if (this.isRenaming) {
      const customId = palette.currentCustomPaletteId.value;
      if (customId) {
        await palette.renameCustomPalette(customId, name);
      }
    } else {
      await palette.saveAsNewPalette(name);
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
    const { type, id, context = this.context } = e.detail;
    const palette = context.palette;

    let switchAction: () => void;
    switch (type) {
      case 'preset':
        switchAction = () => palette.loadPreset(id);
        break;
      case 'custom':
        switchAction = () => palette.loadCustomPalette(id);
        break;
      case 'empty':
        switchAction = () => palette.createEmpty();
        break;
      default:
        return;
    }

    this.pendingSwitchAction = switchAction;
    this.pendingSwitchContext = context;
    this.showUnsavedDialog = true;
  }

  private async handleUnsavedSave() {
    const context = this.pendingSwitchContext ?? this.context;
    const palette = context.palette;

    if (palette.isCustomPalette()) {
      await palette.saveCurrentPalette();
      this.showUnsavedDialog = false;
      if (this.pendingSwitchAction) {
        this.pendingSwitchAction();
        this.pendingSwitchAction = null;
        this.pendingSwitchContext = null;
      }
    } else {
      this.showUnsavedDialog = false;
      this.openSaveAsDialog(context);
    }
  }

  private handleUnsavedDiscard() {
    this.showUnsavedDialog = false;
    if (this.pendingSwitchAction) {
      this.pendingSwitchAction();
      this.pendingSwitchAction = null;
      this.pendingSwitchContext = null;
    }
  }

  private handleUnsavedCancel() {
    this.showUnsavedDialog = false;
    this.pendingSwitchAction = null;
    this.pendingSwitchContext = null;
  }

  // ==========================================
  // Color picker handlers
  // ==========================================

  private handleSwatchEdit(e: CustomEvent) {
    const { color, index, anchor, context = this.context } = e.detail;
    this.editingColor = color;
    this.editingIndex = index;
    this.anchorElement = anchor;
    this.editingContext = context;
    this.showColorPicker = true;
  }

  private handleColorPickerApply(e: CustomEvent) {
    const { color, paletteIndex } = e.detail;
    const context = this.editingContext;
    const oneBasedIndex = paletteIndex + 1;
    const previousColor = context.palette.getColorByIndex(oneBasedIndex);

    if (previousColor && previousColor !== color) {
      const command = new PaletteChangeCommand(oneBasedIndex, previousColor, color, context);
      void context.history.execute(command);
    }

    this.showColorPicker = false;
  }

  private handleColorPickerCancel() {
    this.showColorPicker = false;
  }

  private handleClearAllNewMarks() {
    this.palette.clearAllNewFlags();
  }

  render() {
    const hasNewMarks = this.palette.newColorFlags.value.size > 0;

    return html`
      <pf-palette-toolbar
        class="toolbar"
        @save-click=${this.handleSaveClick}
        @menu-save-as=${() => this.openSaveAsDialog(this.context)}
        @menu-rename=${() => this.openRenameDialog(this.context)}
        @menu-reset=${this.handleMenuReset}
      >
        <pf-palette-selector @request-switch=${this.handleRequestSwitch}></pf-palette-selector>
      </pf-palette-toolbar>

      <pf-palette-grid @swatch-edit=${this.handleSwatchEdit}></pf-palette-grid>

      ${
        hasNewMarks
          ? html`
              <div class="new-marks">
                <button class="clear-new-marks" @click=${this.handleClearAllNewMarks}>
                  Clear all new marks
                </button>
              </div>
            `
          : nothing
      }

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
        .paletteName=${this.palette.getCurrentPaletteName()}
        @save=${this.handleUnsavedSave}
        @discard=${this.handleUnsavedDiscard}
        @cancel=${this.handleUnsavedCancel}
      ></pf-unsaved-changes-dialog>
    `;
  }
}
