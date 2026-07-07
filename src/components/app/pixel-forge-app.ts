import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import "../toolbar/pf-toolbar";
import "../status/pf-status-bar";
import "../menu/pf-menu-bar";
import "../canvas/pf-drawing-canvas";
import "../canvas/pf-canvas-viewport";
import "../color/pf-palette-panel";
import "../toolbar/pf-context-bar";
import "../timeline/pf-timeline";
import "../ui/pf-shortcuts-overlay";
import "../ui/pf-shortcuts-toggle";
import "./pf-project-browser";
import "../dialogs/pf-resize-dialog";
import "../dialogs/pf-export-dialog";
import "../dialogs/pf-new-project-dialog";
import "../dialogs/pf-grid-settings-dialog";
import "../dialogs/pf-checker-settings-dialog";
import "../dialogs/pf-accent-color-dialog";
import "../ui/pf-keyboard-shortcuts-dialog";
import "../preview/pf-preview-overlay";
import "../brush/pf-brush-panel";
import "../ui/pf-undo-history";
import "../ui/pf-panel";
import "../layers/pf-layers-panel";
import { projectStore } from "../../stores/project";
import { viewportStore } from "../../stores/viewport";
import { historyStore } from "../../stores/history";
import { projectRepository } from "../../services/persistence/indexed-db";
import { autoSaveService } from "../../services/auto-save";
import { projectLibrary } from "../../services/project-library";
import type { ToolType as _ToolType } from "../../stores/tools";
import { panelStore } from "../../stores/panels";
import { log } from "../../utils/log";

type UpdatableElement = HTMLElement & { updateComplete?: Promise<unknown> };

@customElement("pixel-forge-app")
export class PixelForgeApp extends BaseComponent {
  static styles = css`
    :host {
      display: grid;
      grid-template-columns: 56px 1fr 288px; /* Toolbar, Workspace, Panels */
      grid-template-rows: 52px 36px 1fr 28px; /* Menu, ContextBar, Main, Status */
      width: 100vw;
      height: 100vh;
      background:
        radial-gradient(circle, rgba(225, 231, 237, 0.18) 0 1px, transparent 1.3px) 23px 31px / 173px 139px,
        linear-gradient(rgba(218, 226, 235, 0.027) 1px, transparent 1px) 0 0 / 32px 32px,
        linear-gradient(90deg, rgba(218, 226, 235, 0.027) 1px, transparent 1px) 0 0 / 32px 32px,
        linear-gradient(180deg, #10141b 0%, var(--pf-color-bg-dark) 58%, #05070a 100%);
      color: var(--pf-color-text-main);
      position: relative;
      isolation: isolate;
      overflow: hidden;
      letter-spacing: 0;
    }

    :host::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background:
        repeating-radial-gradient(circle at 17% 29%, rgba(255, 255, 255, 0.09) 0 1px, transparent 1px 5px),
        repeating-linear-gradient(0deg, transparent 0 2px, rgba(255, 255, 255, 0.014) 2px 3px);
      mix-blend-mode: screen;
      opacity: 0.16;
    }

    :host > * {
      position: relative;
      z-index: 1;
    }

    .menu-bar {
      grid-column: 1 / -1;
      grid-row: 1;
      background:
        linear-gradient(180deg, rgba(22, 26, 33, 0.94), rgba(10, 13, 18, 0.9));
      border-bottom: 1px solid var(--pf-color-border);
      display: flex;
      align-items: center;
      padding: 0 18px;
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset;
      backdrop-filter: blur(14px);
    }

    .context-bar {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .toolbar {
      grid-column: 1;
      grid-row: 3;
      background:
        linear-gradient(180deg, rgba(15, 18, 24, 0.92), rgba(8, 10, 14, 0.9));
      border-right: 1px solid var(--pf-color-border);
      overflow: hidden;
      min-height: 0;
      box-shadow: 1px 0 0 rgba(255, 255, 255, 0.025) inset;
    }

    .workspace {
      grid-column: 2;
      grid-row: 3;
      position: relative;
      background:
        linear-gradient(180deg, rgba(8, 11, 16, 0.16), rgba(0, 0, 0, 0.12));
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
      background: var(--pf-color-border-strong);
      border-radius: 2px;
      opacity: 0.36;
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
      box-shadow: 0 -20px 50px rgba(0, 0, 0, 0.18);
    }

    .panels {
      grid-column: 3;
      grid-row: 3;
      background:
        linear-gradient(180deg, rgba(13, 16, 21, 0.94), rgba(8, 10, 14, 0.92));
      border-left: 1px solid var(--pf-color-border);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      overflow-x: hidden;
      box-shadow: -1px 0 0 rgba(255, 255, 255, 0.025) inset;
    }

    .panels > * {
      flex-shrink: 0;
    }

    .status-bar {
      grid-column: 1 / -1;
      grid-row: 4;
      background: rgba(7, 9, 13, 0.92);
      border-top: 1px solid var(--pf-color-border);
      display: flex;
      align-items: center;
      padding: 0 14px;
      font-size: var(--pf-font-size-xs);
      color: var(--pf-color-text-muted);
      backdrop-filter: blur(12px);
    }

    /* Warning toast - rendered at app level to avoid viewport transform issues */
    .warning-toast {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(13, 16, 21, 0.95);
      border: 1px solid rgba(196, 124, 114, 0.8);
      color: #f0aaa2;
      padding: 10px 20px;
      border-radius: var(--pf-radius-md);
      font-size: 13px;
      font-weight: 500;
      z-index: 10000;
      pointer-events: none;
      animation: toastFadeInOut 2s ease-in-out forwards;
      box-shadow: var(--pf-shadow-lg);
      white-space: nowrap;
    }

    @keyframes toastFadeInOut {
      0% {
        opacity: 0;
        transform: translate(-50%, -50%) translateY(10px);
      }
      15% {
        opacity: 1;
        transform: translate(-50%, -50%) translateY(0);
      }
      85% {
        opacity: 1;
        transform: translate(-50%, -50%) translateY(0);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -50%) translateY(-10px);
      }
    }
  `;

