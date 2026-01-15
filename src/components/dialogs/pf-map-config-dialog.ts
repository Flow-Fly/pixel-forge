import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { tilemapStore } from "../../stores/tilemap";
import "../ui";

// Validation constants
const MIN_MAP_SIZE = 1;
const MAX_MAP_SIZE = 500;
const MIN_TILE_SIZE = 1;
const MAX_TILE_SIZE = 256;

// Tile size presets
const TILE_SIZE_PRESETS = [
  { label: "8x8", width: 8, height: 8 },
  { label: "16x16", width: 16, height: 16 },
  { label: "32x32", width: 32, height: 32 },
  { label: "64x64", width: 64, height: 64 },
];

// LocalStorage key for last-used settings
const LAST_SETTINGS_KEY = "pf-map-config-last-settings";

/**
 * Map Configuration Dialog
 *
 * Allows users to configure tilemap dimensions (width/height in tiles)
 * and tile size (in pixels) with presets and custom values.
 *
 * Story 1-5: Map Configuration Dialog
 *
 * @fires map-config-applied - Dispatched when configuration is applied
 * @fires close - Dispatched when dialog is closed
 */
@customElement("pf-map-config-dialog")
export class PFMapConfigDialog extends BaseComponent {
  static styles = css`
    .section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .section-label {
      font-size: 12px;
      color: var(--pf-color-text-muted);
      font-weight: 500;
    }

    .dimensions {
      display: flex;
      gap: 12px;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    label {
      font-size: 12px;
      color: var(--pf-color-text-muted);
    }

    input {
      background-color: var(--pf-color-bg-dark);
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
      padding: 6px 8px;
      border-radius: 4px;
      width: 100%;
      box-sizing: border-box;
    }

    input:focus {
      outline: none;
      border-color: var(--pf-color-primary);
    }

    input.error {
      border-color: var(--pf-color-error, #e74c3c);
    }

    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .preset-btn {
      padding: 4px 8px;
      border-radius: 4px;
      background-color: var(--pf-color-bg-dark);
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
      cursor: pointer;
      font-size: 11px;
    }

    .preset-btn:hover {
      background-color: var(--pf-color-bg-hover);
    }

    .preset-btn.selected {
      background-color: var(--pf-color-primary);
      border-color: var(--pf-color-primary);
    }

    .custom-tile-size {
      display: flex;
      gap: 12px;
      margin-top: 8px;
    }

    .error-message {
      font-size: 11px;
      color: var(--pf-color-error, #e74c3c);
      margin-top: 4px;
    }

    .warning-message {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 11px;
      color: var(--pf-color-text-main);
      background-color: var(--pf-color-bg-dark);
      padding: 8px;
      border-radius: 4px;
      border-left: 3px solid var(--pf-color-warning, #f0ad4e);
    }

    .warning-icon {
      flex-shrink: 0;
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

    button.primary:hover:not(:disabled) {
      background-color: var(--pf-color-primary-hover, var(--pf-color-primary));
    }

    button.primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button.secondary {
      background-color: transparent;
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
    }

    button.secondary:hover {
      background-color: var(--pf-color-bg-hover);
    }

    fieldset {
      border: none;
      padding: 0;
      margin: 0;
    }

    legend {
      font-size: 12px;
      color: var(--pf-color-text-muted);
      font-weight: 500;
      margin-bottom: 8px;
    }
  `;

  @property({ type: Boolean, reflect: true }) open = false;

  @state() private mapWidth = 20;
  @state() private mapHeight = 15;
  @state() private tileWidth = 16;
  @state() private tileHeight = 16;
  @state() private validationError = "";
  @state() private showResizeWarning = false;
  @state() private selectedPreset: string | null = "16x16";

  /**
   * Show the dialog and populate with current tilemap values
   */
  show() {
    this.mapWidth = tilemapStore.width.value;
    this.mapHeight = tilemapStore.height.value;
    this.tileWidth = tilemapStore.tileWidth.value;
    this.tileHeight = tilemapStore.tileHeight.value;
    this.validationError = "";
    this.showResizeWarning = false;
    this.updateSelectedPreset();
    this.open = true;
  }

