import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { toolStore } from "../../stores/tools";
import { selectionStore } from "../../stores/selection";
import { animationStore } from "../../stores/animation";
import { historyStore } from "../../stores/history";
import { getToolMeta } from "../../tools/tool-registry";
import {
  LinkCelsCommand,
  UnlinkCelsCommand,
} from "../../commands/animation-commands";
import type { ToolOption } from "../../types/tool-meta";
import "./options/pf-option-slider";
import "./options/pf-option-checkbox";
import "./options/pf-option-select";
import "./pf-alternative-tools";
import "../color/pf-lightness-bar";

@customElement("pf-context-bar")
export class PFContextBar extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 var(--pf-spacing-2);
      gap: var(--pf-spacing-2);
      font-size: 12px;
      background-color: var(--pf-color-bg-panel);
      border-bottom: 1px solid var(--pf-color-border);
    }

    .tool-name {
      font-weight: bold;
      color: var(--pf-color-text-muted);
      white-space: nowrap;
    }

    .separator {
      width: 1px;
      height: 16px;
      background-color: var(--pf-color-border);
      flex-shrink: 0;
    }

    .options-section {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2);
      flex: 1;
      min-width: 0;
    }

    .alternatives-section {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .lightness-section {
      margin-left: auto;
    }

    .no-options {
      color: var(--pf-color-text-muted);
      font-style: italic;
      font-size: 11px;
    }

    /* Transform controls */
    .transform-section {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2);
      flex: 1;
    }

    .angle-control {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .angle-control label {
      color: var(--pf-color-text-muted);
      font-size: 12px;
    }

    .angle-control input[type="range"] {
      width: 80px;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: var(--pf-color-bg-tertiary);
      border-radius: 2px;
      cursor: pointer;
    }

    .angle-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      background: var(--pf-color-accent);
      border-radius: 50%;
      cursor: pointer;
    }

    .angle-control input[type="number"] {
      width: 50px;
      padding: 2px 4px;
      border: 1px solid var(--pf-color-border);
      border-radius: 3px;
      background: var(--pf-color-bg-tertiary);
      color: var(--pf-color-text-primary);
      font-size: 11px;
      text-align: right;
    }

    .toggle-group {
      display: flex;
      gap: 0;
    }

    .toggle-btn {
      padding: 4px 8px;
      border: 1px solid var(--pf-color-border);
      background: var(--pf-color-bg-tertiary);
      color: var(--pf-color-text-secondary);
      font-size: 11px;
      cursor: pointer;
    }

    .toggle-btn:first-child {
      border-radius: 3px 0 0 3px;
    }

    .toggle-btn:last-child {
      border-radius: 0 3px 3px 0;
      border-left: none;
    }

    .toggle-btn.active {
      background: var(--pf-color-accent);
      color: white;
      border-color: var(--pf-color-accent);
    }

    .action-btn {
      padding: 4px 10px;
      border: 1px solid var(--pf-color-border);
      border-radius: 3px;
      background: var(--pf-color-bg-tertiary);
      color: var(--pf-color-text-primary);
      font-size: 11px;
      cursor: pointer;
    }

    .action-btn:hover {
      background: var(--pf-color-bg-secondary);
    }

    .action-btn.primary {
      background: var(--pf-color-accent);
      color: white;
      border-color: var(--pf-color-accent);
    }

    .action-btn.primary:hover {
      opacity: 0.9;
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Cel controls */
    .cel-section {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2);
      padding: 0 var(--pf-spacing-2);
      border-left: 1px solid var(--pf-color-border);
    }

    .cel-label {
      color: var(--pf-color-text-muted);
      font-size: 11px;
    }

    .cel-opacity {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .opacity-scrubber {
      cursor: ew-resize;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--pf-color-bg-tertiary);
      color: var(--pf-color-text-primary);
      font-size: 11px;
      min-width: 36px;
      text-align: center;
      user-select: none;
    }

    .opacity-scrubber:hover {
      background: var(--pf-color-bg-secondary);
    }

    .opacity-scrubber.scrubbing {
      background: var(--pf-color-primary-muted);
    }

    .link-btn {
      padding: 4px 8px;
      border: 1px solid var(--pf-color-border);
      border-radius: 3px;
      background: var(--pf-color-bg-tertiary);
      color: var(--pf-color-text-secondary);
      font-size: 11px;
      cursor: pointer;
    }

    .link-btn:hover {
      background: var(--pf-color-bg-secondary);
    }

    .link-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  @state() private isCommitting = false;
  @state() private isCelScrubbing = false;
  private celScrubStartX = 0;
  private celScrubStartOpacity = 0;

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("mousemove", this._handleCelScrubMove);
    window.removeEventListener("mouseup", this._handleCelScrubEnd);
  }

  render() {
    // Check if we're in transforming state - show transform controls instead
    const selectionState = selectionStore.state.value;
    if (selectionState.type === "transforming") {
      return this._renderTransformControls();
    }

    const tool = toolStore.activeTool.value;
    const meta = getToolMeta(tool);

    if (!meta) {
      return html`
        <span class="tool-name">${this._formatToolName(tool)}</span>
        <div class="separator"></div>
        <span class="no-options">Unknown tool</span>
      `;
    }

    // Check for selected cels
    const selectedCelKeys = animationStore.selectedCelKeys.value;
    const hasSelectedCels = selectedCelKeys.size > 0;

    return html`
      <span class="tool-name">${meta.name}</span>
      <div class="separator"></div>

      <div class="options-section">${this._renderOptions(meta.options)}</div>
      <!--
      ${meta.alternatives.length > 0
        ? html`
            <div class="separator"></div>
            <div class="alternatives-section">
              <pf-alternative-tools
                .alternatives=${meta.alternatives}
              ></pf-alternative-tools>
            </div>
          `
        : ""}
-->
      ${hasSelectedCels ? this._renderCelControls(selectedCelKeys) : ""}

      <div class="separator"></div>
      <div class="lightness-section">
        <pf-lightness-bar></pf-lightness-bar>
      </div>
    `;
  }

  private _renderTransformControls() {
    const rotation = selectionStore.rotation;

    return html`
      <span class="tool-name">Rotate Selection</span>
      <div class="separator"></div>

      <div class="transform-section">
        <div class="angle-control">
          <label>Angle:</label>
          <input
            type="range"
            min="0"
            max="360"
            step="1"
            .value=${String(rotation)}
            @input=${this._handleAngleSlider}
          />
          <input
            type="number"
            min="0"
            max="360"
            .value=${String(Math.round(rotation))}
            @input=${this._handleAngleInput}
            @keydown=${this._handleAngleKeydown}
          />
          <span style="color: var(--pf-color-text-muted); font-size: 11px;"
            >°</span
          >
        </div>

        <div class="separator"></div>

        <button
          class="action-btn primary"
          @click=${this._commitTransform}
          ?disabled=${this.isCommitting}
          title="Apply rotation (Enter)"
        >
          ${this.isCommitting ? "Applying..." : "Apply"}
        </button>
        <button
          class="action-btn"
          @click=${this._cancelTransform}
          ?disabled=${this.isCommitting}
          title="Cancel rotation (Escape)"
        >
          Cancel
        </button>
      </div>
    `;
  }

  private _handleAngleSlider(e: Event) {
    const input = e.target as HTMLInputElement;
    const angle = parseFloat(input.value);
    selectionStore.updateRotation(angle);
  }

  private _handleAngleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    let angle = parseFloat(input.value) || 0;
    // Clamp to valid range
    angle = Math.max(0, Math.min(360, angle));
    selectionStore.updateRotation(angle);
  }

  private _handleAngleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      this._commitTransform();
    } else if (e.key === "Escape") {
      e.preventDefault();
      this._cancelTransform();
    }
  }

  private _commitTransform() {
    if (this.isCommitting) return;

    // Dispatch event for viewport to handle the commit
    // The viewport has access to the canvas and can perform the rotation
    this.dispatchEvent(
      new CustomEvent("commit-transform", {
        bubbles: true,
        composed: true,
      })
    );
  }

  private _cancelTransform() {
    if (this.isCommitting) return;
    selectionStore.cancelTransform();
  }

  _formatToolName(tool: string): string {
    return tool
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  _renderOptions(options: ToolOption[]) {
    if (options.length === 0) {
      return html`<span class="no-options">No options</span>`;
    }

    return options.map((option, index) => {
      const showSeparator = index < options.length - 1;
      return html`
        ${this._renderOption(option)}
        ${showSeparator ? html`<div class="separator"></div>` : ""}
      `;
    });
  }

  _renderOption(option: ToolOption) {
    switch (option.type) {
      case "slider": {
        const isOpacity = option.storeKey === "opacity";
        const multiplier = isOpacity ? 100 : 1;
        return html`
          <pf-option-slider
            label=${option.label}
            store=${option.store}
            storeKey=${option.storeKey}
            min=${option.min}
            max=${option.max}
            step=${option.step || 1}
            unit=${option.unit || ""}
            multiplier=${multiplier}
          ></pf-option-slider>
        `;
      }
      case "checkbox":
        return html`
          <pf-option-checkbox
            label=${option.label}
            store=${option.store}
            storeKey=${option.storeKey}
          ></pf-option-checkbox>
        `;
      case "select":
        return html`
          <pf-option-select
            label=${option.label}
            store=${option.store}
            storeKey=${option.storeKey}
            .options=${option.options}
          ></pf-option-select>
        `;
      default:
        return html``;
    }
  }

  // Cel controls
  private _renderCelControls(selectedCelKeys: Set<string>) {
    const celKeys = Array.from(selectedCelKeys);
    const cels = animationStore.cels.value;

    // Get average opacity of selected cels
    let totalOpacity = 0;
    let celCount = 0;
    let hasLinked = false;
    let allLinked = true;

    for (const key of celKeys) {
      const cel = cels.get(key);
      if (cel) {
        totalOpacity += cel.opacity ?? 100;
        celCount++;
        if (cel.linkedCelId) {
          hasLinked = true;
        } else {
          allLinked = false;
        }
      }
    }

    const avgOpacity = celCount > 0 ? Math.round(totalOpacity / celCount) : 100;
    const canLink = celKeys.length >= 2;
    const canUnlink = hasLinked;

    return html`
      <div class="cel-section">
        <span class="cel-label"
          >${celKeys.length} cel${celKeys.length > 1 ? "s" : ""}</span
        >

        <div class="cel-opacity">
          <span class="cel-label">Opacity:</span>
          <span
            class="opacity-scrubber ${this.isCelScrubbing ? "scrubbing" : ""}"
            @mousedown=${(e: MouseEvent) =>
              this._handleCelScrubStart(e, avgOpacity)}
            title="Drag to adjust opacity"
          >
            ${avgOpacity}%
          </span>
        </div>

        <button
          class="link-btn"
          @click=${this._linkSelectedCels}
          ?disabled=${!canLink}
          title="Link selected cels"
        >
          🔗 Link
        </button>
        <button
          class="link-btn"
          @click=${this._unlinkSelectedCels}
          ?disabled=${!canUnlink}
          title="Unlink selected cels"
        >
          ⛓️‍💥 Unlink
        </button>
      </div>
    `;
  }

  private _handleCelScrubStart = (e: MouseEvent, currentOpacity: number) => {
    e.preventDefault();
    this.isCelScrubbing = true;
    this.celScrubStartX = e.clientX;
    this.celScrubStartOpacity = currentOpacity;

    window.addEventListener("mousemove", this._handleCelScrubMove);
    window.addEventListener("mouseup", this._handleCelScrubEnd);
  };

  private _handleCelScrubMove = (e: MouseEvent) => {
    if (!this.isCelScrubbing) return;

    const deltaX = e.clientX - this.celScrubStartX;
    const deltaPercent = Math.round(deltaX / 2);
    const newOpacity = Math.max(
      0,
      Math.min(100, this.celScrubStartOpacity + deltaPercent)
    );

    const selectedCelKeys = Array.from(animationStore.selectedCelKeys.value);
    animationStore.setCelOpacity(selectedCelKeys, newOpacity);
  };

  private _handleCelScrubEnd = () => {
    this.isCelScrubbing = false;
    window.removeEventListener("mousemove", this._handleCelScrubMove);
    window.removeEventListener("mouseup", this._handleCelScrubEnd);
  };

  private _linkSelectedCels = () => {
    const selectedCelKeys = Array.from(animationStore.selectedCelKeys.value);
    if (selectedCelKeys.length >= 2) {
      const command = new LinkCelsCommand(selectedCelKeys);
      historyStore.execute(command);
    }
  };

  private _unlinkSelectedCels = () => {
    const selectedCelKeys = Array.from(animationStore.selectedCelKeys.value);
    if (selectedCelKeys.length > 0) {
      const command = new UnlinkCelsCommand(selectedCelKeys);
      historyStore.execute(command);
    }
  };
}
