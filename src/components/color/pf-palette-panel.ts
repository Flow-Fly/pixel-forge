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
      align-items: center;
      margin-bottom: 8px;
      gap: 6px;
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

    .color-picker {
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      cursor: pointer;
      background: none;
    }

    .color-picker::-webkit-color-swatch-wrapper {
      padding: 2px;
    }

    .color-picker::-webkit-color-swatch {
      border: none;
      border-radius: 2px;
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

    .swatch:hover .remove-btn {
      opacity: 1;
    }
  `;

  @state() private lightnessTarget: { color: string; x: number; y: number } | null = null;
  @state() private hexInput = '';
  @state() private hexInvalid = false;

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

  private removeColor(index: number, e: MouseEvent) {
    e.stopPropagation();
    paletteStore.removeColor(index);
  }

  private resetPalette() {
    paletteStore.resetToDefault();
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

  render() {
    const colors = paletteStore.colors.value;

    return html`
      <div class="toolbar">
        <input
          type="text"
          class="hex-input ${this.hexInvalid ? 'invalid' : ''}"
          placeholder="#hex"
          .value=${this.hexInput}
          @input=${this.handleHexInput}
          @keydown=${this.handleHexKeydown}
        />
        <input
          type="color"
          class="color-picker"
          title="Pick a color to add"
          @change=${this.handleColorPicker}
        />
        <button
          class="toolbar-btn"
          @click=${this.resetPalette}
          title="Reset to default DB32 palette"
        >
          Reset
        </button>
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
            <span
              class="remove-btn"
              @click=${(e: MouseEvent) => this.removeColor(index, e)}
              title="Remove color"
            >×</span>
          </div>
        `)}
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
