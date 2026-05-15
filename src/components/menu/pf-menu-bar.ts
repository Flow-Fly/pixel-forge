import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { historyStore } from "../../stores/history";
import { layerStore } from "../../stores/layers";
import { projectStore } from "../../stores/project";
import { gridStore } from "../../stores/grid";
import { viewportStore } from "../../stores/viewport";
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
  @state() private shortcutsVisible = false;
  @state() private isEditingName = false;

  static styles = css`
    :host {
      display: flex;
      height: 100%;
      align-items: center;
      width: 100%;
      position: relative;
      gap: 16px;
      color: var(--pf-color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 190px;
      color: var(--pf-color-text-main);
      font-size: 12px;
      user-select: none;
    }

    .brand-mark {
      width: 18px;
      height: 18px;
      display: inline-grid;
      place-items: center;
      position: relative;
      color: var(--pf-color-accent);
    }

    .brand-mark::before,
    .brand-mark::after {
      content: "";
      position: absolute;
      background: currentColor;
      box-shadow: 0 0 12px rgba(200, 173, 127, 0.22);
    }

    .brand-mark::before {
      width: 18px;
      height: 2px;
      top: 8px;
      left: 0;
    }

    .brand-mark::after {
      width: 2px;
      height: 18px;
      top: 0;
      left: 8px;
    }

    .brand-text {
      color: var(--pf-color-text-secondary);
      font-size: 13px;
    }

    .menus {
      display: flex;
      align-items: center;
      height: 100%;
      gap: 4px;
    }

    .spacer {
      flex: 1;
    }

    .project-name {
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      max-width: min(40vw, 360px);
      text-align: center;
    }

    .project-name-display {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      font-size: var(--pf-font-size-sm);
      color: var(--pf-color-text-secondary);
      cursor: pointer;
      border-radius: var(--pf-radius-sm);
      border: 1px solid transparent;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .project-name-display:hover {
      color: var(--pf-color-text-main);
      background-color: var(--pf-color-bg-hover);
      border-color: var(--pf-color-border);
    }

    .project-dot {
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: var(--pf-color-text-muted);
      flex: 0 0 auto;
    }

    .project-name-input {
      padding: 4px 10px;
      font-size: var(--pf-font-size-sm);
      color: var(--pf-color-text-main);
      background-color: var(--pf-color-bg-input);
      border: 1px solid var(--pf-color-primary);
      border-radius: var(--pf-radius-sm);
      outline: none;
      width: 180px;
      text-transform: uppercase;
    }

    .menu-btn {
      padding: 0 10px;
      cursor: pointer;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-sm);
      user-select: none;
      background: none;
      border: none;
      height: 100%;
      display: flex;
      align-items: center;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .menu-btn:hover,
    .menu-btn:focus-visible {
      color: var(--pf-color-text-main);
      background-color: var(--pf-color-bg-hover);
      outline: none;
    }

    [popover] {
      padding: 6px 0;
      background-color: rgba(13, 16, 21, 0.98);
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      box-shadow: var(--pf-shadow-lg);
      color: var(--pf-color-text-main);
      min-width: 186px;
      margin: 0; /* Important for anchor positioning */
      backdrop-filter: blur(14px);
    }

    [popover]::backdrop {
      background-color: transparent;
    }

    .menu-item {
      padding: 7px 12px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      gap: 18px;
      font-size: var(--pf-font-size-sm);
      color: var(--pf-color-text-secondary);
      text-transform: none;
    }

    .menu-item:hover {
      background-color: var(--pf-color-primary-transparent);
      color: var(--pf-color-text-main);
    }

    .shortcut {
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
    }

    .divider {
      height: 1px;
      margin: 6px 10px;
      background: var(--pf-color-border);
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
    this.shortcutsVisible = stored === "true";
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
   */
  async openFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pf,.json,.ase,.aseprite";

    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

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
      <div class="brand" aria-label="Pixel Forge">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-text">Pixel Forge</span>
      </div>

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
                ${projectName}<span class="project-dot"></span>
              </span>
            `}
      </div>

      <div class="spacer"></div>

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

    `;
  }
}
