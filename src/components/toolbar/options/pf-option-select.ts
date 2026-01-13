import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SignalWatcher } from "@lit-labs/signals";
import { getOptionValue, setOptionValue, type StoreType } from "./store-accessor";
import "../../ui";

export interface SelectOption {
  value: string;
  label: string;
}

@customElement("pf-option-select")
export class PfOptionSelect extends SignalWatcher(LitElement) {
  static styles = css`
    select {
      background: var(--pf-color-bg-tertiary);
      color: var(--pf-color-text-primary);
      border: 1px solid var(--pf-color-border);
      border-radius: 3px;
      padding: 2px 4px;
      font-size: 11px;
      cursor: pointer;
      outline: none;
    }

    select:hover {
      border-color: var(--pf-color-accent);
    }

    select:focus {
      border-color: var(--pf-color-accent);
      box-shadow: 0 0 0 1px var(--pf-color-accent);
    }
  `;

  @property({ type: String }) label = "";
  @property({ type: String }) store: StoreType = "brush";
  @property({ type: String }) storeKey = "";
  @property({ type: Array }) options: SelectOption[] = [];

  private handleChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    setOptionValue(this.store, this.storeKey, select.value);
  }

  render() {
    const currentValue = (getOptionValue(this.store, this.storeKey) as string) ?? "";

    // If no label, render select directly without wrapper
    if (!this.label) {
      return html`
        <select @change=${this.handleChange}>
          ${this.options.map(
            (opt) => html`
              <option value=${opt.value} ?selected=${opt.value === currentValue}>
                ${opt.label}
              </option>
            `
          )}
        </select>
      `;
    }

    return html`
      <pf-form-field label=${this.label}>
        <select @change=${this.handleChange}>
          ${this.options.map(
            (opt) => html`
              <option value=${opt.value} ?selected=${opt.value === currentValue}>
                ${opt.label}
              </option>
            `
          )}
        </select>
      </pf-form-field>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-option-select": PfOptionSelect;
  }
}
