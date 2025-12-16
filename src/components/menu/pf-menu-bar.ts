import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { historyStore } from "../../stores/history";
import { layerStore } from "../../stores/layers";
import { projectStore } from "../../stores/project";
import { gridStore } from "../../stores/grid";
import {
  FlipLayerCommand,
  RotateLayerCommand,
} from "../../commands/layer-commands";
import { FileService } from "../../services/file-service";
import { openAseFile, exportAseFile } from "../../services/aseprite-service";
import { type ProjectFile } from "../../types/project";

const SHORTCUTS_STORAGE_KEY = "pf-shortcuts-visible";

@customElement("pf-menu-bar")
export class PFMenuBar extends BaseComponent {
  @state() private shortcutsVisible = true;
  @state() private isEditingName = false;

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

  async saveProject() {
    const project = await projectStore.saveProject();
    const projectName = projectStore.name.value || "pixel-forge-project";
    FileService.saveCompressed(project, `${projectName}.pf`);
  }

  async openProject() {
    try {
      const project = await FileService.loadProject<ProjectFile>();
      await projectStore.loadProject(project);
    } catch (e) {
      console.error("Failed to load project:", e);
    }
  }

  async openAseprite() {
    try {
      await openAseFile();
    } catch (e) {
      console.error("Failed to import Aseprite file:", e);
    }
  }

  exportAseprite() {
    const projectName = projectStore.name.value || "pixel-forge-project";
    exportAseFile(`${projectName}.ase`);
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
            New... <span class="shortcut">Ctrl+N</span>
          </div>
          <div class="menu-item" @click=${this.openProject}>
            Open... <span class="shortcut">Ctrl+O</span>
          </div>
          <div class="menu-item" @click=${this.saveProject}>
            Save <span class="shortcut">Ctrl+S</span>
          </div>
          <div class="menu-item" @click=${this.openAseprite}>
            Import Aseprite...
          </div>
          <div class="menu-item" @click=${this.showExportDialog}>
            Export... <span class="shortcut">Ctrl+E</span>
          </div>
          <div class="menu-item" @click=${this.exportAseprite}>
            Export Aseprite...
          </div>
        </div>

        <button id="btn-edit" class="menu-btn" popovertarget="menu-edit">
          Edit
        </button>
        <div id="menu-edit" popover>
          <div class="menu-item" @click=${() => historyStore.undo()}>
            Undo <span class="shortcut">Ctrl+Z</span>
          </div>
          <div class="menu-item" @click=${() => historyStore.redo()}>
            Redo <span class="shortcut">Ctrl+Y</span>
          </div>
          <div class="menu-item">Cut <span class="shortcut">Ctrl+X</span></div>
          <div class="menu-item">Copy <span class="shortcut">Ctrl+C</span></div>
          <div class="menu-item">
            Paste <span class="shortcut">Ctrl+V</span>
          </div>
        </div>

        <button id="btn-view" class="menu-btn" popovertarget="menu-view">
          View
        </button>
        <div id="menu-view" popover>
          <div class="menu-item">
            Zoom In <span class="shortcut">Ctrl++</span>
          </div>
          <div class="menu-item">
            Zoom Out <span class="shortcut">Ctrl+-</span>
          </div>
          <div class="menu-item">
            Fit on Screen <span class="shortcut">Ctrl+0</span>
          </div>
          <div class="menu-item" @click=${() => gridStore.togglePixelGrid()}>
            ${gridStore.pixelGridEnabled.value ? "✓ " : "   "}Pixel Grid
            <span class="shortcut">Ctrl+G</span>
          </div>
          <div class="menu-item" @click=${() => gridStore.toggleTileGrid()}>
            ${gridStore.tileGridEnabled.value ? "✓ " : "   "}Tile Grid
            <span class="shortcut">Ctrl+Shift+G</span>
          </div>
          <div class="menu-item">Grid Settings...</div>
          <div class="menu-item" @click=${this.toggleShortcutsOverlay}>
            ${this.shortcutsVisible ? "✓ " : "   "}Shortcuts Preview
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
    `;
  }
}
