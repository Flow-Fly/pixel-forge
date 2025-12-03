import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { colorStore } from '../../stores/colors';
import { paletteStore, type Harmony } from '../../stores/palette';

interface HarmonyOption {
  type: Harmony;
  icon: string;
  title: string;
}

const HARMONY_OPTIONS: HarmonyOption[] = [
  { type: 'analogous', icon: '~', title: 'Analogous - similar hues' },
  { type: 'triadic', icon: '\u25B3', title: 'Triadic - 3 equidistant hues' },
  { type: 'complementary', icon: '\u25D0', title: 'Complementary - opposite hues' },
  { type: 'split', icon: '\u25C7', title: 'Split-complementary' },
  { type: 'tetradic', icon: '\u25A1', title: 'Tetradic - 4 equidistant hues' },
];

@customElement('pf-palette-generator')
export class PFPaletteGenerator extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      padding: var(--pf-spacing-2);
    }

    .harmony-selector {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
    }

    .harmony-btn {
      flex: 1;
      height: 28px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .harmony-btn:hover {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .harmony-btn.active {
      background: var(--pf-color-accent, #4a9eff);
      color: white;
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .swatch-row {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
    }

    .swatch {
      flex: 1;
      aspect-ratio: 1;
      border-radius: 4px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: all 0.15s ease;
    }

    .swatch:hover {
      transform: scale(1.1);
      z-index: 1;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }

    .swatch.empty {
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px dashed var(--pf-color-border, #333);
      cursor: default;
    }

    .swatch.empty:hover {
      transform: none;
      box-shadow: none;
    }

    .actions {
      display: flex;
      gap: 8px;
    }

    .action-btn {
      flex: 1;
      padding: 6px 8px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .action-btn:hover:not(:disabled) {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px;
      color: var(--pf-color-text-muted, #808080);
      font-size: 11px;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid var(--pf-color-border, #333);
      border-top-color: var(--pf-color-accent, #4a9eff);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  private selectHarmony(type: Harmony) {
    paletteStore.setHarmony(type);
    this.regenerate();
  }

  private selectColor(color: string) {
    colorStore.setPrimaryColor(color);
    colorStore.updateLightnessVariations(color);
  }

  private regenerate() {
    const baseColor = colorStore.primaryColor.value;
    paletteStore.generateHarmony(baseColor);
  }

  private async extractFromDrawing() {
    await paletteStore.extractFromDrawing();
  }

  render() {
    const selectedHarmony = paletteStore.selectedHarmony.value;
    const generatedColors = paletteStore.generatedColors.value;
    const isExtracting = paletteStore.isExtracting.value;

    return html`
      <div class="harmony-selector">
        ${HARMONY_OPTIONS.map(opt => html`
          <button
            class="harmony-btn ${selectedHarmony === opt.type ? 'active' : ''}"
            @click=${() => this.selectHarmony(opt.type)}
            title=${opt.title}
          >
            ${opt.icon}
          </button>
        `)}
      </div>

      ${isExtracting ? html`
        <div class="loading">
          <div class="spinner"></div>
          Extracting colors...
        </div>
      ` : html`
        <div class="swatch-row">
          ${[0, 1, 2, 3, 4].map(i => {
            const color = generatedColors[i];
            return color ? html`
              <div
                class="swatch"
                style="background-color: ${color}"
                title="${color}"
                @click=${() => this.selectColor(color)}
              ></div>
            ` : html`
              <div class="swatch empty" title="No color"></div>
            `;
          })}
        </div>
      `}

      <div class="actions">
        <button
          class="action-btn"
          @click=${this.regenerate}
          ?disabled=${isExtracting}
          title="Generate new palette from current color"
        >
          Regenerate
        </button>
        <button
          class="action-btn"
          @click=${this.extractFromDrawing}
          ?disabled=${isExtracting}
          title="Extract colors from drawing"
        >
          From Drawing
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-palette-generator': PFPaletteGenerator;
  }
}
