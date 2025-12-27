import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { gridStore } from "../../stores/grid";
import { ZOOM_LEVELS } from "../../stores/viewport";
import "@pixel-forge/ui";

@customElement("pf-grid-settings-dialog")
export class PFGridSettingsDialog extends BaseComponent {
  static styles = css`
    .section {
      margin-bottom: 16px;
    }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--pf-color-text-main);
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--pf-color-border);
    }

    .input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    label {
      font-size: 12px;
      color: var(--pf-color-text-muted);
      min-width: 80px;
    }

    input[type="number"] {
      background-color: var(--pf-color-bg-dark);
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
      padding: 4px 8px;
      border-radius: 4px;
      width: 60px;
    }

    input[type="color"] {
      width: 32px;
      height: 24px;
      padding: 0;
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      cursor: pointer;
      background: none;
    }

    input[type="range"] {
      flex: 1;
      max-width: 120px;
    }

    .zoom-slider-container {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .zoom-slider {
      flex: 1;
      max-width: 140px;
    }

    .zoom-value {
      font-size: 11px;
      color: var(--pf-color-text-main);
      min-width: 45px;
      text-align: right;
      font-weight: 500;
    }

    .zoom-hint {
      font-size: 10px;
      color: var(--pf-color-text-muted);
      margin-top: 2px;
    }

    .opacity-value {
      font-size: 11px;
      color: var(--pf-color-text-muted);
      min-width: 35px;
      text-align: right;
    }

    button {
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    button.primary {
      background-color: var(--pf-color-primary);
      color: white;
      border: none;
    }

    button.secondary {
      background-color: transparent;
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
    }
  `;

  @property({ type: Boolean }) open = false;

  // Local state for editing
  @state() private pixelGridColor = "#000000";
  @state() private pixelGridOpacity = 1.0;
  @state() private autoShowThreshold = 16;
  @state() private tileGridSize = 16;
  @state() private tileGridColor = "#0088ff";
  @state() private tileGridOpacity = 0.4;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("show-grid-settings-dialog", this.handleShow);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("show-grid-settings-dialog", this.handleShow);
  }

  private handleShow = () => {
    this.loadFromStore();
    this.open = true;
  };

  private loadFromStore() {
    this.pixelGridColor = gridStore.pixelGridColor.value;
    this.pixelGridOpacity = gridStore.pixelGridOpacity.value;
    this.autoShowThreshold = gridStore.autoShowThreshold.value;
    this.tileGridSize = gridStore.tileGridSize.value;
    this.tileGridColor = gridStore.tileGridColor.value;
    this.tileGridOpacity = gridStore.tileGridOpacity.value;
  }

  render() {
    return html`
      <pf-dialog ?open=${this.open} width="320px" @pf-close=${this.close}>
        <span slot="title">Grid Settings</span>

        <div class="section">
          <div class="section-title">Pixel Grid</div>
          <div class="input-row">
            <label>Color</label>
            <input
              type="color"
              .value=${this.pixelGridColor}
              @input=${(e: Event) =>
                (this.pixelGridColor = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-row">
            <label>Opacity</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              .value=${String(this.pixelGridOpacity)}
              @input=${(e: Event) =>
                (this.pixelGridOpacity = parseFloat(
                  (e.target as HTMLInputElement).value
                ))}
            />
            <span class="opacity-value"
              >${Math.round(this.pixelGridOpacity * 100)}%</span
            >
          </div>
          <div class="input-row">
            <label>Auto-show at</label>
            <div class="zoom-slider-container">
              <input
                class="zoom-slider"
                type="range"
                min="0"
                max="${ZOOM_LEVELS.length - 1}"
                step="1"
                .value=${String(this.getZoomIndex(this.autoShowThreshold))}
                @input=${this.handleZoomSlider}
              />
              <span class="zoom-value">${this.autoShowThreshold * 100}%</span>
            </div>
          </div>
          <div class="zoom-hint">Grid appears when zoomed to this level or higher</div>
        </div>

        <div class="section">
          <div class="section-title">Tile Grid</div>
          <div class="input-row">
            <label>Size</label>
            <input
              type="number"
              min="2"
              max="256"
              .value=${this.tileGridSize}
              @input=${(e: Event) =>
                (this.tileGridSize = parseInt(
                  (e.target as HTMLInputElement).value
                ))}
            />
            <span class="opacity-value">px</span>
          </div>
          <div class="input-row">
            <label>Color</label>
            <input
              type="color"
              .value=${this.tileGridColor}
              @input=${(e: Event) =>
                (this.tileGridColor = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="input-row">
            <label>Opacity</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              .value=${String(this.tileGridOpacity)}
              @input=${(e: Event) =>
                (this.tileGridOpacity = parseFloat(
                  (e.target as HTMLInputElement).value
                ))}
            />
            <span class="opacity-value"
              >${Math.round(this.tileGridOpacity * 100)}%</span
            >
          </div>
        </div>

        <div slot="actions">
          <button class="secondary" @click=${this.close}>Cancel</button>
          <button class="primary" @click=${this.apply}>Apply</button>
        </div>
      </pf-dialog>
    `;
  }

  private getZoomIndex(zoomLevel: number): number {
    const index = ZOOM_LEVELS.indexOf(zoomLevel as (typeof ZOOM_LEVELS)[number]);
    return index >= 0 ? index : 0;
  }

  private handleZoomSlider(e: Event) {
    const input = e.target as HTMLInputElement;
    const index = parseInt(input.value, 10);
    this.autoShowThreshold = ZOOM_LEVELS[index];
  }

  close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("close"));
  }

  apply() {
    // Apply all settings to store
    gridStore.setPixelGridColor(this.pixelGridColor);
    gridStore.setPixelGridOpacity(this.pixelGridOpacity);
    gridStore.setAutoShowThreshold(this.autoShowThreshold);
    gridStore.setTileSize(this.tileGridSize);
    gridStore.setTileGridColor(this.tileGridColor);
    gridStore.setTileGridOpacity(this.tileGridOpacity);
    this.close();
  }
}
