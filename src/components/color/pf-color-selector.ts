import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { colorStore } from '../../stores/colors';

@customElement('pf-color-selector')
export class PFColorSelector extends BaseComponent {
  static styles = css`
    /* ... styles ... */
    :host {
      display: block;
      width: 48px;
      height: 48px;
      position: relative;
    }

    .color-box {
      width: 28px;
      height: 28px;
      border: 1px solid var(--pf-color-border);
      position: absolute;
      cursor: pointer;
    }

    .bg {
      bottom: 0;
      right: 0;
      z-index: 1;
    }

    .fg {
      top: 0;
      left: 0;
      z-index: 2;
    }

    .swap-btn {
      position: absolute;
      top: 0;
      right: 0;
      width: 12px;
      height: 12px;
      font-size: 10px;
      cursor: pointer;
      z-index: 3;
      color: var(--pf-color-text-muted);
    }
  `;

  render() {
    return html`
      <div 
        class="color-box bg" 
        style="background-color: ${colorStore.secondaryColor.value}"
        @click=${() => this.selectColor('bg')}
      ></div>
      <div 
        class="color-box fg" 
        style="background-color: ${colorStore.primaryColor.value}"
        @click=${() => this.selectColor('fg')}
      ></div>
      <div class="swap-btn" @click=${this.swapColors}>X</div>
    `;
  }

  selectColor(type: 'fg' | 'bg') {
    console.log('Select color:', type);
    // Open color picker dialog or activate picker mode
  }

  swapColors() {
    colorStore.swapColors();
  }
}
