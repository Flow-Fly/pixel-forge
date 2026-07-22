import { html, css, nothing, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { scrollbarStyles } from "../../styles/scrollbar-styles";

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
  private previouslyFocused: HTMLElement | null = null;

  static styles = css`
    ${scrollbarStyles}

    :host {
      display: none;
    }

    :host([open]) {
      display: block;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.64);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(8px);
    }

    .dialog {
      background-color: rgba(13, 16, 21, 0.96);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: var(--pf-radius-md);
      padding: 16px;
      --pf-scrollbar-surface-shadow: var(--pf-shadow-lg);
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
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .close-btn {
      background: transparent;
      border: 1px solid var(--pf-color-border, #333);
      color: var(--pf-color-text-main, #e0e0e0);
      padding: 2px 6px;
      border-radius: var(--pf-radius-sm);
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
    }

    .close-btn:hover {
      background-color: var(--pf-color-bg-hover, #2a2a2a);
    }

    .close-btn:focus-visible {
      outline: 1px solid var(--pf-color-accent);
      outline-offset: 2px;
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
      border-radius: var(--pf-radius-sm);
      cursor: pointer;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    ::slotted(button.primary),
    ::slotted(.btn-primary) {
      background-color: var(--pf-color-primary-transparent, #4a9eff);
      color: var(--pf-color-accent-hover);
      border: 1px solid var(--pf-color-accent);
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
    this.restoreFocus();
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.open) return;

    if (this.closeOnEscape && e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }

    if (e.key === "Tab") {
      this.containFocus(e);
    }
  };

  protected updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);
    if (!changedProperties.has("open")) return;

    if (this.open) {
      this.previouslyFocused = document.activeElement as HTMLElement | null;
      this.focusableElements()[0]?.focus();
    } else {
      this.restoreFocus();
    }
  }

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
    this.restoreFocus();
    this.dispatchEvent(
      new CustomEvent("pf-close", {
        bubbles: true,
        composed: true,
      })
    );
  }

  private focusableElements(): HTMLElement[] {
    const closeButton = this.shadowRoot?.querySelector<HTMLElement>(".close-btn");
    const slottedElements = Array.from(
      this.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
    );
    return closeButton ? [closeButton, ...slottedElements] : slottedElements;
  }

  private containFocus(event: KeyboardEvent) {
    const focusable = this.focusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const activeElement = this.shadowRoot?.activeElement ?? document.activeElement;
    const activeIndex = focusable.indexOf(activeElement as HTMLElement);
    const isLeavingStart = event.shiftKey && activeIndex <= 0;
    const isLeavingEnd = !event.shiftKey && activeIndex === focusable.length - 1;
    if (!isLeavingStart && !isLeavingEnd) return;

    event.preventDefault();
    (isLeavingStart ? focusable.at(-1) : focusable[0])?.focus();
  }

  private restoreFocus() {
    if (!this.previouslyFocused?.isConnected) {
      this.previouslyFocused = null;
      return;
    }

    this.previouslyFocused.focus();
    this.previouslyFocused = null;
  }

  render() {
    if (!this.open) return nothing;

    return html`
      <div class="overlay" @click=${this.handleBackdropClick}>
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          data-scrollbar="vertical"
          style="width: ${this.width}"
          @click=${this.handleDialogClick}
        >
          <div class="header">
            <span class="title" id="dialog-title">
              <slot name="title"></slot>
            </span>
            ${this.showCloseButton
              ? html`<button
                  class="close-btn"
                  type="button"
                  aria-label="Close dialog"
                  @click=${this.close}
                >✕</button>`
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
