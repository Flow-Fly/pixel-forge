import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { paletteStore } from '../../stores/palette';
import { colorStore } from '../../stores/colors';

@customElement('pf-lightness-subpalette')
export class PFLightnessSubpalette extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: fixed;
      z-index: 1000;
    }

    .container {
      background: var(--pf-color-bg-panel, #1a1a1a);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      padding: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .title {
      font-size: 10px;
      color: var(--pf-color-text-muted, #808080);
      margin-bottom: 4px;
      text-align: center;
    }

    .variations {
      display: flex;
      gap: 2px;
    }

    .variation-swatch {
      width: 24px;
      height: 24px;
      cursor: pointer;
      border: 1px solid transparent;
      border-radius: 2px;
      transition: transform 0.1s ease;
    }

    .variation-swatch:hover {
      transform: scale(1.15);
      border-color: var(--pf-color-accent, #4a9eff);
      z-index: 1;
    }

    .variation-swatch.original {
      border-color: var(--pf-color-accent-cyan, #00e5ff);
    }
  `;

  @property({ type: String }) color = '#000000';
  @property({ type: Number }) x = 0;
  @property({ type: Number }) y = 0;

  private handleClickOutside = (e: MouseEvent) => {
    if (!this.contains(e.target as Node)) {
      this.close();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    // Delay to prevent immediate close from the triggering right-click
    setTimeout(() => {
      document.addEventListener('click', this.handleClickOutside);
    }, 10);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this.handleClickOutside);
  }

  private close() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  private selectVariation(color: string) {
    colorStore.setPrimaryColor(color);
    this.close();
  }

  render() {
    const variations = paletteStore.getLightnessVariations(this.color);

    // Find which variation is closest to the original color
    const originalIndex = variations.findIndex(v => v.toLowerCase() === this.color.toLowerCase());

    return html`
      <div class="container" style="left: ${this.x}px; top: ${this.y}px;">
        <div class="title">Lightness Variations</div>
        <div class="variations">
          ${variations.map((variation, index) => html`
            <div
              class="variation-swatch ${index === originalIndex ? 'original' : ''}"
              style="background-color: ${variation}"
              title="${variation}"
              @click=${() => this.selectVariation(variation)}
            ></div>
          `)}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-lightness-subpalette': PFLightnessSubpalette;
  }
}
