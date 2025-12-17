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
import "../toolbar/pf-context-bar";
import "../timeline/pf-timeline";
import "../ui/pf-shortcuts-overlay";
import "../ui/pf-shortcuts-toggle";
import "../dialogs/pf-resize-dialog";
import "../dialogs/pf-export-dialog";
import "../dialogs/pf-new-project-dialog";
import "../dialogs/pf-grid-settings-dialog";
import "../dialogs/pf-accent-color-dialog";
import "../ui/pf-keyboard-shortcuts-dialog";
import "../preview/pf-preview-overlay";
import "../brush/pf-brush-panel";
import "../ui/pf-undo-history";
import "../ui/pf-panel";
import "../shape/pf-shape-options";
import "../layers/pf-layers-panel";
import { projectStore } from "../../stores/project";
import { historyStore } from "../../stores/history";
import { persistenceService } from "../../services/persistence/indexed-db";
import { type ToolType } from "../../stores/tools";
import { panelStore } from "../../stores/panels";

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
      overflow: hidden;
      min-height: 0;
    }

    .workspace {
      grid-column: 2;
      grid-row: 3;
      position: relative;
      background-color: var(--pf-color-bg-dark);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    pf-canvas-viewport {
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    .timeline-resize-handle {
      height: 6px;
      cursor: ns-resize;
      background: transparent;
      position: relative;
      flex-shrink: 0;
    }

    .timeline-resize-handle::before {
      content: "";
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 40px;
      height: 3px;
      background: var(--pf-color-border);
      border-radius: 2px;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .timeline-resize-handle:hover::before,
    .timeline-resize-handle.resizing::before {
      opacity: 1;
    }

    .timeline-container {
      flex-shrink: 0;
      border-top: 1px solid var(--pf-color-border);
      min-height: 100px;
      max-height: 500px;
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

    .panels > * {
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

    /* Warning toast - rendered at app level to avoid viewport transform issues */
    .warning-toast {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(40, 40, 40, 0.95);
      border: 1px solid rgba(200, 80, 80, 0.8);
      color: #ff8080;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      z-index: 10000;
      pointer-events: none;
      animation: toastFadeInOut 2s ease-in-out forwards;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      white-space: nowrap;
    }

    @keyframes toastFadeInOut {
      0% { opacity: 0; transform: translate(-50%, -50%) translateY(10px); }
      15% { opacity: 1; transform: translate(-50%, -50%) translateY(0); }
      85% { opacity: 1; transform: translate(-50%, -50%) translateY(0); }
      100% { opacity: 0; transform: translate(-50%, -50%) translateY(-10px); }
    }
  `;

  @state() showResizeDialog = false;
  @state() showExportDialog = false;
  @state() showNewProjectDialog = false;
  @state() showKeyboardShortcutsDialog = false;
  @state() cursorPosition = { x: 0, y: 0 };
  @state() timelineHeight = 200;
  @state() private isResizingTimeline = false;
  @state() private warningMessage: string | null = null;

  private resizeStartY = 0;
  private resizeStartHeight = 0;
  private warningTimer: number | null = null;

  connectedCallback() {
    super.connectedCallback();
    // Load saved timeline height
    const savedHeight = localStorage.getItem("pf-timeline-height");
    if (savedHeight) {
      this.timelineHeight = Math.max(
        100,
        Math.min(500, parseInt(savedHeight, 10))
      );
    }

    // Load saved project from IndexedDB
    this.loadSavedProject();

    // Listen for keyboard shortcuts
    window.addEventListener(
      "show-new-project-dialog",
      this.handleShowNewProjectDialog
    );
    window.addEventListener(
      "show-keyboard-shortcuts-dialog",
      this.handleShowKeyboardShortcutsDialog
    );
    window.addEventListener(
      "show-resize-dialog",
      this.handleShowResizeDialog
    );
    window.addEventListener(
      "show-open-file-dialog",
      this.handleShowOpenFileDialog
    );
    window.addEventListener(
      "show-export-dialog",
      this.handleShowExportDialog
    );

    // Warn user about unsaved changes before leaving
    window.addEventListener("beforeunload", this.handleBeforeUnload);

    // Listen for warning toast events from canvas
    window.addEventListener(
      "show-warning-toast",
      this.handleShowWarningToast as EventListener
    );
  }

  private handleShowWarningToast = (e: CustomEvent<{ message: string }>) => {
    // Clear any existing timer
    if (this.warningTimer !== null) {
      clearTimeout(this.warningTimer);
    }

    this.warningMessage = e.detail.message;

    // Auto-hide after animation completes
    this.warningTimer = window.setTimeout(() => {
      this.warningMessage = null;
      this.warningTimer = null;
    }, 2000);
  };

  private handleShowNewProjectDialog = () => {
    this.showNewProjectDialog = true;
  };

  private handleShowKeyboardShortcutsDialog = () => {
    this.showKeyboardShortcutsDialog = true;
  };

  private handleShowResizeDialog = () => {
    this.showResizeDialog = true;
  };

  private handleShowOpenFileDialog = () => {
    // Trigger the menu bar's open file method
    const menuBar = this.shadowRoot?.querySelector("pf-menu-bar") as any;
    menuBar?.openFile();
  };

  private handleShowExportDialog = () => {
    this.showExportDialog = true;
  };

  private handleBeforeUnload = (e: BeforeUnloadEvent) => {
    // Check if there are unsaved changes (history has items)
    const hasUnsavedChanges = historyStore.undoStack.value.length > 0;
    if (hasUnsavedChanges) {
      // Modern browsers ignore custom messages, but the prompt will still show
      e.preventDefault();
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    }
  };

  private async loadSavedProject() {
    try {
      const savedProject = await persistenceService.loadCurrentProject();
      if (savedProject) {
        // fromAutoSave = true: palette is already loaded from localStorage,
        // don't overwrite with stale palette data from IndexedDB
        await projectStore.loadProject(savedProject, true);
        historyStore.clear();
      }
    } catch (error) {
      console.warn("Failed to load saved project, starting fresh:", error);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("mousemove", this.handleTimelineResizeMove);
    document.removeEventListener("mouseup", this.handleTimelineResizeEnd);
    window.removeEventListener(
      "show-new-project-dialog",
      this.handleShowNewProjectDialog
    );
    window.removeEventListener(
      "show-keyboard-shortcuts-dialog",
      this.handleShowKeyboardShortcutsDialog
    );
    window.removeEventListener(
      "show-resize-dialog",
      this.handleShowResizeDialog
    );
    window.removeEventListener(
      "show-open-file-dialog",
      this.handleShowOpenFileDialog
    );
    window.removeEventListener(
      "show-export-dialog",
      this.handleShowExportDialog
    );
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    window.removeEventListener(
      "show-warning-toast",
      this.handleShowWarningToast as EventListener
    );
  }

  private handleCanvasCursor = (e: CustomEvent<{ x: number; y: number }>) => {
    this.cursorPosition = e.detail;
  };

  private handleTimelineResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    this.isResizingTimeline = true;
    this.resizeStartY = e.clientY;
    this.resizeStartHeight = this.timelineHeight;

    document.addEventListener("mousemove", this.handleTimelineResizeMove);
    document.addEventListener("mouseup", this.handleTimelineResizeEnd);
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  };

  private handleTimelineResizeMove = (e: MouseEvent) => {
    if (!this.isResizingTimeline) return;

    // Dragging up increases height (inverse delta)
    const deltaY = this.resizeStartY - e.clientY;
    const newHeight = Math.max(
      100,
      Math.min(500, this.resizeStartHeight + deltaY)
    );
    this.timelineHeight = newHeight;
  };

  private handleTimelineResizeEnd = () => {
    this.isResizingTimeline = false;
    document.removeEventListener("mousemove", this.handleTimelineResizeMove);
    document.removeEventListener("mouseup", this.handleTimelineResizeEnd);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    // Save to localStorage
    localStorage.setItem("pf-timeline-height", String(this.timelineHeight));
  };

  render() {
    // Access panel states signal to ensure reactive updates when timeline visibility changes
    const isTimelineCollapsed = panelStore.panelStates.value.timeline?.collapsed ?? false;

    return html`
      <header class="menu-bar">
        <pf-menu-bar
          @resize-canvas=${() => (this.showResizeDialog = true)}
          @show-export-dialog=${() => (this.showExportDialog = true)}
          @show-new-project-dialog=${() => (this.showNewProjectDialog = true)}
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
        <pf-shortcuts-toggle></pf-shortcuts-toggle>
        ${!isTimelineCollapsed
          ? html`
              <div
                class="timeline-resize-handle ${this.isResizingTimeline
                  ? "resizing"
                  : ""}"
                @mousedown=${this.handleTimelineResizeStart}
              ></div>
              <div
                class="timeline-container"
                style="height: ${this.timelineHeight}px;"
              >
                <pf-timeline></pf-timeline>
              </div>
            `
          : ""}
      </main>

      <aside class="panels">
        ${isTimelineCollapsed
          ? html`
              <pf-panel header="Layers" collapsible panel-id="layers" bordered>
                <pf-layers-panel></pf-layers-panel>
              </pf-panel>
            `
          : ""}
        <pf-panel header="Brushes" collapsible panel-id="brush" bordered>
          <pf-brush-panel></pf-brush-panel>
        </pf-panel>
        <pf-panel header="Palette" collapsible panel-id="palette" bordered>
          <pf-palette-panel></pf-palette-panel>
        </pf-panel>
        <pf-panel header="History" collapsible panel-id="history" bordered>
          <pf-undo-history></pf-undo-history>
        </pf-panel>
      </aside>

      <footer class="status-bar">
        <pf-status-bar .cursor=${this.cursorPosition}></pf-status-bar>
      </footer>

      <pf-export-dialog
        ?open=${this.showExportDialog}
        @close=${() => (this.showExportDialog = false)}
      ></pf-export-dialog>

      <pf-new-project-dialog
        ?open=${this.showNewProjectDialog}
        @close=${() => (this.showNewProjectDialog = false)}
      ></pf-new-project-dialog>

      <pf-keyboard-shortcuts-dialog
        ?open=${this.showKeyboardShortcutsDialog}
        @pf-close=${() => (this.showKeyboardShortcutsDialog = false)}
      ></pf-keyboard-shortcuts-dialog>

      <pf-resize-dialog
        ?open=${this.showResizeDialog}
        @close=${() => (this.showResizeDialog = false)}
      ></pf-resize-dialog>

      <pf-grid-settings-dialog></pf-grid-settings-dialog>
      <pf-accent-color-dialog></pf-accent-color-dialog>

      ${this.warningMessage ? html`<div class="warning-toast">${this.warningMessage}</div>` : ""}
    `;
  }
}
