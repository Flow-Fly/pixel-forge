import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SignalWatcher } from "@lit-labs/signals";
import { getOptionValue, setOptionValue, type StoreType } from "./store-accessor";
import "@pixel-forge/ui";

@customElement("pf-option-checkbox")
export class PfOptionCheckbox extends SignalWatcher(LitElement) {
  static styles = css`
    input[type="checkbox"] {
      width: 14px;
      height: 14px;
      margin: 0;
      cursor: pointer;
      accent-color: var(--pf-color-accent);
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
      <pf-form-field label=${this.label} layout="checkbox">
        <input
          type="checkbox"
          id=${id}
          name=${id}
          .checked=${checked}
          title=${this.title || ""}
          @change=${this.handleChange}
        />
      </pf-form-field>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-option-checkbox": PfOptionCheckbox;
  }
}
