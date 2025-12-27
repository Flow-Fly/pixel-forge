import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SignalWatcher } from "@lit-labs/signals";
import { getOptionValue, setOptionValue, type StoreType } from "./store-accessor";
import "@pixel-forge/ui";

@customElement("pf-option-slider")
export class PfOptionSlider extends SignalWatcher(LitElement) {
  static styles = css`
    input[type="range"] {
      width: 60px;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: var(--pf-color-bg-tertiary);
      border-radius: 2px;
      cursor: pointer;
    }

    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      background: var(--pf-color-accent);
      border-radius: 50%;
      cursor: pointer;
    }

    input[type="range"]::-moz-range-thumb {
      width: 12px;
      height: 12px;
      background: var(--pf-color-accent);
      border-radius: 50%;
      cursor: pointer;
      border: none;
    }

    .value {
      min-width: 32px;
      font-size: 11px;
      color: var(--pf-color-text-secondary);
      text-align: right;
    }
  `;

  @property({ type: String }) label = "";
  @property({ type: String }) store: StoreType = "brush";
  @property({ type: String }) storeKey = "";
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ type: Number }) step = 1;
  @property({ type: String }) unit = "";
  /** Multiplier applied when reading/writing (e.g., 100 for opacity stored as 0-1) */
  @property({ type: Number }) multiplier = 1;

  private handleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    let value = parseFloat(input.value);

    // Apply inverse multiplier when writing
    if (this.multiplier !== 1) {
      value = value / this.multiplier;
    }

    setOptionValue(this.store, this.storeKey, value);
  }

  render() {
    const rawValue = (getOptionValue(this.store, this.storeKey) as number) ?? this.min;

    // Apply multiplier for display (e.g., 0.5 -> 50 for opacity)
    const displayValue = rawValue * this.multiplier;

    return html`
      <pf-form-field label=${this.label}>
        <input
          type="range"
          .min=${String(this.min)}
          .max=${String(this.max)}
          .step=${String(this.step)}
          .value=${String(displayValue)}
          @input=${this.handleInput}
        />
        <span class="value">${Math.round(displayValue)}${this.unit}</span>
      </pf-form-field>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-option-slider": PfOptionSlider;
  }
}
