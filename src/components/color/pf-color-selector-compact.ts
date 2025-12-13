import { html, css } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { colorStore } from '../../stores/colors';

/**
 * Compact color selector for the toolbar.
 * Shows FG/BG colors stacked vertically with a swap button.
 */
@customElement('pf-color-selector-compact')
export class PFColorSelectorCompact extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 4px;
    }

    .colors-container {
      position: relative;
      width: 32px;
      height: 32px;
    }

    .color-box {
      width: 20px;
      height: 20px;
      border: 1px solid var(--pf-color-border, #333);
      position: absolute;
      cursor: pointer;
      transition: transform 0.1s ease;
    }

    .color-box:hover {
      transform: scale(1.1);
      z-index: 10;
    }

    .bg {
      bottom: 0;
      right: 0;
      z-index: 1;
    }

    .fg {
      top: 0;
      left: 0;
      z-index: 2;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .swap-btn {
      width: 16px;
      height: 16px;
      font-size: 10px;
      cursor: pointer;
      color: var(--pf-color-text-muted, #808080);
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.15s ease;
    }

    .swap-btn:hover {
      background: var(--pf-color-bg-hover, #2a2a2a);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .reset-btn {
      width: 16px;
      height: 16px;
      font-size: 8px;
      cursor: pointer;
      color: var(--pf-color-text-muted, #808080);
      background: transparent;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .reset-btn:hover {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .hidden-picker {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
      pointer-events: none;
    }
  `;

  @query('#fg-picker') private fgPicker!: HTMLInputElement;
  @query('#bg-picker') private bgPicker!: HTMLInputElement;

  render() {
    return html`
      <div class="colors-container">
        <div
          class="color-box bg"
          style="background-color: ${colorStore.secondaryColor.value}"
          @click=${() => this.openPicker('bg')}
          title="Background Color - Click to change"
        ></div>
        <div
          class="color-box fg"
          style="background-color: ${colorStore.primaryColor.value}"
          @click=${() => this.openPicker('fg')}
          title="Foreground Color - Click to change"
        ></div>
      </div>
      <button class="swap-btn" @click=${this.swapColors} title="Swap Colors (X)">
        ⇄
      </button>
      <button class="reset-btn" @click=${this.resetColors} title="Reset to Default">
        D
      </button>

      <!-- Hidden color pickers -->
      <input
        type="color"
        id="fg-picker"
        class="hidden-picker"
        .value=${colorStore.primaryColor.value}
        @input=${this.handleFgChange}
      />
      <input
        type="color"
        id="bg-picker"
        class="hidden-picker"
        .value=${colorStore.secondaryColor.value}
        @input=${this.handleBgChange}
      />
    `;
  }

  private openPicker(type: 'fg' | 'bg') {
    if (type === 'fg') {
      this.fgPicker.click();
    } else {
      this.bgPicker.click();
    }
  }

  private handleFgChange(e: Event) {
    const color = (e.target as HTMLInputElement).value;
    colorStore.setPrimaryColor(color);
    colorStore.updateLightnessVariations(color);
  }

  private handleBgChange(e: Event) {
    const color = (e.target as HTMLInputElement).value;
    colorStore.setSecondaryColor(color);
  }

  private swapColors() {
    colorStore.swapColors();
  }

  private resetColors() {
    colorStore.setPrimaryColor('#000000');
    colorStore.setSecondaryColor('#ffffff');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-color-selector-compact': PFColorSelectorCompact;
  }
}
