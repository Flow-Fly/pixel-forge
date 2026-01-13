import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../../core/base-component";
import { paletteStore } from "../../../stores/palette";
import "../../ui";

@customElement("pf-extraction-section")
export class PFExtractionSection extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      margin-top: 12px;
      border-top: 1px solid var(--pf-color-border, #333);
      padding-top: 8px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
      padding: 4px 0;
      user-select: none;
    }

    .header:hover {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .chevron {
      transition: transform 0.2s ease;
      font-size: 10px;
    }

    .chevron.collapsed {
      transform: rotate(-90deg);
    }

    .content {
      padding: 8px 0;
    }

    .extract-btn {
      width: 100%;
      padding: 6px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-muted, #808080);
      cursor: pointer;
      font-size: 11px;
      transition: all 0.15s ease;
    }

    .extract-btn:hover:not(:disabled) {
      background: var(--pf-color-bg-panel, #141414);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .extract-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 2px;
      margin: 8px 0;
      padding: 4px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border-radius: 3px;
    }

    .swatch {
      aspect-ratio: 1;
      cursor: pointer;
      border-radius: 2px;
      transition: transform 0.1s ease;
    }

    .swatch:hover {
      transform: scale(1.15);
      z-index: 1;
    }

    .actions {
      display: flex;
      gap: 6px;
    }
  `;

  @state() private expanded = false;

  private toggle() {
    this.expanded = !this.expanded;
  }

  private async handleExtract() {
    await paletteStore.extractFromDrawing();
  }

  private handleColorClick(color: string) {
    paletteStore.addExtractedColor(color);
  }

  private handleDragStart(color: string, e: DragEvent) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("application/x-palette-color", color);
    }
  }

  private addAll() {
    paletteStore.addAllExtracted();
  }

  private replaceAll() {
    paletteStore.replaceWithExtracted();
  }

  render() {
    const extractedColors = paletteStore.extractedColors.value;
    const isExtracting = paletteStore.isExtracting.value;

    return html`
      <div class="header" @click=${this.toggle}>
        <span class="chevron ${this.expanded ? "" : "collapsed"}">▼</span>
        <span>Extract from Drawing</span>
      </div>

      ${this.expanded ? html`
        <div class="content">
          <button
            class="extract-btn"
            @click=${this.handleExtract}
            ?disabled=${isExtracting}
          >
            ${isExtracting ? "Extracting..." : "Extract Colors"}
          </button>

          ${extractedColors.length > 0 ? html`
            <div class="grid">
              ${extractedColors.map(color => html`
                <div
                  class="swatch"
                  style="background-color: ${color}"
                  draggable="true"
                  @dragstart=${(e: DragEvent) => this.handleDragStart(color, e)}
                  @click=${() => this.handleColorClick(color)}
                  title="${color} - Click to add, drag to palette"
                ></div>
              `)}
            </div>
            <div class="actions">
              <pf-button fill size="sm" @click=${this.addAll}>Add All</pf-button>
              <pf-button fill size="sm" @click=${this.replaceAll}>Replace All</pf-button>
            </div>
          ` : ""}
        </div>
      ` : ""}
    `;
  }
}
