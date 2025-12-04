import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { toolStore, type ToolType } from '../../stores/tools';
import { brushStore } from '../../stores/brush';
import './pf-tool-button';
import '../color/pf-color-selector-compact';

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

    .spacer {
      flex: 1;
    }

    .color-section {
      padding: var(--pf-spacing-2) 0;
      border-top: 1px solid var(--pf-color-border);
      display: flex;
      justify-content: center;
    }

    .big-pixel-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 8px;
      margin: 0 var(--pf-spacing-2) var(--pf-spacing-2);
      background: transparent;
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      font-size: 10px;
      color: var(--pf-color-text-muted);
      text-align: center;
    }

    .big-pixel-toggle:hover {
      background: var(--pf-color-bg-hover);
    }

    .big-pixel-toggle.active {
      background: var(--pf-color-primary);
      border-color: var(--pf-color-primary);
      color: white;
    }

    .big-pixel-toggle svg {
      width: 14px;
      height: 14px;
      margin-right: 4px;
    }
  `;

  selectTool(tool: ToolType) {
    toolStore.setActiveTool(tool);
  }

  render() {
    const activeTool = toolStore.activeTool.value;
    const bigPixelMode = brushStore.bigPixelMode.value;

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
          shortcut="Q"
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
          shortcut="L"
          ?active=${activeTool === 'line'}
          @click=${() => this.selectTool('line')}
        ></pf-tool-button>
        <pf-tool-button
          tool="rectangle"
          shortcut="U"
          ?active=${activeTool === 'rectangle'}
          @click=${() => this.selectTool('rectangle')}
        ></pf-tool-button>
        <pf-tool-button
          tool="ellipse"
          shortcut="⇧U"
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
          shortcut="⇧G"
          ?active=${activeTool === 'gradient'}
          @click=${() => this.selectTool('gradient')}
        ></pf-tool-button>
        <pf-tool-button
          tool="transform"
          shortcut="V"
          ?active=${activeTool === 'transform'}
          @click=${() => this.selectTool('transform')}
        ></pf-tool-button>
      </div>
      <div class="group">
        <pf-tool-button
          tool="hand"
          shortcut="H"
          ?active=${activeTool === 'hand'}
          @click=${() => this.selectTool('hand')}
        ></pf-tool-button>
        <pf-tool-button
          tool="zoom"
          shortcut="Z"
          ?active=${activeTool === 'zoom'}
          @click=${() => this.selectTool('zoom')}
        ></pf-tool-button>
      </div>

      <div
        class="big-pixel-toggle ${bigPixelMode ? 'active' : ''}"
        @click=${() => brushStore.toggleBigPixelMode()}
        title="Big Pixel Mode (Ctrl+Shift+B)"
      >
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="6" height="6"/>
          <rect x="9" y="1" width="6" height="6"/>
          <rect x="1" y="9" width="6" height="6"/>
          <rect x="9" y="9" width="6" height="6"/>
        </svg>
        BIG
      </div>

      <div class="spacer"></div>

      <div class="color-section">
        <pf-color-selector-compact></pf-color-selector-compact>
      </div>
    `;
  }
}
