import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SignalWatcher } from "@lit-labs/signals";
import { getOptionValue, setOptionValue, type StoreType } from "./store-accessor";

@customElement("pf-option-checkbox")
export class PfOptionCheckbox extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    input[type="checkbox"] {
      width: 14px;
      height: 14px;
      margin: 0;
      cursor: pointer;
      accent-color: var(--pf-color-accent);
    }

    label {
      color: var(--pf-color-text-primary);
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }
  `;

  @property({ type: String }) label = "";
  @property({ type: String }) store: StoreType = "brush";
  @property({ type: String }) storeKey = "";
  @property({ type: String }) title = "";

  private handleChange(e: Event) {
    const input = e.target as HTMLInputElement;
    setOptionValue(this.store, this.storeKey, input.checked);
  }

  render() {
    const checked = (getOptionValue(this.store, this.storeKey) as boolean) ?? false;
    const id = `opt-${this.store}-${this.storeKey}`;

    return html`
      <input
        type="checkbox"
        id=${id}
        .checked=${checked}
        @change=${this.handleChange}
      />
      <label for=${id} title=${this.title || ""}>${this.label}</label>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-option-checkbox": PfOptionCheckbox;
  }
}
