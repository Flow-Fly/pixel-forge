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
import "../dialogs/pf-paint-by-number-dialog";
import "../dialogs/pf-grid-settings-dialog";
import "../dialogs/pf-checker-settings-dialog";
import "../dialogs/pf-accent-color-dialog";
import "../ui/pf-keyboard-shortcuts-dialog";
import "../preview/pf-preview-overlay";
import "../brush/pf-brush-panel";
import "../ui/pf-undo-history";
import "../ui/pf-panel";
import "../layers/pf-layers-panel";
import "./pf-project-tabs";
import "./pf-pwa-update-toast";
import {
  activeProjectContext,
  getActiveProjectContext,
  type ProjectContext,
} from "../../stores/project-context";
import { workspaceStore } from "../../stores/workspace";
import { viewportStore } from "../../stores/viewport";
import { historyStore } from "../../stores/history";
import { projectRepository } from "../../services/persistence/indexed-db";
import { autoSaveService } from "../../services/auto-save";
import { projectLibrary } from "../../services/project-library";
import { pwaFileHandling } from "../../services/pwa-file-handling";
import {
  PROJECT_FILE_IMPORT_REPORT_EVENT,
  describeProjectFileImport,
  importProjectFiles,
  supportedProjectFiles,
  type ProjectFileImportReport,
} from "../../services/project-file-handling";
import type { ToolType as _ToolType } from "../../stores/tools";
import { panelStore } from "../../stores/panels";
import {
  DEFAULT_SIDEBAR_WIDTH,
  clampSidebarWidth,
  getSidebarWidthBounds,
  persistSidebarWidth,
  readSidebarWidth,
  resetSidebarWidth,
} from "../../stores/sidebar-width";
import { log } from "../../utils/log";
import { scrollbarStyles } from "../../styles/scrollbar-styles";
import { productTelemetry } from "../../services/telemetry";

type UpdatableElement = HTMLElement & { updateComplete?: Promise<unknown> };
const SIDEBAR_KEYBOARD_STEP = 16;

@customElement("pixel-forge-app")
export class PixelForgeApp extends BaseComponent {
  static styles = css`
    ${scrollbarStyles}

    :host {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr) var(--pf-sidebar-width, 288px);
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
      --pf-scrollbar-surface-shadow: -1px 0 0 rgba(255, 255, 255, 0.025) inset;
    }

    .panels > * {
      flex-shrink: 0;
    }

    .sidebar-resize-handle {
      grid-column: 3;
      grid-row: 3;
      align-self: stretch;
      justify-self: start;
      width: 11px;
      z-index: 2;
      border: 0;
      padding: 0;
      background: transparent;
      cursor: ew-resize;
      touch-action: none;
      transform: translateX(-50%);
    }

    .sidebar-resize-handle::before {
      content: "";
      position: absolute;
      inset-block: 0;
      left: 50%;
      width: 2px;
      background: var(--pf-color-border-strong);
      opacity: 0.5;
      transform: translateX(-50%);
      transition:
        background-color 0.15s,
        opacity 0.15s;
    }

    .sidebar-resize-handle:hover::before,
    .sidebar-resize-handle:focus-visible::before,
    .sidebar-resize-handle.resizing::before {
      background: var(--pf-color-accent);
      opacity: 1;
    }

    .sidebar-resize-handle:focus-visible {
      outline: 1px solid var(--pf-color-accent);
      outline-offset: -2px;
    }

    .sidebar-resize-handle[hidden] {
      display: none;
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

    .file-import-status {
      position: fixed;
      left: 50%;
      bottom: 42px;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 14px;
      max-width: min(560px, calc(100vw - 32px));
      padding: 9px 10px 9px 14px;
      background: rgba(13, 16, 21, 0.97);
      border: 1px solid var(--pf-color-border-strong);
      border-radius: var(--pf-radius-md);
      box-shadow: var(--pf-shadow-lg);
      color: var(--pf-color-text-main);
      font-size: 12px;
      line-height: 1.4;
      z-index: 10000;
    }

    .file-import-status button {
      flex: none;
      min-height: 28px;
      padding: 4px 8px;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: transparent;
      color: var(--pf-color-text-secondary);
      font: inherit;
      cursor: pointer;
    }

    .file-import-status button:hover,
    .file-import-status button:focus-visible {
      border-color: var(--pf-color-accent);
      color: var(--pf-color-text-main);
      outline: none;
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      border: 0;
    }
  `;

