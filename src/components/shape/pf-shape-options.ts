import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { shapeStore } from '../../stores/shape';

@customElement('pf-shape-options')
export class PFShapeOptions extends BaseComponent {
  static styles = css`
    :host {
      display: block;
    }

    .option-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .option-row:last-child {
      margin-bottom: 0;
    }

    label {
      color: var(--pf-color-text-main, #e0e0e0);
      cursor: pointer;
    }

    input[type="checkbox"] {
      accent-color: var(--pf-color-accent, #4a9eff);
      cursor: pointer;
    }

    input[type="range"] {
      flex: 1;
      min-width: 60px;
      accent-color: var(--pf-color-accent, #4a9eff);
    }

    .value {
      min-width: 30px;
      text-align: right;
      color: var(--pf-color-text-muted, #808080);
      font-size: 11px;
    }
  `;

  render() {
    const filled = shapeStore.filled.value;
    const strokeWidth = shapeStore.strokeWidth.value;

    return html`
      <div class="option-row">
        <input
          type="checkbox"
          id="shape-fill"
          .checked=${filled}
          @change=${this.handleFillChange}
        >
        <label for="shape-fill">Fill Shape</label>
      </div>
      <div class="option-row">
        <label>Stroke:</label>
        <input
          type="range"
          min="1"
          max="10"
          .value=${String(strokeWidth)}
          @input=${this.handleStrokeChange}
        >
        <span class="value">${strokeWidth}px</span>
      </div>
    `;
  }

  private handleFillChange(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    shapeStore.setFilled(checked);
  }

  private handleStrokeChange(e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value);
    shapeStore.setStrokeWidth(value);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-shape-options': PFShapeOptions;
  }
}
