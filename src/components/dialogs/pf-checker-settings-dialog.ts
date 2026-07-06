import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import {
  CHECKER_TILE_SIZE_MAX,
  CHECKER_TILE_SIZE_MIN,
  settingsStore,
} from "../../stores/settings";
import "../ui/pf-dialog";

@customElement("pf-checker-settings-dialog")
export class PFCheckerSettingsDialog extends BaseComponent {
  static styles = css`
    form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    fieldset {
      border: 0;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    legend {
      font-size: 12px;
      font-weight: 600;
      color: var(--pf-color-text-main);
      margin-bottom: 2px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--pf-color-border);
      width: 100%;
    }

    .input-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    label {
      font-size: 12px;
      color: var(--pf-color-text-muted);
      min-width: 84px;
    }

    input[type="number"] {
      background-color: var(--pf-color-bg-dark);
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
      padding: 4px 8px;
      border-radius: 4px;
      width: 64px;
    }

    input[type="color"] {
      width: 34px;
      height: 26px;
      padding: 0;
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      cursor: pointer;
      background: transparent;
    }

    input:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--pf-color-accent);
      outline-offset: 2px;
    }

    .unit {
      font-size: 11px;
      color: var(--pf-color-text-muted);
    }

    .preview {
      height: 44px;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background-color: var(--checker-preview-dark);
      background-image: linear-gradient(
          45deg,
          var(--checker-preview-light) 25%,
          transparent 25%
        ),
        linear-gradient(-45deg, var(--checker-preview-light) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, var(--checker-preview-light) 75%),
        linear-gradient(-45deg, transparent 75%, var(--checker-preview-light) 75%);
      background-size: calc(var(--checker-preview-size) * 2)
        calc(var(--checker-preview-size) * 2);
      background-position: 0 0, 0 var(--checker-preview-size),
        var(--checker-preview-size) calc(-1 * var(--checker-preview-size)),
        calc(-1 * var(--checker-preview-size)) 0;
    }

    button {
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    button.primary {
      background-color: var(--pf-color-primary-transparent);
      color: var(--pf-color-accent-hover);
      border: 1px solid var(--pf-color-accent);
    }

    button.secondary {
      background-color: transparent;
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
    }
  `;

  @property({ type: Boolean }) open = false;
  @state() private checkerLightColor = "#2a3340";
  @state() private checkerDarkColor = "#151a21";
  @state() private checkerTileSize = 8;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("show-checker-settings-dialog", this.handleShow);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("show-checker-settings-dialog", this.handleShow);
  }

  private handleShow = () => {
    this.loadFromStore();
    this.open = true;
  };

  private loadFromStore() {
    this.checkerLightColor = settingsStore.checkerLightColor.value;
    this.checkerDarkColor = settingsStore.checkerDarkColor.value;
    this.checkerTileSize = settingsStore.checkerTileSize.value;
  }

  private close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("close"));
  }

  private apply(e: SubmitEvent) {
    e.preventDefault();
    settingsStore.setCheckerSettings({
      lightColor: this.checkerLightColor,
      darkColor: this.checkerDarkColor,
      tileSize: this.checkerTileSize,
    });
    this.close();
  }

  render() {
    const previewStyle = [
      `--checker-preview-light: ${this.checkerLightColor}`,
      `--checker-preview-dark: ${this.checkerDarkColor}`,
      `--checker-preview-size: ${this.checkerTileSize}px`,
    ].join(";");

    return html`
      <pf-dialog ?open=${this.open} width="320px" @pf-close=${this.close}>
        <span slot="title">Transparency Checker</span>

        <form id="checker-settings-form" @submit=${this.apply}>
          <fieldset>
            <legend>Checker Display</legend>

            <div class="input-row">
              <label for="checker-light-color">Light color</label>
              <input
                id="checker-light-color"
                name="checker-light-color"
                type="color"
                .value=${this.checkerLightColor}
                @input=${(e: Event) =>
                  (this.checkerLightColor = (e.target as HTMLInputElement).value)}
              />
            </div>

            <div class="input-row">
              <label for="checker-dark-color">Dark color</label>
              <input
                id="checker-dark-color"
                name="checker-dark-color"
                type="color"
                .value=${this.checkerDarkColor}
                @input=${(e: Event) =>
                  (this.checkerDarkColor = (e.target as HTMLInputElement).value)}
              />
            </div>

            <div class="input-row">
              <label for="checker-tile-size">Tile size</label>
              <input
                id="checker-tile-size"
                name="checker-tile-size"
                type="number"
                min=${CHECKER_TILE_SIZE_MIN}
                max=${CHECKER_TILE_SIZE_MAX}
                step="1"
                required
                .value=${String(this.checkerTileSize)}
                @input=${(e: Event) =>
                  (this.checkerTileSize = parseInt(
                    (e.target as HTMLInputElement).value,
                    10
                  ))}
              />
              <span class="unit">px</span>
            </div>
          </fieldset>

          <div class="preview" style=${previewStyle} aria-hidden="true"></div>
        </form>

        <div slot="actions">
          <button class="secondary" type="button" @click=${this.close}>
            Cancel
          </button>
          <button class="primary" type="submit" form="checker-settings-form">
            Apply
          </button>
        </div>
      </pf-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-checker-settings-dialog": PFCheckerSettingsDialog;
  }
}
