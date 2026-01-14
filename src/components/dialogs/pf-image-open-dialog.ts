import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";

@customElement("pf-image-open-dialog")
export class PFImageOpenDialog extends BaseComponent {
  static styles = css`
    :host {
      display: none;
    }

    :host([open]) {
      display: block;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialog {
      background: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 8px;
      padding: var(--pf-spacing-4);
      min-width: 300px;
      max-width: 400px;
    }

    .title {
      font-size: var(--pf-font-size-lg);
      margin-bottom: var(--pf-spacing-3);
    }

    .message {
      color: var(--pf-color-text-muted);
      margin-bottom: var(--pf-spacing-4);
    }

    .buttons {
      display: flex;
      gap: var(--pf-spacing-2);
      justify-content: flex-end;
    }

    button {
      padding: 8px 16px;
      border-radius: 4px;
      border: 1px solid var(--pf-color-border);
      background: var(--pf-color-bg-dark);
      color: var(--pf-color-text-main);
      cursor: pointer;
    }

    button:hover {
      background: var(--pf-color-bg-hover);
    }

    button.primary {
      background: var(--pf-color-accent);
      border-color: var(--pf-color-accent);
    }

    button.primary:hover {
      filter: brightness(1.1);
    }
  `;

  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: String }) filename = "";

  private handleReference() {
    this.dispatchEvent(new CustomEvent("select", { detail: { type: "reference" } }));
    this.open = false;
  }

  private handleProject() {
    this.dispatchEvent(new CustomEvent("select", { detail: { type: "project" } }));
    this.open = false;
  }

  private handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
    this.open = false;
  }

  render() {
    if (!this.open) return html``;

    return html`
      <div class="overlay" @click=${this.handleCancel}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <div class="title">Open Image</div>
          <div class="message">
            How would you like to open "${this.filename}"?
          </div>
          <div class="buttons">
            <button @click=${this.handleCancel}>Cancel</button>
            <button @click=${this.handleProject}>New Project</button>
            <button class="primary" @click=${this.handleReference}>
              Reference Image
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
