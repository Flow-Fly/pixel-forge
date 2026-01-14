import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { historyStore } from "../../stores/history";
import { layerStore } from "../../stores/layers";
import { projectStore } from "../../stores/project";
import { gridStore } from "../../stores/grid";
import { viewportStore } from "../../stores/viewport";
import { referenceImageStore } from "../../stores/reference-image";
import { animationStore } from "../../stores/animation";
import "../dialogs/pf-image-open-dialog";
import {
  FlipLayerCommand,
  RotateLayerCommand,
} from "../../commands/layer-commands";
// Dynamic imports for file handling - loaded on demand to reduce initial bundle
// import { importAseFile } from "../../services/aseprite-service";
// import pako from "pako";
import { type ProjectFile } from "../../types/project";
import { formatShortcut } from "../../utils/platform";
import { menuShortcuts } from "../../services/keyboard/shortcut-definitions";

const SHORTCUTS_STORAGE_KEY = "pf-shortcuts-visible";

@customElement("pf-menu-bar")
export class PFMenuBar extends BaseComponent {
  @state() private shortcutsVisible = true;
  @state() private isEditingName = false;
  @state() private pendingImageFile: File | null = null;
  @state() private showImageOpenDialog = false;

  static styles = css`
    :host {
      display: flex;
      height: 100%;
      align-items: center;
      width: 100%;
    }

    .menus {
      display: flex;
      align-items: center;
      height: 100%;
    }

    .spacer {
      flex: 1;
    }

    .project-name {
      display: flex;
      align-items: center;
      margin-right: var(--pf-spacing-4);
    }

    .project-name-display {
      padding: 2px 8px;
      font-size: var(--pf-font-size-sm);
      color: var(--pf-color-text-muted);
      cursor: pointer;
      border-radius: 4px;
      border: 1px solid transparent;
    }

    .project-name-display:hover {
      color: var(--pf-color-text-main);
      background-color: var(--pf-color-bg-surface);
    }

    .project-name-input {
      padding: 2px 8px;
      font-size: var(--pf-font-size-sm);
      color: var(--pf-color-text-main);
      background-color: var(--pf-color-bg-dark);
      border: 1px solid var(--pf-color-primary);
      border-radius: 4px;
      outline: none;
      width: 150px;
    }

    .menu-btn {
      padding: 0 var(--pf-spacing-2);
      cursor: pointer;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-sm);
      user-select: none;
      background: none;
      border: none;
      height: 100%;
      display: flex;
      align-items: center;
    }

    .menu-btn:hover,
    .menu-btn:focus-visible {
      color: var(--pf-color-text-main);
      background-color: var(--pf-color-bg-surface);
    }

    [popover] {
      padding: var(--pf-spacing-1) 0;
      background-color: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      box-shadow: var(--pf-shadow-lg);
      color: var(--pf-color-text-main);
      min-width: 150px;
      margin: 0; /* Important for anchor positioning */
    }

    [popover]::backdrop {
      background-color: transparent;
    }

    .menu-item {
      padding: var(--pf-spacing-1) var(--pf-spacing-3);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      font-size: var(--pf-font-size-sm);
    }

    .menu-item:hover {
      background-color: var(--pf-color-bg-surface);
    }

    .shortcut {
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
    }

    /* Anchor Positioning */
    #menu-file {
      position-anchor: --btn-file;
      top: anchor(bottom);
      left: anchor(left);
    }
    #btn-file {
      anchor-name: --btn-file;
    }

    #menu-edit {
      position-anchor: --btn-edit;
      top: anchor(bottom);
      left: anchor(left);
    }
    #btn-edit {
      anchor-name: --btn-edit;
    }

    #menu-view {
      position-anchor: --btn-view;
      top: anchor(bottom);
      left: anchor(left);
    }
    #btn-view {
      anchor-name: --btn-view;
    }

    #menu-image {
      position-anchor: --btn-image;
      top: anchor(bottom);
      left: anchor(left);
    }
    #btn-image {
      anchor-name: --btn-image;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    // Load initial state from localStorage
    const stored = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    this.shortcutsVisible = stored === null || stored === "true";
    // Listen for visibility changes from the overlay
    window.addEventListener(
      "shortcuts-visibility-changed",
      this.handleShortcutsVisibilityChanged
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(
      "shortcuts-visibility-changed",
      this.handleShortcutsVisibilityChanged
    );
  }

  private handleShortcutsVisibilityChanged = (e: Event) => {
    const event = e as CustomEvent<{ visible: boolean }>;
    this.shortcutsVisible = event.detail.visible;
  };

  flipLayer(direction: "horizontal" | "vertical") {
    const activeLayerId = layerStore.activeLayerId.value;
    if (activeLayerId) {
      historyStore.execute(new FlipLayerCommand(activeLayerId, direction));
    }
  }

  rotateLayer(angle: number) {
    const activeLayerId = layerStore.activeLayerId.value;
    if (activeLayerId) {
      historyStore.execute(new RotateLayerCommand(activeLayerId, angle));
    }
  }

  /**
   * Unified open handler that supports:
   * - .pf (compressed PixelForge project)
   * - .json (uncompressed PixelForge project)
   * - .ase, .aseprite (Aseprite files)
   * - .png, .jpg, .jpeg, .gif, .webp (with dialog for reference vs project)
   */
  async openFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pf,.json,.ase,.aseprite,.png,.jpg,.jpeg,.gif,.webp";

    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
      const isImage = imageExtensions.some((ext) =>
        file.name.toLowerCase().endsWith(ext)
      );

      if (isImage) {
        // Show dialog to ask user's intent
        this.pendingImageFile = file;
        this.showImageOpenDialog = true;
      } else {
        // Handle as project file (existing logic)
        await this.handleOpenProjectFile(file);
      }
    };

    input.click();
  }

  private async handleOpenProjectFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();

    try {
      if (ext === "ase" || ext === "aseprite") {
        // Aseprite format - lazy load parser
        const buffer = await file.arrayBuffer();
        const { importAseFile } = await import("../../services/aseprite-service");
        await importAseFile(buffer);
      } else if (ext === "pf") {
        // Compressed PixelForge format - lazy load pako
        const buffer = await file.arrayBuffer();
        const pako = await import("pako");
        const decompressed = pako.default.inflate(new Uint8Array(buffer), { to: "string" });
        const project = JSON.parse(decompressed) as ProjectFile;
        await projectStore.loadProject(project);
      } else {
        // JSON format (uncompressed)
        const text = await file.text();
        const project = JSON.parse(text) as ProjectFile;
        await projectStore.loadProject(project);
      }
    } catch (error) {
      console.error("Failed to open file:", error);
    }
  }

  private async handleImageOpenChoice(e: CustomEvent<{ type: string }>) {
    if (!this.pendingImageFile) return;

    if (e.detail.type === "reference") {
      await referenceImageStore.addImage(this.pendingImageFile);
    } else if (e.detail.type === "project") {
      // Create new project from image
      await this.createProjectFromImage(this.pendingImageFile);
    }

    this.pendingImageFile = null;
    this.showImageOpenDialog = false;
  }

  private handleImageOpenCancel() {
    this.pendingImageFile = null;
    this.showImageOpenDialog = false;
  }

  private async createProjectFromImage(file: File) {
    // Load image and create new project with its dimensions
    const img = new Image();
    const url = URL.createObjectURL(file);

    await new Promise<void>((resolve) => {
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      img.src = url;
    });

    await projectStore.newProject(img.width, img.height);

    // Draw image onto the current frame's cel canvas (not layer canvas)
    const layers = layerStore.layers.value;
    const currentFrameId = animationStore.currentFrameId.value;
    if (layers[0] && currentFrameId) {
      const celCanvas = animationStore.getCelCanvas(currentFrameId, layers[0].id);
      if (celCanvas) {
        const ctx = celCanvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
      }
    }

    // Reset view to fit the new canvas size and trigger re-render
    viewportStore.resetView();
  }

  private importReferenceImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".png,.jpg,.jpeg,.gif,.webp";

    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await referenceImageStore.addImage(file);
      }
    };

    input.click();
  }

  showExportDialog() {
    this.dispatchEvent(
      new CustomEvent("show-export-dialog", { bubbles: true, composed: true })
    );
  }

  showNewProjectDialog() {
    this.dispatchEvent(
      new CustomEvent("show-new-project-dialog", {
        bubbles: true,
        composed: true,
      })
    );
  }

  toggleShortcutsOverlay() {
    window.dispatchEvent(new CustomEvent("toggle-shortcuts-overlay"));
  }

  showKeyboardShortcutsDialog() {
    window.dispatchEvent(new CustomEvent("show-keyboard-shortcuts-dialog"));
  }

  showGridSettingsDialog() {
    window.dispatchEvent(new CustomEvent("show-grid-settings-dialog"));
  }

  showAccentColorDialog() {
    window.dispatchEvent(new CustomEvent("show-accent-color-dialog"));
  }

  private startEditingName() {
    this.isEditingName = true;
    // Focus the input after render
    this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector(
        ".project-name-input"
      ) as HTMLInputElement;
      input?.focus();
      input?.select();
    });
  }

  private handleNameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      this.commitNameEdit(e);
    } else if (e.key === "Escape") {
      this.isEditingName = false;
    }
  }

  private commitNameEdit(e: Event) {
    const input = e.target as HTMLInputElement;
    const newName = input.value.trim() || "Untitled";
    projectStore.name.value = newName;
    this.isEditingName = false;
  }

  render() {
    const projectName = projectStore.name.value;

    return html`
      <div class="menus">
        <button id="btn-file" class="menu-btn" popovertarget="menu-file">
          File
        </button>
        <div id="menu-file" popover>
          <div class="menu-item" @click=${this.showNewProjectDialog}>
            New... <span class="shortcut">${formatShortcut(menuShortcuts.newProject)}</span>
          </div>
          <div class="menu-item" @click=${this.openFile}>
            Open... <span class="shortcut">${formatShortcut(menuShortcuts.open)}</span>
          </div>
          <div class="menu-item" @click=${this.importReferenceImage}>
            Import Reference Image...
          </div>
          <div class="menu-item" @click=${this.showExportDialog}>
            Export... <span class="shortcut">${formatShortcut(menuShortcuts.export)}</span>
          </div>
        </div>

