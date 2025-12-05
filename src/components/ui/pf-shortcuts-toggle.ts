import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";

/**
 * Toggle button for the shortcuts preview overlay.
 * Always visible at fixed bottom-right position.
 */
@customElement("pf-shortcuts-toggle")
export class PfShortcutsToggle extends BaseComponent {
  static styles = css`
    :host {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 100;
    }

    button {
      background: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 10px;
      color: var(--pf-color-text-muted);
      cursor: pointer;
    }

    button:hover {
      background: var(--pf-color-bg-hover);
      color: var(--pf-color-text-primary);
    }
  `;

  private handleClick() {
    window.dispatchEvent(new CustomEvent("toggle-shortcuts-overlay"));
  }

  render() {
    return html`<button @click=${this.handleClick} title="Toggle Shortcuts Preview">?</button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-shortcuts-toggle": PfShortcutsToggle;
  }
}
