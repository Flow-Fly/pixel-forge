import { html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { type ToolType } from '../../stores/tools';
import { brushStore } from '../../stores/brush';
import { EraserTool, type EraserMode } from '../../tools/eraser-tool';
import '../ui/pf-popover';

@customElement('pf-tool-options-popover')
export class PFToolOptionsPopover extends BaseComponent {
  @property({ type: String }) tool: ToolType = 'pencil';
  @property({ type: Boolean }) open = false;
  @property({ type: Object }) anchorRect?: DOMRect;

  static styles = css`
    .title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--pf-color-text-muted, #808080);
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--pf-color-border, #333);
    }

    .option-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .option-row:last-child {
      margin-bottom: 0;
    }

    label {
      color: var(--pf-color-text-main, #e0e0e0);
      white-space: nowrap;
    }

    input[type="range"] {
      flex: 1;
      min-width: 80px;
      accent-color: var(--pf-color-accent, #4a9eff);
    }

    input[type="number"] {
      width: 50px;
      padding: 2px 4px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 2px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 12px;
    }

    input[type="checkbox"] {
      accent-color: var(--pf-color-accent, #4a9eff);
    }

    select {
      flex: 1;
      padding: 4px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 2px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 12px;
    }

    .value {
      min-width: 35px;
      text-align: right;
      color: var(--pf-color-text-muted, #808080);
      font-size: 11px;
    }

    .no-options {
      color: var(--pf-color-text-muted, #808080);
      font-style: italic;
      font-size: 12px;
    }
  `;

  render() {
    return html`
      <pf-popover
        ?open=${this.open}
        position="right"
        .anchorRect=${this.anchorRect}
        @close=${this.handleClose}
      >
        <div class="title">${this.formatToolName(this.tool)} Options</div>
        ${this.renderToolOptions()}
      </pf-popover>
    `;
  }

  private formatToolName(tool: string): string {
    return tool.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  private handleClose() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  private renderToolOptions() {
    switch (this.tool) {
      case 'pencil':
        return this.renderPencilOptions();
      case 'eraser':
        return this.renderEraserOptions();
      case 'fill':
        return this.renderFillOptions();
      case 'gradient':
        return this.renderGradientOptions();
      case 'line':
      case 'rectangle':
      case 'ellipse':
        return this.renderShapeOptions();
      default:
        return html`<span class="no-options">No options available</span>`;
    }
  }

  private renderPencilOptions() {
    const brush = brushStore.activeBrush.value;
    return html`
      <div class="option-row">
        <label>Size:</label>
        <input
          type="range"
          min="1"
          max="50"
          .value=${String(brush.size)}
          @input=${(e: Event) => brushStore.updateActiveBrushSettings({ size: parseInt((e.target as HTMLInputElement).value) })}
        >
        <span class="value">${brush.size}px</span>
      </div>
      <div class="option-row">
        <label>Opacity:</label>
        <input
          type="range"
          min="0"
          max="100"
          .value=${String(brush.opacity * 100)}
          @input=${(e: Event) => brushStore.updateActiveBrushSettings({ opacity: parseInt((e.target as HTMLInputElement).value) / 100 })}
        >
        <span class="value">${Math.round(brush.opacity * 100)}%</span>
      </div>
      <div class="option-row">
        <input
          type="checkbox"
          id="pp-pencil"
          .checked=${brush.pixelPerfect}
          @change=${(e: Event) => brushStore.updateActiveBrushSettings({ pixelPerfect: (e.target as HTMLInputElement).checked })}
        >
        <label for="pp-pencil" title="Remove L-shaped artifacts from 1px strokes">Pixel Perfect</label>
      </div>
    `;
  }

  private renderEraserOptions() {
    const brush = brushStore.activeBrush.value;
    return html`
      <div class="option-row">
        <label>Size:</label>
        <input
          type="range"
          min="1"
          max="50"
          .value=${String(brush.size)}
          @input=${(e: Event) => brushStore.updateActiveBrushSettings({ size: parseInt((e.target as HTMLInputElement).value) })}
        >
        <span class="value">${brush.size}px</span>
      </div>
      <div class="option-row">
        <label>Mode:</label>
        <select @change=${(e: Event) => EraserTool.setMode((e.target as HTMLSelectElement).value as EraserMode)}>
          <option value="transparent" ?selected=${EraserTool.getMode() === 'transparent'}>To Transparent</option>
          <option value="background" ?selected=${EraserTool.getMode() === 'background'}>To Background</option>
        </select>
      </div>
      <div class="option-row">
        <input
          type="checkbox"
          id="pp-eraser"
          .checked=${brush.pixelPerfect}
          @change=${(e: Event) => brushStore.updateActiveBrushSettings({ pixelPerfect: (e.target as HTMLInputElement).checked })}
        >
        <label for="pp-eraser" title="Remove L-shaped artifacts">Pixel Perfect</label>
      </div>
    `;
  }

  private renderFillOptions() {
    return html`
      <div class="option-row">
        <input type="checkbox" id="contiguous" checked>
        <label for="contiguous">Contiguous</label>
      </div>
      <div class="option-row">
        <label>Tolerance:</label>
        <input type="range" min="0" max="255" value="0">
        <span class="value">0</span>
      </div>
    `;
  }

  private renderGradientOptions() {
    return html`
      <div class="option-row">
        <label>Type:</label>
        <select>
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
      </div>
      <div class="option-row">
        <label>Dithering:</label>
        <input type="checkbox" id="dithering">
        <label for="dithering">Enable</label>
      </div>
    `;
  }

  private renderShapeOptions() {
    return html`
      <div class="option-row">
        <input type="checkbox" id="fill-shape">
        <label for="fill-shape">Fill Shape</label>
      </div>
      <div class="option-row">
        <label>Stroke:</label>
        <input type="number" value="1" min="1" max="10" style="width: 50px">
        <span class="value">px</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-tool-options-popover': PFToolOptionsPopover;
  }
}