  @state() showResizeDialog = false;
  @state() showExportDialog = false;
  @state() showNewProjectDialog = false;
  @state() showPaintByNumberDialog = false;
  @state() showProjectBrowser = false;
  @state() showDeleteCurrentDialog = false;
  @state() showKeyboardShortcutsDialog = false;
  @state() cursorPosition = { x: 0, y: 0 };
  @state() timelineHeight = 200;
  @state() private isResizingTimeline = false;
  @state() private sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
  @state() private isResizingSidebar = false;
  @state() private hasLibraryProject = false;
  @state() private projectSelectionRequired = false;
  @state() private isDeletingCurrentProject = false;
  @state() private deleteCurrentProjectError: string | null = null;
  @state() private warningMessage: string | null = null;
  @state() private fileImportMessage: string | null = null;

  private resizeStartY = 0;
  private resizeStartHeight = 0;
  private sidebarResizeStartX = 0;
  private sidebarResizeStartWidth = DEFAULT_SIDEBAR_WIDTH;
  private sidebarResizePointerId: number | null = null;
  private sidebarResizeHandle: HTMLElement | null = null;
  private previousBodyCursor = "";
  private previousBodyUserSelect = "";
  private warningTimer: number | null = null;
  private fileImportTimer: number | null = null;
  private editorLoadedTimer: number | null = null;
  private fileDropHandlingStarted = false;
  private deleteCurrentProjectContext: ProjectContext | null = null;
  private exportProjectContext: ProjectContext | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.applySidebarWidth(readSidebarWidth(window.innerWidth));
    window.addEventListener("resize", this.handleWindowResize);

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
      "show-paint-by-number-dialog",
      this.handleShowPaintByNumberDialog
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
    window.addEventListener(
      PROJECT_FILE_IMPORT_REPORT_EVENT,
      this.handleProjectFileImportReport as EventListener
    );

    // Load saved project from IndexedDB after listeners are ready.
    void this.loadSavedProject().finally(() => {
      if (!this.isConnected) return;
      pwaFileHandling.registerLaunchConsumer();
      this.startProjectFileDropHandling();
      this.editorLoadedTimer = window.setTimeout(() => {
        productTelemetry.record({
          name: "editor_loaded",
          dimensions: { entryPoint: "direct" },
        });
        this.editorLoadedTimer = null;
      });
    });
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

  private handleProjectFileImportReport = (
    event: CustomEvent<ProjectFileImportReport>
  ) => {
    const message = describeProjectFileImport(event.detail);
    if (!message) return;

    if (event.detail.outcomes.some((outcome) => outcome.ok)) {
      this.hasLibraryProject = true;
      this.projectSelectionRequired = false;
      this.showProjectBrowser = false;
    }

    this.dismissFileImportMessage();
    this.fileImportMessage = message;
    this.fileImportTimer = window.setTimeout(() => {
      this.fileImportMessage = null;
      this.fileImportTimer = null;
    }, 6000);
  };

  private dismissFileImportMessage = () => {
    if (this.fileImportTimer !== null) {
      clearTimeout(this.fileImportTimer);
      this.fileImportTimer = null;
    }
    this.fileImportMessage = null;
  };

  private startProjectFileDropHandling() {
    if (this.fileDropHandlingStarted) return;

    window.addEventListener("dragover", this.handleProjectFileDragOver);
    window.addEventListener("drop", this.handleProjectFileDrop);
    this.fileDropHandlingStarted = true;
  }

