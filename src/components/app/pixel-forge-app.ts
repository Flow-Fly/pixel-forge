import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import '../toolbar/pf-toolbar';
import '../toolbar/pf-context-bar';
import '../status/pf-status-bar';
import '../menu/pf-menu-bar';
import '../canvas/pf-drawing-canvas';
import '../canvas/pf-canvas-viewport';
import '../color/pf-color-selector';
import '../color/pf-color-sliders';
import '../color/pf-palette-panel';
import '../layers/pf-layers-panel';
import '../timeline/pf-timeline';
import '../dialogs/pf-resize-dialog';
import '../preview/pf-preview-window';
import { projectStore } from '../../stores/project';

@customElement('pixel-forge-app')
export class PixelForgeApp extends BaseComponent {
  static styles = css`
    :host {
      display: grid;
      grid-template-columns: 48px 1fr 250px; /* Toolbar, Workspace, Panels */
      grid-template-rows: 32px 1fr 32px; /* Menu, Main, Status */
      width: 100vw;
      height: 100vh;
      background-color: var(--pf-color-bg-dark);
      color: var(--pf-color-text-main);
    }

    .menu-bar {
      grid-column: 1 / -1;
      background-color: var(--pf-color-bg-panel);
      border-bottom: 1px solid var(--pf-color-border);
      display: flex;
      align-items: center;
      padding: 0 var(--pf-spacing-2);
    }

    .toolbar {
      grid-column: 1;
      grid-row: 2;
      background-color: var(--pf-color-bg-panel);
      border-right: 1px solid var(--pf-color-border);
    }

    .workspace {
      grid-column: 2;
      grid-row: 2;
      position: relative;
      background-color: var(--pf-color-bg-dark);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    pf-canvas-viewport {
      flex: 1;
      overflow: hidden;
    }

    .timeline-container {
      height: 200px;
      border-top: 1px solid var(--pf-color-border);
    }

    .panels {
      grid-column: 3;
      grid-row: 2;
      background-color: var(--pf-color-bg-panel);
      border-left: 1px solid var(--pf-color-border);
      display: flex;
      flex-direction: column;
    }

    .status-bar {
      grid-column: 1 / -1;
      grid-row: 3;
      background-color: var(--pf-color-bg-panel);
      border-top: 1px solid var(--pf-color-border);
      display: flex;
      align-items: center;
      padding: 0 var(--pf-spacing-2);
      font-size: var(--pf-font-size-xs);
    }
  `;

  @state() showResizeDialog = false;

  render() {
    return html`
      <header class="menu-bar">
        <pf-menu-bar @resize-canvas=${() => this.showResizeDialog = true}></pf-menu-bar>
        <div style="flex: 1"></div>
        <pf-context-bar></pf-context-bar>
      </header>

      <aside class="toolbar">
        <pf-toolbar></pf-toolbar>
      </aside>

      <main class="workspace">
        <pf-canvas-viewport>
          <pf-drawing-canvas 
            .width=${projectStore.width.value} 
            .height=${projectStore.height.value} 
            zoom="10"
          ></pf-drawing-canvas>
        </pf-canvas-viewport>
        <div class="timeline-container">
          <pf-timeline></pf-timeline>
        </div>
      </main>

      <aside class="panels">
        <div style="padding: 8px; border-bottom: 1px solid var(--pf-color-border);">
          <pf-color-selector></pf-color-selector>
        </div>
        <pf-color-sliders></pf-color-sliders>
        <div style="height: 200px; border-top: 1px solid var(--pf-color-border); overflow-y: auto;">
          <pf-brush-panel></pf-brush-panel>
        </div>
        <div style="padding: 8px; font-size: 12px; color: var(--pf-color-text-muted); border-top: 1px solid var(--pf-color-border);">Palette</div>
        <pf-palette-panel></pf-palette-panel>
        <div style="padding: 8px; border-top: 1px solid var(--pf-color-border);">
          <pf-preview-window></pf-preview-window>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; border-top: 1px solid var(--pf-color-border); min-height: 150px;">
          <pf-layers-panel></pf-layers-panel>
        </div>
        <div style="height: 150px; border-top: 1px solid var(--pf-color-border);">
          <pf-undo-history></pf-undo-history>
        </div>
      </aside>

      <footer class="status-bar">
        <pf-status-bar></pf-status-bar>
      </footer>
    `;
  }
}
