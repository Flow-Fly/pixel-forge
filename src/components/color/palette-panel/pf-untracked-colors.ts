import { html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../../core/base-component";
import { colorStore } from "../../../stores/colors";
import { paletteStore } from "../../../stores/palette";
import "../../ui/pf-button";

@customElement("pf-untracked-colors")
export class PFUntrackedColors extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      margin-top: 12px;
      border-top: 1px solid var(--pf-color-border, #333);
      padding-top: 8px;
    }

    :host([hidden]) {
      display: none;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .title {
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
    }

    .count {
      color: var(--pf-color-accent-cyan, #00e5ff);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 2px;
      padding: 4px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border-radius: 3px;
      margin-bottom: 6px;
    }

    .swatch {
      aspect-ratio: 1;
      cursor: pointer;
      border-radius: 2px;
      transition: transform 0.1s ease;
      border: 1px dashed var(--pf-color-border, #444);
    }

    .swatch:hover {
      transform: scale(1.15);
      z-index: 1;
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .swatch.selected {
      border: 2px solid var(--pf-color-accent, #4a9eff);
      box-shadow: 0 0 6px rgba(74, 158, 255, 0.5);
    }

    .actions {
      display: flex;
      gap: 6px;
    }

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
  `;

  @state() private selectedColor: string | null = null;
  @state() private isReplaceMode = false;

  private selectColor(color: string) {
    if (this.selectedColor === color) {
      this.selectedColor = null;
      this.isReplaceMode = false;
    } else {
      this.selectedColor = color;
      this.isReplaceMode = false;
    }

    colorStore.setPrimaryColorFromShade(color);
    colorStore.updateLightnessVariations(color);

    this.dispatchEvent(new CustomEvent("selection-change", {
      detail: { color: this.selectedColor, replaceMode: this.isReplaceMode },
      bubbles: true,
      composed: true,
    }));
  }

  private handleRightClick(e: MouseEvent, color: string) {
    e.preventDefault();
    paletteStore.promoteEphemeralColor(color);
    if (this.selectedColor === color) {
      this.selectedColor = null;
      this.isReplaceMode = false;
    }
  }

  private enterReplaceMode() {
    if (this.selectedColor) {
      this.isReplaceMode = true;
      this.dispatchEvent(new CustomEvent("replace-mode-change", {
        detail: { active: true, color: this.selectedColor },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private cancelReplaceMode() {
    this.isReplaceMode = false;
    this.dispatchEvent(new CustomEvent("replace-mode-change", {
      detail: { active: false, color: null },
      bubbles: true,
      composed: true,
    }));
  }

  handleReplaceComplete() {
    this.isReplaceMode = false;
    this.selectedColor = null;
  }

  private handleDragStart(color: string, e: DragEvent) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("application/x-palette-color", color);
      e.dataTransfer.setData("application/x-ephemeral-color", "true");
    }
  }

  private promoteAll() {
    paletteStore.promoteAllEphemeralColors();
  }

  private clearAll() {
    paletteStore.clearEphemeralColors();
  }

  render() {
    const colors = paletteStore.ephemeralColors.value;

    if (colors.length === 0) {
      return nothing;
    }

    return html`
      <div class="header">
        <span class="title">
          Untracked <span class="count">(${colors.length})</span>
        </span>
      </div>

      <div class="grid">
        ${colors.map(color => html`
          <div
            class="swatch ${this.selectedColor === color ? "selected" : ""}"
            style="background-color: ${color}"
            title="${color} - Click to select, right-click to add to palette"
            draggable="true"
            @click=${() => this.selectColor(color)}
            @contextmenu=${(e: MouseEvent) => this.handleRightClick(e, color)}
            @dragstart=${(e: DragEvent) => this.handleDragStart(color, e)}
          ></div>
        `)}
      </div>

      <div class="actions">
        ${this.selectedColor && !this.isReplaceMode ? html`
          <button class="replace-btn" @click=${this.enterReplaceMode}>
            Replace in Palette
          </button>
        ` : this.isReplaceMode ? html`
          <button class="replace-btn cancel" @click=${this.cancelReplaceMode}>
            Cancel Replace
          </button>
        ` : nothing}
        <pf-button fill size="sm" @click=${this.promoteAll}>Add All</pf-button>
        <pf-button fill size="sm" @click=${this.clearAll}>Clear</pf-button>
      </div>
    `;
  }
}
