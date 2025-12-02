import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { colorStore } from '../../stores/colors';
import { paletteStore } from '../../stores/palette';
import './pf-lightness-subpalette';

@customElement('pf-palette-panel')
export class PFPalettePanel extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      padding: var(--pf-spacing-2);
    }

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      gap: 4px;
    }

    .toolbar-btn {
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      font-size: 10px;
      padding: 3px 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .toolbar-btn:hover {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .toolbar-btn.active {
      background: var(--pf-color-accent, #4a9eff);
      color: white;
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .palette-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 1px;
      background-color: var(--pf-color-border);
      border: 1px solid var(--pf-color-border);
    }

    .swatch {
      aspect-ratio: 1;
      cursor: pointer;
      position: relative;
    }

    .swatch:hover {
      transform: scale(1.1);
      z-index: 1;
      box-shadow: 0 0 4px rgba(0,0,0,0.5);
    }

    .swatch .remove-btn {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 14px;
      height: 14px;
      background: var(--pf-color-accent-red, #e53935);
      border: 1px solid rgba(0,0,0,0.3);
      border-radius: 50%;
      color: white;
      font-size: 10px;
      line-height: 12px;
      text-align: center;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    .swatch:hover .remove-btn,
    .swatch .remove-btn:focus {
      opacity: 1;
    }

    .add-swatch {
      aspect-ratio: 1;
      cursor: pointer;
      background: var(--pf-color-bg-surface, #1e1e1e);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--pf-color-text-muted, #808080);
      font-size: 16px;
      transition: all 0.15s ease;
    }

    .add-swatch:hover {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-accent, #4a9eff);
    }
  `;

  @state() private lightnessTarget: { color: string; x: number; y: number } | null = null;

  private selectColor(color: string) {
    colorStore.setPrimaryColor(color);
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

  private addCurrentColor() {
    const currentColor = colorStore.primaryColor.value;
    paletteStore.addColor(currentColor);
  }

  private removeColor(index: number, e: MouseEvent) {
    e.stopPropagation();
    paletteStore.removeColor(index);
  }

  private toggleEditMode() {
    paletteStore.toggleEditMode();
  }

  private resetPalette() {
    paletteStore.resetToDefault();
  }

  render() {
    const colors = paletteStore.colors.value;
    const editMode = paletteStore.editMode.value;

    return html`
      <div class="toolbar">
        <button
          class="toolbar-btn ${editMode ? 'active' : ''}"
          @click=${this.toggleEditMode}
          title="Toggle edit mode"
        >
          ${editMode ? 'Done' : 'Edit'}
        </button>
        ${editMode ? html`
          <button
            class="toolbar-btn"
            @click=${this.resetPalette}
            title="Reset to default DB32 palette"
          >
            Reset
          </button>
        ` : ''}
      </div>

      <div class="palette-grid">
        ${colors.map((color, index) => html`
          <div
            class="swatch"
            style="background-color: ${color}"
            title="${color} - Right-click for variations"
            @click=${() => this.selectColor(color)}
            @contextmenu=${(e: MouseEvent) => this.handleSwatchRightClick(e, color)}
          >
            ${editMode ? html`
              <span
                class="remove-btn"
                @click=${(e: MouseEvent) => this.removeColor(index, e)}
                title="Remove color"
              >×</span>
            ` : ''}
          </div>
        `)}
        ${editMode ? html`
          <div
            class="add-swatch"
            @click=${this.addCurrentColor}
            title="Add current primary color"
          >+</div>
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
