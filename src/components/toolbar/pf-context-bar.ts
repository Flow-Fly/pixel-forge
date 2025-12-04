import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { toolStore } from "../../stores/tools";
import { getToolMeta } from "../../tools/tool-registry";
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
  `;

  render() {
    const tool = toolStore.activeTool.value;
    const meta = getToolMeta(tool);

    if (!meta) {
      return html`
        <span class="tool-name">${this._formatToolName(tool)}</span>
        <div class="separator"></div>
        <span class="no-options">Unknown tool</span>
      `;
    }

    return html`
      <span class="tool-name">${meta.name}</span>
      <div class="separator"></div>

      <div class="options-section">${this._renderOptions(meta.options)}</div>

      ${meta.alternatives.length > 0
        ? html`
            <div class="separator"></div>
            <div class="alternatives-section">
              <pf-alternative-tools .alternatives=${meta.alternatives}></pf-alternative-tools>
            </div>
          `
        : ""}

      <div class="separator"></div>
      <div class="lightness-section">
        <pf-lightness-bar></pf-lightness-bar>
      </div>
    `;
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
      return html` ${this._renderOption(option)} ${showSeparator ? html`<div class="separator"></div>` : ""} `;
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
}
