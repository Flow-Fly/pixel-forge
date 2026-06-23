import { html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";

/**
 * Reusable button component with consistent styling.
 *
 * Variants:
 * - `default`: Standard action button (panels, dialogs)
 * - `primary`: Emphasized action (submit, confirm)
 * - `ghost`: Minimal styling, just text
 *
 * Sizes:
 * - `sm`: Small (font-size 10px, padding 4px 8px)
 * - `md`: Medium (font-size 11px, padding 4px 10px) - default
 *
 * @example
 * ```html
 * <pf-button @click=${this.handleAdd}>+ Add</pf-button>
 * <pf-button variant="primary" @click=${this.handleSave}>Save</pf-button>
 * <pf-button ?disabled=${!canDelete} @click=${this.handleDelete}>Delete</pf-button>
 * ```
 */
@customElement("pf-button")
export class PFButton extends BaseComponent {
  static styles = css`
    :host {
      display: inline-block;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 6px 12px;
      font-size: 11px;
      font-family: inherit;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: var(--pf-color-bg-input);
      color: var(--pf-color-text-primary);
      cursor: pointer;
      transition: all 0.1s ease;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.035) inset;
    }

    button:hover:not(:disabled) {
      background: var(--pf-color-bg-hover);
      border-color: var(--pf-color-border-strong);
      color: var(--pf-color-text-main);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Small size */
    :host([size="sm"]) button {
      padding: 4px 8px;
      font-size: 10px;
    }

    /* Primary variant */
    :host([variant="primary"]) button {
      background: var(--pf-color-primary-transparent);
      border-color: var(--pf-color-accent, #4a9eff);
      color: var(--pf-color-accent-hover);
      box-shadow: var(--pf-shadow-glow);
    }

    :host([variant="primary"]) button:hover:not(:disabled) {
      background: var(--pf-color-primary-muted);
      border-color: var(--pf-color-accent-hover, #3a8eef);
    }

    /* Ghost variant */
    :host([variant="ghost"]) button {
      background: transparent;
      border-color: transparent;
    }

    :host([variant="ghost"]) button:hover:not(:disabled) {
      background: var(--pf-color-bg-hover);
    }

    /* Flex fill for action button rows */
    :host([fill]) {
      flex: 1;
    }

    :host([fill]) button {
      width: 100%;
    }
  `;

  /** Button variant */
  @property({ type: String, reflect: true }) variant:
    | "default"
    | "primary"
    | "ghost" = "default";

  /** Button size */
  @property({ type: String, reflect: true }) size: "sm" | "md" = "md";

  /** Disabled state */
  @property({ type: Boolean, reflect: true }) disabled = false;

  /** Fill available width (for action button rows) */
  @property({ type: Boolean, reflect: true }) fill = false;

  /** Button title/tooltip */
  @property({ type: String }) title = "";

  render() {
    return html`
      <button ?disabled=${this.disabled} title=${this.title || nothing}>
        <slot></slot>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-button": PFButton;
  }
}
