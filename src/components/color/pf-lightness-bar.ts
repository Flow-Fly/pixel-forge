import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { colorStore } from '../../stores/colors';

const STORAGE_KEY = 'pf-lightness-bar-collapsed';

@customElement('pf-lightness-bar')
export class PFLightnessBar extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
    }

    .container {
      display: flex;
      align-items: center;
      padding: 0 4px;
      transition: opacity 0.15s ease;
    }

    .container.collapsed {
      /* Keep minimal width when collapsed */
    }

    .chevron {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--pf-color-text-muted, #808080);
      font-size: 10px;
      flex-shrink: 0;
      transition: transform 0.15s ease;
    }

    .chevron:hover {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .chevron.collapsed {
      transform: rotate(-90deg);
    }

    .swatches {
      display: flex;
      gap: 2px;
      justify-content: center;
      flex: 1;
      transition: opacity 0.1s ease;
    }

    .swatches.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .swatch {
      width: 20px;
      height: 14px;
      cursor: pointer;
      border-radius: 2px;
      transition: transform 0.1s ease, outline-color 0.1s ease, background-color 0.1s ease;
      outline: 1px solid transparent;
      outline-offset: -1px;
    }

    .swatch:hover {
      transform: scale(1.1);
    }

    .swatch.active {
      outline-color: var(--pf-color-accent, #4a9eff);
    }

    .spacer {
      width: 16px;
      flex-shrink: 0;
    }
  `;

  @state() private collapsed = false;

  connectedCallback() {
    super.connectedCallback();
    this.loadCollapseState();
  }

  private loadCollapseState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      this.collapsed = saved === 'true';
    }
  }

  private saveCollapseState() {
    localStorage.setItem(STORAGE_KEY, String(this.collapsed));
  }

  private toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.saveCollapseState();
  }

  private selectSwatch(index: number) {
    colorStore.setLightnessIndex(index);
  }

  render() {
    const variations = colorStore.lightnessVariations.value;
    const activeIndex = colorStore.lightnessIndex.value;

    return html`
      <div class="container ${this.collapsed ? 'collapsed' : ''}">
        <div
          class="chevron ${this.collapsed ? 'collapsed' : ''}"
          @click=${this.toggleCollapse}
          title="${this.collapsed ? 'Expand' : 'Collapse'} lightness bar"
        >
          ▼
        </div>

        <div class="swatches ${this.collapsed ? 'hidden' : ''}">
          ${variations.map((color, index) => html`
            <div
              class="swatch ${index === activeIndex ? 'active' : ''}"
              style="background-color: ${color}"
              title="${color} (${index + 1})"
              @click=${() => this.selectSwatch(index)}
            ></div>
          `)}
        </div>

        <div class="spacer"></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-lightness-bar': PFLightnessBar;
  }
}
