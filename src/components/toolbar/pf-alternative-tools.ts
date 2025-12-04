import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { toolStore, type ToolType } from "../../stores/tools";

/**
 * Display names for tools (for tooltips)
 */
const toolNames: Record<string, string> = {
  pencil: "Pencil",
  eraser: "Eraser",
  eyedropper: "Eyedropper",
  fill: "Fill",
  gradient: "Gradient",
  line: "Line",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  "marquee-rect": "Marquee",
  lasso: "Lasso",
  "polygonal-lasso": "Polygonal Lasso",
  "magic-wand": "Magic Wand",
  transform: "Transform",
  hand: "Hand",
  zoom: "Zoom",
};

/**
 * Short labels for tools (single char or abbreviated)
 */
const toolLabels: Record<string, string> = {
  pencil: "P",
  eraser: "E",
  eyedropper: "I",
  fill: "F",
  gradient: "G",
  line: "L",
  rectangle: "R",
  ellipse: "O",
  "marquee-rect": "M",
  lasso: "Q",
  "polygonal-lasso": "PL",
  "magic-wand": "W",
  transform: "V",
  hand: "H",
  zoom: "Z",
};

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
      ${this.alternatives.map(
        (tool) => html`
          <button
            class="alt-tool-btn"
            title=${toolNames[tool] || tool}
            @click=${() => this.handleClick(tool)}
          >
            ${toolLabels[tool] || tool[0].toUpperCase()}
          </button>
        `
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-alternative-tools": PfAlternativeTools;
  }
}