        <button id="btn-edit" class="menu-btn" popovertarget="menu-edit">
          Edit
        </button>
        <div id="menu-edit" popover>
          <div class="menu-item" @click=${() => historyStore.undo()}>
            Undo <span class="shortcut">${formatShortcut(menuShortcuts.undo)}</span>
          </div>
          <div class="menu-item" @click=${() => historyStore.redo()}>
            Redo <span class="shortcut">${formatShortcut(menuShortcuts.redo)}</span>
          </div>
          <div class="menu-item">Cut <span class="shortcut">${formatShortcut(menuShortcuts.cut)}</span></div>
          <div class="menu-item">Copy <span class="shortcut">${formatShortcut(menuShortcuts.copy)}</span></div>
          <div class="menu-item">
            Paste <span class="shortcut">${formatShortcut(menuShortcuts.paste)}</span>
          </div>
        </div>

        <button id="btn-view" class="menu-btn" popovertarget="menu-view">
          View
        </button>
        <div id="menu-view" popover>
          <div class="menu-item" @click=${() => viewportStore.zoomIn()}>
            Zoom In <span class="shortcut">${formatShortcut(menuShortcuts.zoomIn)}</span>
          </div>
          <div class="menu-item" @click=${() => viewportStore.zoomOut()}>
            Zoom Out <span class="shortcut">${formatShortcut(menuShortcuts.zoomOut)}</span>
          </div>
          <div class="menu-item" @click=${() => viewportStore.zoomToLevel(1)}>
            Zoom 100% <span class="shortcut">${formatShortcut(menuShortcuts.zoom100)}</span>
          </div>
          <div class="menu-item" @click=${() => viewportStore.resetView()}>
            Fit to Viewport <span class="shortcut">0</span>
          </div>
          <div class="menu-item" @click=${() => gridStore.togglePixelGrid()}>
            ${gridStore.pixelGridEnabled.value ? "✓ " : "   "}Pixel Grid
            <span class="shortcut">${formatShortcut("mod+g")}</span>
          </div>
          <div class="menu-item" @click=${() => gridStore.toggleTileGrid()}>
            ${gridStore.tileGridEnabled.value ? "✓ " : "   "}Tile Grid
            <span class="shortcut">${formatShortcut("mod+shift+g")}</span>
          </div>
          <div class="menu-item" @click=${this.showGridSettingsDialog}>
            Grid Settings...
          </div>
          <div class="menu-item" @click=${this.toggleShortcutsOverlay}>
            ${this.shortcutsVisible ? "✓ " : "   "}Shortcuts Preview
          </div>
          <div class="menu-item" @click=${this.showKeyboardShortcutsDialog}>
            Keyboard Shortcuts... <span class="shortcut">${formatShortcut(menuShortcuts.keyboardShortcuts)}</span>
          </div>
          <div class="divider"></div>
          <div class="menu-item" @click=${this.showAccentColorDialog}>
            Accent Color...
          </div>
        </div>

