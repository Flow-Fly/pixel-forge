import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { toolStore } from '../../stores/tools';
import { brushStore } from '../../stores/brush';

@customElement('pf-context-bar')
export class PFContextBar extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      height: 100%;
      padding: 0 var(--pf-spacing-2);
      gap: var(--pf-spacing-2);
      font-size: 12px;
    }

    .separator {
      width: 1px;
      height: 16px;
      background-color: var(--pf-color-border);
    }
    
    .option {
      display: flex;
      align-items: center;
      gap: 4px;
    }
  `;

  render() {
    const tool = toolStore.activeTool.value;
    
    return html`
      <span style="font-weight: bold; color: var(--pf-color-text-muted);">${this.formatToolName(tool)}</span>
      <div class="separator"></div>
      ${this.renderToolOptions(tool)}
    `;
  }

  formatToolName(tool: string) {
    return tool.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  renderToolOptions(tool: string) {
    switch (tool) {
      case 'pencil':
        return html`
          <div class="option">
            <label>Size:</label>
            <input 
              type="range" 
              min="1" 
              max="50" 
              .value=${brushStore.activeBrush.value.size}
              @input=${(e: Event) => brushStore.updateActiveBrushSettings({ size: parseInt((e.target as HTMLInputElement).value) })}
              style="width: 60px"
            >
            <span>${brushStore.activeBrush.value.size}px</span>
          </div>
          <div class="separator"></div>
          <div class="option">
            <label>Opacity:</label>
            <input 
              type="range" 
              min="0" 
              max="100" 
              .value=${brushStore.activeBrush.value.opacity * 100}
              @input=${(e: Event) => brushStore.updateActiveBrushSettings({ opacity: parseInt((e.target as HTMLInputElement).value) / 100 })}
              style="width: 60px"
            >
            <span>${Math.round(brushStore.activeBrush.value.opacity * 100)}%</span>
          </div>
        `;
      case 'fill':
        return html`
          <div class="option">
            <input type="checkbox" id="contiguous" checked>
            <label for="contiguous">Contiguous</label>
          </div>
        `;
      case 'gradient':
        return html`
          <div class="option">
            <label>Type:</label>
            <select>
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
            </select>
          </div>
        `;
      case 'line':
      case 'rectangle':
      case 'ellipse':
        return html`
          <div class="option">
            <input type="checkbox" id="fill-shape">
            <label for="fill-shape">Fill</label>
          </div>
          <div class="option">
            <label>Thickness:</label>
            <input type="number" value="1" min="1" max="10" style="width: 40px">
          </div>
        `;
      default:
        return html`<span style="color: var(--pf-color-text-muted); font-style: italic;">No options</span>`;
    }
  }
}
