import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { toolStore, type ToolType } from "../../stores/tools";
import { getToolMeta, getToolLabel } from "../../tools/tool-registry";

@customElement("pf-alternative-tools")
export class PfAlternativeTools extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .alt-tool-btn {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--pf-color-bg-tertiary);
      border: 1px solid var(--pf-color-border);
      border-radius: 3px;
      color: var(--pf-color-text-muted);
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.1s ease;
    }

    .alt-tool-btn:hover {
      background: var(--pf-color-bg-hover);
      border-color: var(--pf-color-accent);
      color: var(--pf-color-text-primary);
    }

    .alt-tool-btn:active {
      background: var(--pf-color-accent);
      color: white;
    }
  `;

  @property({ type: Array }) alternatives: string[] = [];

  private handleClick(tool: string) {
    toolStore.setActiveTool(tool as ToolType);
  }

  render() {
    if (!this.alternatives || this.alternatives.length === 0) {
      return html``;
    }

    return html`
      ${this.alternatives.map((tool) => {
        const meta = getToolMeta(tool as ToolType);
        return html`
          <button
            class="alt-tool-btn"
            title=${meta?.name || tool}
            @click=${() => this.handleClick(tool)}
          >
            ${getToolLabel(tool as ToolType)}
          </button>
        `;
      })}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-alternative-tools": PfAlternativeTools;
  }
}
