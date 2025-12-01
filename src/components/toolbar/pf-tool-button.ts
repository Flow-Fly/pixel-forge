import { html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';

@customElement('pf-tool-button')
export class PFToolButton extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      width: 32px;
      height: 32px;
      margin: 4px auto;
    }

    button {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: transparent;
      border: 1px solid transparent;
      border-radius: 2px;
      color: var(--pf-color-text-muted);
      transition: all 0.1s;
    }

    button:hover {
      background-color: var(--pf-color-bg-surface);
      color: var(--pf-color-text-main);
    }

    :host([active]) button {
      background-color: var(--pf-color-bg-surface);
      border-color: var(--pf-color-accent-cyan);
      color: var(--pf-color-accent-cyan);
      box-shadow: var(--pf-shadow-glow-cyan);
    }
  `;

  @property({ type: String }) tool = '';
  @property({ type: String }) icon = '';
  @property({ type: String }) shortcut = '';
  @property({ type: Boolean, reflect: true }) active = false;

  render() {
    return html`
      <button title="${this.tool} (${this.shortcut})">
        <!-- Placeholder icon if no icon provided -->
        ${this.icon ? html`<span class="icon">${this.icon}</span>` : html`<span>${this.tool[0].toUpperCase()}</span>`}
      </button>
    `;
  }
}
