import { html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import {
  paletteStore,
  PRESET_PALETTES,
  type PresetPalette,
  type CustomPalette,
} from "../../stores/palette";
import "@pixel-forge/ui";

@customElement("pf-palette-selector")
export class PfPaletteSelector extends BaseComponent {
  static styles = css`
    :host {
      display: block;
    }

    .selector-trigger {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
      min-width: 80px;
    }

    .selector-trigger:hover {
      background: var(--pf-color-bg-panel, #141414);
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .trigger-label {
      flex: 1;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .trigger-chevron {
      font-size: 8px;
      opacity: 0.6;
    }

    .selector-content {
      width: 240px;
      max-height: 380px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .search-input {
      width: 100%;
      padding: 8px 10px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: none;
      border-bottom: 1px solid var(--pf-color-border, #333);
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 12px;
      outline: none;
      box-sizing: border-box;
    }

    .search-input::placeholder {
      color: var(--pf-color-text-muted, #808080);
    }

    .search-input:focus {
      background: var(--pf-color-bg-panel, #141414);
    }

    .palette-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }

    .section-header {
      padding: 6px 10px 4px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--pf-color-text-muted, #808080);
    }

    .palette-item {
      padding: 6px 10px;
      cursor: pointer;
      transition: background 0.1s ease;
      position: relative;
    }

    .palette-item:hover {
      background: var(--pf-color-bg-surface, #1e1e1e);
    }

    .palette-item.selected {
      background: rgba(74, 158, 255, 0.15);
    }

    .palette-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }

    .palette-name {
      font-size: 11px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-weight: 500;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .palette-count {
      font-size: 10px;
      color: var(--pf-color-text-muted, #808080);
      margin-left: 8px;
    }

    .delete-btn {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      font-size: 10px;
      padding: 2px 6px;
      cursor: pointer;
      opacity: 0;
      transition: all 0.1s ease;
    }

    .palette-item:hover .delete-btn {
      opacity: 1;
    }

    .delete-btn:hover {
      background: #c53030;
      border-color: #c53030;
      color: white;
    }

    .palette-preview {
      display: flex;
      height: 6px;
      border-radius: 2px;
      overflow: hidden;
    }

    .preview-color {
      flex: 1;
      min-width: 0;
    }

    .divider {
      height: 1px;
      background: var(--pf-color-border, #333);
      margin: 4px 0;
    }

    .action-item {
      padding: 8px 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
      transition: all 0.1s ease;
    }

    .action-item:hover {
      background: var(--pf-color-bg-surface, #1e1e1e);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .action-icon {
      font-size: 12px;
    }

    .no-results {
      padding: 16px;
      text-align: center;
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
    }

    /* Confirm delete dialog */
    .confirm-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 10;
    }

    .confirm-message {
      font-size: 12px;
      color: var(--pf-color-text-main, #e0e0e0);
      text-align: center;
      margin-bottom: 12px;
    }

    .confirm-name {
      font-weight: 600;
      color: var(--pf-color-accent, #4a9eff);
    }

    .confirm-buttons {
      display: flex;
      gap: 8px;
    }

    .confirm-btn {
      padding: 6px 12px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
      border: 1px solid var(--pf-color-border, #333);
      transition: all 0.1s ease;
    }

    .confirm-btn.cancel {
      background: var(--pf-color-bg-surface, #1e1e1e);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .confirm-btn.cancel:hover {
      background: var(--pf-color-bg-panel, #141414);
    }

    .confirm-btn.delete {
      background: #c53030;
      border-color: #c53030;
      color: white;
    }

    .confirm-btn.delete:hover {
      background: #9b2c2c;
    }
  `;

  @state() private isOpen = false;
  @state() private searchQuery = "";
  @state() private triggerRect: DOMRect | null = null;
  @state() private confirmDeleteId: string | null = null;
  @state() private confirmDeleteName: string = "";

  private get filteredCustomPalettes(): CustomPalette[] {
    const custom = paletteStore.customPalettes.value;
    if (!this.searchQuery.trim()) {
      return custom;
    }
    const query = this.searchQuery.toLowerCase();
    return custom.filter((p) => p.name.toLowerCase().includes(query));
  }

  private get filteredPresetPalettes(): PresetPalette[] {
    if (!this.searchQuery.trim()) {
      return PRESET_PALETTES;
    }
    const query = this.searchQuery.toLowerCase();
    return PRESET_PALETTES.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.author.toLowerCase().includes(query)
    );
  }

  private get currentPaletteName(): string {
    return paletteStore.getCurrentPaletteName();
  }

  private handleTriggerClick(e: Event) {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    this.triggerRect = target.getBoundingClientRect();
    this.isOpen = !this.isOpen;
  }

  private handleClose() {
    this.isOpen = false;
    this.searchQuery = "";
    this.confirmDeleteId = null;
  }

  private handleSearchInput(e: Event) {
    this.searchQuery = (e.target as HTMLInputElement).value;
  }

  private handlePresetSelect(palette: PresetPalette) {
    // Check if we need to confirm unsaved changes when leaving a custom palette
    if (paletteStore.isDirty.value && paletteStore.isCustomPalette()) {
      this.dispatchEvent(
        new CustomEvent("request-switch", {
          bubbles: true,
          composed: true,
          detail: { type: "preset", id: palette.id },
        })
      );
      this.handleClose();
      return;
    }
    paletteStore.loadPreset(palette.id);
    this.handleClose();
  }

  private handleCustomSelect(palette: CustomPalette) {
    // Check if we need to confirm unsaved changes when leaving a custom palette
    if (paletteStore.isDirty.value && paletteStore.isCustomPalette()) {
      this.dispatchEvent(
        new CustomEvent("request-switch", {
          bubbles: true,
          composed: true,
          detail: { type: "custom", id: palette.id },
        })
      );
      this.handleClose();
      return;
    }
    paletteStore.loadCustomPalette(palette.id);
    this.handleClose();
  }

  private handleNewEmpty() {
    // Check if we need to confirm unsaved changes when leaving a custom palette
    if (paletteStore.isDirty.value && paletteStore.isCustomPalette()) {
      this.dispatchEvent(
        new CustomEvent("request-switch", {
          bubbles: true,
          composed: true,
          detail: { type: "empty" },
        })
      );
      this.handleClose();
      return;
    }
    paletteStore.createEmpty();
    this.handleClose();
  }

  private handleDeleteClick(e: Event, palette: CustomPalette) {
    e.stopPropagation();
    this.confirmDeleteId = palette.id;
    this.confirmDeleteName = palette.name;
  }

  private handleConfirmDelete() {
    if (this.confirmDeleteId) {
      paletteStore.deleteCustomPalette(this.confirmDeleteId);
      this.confirmDeleteId = null;
      this.confirmDeleteName = "";
    }
  }

  private handleCancelDelete() {
    this.confirmDeleteId = null;
    this.confirmDeleteName = "";
  }

  private renderPalettePreview(colors: string[]) {
    // Show max 16 colors in preview
    const displayColors = colors.slice(0, 16);
    return html`
      <div class="palette-preview">
        ${displayColors.map(
          (color) => html`
            <div class="preview-color" style="background-color: ${color}"></div>
          `
        )}
      </div>
    `;
  }

  private renderConfirmDialog() {
    if (!this.confirmDeleteId) return nothing;

    return html`
      <div class="confirm-overlay" @click=${(e: Event) => e.stopPropagation()}>
        <div class="confirm-message">
          Delete <span class="confirm-name">${this.confirmDeleteName}</span>?
        </div>
        <div class="confirm-buttons">
          <button class="confirm-btn cancel" @click=${this.handleCancelDelete}>
            Cancel
          </button>
          <button class="confirm-btn delete" @click=${this.handleConfirmDelete}>
            Delete
          </button>
        </div>
      </div>
    `;
  }

  render() {
    const currentPresetId = paletteStore.currentPresetId.value;
    const currentCustomId = paletteStore.currentCustomPaletteId.value;
    const filteredCustom = this.filteredCustomPalettes;
    const filteredPreset = this.filteredPresetPalettes;
    const hasCustomPalettes = filteredCustom.length > 0;
    const hasPresets = filteredPreset.length > 0;
    const hasResults = hasCustomPalettes || hasPresets;

    return html`
      <button
        class="selector-trigger"
        @click=${this.handleTriggerClick}
        title="Select palette"
      >
        <span class="trigger-label">${this.currentPaletteName}</span>
        <span class="trigger-chevron">▼</span>
      </button>

      <pf-popover
        ?open=${this.isOpen}
        position="bottom"
        .anchorRect=${this.triggerRect}
        @close=${this.handleClose}
      >
        <div class="selector-content">
          ${this.renderConfirmDialog()}

          <input
            type="text"
            class="search-input"
            placeholder="Search palettes..."
            .value=${this.searchQuery}
            @input=${this.handleSearchInput}
          />

          <div class="palette-list">
            ${!hasResults
              ? html` <div class="no-results">No palettes found</div> `
              : nothing}
            ${hasCustomPalettes
              ? html`
                  <div class="section-header">My Palettes</div>
                  ${filteredCustom.map(
                    (palette) => html`
                      <div
                        class="palette-item ${currentCustomId === palette.id
                          ? "selected"
                          : ""}"
                        @click=${() => this.handleCustomSelect(palette)}
                      >
                        <div class="palette-header">
                          <span class="palette-name">${palette.name}</span>
                          <span class="palette-count"
                            >${palette.colors.length}</span
                          >
                        </div>
                        ${this.renderPalettePreview(palette.colors)}
                        <button
                          class="delete-btn"
                          @click=${(e: Event) =>
                            this.handleDeleteClick(e, palette)}
                          title="Delete palette"
                        >
                          Delete
                        </button>
                      </div>
                    `
                  )}
                `
              : nothing}
            ${hasCustomPalettes && hasPresets
              ? html` <div class="divider"></div> `
              : nothing}
            ${hasPresets
              ? html`
                  <div class="section-header">Presets</div>
                  ${filteredPreset.map(
                    (palette) => html`
                      <div
                        class="palette-item ${currentPresetId === palette.id
                          ? "selected"
                          : ""}"
                        @click=${() => this.handlePresetSelect(palette)}
                      >
                        <div class="palette-header">
                          <span class="palette-name">${palette.name}</span>
                          <span class="palette-count"
                            >${palette.colors.length}</span
                          >
                        </div>
                        ${this.renderPalettePreview(palette.colors)}
                      </div>
                    `
                  )}
                `
              : nothing}
          </div>

          <div class="divider"></div>

          <div class="action-item" @click=${this.handleNewEmpty}>
            <span class="action-icon">+</span>
            <span>New Empty Palette</span>
          </div>
        </div>
      </pf-popover>
    `;
  }
}