        <button id="btn-image" class="menu-btn" popovertarget="menu-image">
          Image
        </button>
        <div id="menu-image" popover>
          <div
            class="menu-item"
            @click=${() =>
              this.dispatchEvent(
                new CustomEvent("resize-canvas", {
                  bubbles: true,
                  composed: true,
                })
              )}
          >
            Resize Canvas...
          </div>
          <div class="menu-item" @click=${() => this.flipLayer("horizontal")}>
            Flip Horizontal
          </div>
          <div class="menu-item" @click=${() => this.flipLayer("vertical")}>
            Flip Vertical
          </div>
          <div class="menu-item" @click=${() => this.rotateLayer(90)}>
            Rotate 90° CW
          </div>
          <div class="menu-item" @click=${() => this.rotateLayer(-90)}>
            Rotate 90° CCW
          </div>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="project-name">
        ${this.isEditingName
          ? html`
              <input
                class="project-name-input"
                type="text"
                .value=${projectName}
                @blur=${this.commitNameEdit}
                @keydown=${this.handleNameKeydown}
              />
            `
          : html`
              <span
                class="project-name-display"
                @click=${this.startEditingName}
                title="Click to rename"
              >
                ${projectName}
              </span>
            `}
      </div>

      <pf-image-open-dialog
        ?open=${this.showImageOpenDialog}
        filename=${this.pendingImageFile?.name ?? ""}
        @select=${this.handleImageOpenChoice}
        @cancel=${this.handleImageOpenCancel}
      ></pf-image-open-dialog>
    `;
  }
}