  @state() showResizeDialog = false;
  @state() showExportDialog = false;
  @state() showNewProjectDialog = false;
  @state() showProjectBrowser = false;
  @state() showDeleteCurrentDialog = false;
  @state() showKeyboardShortcutsDialog = false;
  @state() cursorPosition = { x: 0, y: 0 };
  @state() timelineHeight = 200;
  @state() private isResizingTimeline = false;
  @state() private hasLibraryProject = false;
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

    // Listen for keyboard shortcuts
    window.addEventListener("project-loaded", this.handleProjectLoaded);
    window.addEventListener(
      "show-new-project-dialog",
      this.handleShowNewProjectDialog
    );
    window.addEventListener(
      "show-keyboard-shortcuts-dialog",
      this.handleShowKeyboardShortcutsDialog
    );
    window.addEventListener("show-resize-dialog", this.handleShowResizeDialog);
    window.addEventListener(
      "show-open-file-dialog",
      this.handleShowOpenFileDialog
    );
    window.addEventListener(
      "show-project-browser",
      this.handleShowProjectBrowser
    );
    window.addEventListener(
      "duplicate-current-project",
      this.handleDuplicateCurrentProject
    );
    window.addEventListener(
      "delete-current-project",
      this.handleDeleteCurrentProject
    );
    window.addEventListener("show-export-dialog", this.handleShowExportDialog);

    // Warn user about unsaved changes before leaving
    window.addEventListener("beforeunload", this.handleBeforeUnload);

    // Listen for warning toast events from canvas
    window.addEventListener(
      "show-warning-toast",
      this.handleShowWarningToast as EventListener
    );

    // Load saved project from IndexedDB after listeners are ready.
    this.loadSavedProject();
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

