import { html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { BaseComponent } from "./base-component";

/**
 * Reusable dialog/modal component with backdrop, close behaviors, and slot-based content.
 *
 * Slots:
 * - `title`: Dialog title text
 * - `default`: Main content area
 * - `actions`: Footer buttons (Cancel, Apply, etc.)
 *
 * @fires pf-close - Dispatched when dialog should close (backdrop click, escape key, or close() called)
 *
 * @example
 * ```html
 * <pf-dialog ?open=${this.showDialog} @pf-close=${() => this.showDialog = false}>
 *   <span slot="title">Dialog Title</span>
 *   <div>Content goes here</div>
 *   <div slot="actions">
 *     <button class="secondary" @click=${this.close}>Cancel</button>
 *     <button class="primary" @click=${this.apply}>Apply</button>
 *   </div>
 * </pf-dialog>
 * ```
 */
@customElement("pf-dialog")
export class PFDialog extends BaseComponent {
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
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dialog {
      background-color: var(--pf-color-bg-panel, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      padding: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      max-height: 90vh;
      overflow-y: auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .title {
      font-weight: bold;
      font-size: 14px;
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .close-btn {
      background: transparent;
      border: 1px solid var(--pf-color-border, #333);
      color: var(--pf-color-text-main, #e0e0e0);
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
    }

    .close-btn:hover {
      background-color: var(--pf-color-bg-hover, #2a2a2a);
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .actions {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* Button styles for slotted content */
    ::slotted(button),
    ::slotted(.btn) {
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    ::slotted(button.primary),
    ::slotted(.btn-primary) {
      background-color: var(--pf-color-primary, #4a9eff);
      color: white;
      border: none;
    }

    ::slotted(button.primary:hover),
    ::slotted(.btn-primary:hover) {
      background-color: var(--pf-color-primary-hover, #3a8eef);
    }

    ::slotted(button.secondary),
    ::slotted(.btn-secondary) {
      background-color: transparent;
      border: 1px solid var(--pf-color-border, #333);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    ::slotted(button.secondary:hover),
    ::slotted(.btn-secondary:hover) {
      background-color: var(--pf-color-bg-hover, #2a2a2a);
    }
  `;

  /** Whether the dialog is open */
  @property({ type: Boolean, reflect: true }) open = false;

  /** Dialog width (CSS value) */
  @property({ type: String }) width = "300px";

  /** Close when clicking the backdrop */
  @property({ type: Boolean, attribute: "close-on-backdrop" })
  closeOnBackdrop = true;

  /** Close when pressing Escape key */
  @property({ type: Boolean, attribute: "close-on-escape" })
  closeOnEscape = true;

  /** Show the X close button in header */
  @property({ type: Boolean, attribute: "show-close-button" })
  showCloseButton = true;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.open && this.closeOnEscape && e.key === "Escape") {
      e.preventDefault();
      this.close();
    }
  };

  private handleBackdropClick = (e: MouseEvent) => {
    if (this.closeOnBackdrop && e.target === e.currentTarget) {
      this.close();
    }
  };

  private handleDialogClick = (e: MouseEvent) => {
    // Prevent backdrop click when clicking inside dialog
    e.stopPropagation();
  };

  /** Close the dialog and dispatch pf-close event */
  close() {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent("pf-close", {
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    if (!this.open) return nothing;

    return html`
      <div class="overlay" @click=${this.handleBackdropClick}>
        <div
          class="dialog"
          style="width: ${this.width}"
          @click=${this.handleDialogClick}
        >
          <div class="header">
            <span class="title">
              <slot name="title"></slot>
            </span>
            ${this.showCloseButton
              ? html`<button class="close-btn" @click=${this.close}>✕</button>`
              : nothing}
          </div>
          <div class="content">
            <slot></slot>
          </div>
          <div class="actions">
            <slot name="actions"></slot>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-dialog": PFDialog;
  }
}
