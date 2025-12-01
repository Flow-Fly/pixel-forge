import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { brushStore } from '../../stores/brush';
import type { Brush } from '../../types/brush';

@customElement('pf-brush-panel')
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
  `;

  render() {
    const brushes = brushStore.brushes.value;
    const activeBrush = brushStore.activeBrush.value;

    return html`
      <div class="header">Brushes</div>
      
      <div class="brush-list">
        ${brushes.map(brush => html`
          <div 
            class="brush-item ${brush.id === activeBrush.id ? 'active' : ''}"
            @click=${() => brushStore.setActiveBrush(brush)}
            title="${brush.name}"
          >
            <div 
              class="brush-preview"
              style="
                width: ${Math.min(24, brush.size * 2)}px; 
                height: ${Math.min(24, brush.size * 2)}px;
                border-radius: ${brush.shape === 'circle' ? '50%' : '0'};
                background-color: black;
              "
            ></div>
          </div>
        `)}
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
          >
        </div>
        
        <div class="control-group">
          <label>Opacity: ${Math.round(activeBrush.opacity * 100)}%</label>
          <input 
            type="range" 
            min="0" 
            max="100" 
            .value=${activeBrush.opacity * 100}
            @input=${(e: Event) => this.updateOpacity(e)}
          >
        </div>
      </div>
    `;
  }

  updateSize(e: Event) {
    const input = e.target as HTMLInputElement;
    brushStore.updateActiveBrushSettings({ size: parseInt(input.value) });
  }

  updateOpacity(e: Event) {
    const input = e.target as HTMLInputElement;
    brushStore.updateActiveBrushSettings({ opacity: parseInt(input.value) / 100 });
  }
}