  /**
   * Hide the dialog
   */
  hide() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("close"));
  }

  private updateSelectedPreset() {
    const preset = TILE_SIZE_PRESETS.find(
      (p) => p.width === this.tileWidth && p.height === this.tileHeight
    );
    this.selectedPreset = preset?.label ?? null;
  }

  private selectPreset(preset: { label: string; width: number; height: number }) {
    this.tileWidth = preset.width;
    this.tileHeight = preset.height;
    this.selectedPreset = preset.label;
    this.validate();
  }

  private handleMapWidthInput(e: Event) {
    this.mapWidth = parseInt((e.target as HTMLInputElement).value) || 1;
    this.validate();
    this.checkResizeWarning();
  }

  private handleMapHeightInput(e: Event) {
    this.mapHeight = parseInt((e.target as HTMLInputElement).value) || 1;
    this.validate();
    this.checkResizeWarning();
  }

  private handleTileWidthInput(e: Event) {
    this.tileWidth = parseInt((e.target as HTMLInputElement).value) || 1;
    this.selectedPreset = null;
    this.validate();
  }

  private handleTileHeightInput(e: Event) {
    this.tileHeight = parseInt((e.target as HTMLInputElement).value) || 1;
    this.selectedPreset = null;
    this.validate();
  }

  private validate(): boolean {
    // Validate map dimensions
    if (this.mapWidth < MIN_MAP_SIZE || this.mapWidth > MAX_MAP_SIZE) {
      this.validationError = `Map width must be between ${MIN_MAP_SIZE} and ${MAX_MAP_SIZE} tiles`;
      return false;
    }
    if (this.mapHeight < MIN_MAP_SIZE || this.mapHeight > MAX_MAP_SIZE) {
      this.validationError = `Map height must be between ${MIN_MAP_SIZE} and ${MAX_MAP_SIZE} tiles`;
      return false;
    }

    // Validate tile size
    if (this.tileWidth < MIN_TILE_SIZE || this.tileWidth > MAX_TILE_SIZE) {
      this.validationError = `Tile width must be between ${MIN_TILE_SIZE} and ${MAX_TILE_SIZE} pixels`;
      return false;
    }
    if (this.tileHeight < MIN_TILE_SIZE || this.tileHeight > MAX_TILE_SIZE) {
      this.validationError = `Tile height must be between ${MIN_TILE_SIZE} and ${MAX_TILE_SIZE} pixels`;
      return false;
    }

    // Ensure values are positive integers
    if (
      !Number.isInteger(this.mapWidth) ||
      !Number.isInteger(this.mapHeight) ||
      !Number.isInteger(this.tileWidth) ||
      !Number.isInteger(this.tileHeight)
    ) {
      this.validationError = "All values must be positive integers";
      return false;
    }

    this.validationError = "";
    return true;
  }

  private checkResizeWarning() {
    const currentWidth = tilemapStore.width.value;
    const currentHeight = tilemapStore.height.value;

    // Warn if shrinking would potentially lose tiles
    this.showResizeWarning =
      this.mapWidth < currentWidth || this.mapHeight < currentHeight;
  }

  private apply() {
    if (!this.validate()) return;

    // Clamp values just in case
    const width = Math.max(MIN_MAP_SIZE, Math.min(MAX_MAP_SIZE, this.mapWidth));
    const height = Math.max(MIN_MAP_SIZE, Math.min(MAX_MAP_SIZE, this.mapHeight));
    const tileW = Math.max(MIN_TILE_SIZE, Math.min(MAX_TILE_SIZE, this.tileWidth));
    const tileH = Math.max(MIN_TILE_SIZE, Math.min(MAX_TILE_SIZE, this.tileHeight));

    // Apply changes to tilemap store
    tilemapStore.resizeTilemap(width, height);
    tilemapStore.setTileSize(tileW, tileH);

    // Save last-used settings to localStorage
    this.saveLastSettings();

    this.hide();

    this.dispatchEvent(
      new CustomEvent("map-config-applied", {
        detail: {
          mapWidth: width,
          mapHeight: height,
          tileWidth: tileW,
          tileHeight: tileH,
        },
      })
    );
  }

  private saveLastSettings() {
    try {
      localStorage.setItem(
        LAST_SETTINGS_KEY,
        JSON.stringify({
          mapWidth: this.mapWidth,
          mapHeight: this.mapHeight,
          tileWidth: this.tileWidth,
          tileHeight: this.tileHeight,
        })
      );
    } catch {
      // Ignore localStorage errors
    }
  }

  /**
   * Load last-used settings from localStorage (for new tilemaps)
   */
  loadLastSettings() {
    try {
      const saved = localStorage.getItem(LAST_SETTINGS_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        this.mapWidth = settings.mapWidth ?? 20;
        this.mapHeight = settings.mapHeight ?? 15;
        this.tileWidth = settings.tileWidth ?? 16;
        this.tileHeight = settings.tileHeight ?? 16;
        this.updateSelectedPreset();
      }
    } catch {
      // Ignore parse errors
    }
  }

  render() {
    const isValid = this.validationError === "";

    return html`
      <pf-dialog
        ?open=${this.open}
        width="380px"
        @pf-close=${this.hide}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <span slot="title" id="dialog-title">Map Settings</span>

        <div class="section">
          <span class="section-label">Map Dimensions</span>
          <div class="dimensions">
            <div class="input-group">
              <label for="map-width">Width (tiles)</label>
              <input
                id="map-width"
                type="number"
                min="${MIN_MAP_SIZE}"
                max="${MAX_MAP_SIZE}"
                .value=${String(this.mapWidth)}
                @input=${this.handleMapWidthInput}
                class=${this.validationError.includes("Map width") ? "error" : ""}
              />
            </div>
            <div class="input-group">
              <label for="map-height">Height (tiles)</label>
              <input
                id="map-height"
                type="number"
                min="${MIN_MAP_SIZE}"
                max="${MAX_MAP_SIZE}"
                .value=${String(this.mapHeight)}
                @input=${this.handleMapHeightInput}
                class=${this.validationError.includes("Map height") ? "error" : ""}
              />
            </div>
          </div>
        </div>

        <fieldset class="section">
          <legend>Tile Size</legend>
          <div class="presets">
            ${TILE_SIZE_PRESETS.map(
              (preset) => html`
                <button
                  type="button"
                  class="preset-btn ${this.selectedPreset === preset.label ? "selected" : ""}"
                  @click=${() => this.selectPreset(preset)}
                  aria-pressed=${this.selectedPreset === preset.label}
                >
                  ${preset.label}
                </button>
              `
            )}
          </div>
          <div class="custom-tile-size">
            <div class="input-group">
              <label for="tile-width">Width (px)</label>
              <input
                id="tile-width"
                type="number"
                min="${MIN_TILE_SIZE}"
                max="${MAX_TILE_SIZE}"
                .value=${String(this.tileWidth)}
                @input=${this.handleTileWidthInput}
                class=${this.validationError.includes("Tile width") ? "error" : ""}
              />
            </div>
            <div class="input-group">
              <label for="tile-height">Height (px)</label>
              <input
                id="tile-height"
                type="number"
                min="${MIN_TILE_SIZE}"
                max="${MAX_TILE_SIZE}"
                .value=${String(this.tileHeight)}
                @input=${this.handleTileHeightInput}
                class=${this.validationError.includes("Tile height") ? "error" : ""}
              />
            </div>
          </div>
        </fieldset>

        ${this.validationError
          ? html`<div class="error-message">${this.validationError}</div>`
          : ""}

        ${this.showResizeWarning && !this.validationError
          ? html`
              <div class="warning-message">
                <span class="warning-icon">&#9888;</span>
                <span>
                  Reducing map size will permanently remove tiles outside the new
                  boundaries. This action cannot be undone.
                </span>
              </div>
            `
          : ""}

        <div slot="actions">
          <button class="secondary" @click=${this.hide}>Cancel</button>
          <button class="primary" ?disabled=${!isValid} @click=${this.apply}>
            Apply
          </button>
        </div>
      </pf-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-map-config-dialog": PFMapConfigDialog;
  }
}
