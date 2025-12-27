import { html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { BaseComponent } from "./base-component";

/**
 * Reusable form field wrapper providing consistent label styling.
 * Designed to wrap any input element (checkbox, slider, select, etc.)
 *
 * Slots:
 * - `default`: The input element(s)
 *
 * @example
 * ```html
 * <pf-form-field label="Opacity">
 *   <input type="range" min="0" max="100" />
 * </pf-form-field>
 *
 * <pf-form-field label="Pixel Perfect" layout="checkbox">
 *   <input type="checkbox" />
 * </pf-form-field>
 * ```
 */
@customElement("pf-form-field")
export class PFFormField extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Vertical layout for stacked label + input */
    :host([layout="vertical"]) {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    /* Checkbox layout: input first, then label */
    :host([layout="checkbox"]) {
      flex-direction: row;
    }

    .label {
      color: var(--pf-color-text-muted, #808080);
      font-size: 10px;
      white-space: nowrap;
      user-select: none;
    }

    /* Make label clickable for checkbox layout */
    :host([layout="checkbox"]) .label {
      cursor: pointer;
    }

    /* Suffix (e.g., ":" after label) */
    .label-suffix {
      margin-right: 0;
    }

    /* Hide suffix in checkbox layout */
    :host([layout="checkbox"]) .label-suffix {
      display: none;
    }

    /* Slot wrapper for input styling hooks */
    .input-wrapper {
      display: flex;
      align-items: center;
      gap: 4px;
    }
  `;

  /** Label text */
  @property({ type: String }) label = "";

  /** Layout variant: 'horizontal' (default), 'vertical', or 'checkbox' */
  @property({ type: String, reflect: true }) layout:
    | "horizontal"
    | "vertical"
    | "checkbox" = "horizontal";

  /** Optional suffix after label (default: ":" for horizontal, none for checkbox) */
  @property({ type: String }) suffix = "";

  // Note: We don't use for/id linking because it doesn't work across shadow DOM boundaries.
  // Instead, for checkbox layout, we use a click handler on the label.

  render() {
    const showSuffix =
      this.suffix || (this.layout !== "checkbox" && this.label);
    const suffixText = this.suffix || ":";

    // For checkbox layout, render input first
    if (this.layout === "checkbox") {
      return html`
        <div class="input-wrapper">
          <slot></slot>
        </div>
        ${this.label
          ? html`<label class="label" @click=${this.handleLabelClick}
              >${this.label}</label
            >`
          : nothing}
      `;
    }

    // Default: label first, then input
    return html`
      ${this.label
        ? html`<label class="label"
            >${this.label}${showSuffix
              ? html`<span class="label-suffix">${suffixText}</span>`
              : nothing}</label
          >`
        : nothing}
      <div class="input-wrapper">
        <slot></slot>
      </div>
    `;
  }

  /** Handle label click for checkbox layout - toggles the slotted checkbox */
  private handleLabelClick() {
    if (this.layout !== "checkbox") return;

    // Find the slotted checkbox input
    const slot = this.shadowRoot?.querySelector("slot");
    const slottedElements = slot?.assignedElements({ flatten: true }) || [];
    const checkbox = slottedElements.find(
      (el) => el instanceof HTMLInputElement && el.type === "checkbox"
    ) as HTMLInputElement | undefined;

    if (checkbox) {
      checkbox.click();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-form-field": PFFormField;
  }
}
