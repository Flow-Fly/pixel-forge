import { html, css } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { BaseComponent } from "../../../core/base-component";
import { paletteStore } from "../../../stores/palette";
import "../../ui/pf-popover";

@customElement("pf-palette-toolbar")
export class PFPaletteToolbar extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    ::slotted(pf-palette-selector) {
      flex: 1;
    }

    .toolbar-btn {
      width: 28px;
      height: 28px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }

    .toolbar-btn:hover {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-accent, #4a9eff);
    }

    .save-btn {
      position: relative;
      font-size: 14px;
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

    .menu-btn {
      font-size: 14px;
    }

    .add-btn {
      font-size: 18px;
    }

    /* Menu popover content */
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

    /* Add color popover */
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
  `;

  @state() private showMenuPopover = false;
  @state() private menuBtnRect: DOMRect | null = null;
  @state() private showAddPopover = false;
  @state() private addBtnRect: DOMRect | null = null;
  @state() private hexInput = "";
  @state() private hexInvalid = false;

  @query(".menu-btn") private menuButton!: HTMLButtonElement;
  @query(".add-btn") private addButton!: HTMLButtonElement;

  private handleSaveClick() {
    this.dispatchEvent(new CustomEvent("save-click"));
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
    this.dispatchEvent(new CustomEvent("menu-save-as"));
    this.closeMenu();
  }

  private handleMenuRename() {
    if (paletteStore.isCustomPalette()) {
      this.dispatchEvent(new CustomEvent("menu-rename"));
      this.closeMenu();
    }
  }

  private handleMenuReset() {
    if (paletteStore.isPresetPalette() && paletteStore.isDirty.value) {
      this.dispatchEvent(new CustomEvent("menu-reset"));
      this.closeMenu();
    }
  }

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
    this.hexInput = (e.target as HTMLInputElement).value;
    this.hexInvalid = false;
  }

  private handleHexKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      this.addHexColor();
    }
  }

  private addHexColor() {
    let hex = this.hexInput.trim();

    if (hex && !hex.startsWith("#")) {
      hex = "#" + hex;
    }

    if (!/^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(hex)) {
      this.hexInvalid = true;
      return;
    }

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

  render() {
    const isDirty = paletteStore.isDirty.value;
    const isCustomPalette = paletteStore.isCustomPalette();
    const isPresetPalette = paletteStore.isPresetPalette();
    const canRename = isCustomPalette;
    const canReset = isPresetPalette && isDirty;

    return html`
      <slot></slot>

      <button
        class="toolbar-btn save-btn ${isDirty ? "dirty" : ""}"
        @click=${this.handleSaveClick}
        title="${isDirty ? "Save palette (unsaved changes)" : "Save palette"}"
      >
        &#128190;
      </button>

      <button
        class="toolbar-btn menu-btn"
        @click=${this.toggleMenu}
        title="Palette options"
      >
        &#8942;
      </button>

      <button
        class="toolbar-btn add-btn"
        @click=${this.toggleAddPopover}
        title="Add color"
      >
        +
      </button>

      <pf-popover
        ?open=${this.showMenuPopover}
        position="bottom"
        .anchorRect=${this.menuBtnRect}
        @close=${this.closeMenu}
      >
        <div class="menu-content">
          <div class="menu-item" @click=${this.handleMenuSaveAs}>Save As...</div>
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
    `;
  }
}
