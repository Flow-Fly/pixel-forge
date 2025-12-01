import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { toolStore, type ToolType } from '../../stores/tools';
import './pf-tool-button';

@customElement('pf-toolbar')
export class PFToolbar extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      padding: var(--pf-spacing-1) 0;
      height: 100%;
      overflow-y: auto;
    }

    .group {
      margin-bottom: var(--pf-spacing-2);
      padding-bottom: var(--pf-spacing-2);
      border-bottom: 1px solid var(--pf-color-border);
    }

    .group:last-child {
      border-bottom: none;
    }
  `;

  selectTool(tool: ToolType) {
    toolStore.setActiveTool(tool);
  }

  render() {
    const activeTool = toolStore.activeTool.value;
    return html`
      <div class="group">
        <pf-tool-button 
          tool="pencil" 
          shortcut="B" 
          ?active=${activeTool === 'pencil'}
          @click=${() => this.selectTool('pencil')}
        ></pf-tool-button>
        <pf-tool-button 
          tool="eraser" 
          shortcut="E" 
          ?active=${activeTool === 'eraser'}
          @click=${() => this.selectTool('eraser')}
        ></pf-tool-button>
        <pf-tool-button 
          tool="eyedropper" 
          shortcut="I" 
          ?active=${activeTool === 'eyedropper'}
          @click=${() => this.selectTool('eyedropper')}
        ></pf-tool-button>
      </div>
      <div class="group">
        <pf-tool-button 
          tool="marquee-rect" 
          shortcut="M" 
          ?active=${activeTool === 'marquee-rect'}
          @click=${() => this.selectTool('marquee-rect')}
        ></pf-tool-button>
        <pf-tool-button 
          tool="lasso" 
          shortcut="L" 
          ?active=${activeTool === 'lasso'}
          @click=${() => this.selectTool('lasso')}
        ></pf-tool-button>
        <pf-tool-button 
          tool="magic-wand" 
          shortcut="W" 
          ?active=${activeTool === 'magic-wand'}
          @click=${() => this.selectTool('magic-wand')}
        ></pf-tool-button>
      </div>
      <div class="group">
        <pf-tool-button 
          tool="line" 
          shortcut="U" 
          ?active=${activeTool === 'line'}
          @click=${() => this.selectTool('line')}
        ></pf-tool-button>
        <pf-tool-button 
          tool="rectangle" 
          shortcut="R" 
          ?active=${activeTool === 'rectangle'}
          @click=${() => this.selectTool('rectangle')}
        ></pf-tool-button>
        <pf-tool-button 
          tool="ellipse" 
          shortcut="O" 
          ?active=${activeTool === 'ellipse'}
          @click=${() => this.selectTool('ellipse')}
        ></pf-tool-button>
      </div>
      <div class="group">
        <pf-tool-button 
          tool="fill" 
          shortcut="G" 
          ?active=${activeTool === 'fill'}
          @click=${() => this.selectTool('fill')}
        ></pf-tool-button>
        <pf-tool-button 
          tool="gradient" 
          shortcut="H" 
          ?active=${activeTool === 'gradient'}
          @click=${() => this.selectTool('gradient')}
        ></pf-tool-button>
        <pf-tool-button 
          tool="transform" 
          shortcut="T" 
          ?active=${activeTool === 'transform'}
          @click=${() => this.selectTool('transform')}
        ></pf-tool-button>
      </div>
    `;
  }
}