  private handleProjectFileDragOver = (event: DragEvent) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  };

  private handleProjectFileDrop = (event: DragEvent) => {
    const files = supportedProjectFiles(getDataTransferFiles(event.dataTransfer));
    if (files.length === 0) return;

    event.preventDefault();
    void importProjectFiles(files).catch((error) => {
      log.error("Failed to import dropped project files:", error);
    });
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
    this.showProjectBrowser = false;
    this.showNewProjectDialog = true;
  };

  private handleShowPaintByNumberDialog = () => {
    this.showProjectBrowser = false;
    this.showPaintByNumberDialog = true;
  };

  private handlePaintByNumberDialogClose = () => {
    this.showPaintByNumberDialog = false;

    if (this.projectSelectionRequired) {
      this.showProjectBrowser = true;
    }
  };

  private handleNewProjectDialogClose = () => {
    this.showNewProjectDialog = false;

    if (this.projectSelectionRequired) {
      this.showProjectBrowser = true;
    }
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
    const context = getActiveProjectContext();
    try {
      await autoSaveService.saveNow(context);
      await projectLibrary.duplicateProject(context.project.id.value);
      this.showWarning("Project duplicated");
    } catch (error) {
      log.error("Failed to duplicate project:", error);
      this.showWarning("Could not duplicate project");
    }
  };

  private handleDeleteCurrentProject = () => {
    if (this.isDeletingCurrentProject) return;

    this.deleteCurrentProjectContext = getActiveProjectContext();
    this.deleteCurrentProjectError = null;
    this.showDeleteCurrentDialog = true;
  };

  private dismissDeleteCurrentProject = () => {
    this.deleteCurrentProjectContext = null;
    this.deleteCurrentProjectError = null;
    this.showDeleteCurrentDialog = false;
  };

  private handleShowExportDialog = () => {
    this.exportProjectContext = getActiveProjectContext();
    this.showExportDialog = true;
  };

  private handleExportDialogClose = () => {
    this.exportProjectContext = null;
    this.showExportDialog = false;
  };

  private handleProjectBrowserClose = () => {
    if (!this.projectSelectionRequired) {
      this.showProjectBrowser = false;
    }
  };

  private handleProjectOpened = () => {
    this.hasLibraryProject = true;
    this.projectSelectionRequired = false;
    this.showProjectBrowser = false;
  };

  private handleProjectCreated = () => {
    this.hasLibraryProject = true;
    this.projectSelectionRequired = false;
    this.showNewProjectDialog = false;
    this.showPaintByNumberDialog = false;
    this.showProjectBrowser = false;
  };

  private handleCurrentProjectDeleted = () => {
    this.hasLibraryProject = false;
    this.projectSelectionRequired = true;
    this.showProjectBrowser = true;
  };

  private confirmDeleteCurrentProject = async () => {
    const context = this.deleteCurrentProjectContext;
    if (!context || this.isDeletingCurrentProject) return;

    this.isDeletingCurrentProject = true;
    this.deleteCurrentProjectError = null;

    try {
      const result = await workspaceStore.deleteProject(context.project.id.value);
      this.dismissDeleteCurrentProject();
      if (result.installedReplacement) {
        this.handleCurrentProjectDeleted();
      }
    } catch (error) {
      log.error("Failed to delete project:", error);
      this.deleteCurrentProjectError = "Could not delete project. Your project is still available.";
    } finally {
      this.isDeletingCurrentProject = false;
    }
  };

  private showWarning(message: string) {
    this.handleShowWarningToast(
      new CustomEvent("show-warning-toast", { detail: { message } })
    );
  }

  private handleBeforeUnload = (e: BeforeUnloadEvent) => {
    const hasUnsavedChanges = autoSaveService.dirtyContexts.value.size > 0;
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
      const workspaceState = await projectRepository.getWorkspaceState();
      if (
        workspaceState &&
        (await workspaceStore.restoreWorkspace(workspaceState))
      ) {
        productTelemetry.record({
          name: "project_opened",
          dimensions: { source: "session_restore" },
        });
        this.hasLibraryProject = true;
        this.projectSelectionRequired = false;
        this.showProjectBrowser = false;
        return;
      }

      let projectId = await projectRepository.getLastOpenedProjectId();
      if (!projectId) {
        // No last-opened marker — fall back to the most recent project
        const all = await projectRepository.list();
        projectId = all[0]?.id ?? null;
      }

      if (
        projectId &&
        (await workspaceStore.restoreWorkspace({
          openProjectIds: [projectId],
          activeProjectId: projectId,
        }))
      ) {
        productTelemetry.record({
          name: "project_opened",
          dimensions: { source: "session_restore" },
        });
        historyStore.clear();
        this.hasLibraryProject = true;
        this.projectSelectionRequired = false;
        this.showProjectBrowser = false;
      } else {
        this.hasLibraryProject = false;
        this.projectSelectionRequired = false;
        this.showProjectBrowser = false;
      }
    } catch (error) {
      log.warn("Failed to load saved project, starting fresh:", error);
      this.hasLibraryProject = false;
      this.projectSelectionRequired = false;
      this.showProjectBrowser = false;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.editorLoadedTimer !== null) {
      clearTimeout(this.editorLoadedTimer);
      this.editorLoadedTimer = null;
    }
    this.stopSidebarResize(false);
    window.removeEventListener("resize", this.handleWindowResize);
    document.removeEventListener("mousemove", this.handleTimelineResizeMove);
    document.removeEventListener("mouseup", this.handleTimelineResizeEnd);
    window.removeEventListener("project-loaded", this.handleProjectLoaded);
    window.removeEventListener(
      "show-new-project-dialog",
      this.handleShowNewProjectDialog
    );
    window.removeEventListener(
      "show-paint-by-number-dialog",
      this.handleShowPaintByNumberDialog
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
    window.removeEventListener(
      PROJECT_FILE_IMPORT_REPORT_EVENT,
      this.handleProjectFileImportReport as EventListener
    );
    window.removeEventListener("dragover", this.handleProjectFileDragOver);
    window.removeEventListener("drop", this.handleProjectFileDrop);
    this.fileDropHandlingStarted = false;
    this.dismissFileImportMessage();
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

  private get sidebarWidthBounds() {
    return getSidebarWidthBounds(window.innerWidth);
  }

  private applySidebarWidth(width: number) {
    this.sidebarWidth = clampSidebarWidth(width, window.innerWidth);
    this.style.setProperty("--pf-sidebar-width", `${this.sidebarWidth}px`);
  }

  private handleWindowResize = () => {
    this.stopSidebarResize(false);
    this.applySidebarWidth(readSidebarWidth(window.innerWidth));
    this.requestUpdate();
  };

  private handleSidebarResizeStart = (event: PointerEvent) => {
    const { min, max } = this.sidebarWidthBounds;
    if (this.isResizingSidebar || event.button !== 0 || min === max) return;

    event.preventDefault();
    event.stopPropagation();
    this.isResizingSidebar = true;
    this.sidebarResizeStartX = event.clientX;
    this.sidebarResizeStartWidth = this.sidebarWidth;
    this.sidebarResizePointerId = event.pointerId;
    this.sidebarResizeHandle = event.currentTarget as HTMLElement;
    this.previousBodyCursor = document.body.style.cursor;
    this.previousBodyUserSelect = document.body.style.userSelect;

    try {
      this.sidebarResizeHandle.setPointerCapture?.(event.pointerId);
    } catch {
      // Document listeners remain the fallback when capture is unavailable.
    }
    document.addEventListener("pointermove", this.handleSidebarResizeMove);
    document.addEventListener("pointerup", this.handleSidebarResizeEnd);
    document.addEventListener("pointercancel", this.handleSidebarResizeEnd);
    window.addEventListener("blur", this.handleSidebarResizeBlur);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  private handleSidebarResizeMove = (event: PointerEvent) => {
    if (
      !this.isResizingSidebar ||
      event.pointerId !== this.sidebarResizePointerId
    ) {
      return;
    }

    event.preventDefault();
    const dragDistance = this.sidebarResizeStartX - event.clientX;
    this.applySidebarWidth(this.sidebarResizeStartWidth + dragDistance);
  };

  private handleSidebarResizeEnd = (event: PointerEvent) => {
    if (event.pointerId !== this.sidebarResizePointerId) return;
    this.stopSidebarResize(true);
  };

  private handleSidebarResizeBlur = () => {
    this.stopSidebarResize(true);
  };

  private stopSidebarResize(persist: boolean) {
    const wasResizing = this.isResizingSidebar;
    const pointerId = this.sidebarResizePointerId;
    const resizeHandle = this.sidebarResizeHandle;
    if (wasResizing && persist) {
      this.applySidebarWidth(
        persistSidebarWidth(this.sidebarWidth, window.innerWidth)
      );
    }

    this.isResizingSidebar = false;
    this.sidebarResizePointerId = null;
    this.sidebarResizeHandle = null;
    document.removeEventListener("pointermove", this.handleSidebarResizeMove);
    document.removeEventListener("pointerup", this.handleSidebarResizeEnd);
    document.removeEventListener("pointercancel", this.handleSidebarResizeEnd);
    window.removeEventListener("blur", this.handleSidebarResizeBlur);
    if (
      pointerId !== null &&
      resizeHandle?.hasPointerCapture?.(pointerId)
    ) {
      resizeHandle.releasePointerCapture(pointerId);
    }
    if (wasResizing) {
      document.body.style.cursor = this.previousBodyCursor;
      document.body.style.userSelect = this.previousBodyUserSelect;
    }
  }

  private handleSidebarResizeKeydown = (event: KeyboardEvent) => {
    const { min, max } = this.sidebarWidthBounds;
    if (min === max) return;

    let requestedWidth: number;
    if (event.key === "ArrowLeft") {
      requestedWidth = this.sidebarWidth + SIDEBAR_KEYBOARD_STEP;
    } else if (event.key === "ArrowRight") {
      requestedWidth = this.sidebarWidth - SIDEBAR_KEYBOARD_STEP;
    } else if (event.key === "Home") {
      this.applySidebarWidth(resetSidebarWidth(window.innerWidth));
      event.preventDefault();
      event.stopPropagation();
      return;
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.applySidebarWidth(
      persistSidebarWidth(requestedWidth, window.innerWidth)
    );
  };

  private renderSidebarResizeHandle() {
    const bounds = this.sidebarWidthBounds;
    const canResize = bounds.min < bounds.max;

    return html`
      <div
        class="sidebar-resize-handle ${this.isResizingSidebar ? "resizing" : ""}"
        role="separator"
        aria-label="Resize workspace panels"
        aria-orientation="vertical"
        aria-valuemin=${bounds.min}
        aria-valuemax=${bounds.max}
        aria-valuenow=${this.sidebarWidth}
        aria-valuetext="${this.sidebarWidth} pixels"
        title="Resize panels. Use arrow keys; Home resets."
        tabindex=${canResize ? 0 : -1}
        ?hidden=${!canResize}
        @pointerdown=${this.handleSidebarResizeStart}
        @lostpointercapture=${this.handleSidebarResizeEnd}
        @keydown=${this.handleSidebarResizeKeydown}
      ></div>
    `;
  }

  private renderFileImportStatus() {
    return html`
      <span class="visually-hidden" role="status" aria-live="polite"
        >${this.fileImportMessage ?? ""}</span
      >
      ${this.fileImportMessage
        ? html`
            <div class="file-import-status">
              <span aria-hidden="true">${this.fileImportMessage}</span>
              <button type="button" @click=${this.dismissFileImportMessage}>Dismiss</button>
            </div>
          `
        : ""}
    `;
  }

  private getDeleteProjectName(activeProject: ProjectContext["project"]) {
    const project = this.deleteCurrentProjectContext?.project ?? activeProject;
    return project.name.value;
  }

  render() {
    // Access panel states signal to ensure reactive updates when timeline visibility changes
    const isTimelineCollapsed =
      panelStore.panelStates.value.timeline?.collapsed ?? false;
    const activeProject = activeProjectContext.value.project;
    const deleteProjectName = this.getDeleteProjectName(activeProject);

    return html`
      <header class="menu-bar">
        <pf-menu-bar
          @resize-canvas=${() => (this.showResizeDialog = true)}
          @show-export-dialog=${this.handleShowExportDialog}
          @show-new-project-dialog=${this.handleShowNewProjectDialog}
          @show-paint-by-number-dialog=${this.handleShowPaintByNumberDialog}
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
        <pf-project-tabs
          @show-project-browser=${this.handleShowProjectBrowser}
        ></pf-project-tabs>
        <pf-canvas-viewport @canvas-cursor=${this.handleCanvasCursor}>
          <pf-drawing-canvas
            .width=${activeProject.width.value}
            .height=${activeProject.height.value}
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

      ${this.renderSidebarResizeHandle()}

      <aside class="panels" data-scrollbar="vertical">
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
        .context=${this.exportProjectContext}
        @close=${this.handleExportDialogClose}
      ></pf-export-dialog>

      <pf-new-project-dialog
        ?open=${this.showNewProjectDialog}
        .saveCurrentBeforeCreate=${this.hasLibraryProject}
        @close=${this.handleNewProjectDialogClose}
        @project-created=${this.handleProjectCreated}
      ></pf-new-project-dialog>

      <pf-paint-by-number-dialog
        ?open=${this.showPaintByNumberDialog}
        @close=${this.handlePaintByNumberDialogClose}
        @project-created=${this.handleProjectCreated}
      ></pf-paint-by-number-dialog>

      ${this.showProjectBrowser
        ? html`
            <pf-project-browser
              .canClose=${!this.projectSelectionRequired}
              @show-new-project-dialog=${this.handleShowNewProjectDialog}
              @show-paint-by-number-dialog=${this.handleShowPaintByNumberDialog}
              @project-browser-close=${this.handleProjectBrowserClose}
              @project-opened=${this.handleProjectOpened}
              @current-project-deleted=${this.handleCurrentProjectDeleted}
            ></pf-project-browser>
          `
        : ""}

      <pf-dialog
        ?open=${this.showDeleteCurrentDialog}
        .closeOnBackdrop=${!this.isDeletingCurrentProject}
        .closeOnEscape=${!this.isDeletingCurrentProject}
        .showCloseButton=${!this.isDeletingCurrentProject}
        width="360px"
        @pf-close=${this.dismissDeleteCurrentProject}
      >
        <span slot="title">Delete Current Project</span>
        <p>Delete "${deleteProjectName}" from this browser?</p>
        ${this.deleteCurrentProjectError
          ? html`<p role="alert">${this.deleteCurrentProjectError}</p>`
          : ""}
        <div slot="actions">
          <button
            type="button"
            class="secondary"
            ?disabled=${this.isDeletingCurrentProject}
            @click=${this.dismissDeleteCurrentProject}
          >
            Cancel
          </button>
          <button
            type="button"
            class="primary"
            ?disabled=${this.isDeletingCurrentProject}
            @click=${this.confirmDeleteCurrentProject}
          >
            ${this.isDeletingCurrentProject ? "Deleting..." : "Delete"}
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
      ${this.renderFileImportStatus()}
      <pf-pwa-update-toast></pf-pwa-update-toast>
    `;
  }
}

function getDataTransferFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];

  const files = Array.from(dataTransfer.files);
  if (files.length > 0) return files;

  return Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.files.length > 0) return true;
  if (Array.from(dataTransfer.items).some((item) => item.kind === "file")) return true;
  return Array.from(dataTransfer.types).includes("Files");
}
