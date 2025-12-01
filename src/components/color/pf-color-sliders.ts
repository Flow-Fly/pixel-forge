import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { hexToRgb, rgbToHex } from '../../utils/color';
import { colorStore } from '../../stores/colors';

@customElement('pf-color-sliders')
export class PFColorSliders extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--pf-spacing-2);
      padding: var(--pf-spacing-2);
    }

    .slider-row {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2);
    }

    label {
      width: 16px;
      font-size: var(--pf-font-size-xs);
      color: var(--pf-color-text-muted);
    }

    input[type="range"] {
      flex: 1;
      accent-color: var(--pf-color-accent-cyan);
    }

    input[type="number"] {
      width: 40px;
      background: var(--pf-color-bg-surface);
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
      font-family: var(--pf-font-mono);
      font-size: var(--pf-font-size-xs);
      padding: 2px;
    }
  `;

  @state() private r = 0;
  @state() private g = 0;
  @state() private b = 0;

  connectedCallback() {
    super.connectedCallback();
    // Initialize from current global color
    this.updateFromHex(colorStore.primaryColor.value);
    
    // Subscribe to changes
    this.addController({
      hostConnected: () => {
        // In a real app we'd subscribe to the signal
        // For now, we rely on re-renders or manual updates if needed
      },
      hostDisconnected: () => {}
    });
  }

  updateFromHex(hex: string) {
    const rgb = hexToRgb(hex);
    if (rgb) {
      this.r = rgb.r;
      this.g = rgb.g;
      this.b = rgb.b;
    }
  }

  updateColor() {
    const hex = rgbToHex(this.r, this.g, this.b);
    colorStore.setPrimaryColor(hex);
  }

  handleInput(e: Event, channel: 'r' | 'g' | 'b') {
    const val = parseInt((e.target as HTMLInputElement).value);
    this[channel] = val;
    this.updateColor();
  }

  render() {
    return html`
      <div class="slider-row">
        <label>R</label>
        <input type="range" min="0" max="255" .value=${this.r.toString()} @input=${(e: Event) => this.handleInput(e, 'r')}>
        <input type="number" min="0" max="255" .value=${this.r.toString()} @input=${(e: Event) => this.handleInput(e, 'r')}>
      </div>
      <div class="slider-row">
        <label>G</label>
        <input type="range" min="0" max="255" .value=${this.g.toString()} @input=${(e: Event) => this.handleInput(e, 'g')}>
        <input type="number" min="0" max="255" .value=${this.g.toString()} @input=${(e: Event) => this.handleInput(e, 'g')}>
      </div>
      <div class="slider-row">
        <label>B</label>
        <input type="range" min="0" max="255" .value=${this.b.toString()} @input=${(e: Event) => this.handleInput(e, 'b')}>
        <input type="number" min="0" max="255" .value=${this.b.toString()} @input=${(e: Event) => this.handleInput(e, 'b')}>
      </div>
    `;
  }
}