  private handleProjectLoaded = async () => {
    await this.updateComplete;

    const viewport =
      this.shadowRoot?.querySelector<UpdatableElement>("pf-canvas-viewport");
    const drawingCanvas =
      this.shadowRoot?.querySelector<UpdatableElement>("pf-drawing-canvas");

    await Promise.all([viewport?.updateComplete, drawingCanvas?.updateComplete]);
    viewportStore.resetView();
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

  private handleShowProjectBrowser = () => {
    this.showProjectBrowser = true;
  };

  private handleDuplicateCurrentProject = async () => {
    try {
      await autoSaveService.saveNow();
      await projectLibrary.duplicateProject(projectStore.id.value);
      this.showWarning("Project duplicated");
    } catch (error) {
      log.error("Failed to duplicate project:", error);
      this.showWarning("Could not duplicate project");
    }
  };

  private handleDeleteCurrentProject = () => {
    this.showDeleteCurrentDialog = true;
  };

  private handleShowExportDialog = () => {
    this.showExportDialog = true;
  };

  private handleProjectBrowserClose = () => {
    if (this.hasLibraryProject) {
      this.showProjectBrowser = false;
    }
  };

  private handleProjectOpened = () => {
    this.hasLibraryProject = true;
    this.showProjectBrowser = false;
  };

  private handleProjectCreated = () => {
    this.hasLibraryProject = true;
    this.showProjectBrowser = false;
  };

  private handleCurrentProjectDeleted = () => {
    this.hasLibraryProject = false;
    this.showProjectBrowser = true;
  };

  private confirmDeleteCurrentProject = async () => {
    this.showDeleteCurrentDialog = false;

    try {
      await projectLibrary.deleteProject(projectStore.id.value);
      this.handleCurrentProjectDeleted();
    } catch (error) {
      log.error("Failed to delete project:", error);
      this.showWarning("Could not delete project");
    }
  };

  private showWarning(message: string) {
    this.handleShowWarningToast(
      new CustomEvent("show-warning-toast", { detail: { message } })
    );
  }

  private handleBeforeUnload = (e: BeforeUnloadEvent) => {
    // Check if there are unsaved changes (history has items)
    const hasUnsavedChanges = historyStore.undoStack.value.length > 0;
    if (hasUnsavedChanges) {
      // Modern browsers ignore custom messages, but the prompt will still show
      e.preventDefault();
      e.returnValue =
        "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    }
  };

  private async loadSavedProject() {
    try {
      let projectId = await projectRepository.getLastOpenedProjectId();
      if (!projectId) {
        // No last-opened marker — fall back to the most recent project
        const all = await projectRepository.list();
        projectId = all[0]?.id ?? null;
      }

      const savedProject = projectId
        ? await projectRepository.load(projectId)
        : null;
      if (savedProject && projectId) {
        projectStore.id.value = projectId;
        // fromAutoSave = true: palette is already loaded from localStorage,
        // don't overwrite with stale palette data from IndexedDB
        await projectStore.loadProject(savedProject, true);
        await projectRepository.setLastOpenedProjectId(projectId);
        historyStore.clear();
        this.hasLibraryProject = true;
        this.showProjectBrowser = false;
      } else {
        this.hasLibraryProject = false;
        this.showProjectBrowser = true;
      }
    } catch (error) {
      log.warn("Failed to load saved project, starting fresh:", error);
      this.hasLibraryProject = false;
      this.showProjectBrowser = true;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("mousemove", this.handleTimelineResizeMove);
    document.removeEventListener("mouseup", this.handleTimelineResizeEnd);
    window.removeEventListener("project-loaded", this.handleProjectLoaded);
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
      "show-project-browser",
      this.handleShowProjectBrowser
    );
    window.removeEventListener(
      "duplicate-current-project",
      this.handleDuplicateCurrentProject
    );
    window.removeEventListener(
      "delete-current-project",
      this.handleDeleteCurrentProject
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
    const isTimelineCollapsed =
      panelStore.panelStates.value.timeline?.collapsed ?? false;

    return html`
      <header class="menu-bar">
        <pf-menu-bar
          @resize-canvas=${() => (this.showResizeDialog = true)}
          @show-export-dialog=${() => (this.showExportDialog = true)}
          @show-new-project-dialog=${() => (this.showNewProjectDialog = true)}
          @show-project-browser=${() => (this.showProjectBrowser = true)}
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
        <!-- <pf-shortcuts-toggle></pf-shortcuts-toggle> -->
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
        .saveCurrentBeforeCreate=${this.hasLibraryProject}
        @close=${() => (this.showNewProjectDialog = false)}
        @project-created=${this.handleProjectCreated}
      ></pf-new-project-dialog>

      ${this.showProjectBrowser
        ? html`
            <pf-project-browser
              .canClose=${this.hasLibraryProject}
              @project-browser-close=${this.handleProjectBrowserClose}
              @project-opened=${this.handleProjectOpened}
              @current-project-deleted=${this.handleCurrentProjectDeleted}
            ></pf-project-browser>
          `
        : ""}

      <pf-dialog
        ?open=${this.showDeleteCurrentDialog}
        width="360px"
        @pf-close=${() => (this.showDeleteCurrentDialog = false)}
      >
        <span slot="title">Delete Current Project</span>
        <p>Delete "${projectStore.name.value}" from this browser?</p>
        <div slot="actions">
          <button
            type="button"
            class="secondary"
            @click=${() => (this.showDeleteCurrentDialog = false)}
          >
            Cancel
          </button>
          <button
            type="button"
            class="primary"
            @click=${this.confirmDeleteCurrentProject}
          >
            Delete
          </button>
        </div>
      </pf-dialog>

      <pf-keyboard-shortcuts-dialog
        ?open=${this.showKeyboardShortcutsDialog}
        @pf-close=${() => (this.showKeyboardShortcutsDialog = false)}
      ></pf-keyboard-shortcuts-dialog>

      <pf-resize-dialog
        ?open=${this.showResizeDialog}
        @close=${() => (this.showResizeDialog = false)}
      ></pf-resize-dialog>

      <pf-grid-settings-dialog></pf-grid-settings-dialog>
      <pf-checker-settings-dialog></pf-checker-settings-dialog>
      <pf-accent-color-dialog></pf-accent-color-dialog>

      ${this.warningMessage
        ? html`<div class="warning-toast">${this.warningMessage}</div>`
        : ""}
    `;
  }
}
