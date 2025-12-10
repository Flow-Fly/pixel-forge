import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { brushStore } from "../../stores/brush";
import type { Brush, BrushSpacing } from "../../types/brush";

@customElement("pf-brush-panel")
export class PFBrushPanel extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 8px;
    }

    .header {
      font-size: 12px;
      color: var(--pf-color-text-muted);
      margin-bottom: 8px;
      border-bottom: 1px solid var(--pf-color-border);
      padding-bottom: 4px;
    }

    .brush-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
      gap: 4px;
      margin-bottom: 16px;
    }

    .brush-item {
      width: 40px;
      height: 40px;
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      background-color: var(--pf-color-bg-panel);
    }

    .brush-item:hover {
      background-color: var(--pf-color-bg-hover);
    }

    .brush-item.active {
      border-color: var(--pf-color-primary);
      background-color: var(--pf-color-bg-active);
    }

    .brush-preview {
      background-color: white;
    }

    .controls {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .control-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    label {
      font-size: 11px;
      color: var(--pf-color-text-muted);
    }

    input[type="range"] {
      width: 100%;
    }

    select {
      width: 100%;
      padding: 4px;
      background: var(--pf-color-bg-input, #2a2a2a);
      color: var(--pf-color-text, #fff);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      font-size: 11px;
    }

    .custom-spacing {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
    }

    .custom-spacing input {
      width: 50px;
      padding: 2px 4px;
      background: var(--pf-color-bg-input, #2a2a2a);
      color: var(--pf-color-text, #fff);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      font-size: 11px;
    }
  `;

  @state() private showCustomSpacing = false;

  render() {
    const brushes = brushStore.brushes.value;
    const activeBrush = brushStore.activeBrush.value;
    const spacingValue = this.getSpacingSelectValue(activeBrush.spacing);

    return html`
      <div class="header">Brushes</div>

      <div class="brush-list">
        ${brushes.map(
          (brush) => html`
            <div
              class="brush-item ${brush.id === activeBrush.id ? "active" : ""}"
              @click=${() => brushStore.setActiveBrush(brush)}
              title="${brush.name}"
            >
              <div
                class="brush-preview"
                style="
                width: ${Math.min(24, brush.size * 2)}px; 
                height: ${Math.min(24, brush.size * 2)}px;
                border-radius: 0;
                background-color: whitesmoke;
              "
              ></div>
            </div>
          `
        )}
      </div>

      <div class="controls">
        <div class="control-group">
          <label>Size: ${activeBrush.size}px</label>
          <input
            type="range"
            min="1"
            max="50"
            .value=${activeBrush.size}
            @input=${(e: Event) => this.updateSize(e)}
          />
        </div>

        <div class="control-group">
          <label>Opacity: ${Math.round(activeBrush.opacity * 100)}%</label>
          <input
            type="range"
            min="0"
            max="100"
            .value=${activeBrush.opacity * 100}
            @input=${(e: Event) => this.updateOpacity(e)}
          />
        </div>

        <div class="control-group">
          <label>Spacing</label>
          <select @change=${(e: Event) => this.updateSpacing(e)}>
            <option value="1" ?selected=${spacingValue === "1"}>1px (Standard)</option>
            <option value="match" ?selected=${spacingValue === "match"}>Match Brush Size</option>
            <option value="custom" ?selected=${spacingValue === "custom"}>Custom...</option>
          </select>
          ${this.showCustomSpacing || spacingValue === "custom"
            ? html`
                <div class="custom-spacing">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    .value=${typeof activeBrush.spacing === "number" ? activeBrush.spacing : activeBrush.size}
                    @input=${(e: Event) => this.updateCustomSpacing(e)}
                  />
                  <span>px</span>
                </div>
              `
            : null}
        </div>
      </div>
    `;
  }

  private getSpacingSelectValue(spacing: BrushSpacing): string {
    if (spacing === "match") return "match";
    if (spacing === 1) return "1";
    return "custom";
  }

  updateSize(e: Event) {
    const input = e.target as HTMLInputElement;
    brushStore.updateActiveBrushSettings({ size: parseInt(input.value) });
    brushStore.syncBigPixelModeWithBrushSize();
  }

  updateOpacity(e: Event) {
    const input = e.target as HTMLInputElement;
    brushStore.updateActiveBrushSettings({
      opacity: parseInt(input.value) / 100,
    });
  }

  updateSpacing(e: Event) {
    const select = e.target as HTMLSelectElement;
    const value = select.value;

    if (value === "1") {
      brushStore.updateActiveBrushSettings({ spacing: 1 });
      this.showCustomSpacing = false;
    } else if (value === "match") {
      brushStore.updateActiveBrushSettings({ spacing: "match" });
      this.showCustomSpacing = false;
    } else {
      this.showCustomSpacing = true;
      // Default custom to brush size
      const brush = brushStore.activeBrush.value;
      brushStore.updateActiveBrushSettings({ spacing: brush.size });
    }
  }

  updateCustomSpacing(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = Math.max(1, Math.min(50, parseInt(input.value) || 1));
    brushStore.updateActiveBrushSettings({ spacing: value });
  }
}
