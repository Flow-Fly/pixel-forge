import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import "../toolbar/pf-toolbar";
import "../status/pf-status-bar";
import "../menu/pf-menu-bar";
import "../canvas/pf-drawing-canvas";
import "../canvas/pf-canvas-viewport";
import "../color/pf-color-selector";
import "../color/pf-color-sliders";
import "../color/pf-palette-panel";
import "../color/pf-palette-generator";
import "../toolbar/pf-context-bar";
import "../timeline/pf-timeline";
import "../ui/pf-shortcuts-overlay";
import "../dialogs/pf-resize-dialog";
import "../dialogs/pf-export-dialog";
import "../preview/pf-preview-overlay";
import "../brush/pf-brush-panel";
import "../ui/pf-undo-history";
import "../ui/pf-collapsible-panel";
import "../shape/pf-shape-options";
import { projectStore } from "../../stores/project";
import { type ToolType } from "../../stores/tools";

@customElement("pixel-forge-app")
export class PixelForgeApp extends BaseComponent {
  static styles = css`
    :host {
      display: grid;
      grid-template-columns: 48px 1fr 250px; /* Toolbar, Workspace, Panels */
      grid-template-rows: 32px auto 1fr 32px; /* Menu, ContextBar, Main, Status */
      width: 100vw;
      height: 100vh;
      background-color: var(--pf-color-bg-dark);
      color: var(--pf-color-text-main);
    }

    .menu-bar {
      grid-column: 1 / -1;
      grid-row: 1;
      background-color: var(--pf-color-bg-panel);
      border-bottom: 1px solid var(--pf-color-border);
      display: flex;
      align-items: center;
      padding: 0 var(--pf-spacing-2);
    }

    .context-bar {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .toolbar {
      grid-column: 1;
      grid-row: 3;
      background-color: var(--pf-color-bg-panel);
      border-right: 1px solid var(--pf-color-border);
    }

    .workspace {
      grid-column: 2;
      grid-row: 3;
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
      grid-row: 3;
      background-color: var(--pf-color-bg-panel);
      border-left: 1px solid var(--pf-color-border);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .panels pf-collapsible-panel {
      flex-shrink: 0;
    }

    .status-bar {
      grid-column: 1 / -1;
      grid-row: 4;
      background-color: var(--pf-color-bg-panel);
      border-top: 1px solid var(--pf-color-border);
      display: flex;
      align-items: center;
      padding: 0 var(--pf-spacing-2);
      font-size: var(--pf-font-size-xs);
    }
  `;

  @state() showResizeDialog = false;
  @state() showExportDialog = false;
  @state() cursorPosition = { x: 0, y: 0 };

  private handleCanvasCursor = (e: CustomEvent<{ x: number; y: number }>) => {
    this.cursorPosition = e.detail;
  };

  render() {
    return html`
      <header class="menu-bar">
        <pf-menu-bar
          @resize-canvas=${() => (this.showResizeDialog = true)}
          @show-export-dialog=${() => (this.showExportDialog = true)}
        ></pf-menu-bar>
      </header>

      <div class="context-bar">
        <pf-context-bar></pf-context-bar>
      </div>

      <aside class="toolbar">
        <pf-toolbar></pf-toolbar>
      </aside>

      <main class="workspace">
        <pf-canvas-viewport @canvas-cursor=${this.handleCanvasCursor}>
          <pf-drawing-canvas
            .width=${projectStore.width.value}
            .height=${projectStore.height.value}
          ></pf-drawing-canvas>
        </pf-canvas-viewport>
        <pf-preview-overlay></pf-preview-overlay>
        <pf-shortcuts-overlay></pf-shortcuts-overlay>
        <div class="timeline-container">
          <pf-timeline></pf-timeline>
        </div>
      </main>

      <aside class="panels">
        <!-- Color Selector 
        <div style="padding: 8px; border-bottom: 1px solid var(--pf-color-border);">
          <pf-color-selector></pf-color-selector>
        </div>
        
        <pf-collapsible-panel panelId="color-sliders" title="Color Sliders">
        <pf-color-sliders></pf-color-sliders>
        </pf-collapsible-panel>
        -->

        <pf-collapsible-panel
          panelId="brush"
          title="Brushes"
          .visibleForTools=${["pencil", "eraser"] as ToolType[]}
        >
          <pf-brush-panel></pf-brush-panel>
        </pf-collapsible-panel>

        <pf-collapsible-panel panelId="palette" title="Palette">
          <pf-palette-panel></pf-palette-panel>
        </pf-collapsible-panel>

        <pf-collapsible-panel panelId="palette-generator" title="Palette Generator">
          <pf-palette-generator></pf-palette-generator>
        </pf-collapsible-panel>

        <pf-collapsible-panel panelId="history" title="History">
          <pf-undo-history></pf-undo-history>
        </pf-collapsible-panel>
      </aside>

      <footer class="status-bar">
        <pf-status-bar .cursor=${this.cursorPosition}></pf-status-bar>
      </footer>

      <pf-export-dialog
        ?open=${this.showExportDialog}
        @close=${() => (this.showExportDialog = false)}
      ></pf-export-dialog>
    `;
  }
}
