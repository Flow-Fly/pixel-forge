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
import { type ProjectFileInput } from "../../types/project";
import { formatShortcut } from "../../utils/platform";
import { menuShortcuts } from "../../services/keyboard/shortcut-definitions";

const SHORTCUTS_STORAGE_KEY = "pf-shortcuts-visible";
const MENU_MARGIN = 8;
const MENU_GAP = 4;
const FALLBACK_MENU_WIDTH = 186;
const FALLBACK_MENU_HEIGHT = 240;

type MenuId = "file" | "edit" | "view" | "image";

@customElement("pf-menu-bar")
export class PFMenuBar extends BaseComponent {
  @state() private shortcutsVisible = false;
  @state() private isEditingName = false;
  @state() private activeMenu: MenuId | null = null;

  static styles = css`
    :host {
      display: flex;
      height: 100%;
      align-items: center;
      width: 100%;
      min-inline-size: 0;
      overflow: hidden;
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
      flex: 0 1 190px;
      min-inline-size: 0;
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .menus {
      display: flex;
      align-items: center;
      height: 100%;
      gap: 4px;
      flex: 0 0 auto;
    }

    .spacer {
      flex: 1 1 auto;
      min-inline-size: 0;
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
      box-sizing: border-box;
      display: none;
      position: fixed;
      inset: auto;
      padding: 6px 0;
      background-color: rgba(13, 16, 21, 0.98);
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      box-shadow: var(--pf-shadow-lg);
      color: var(--pf-color-text-main);
      min-width: 186px;
      margin: 0; /* Important for anchor positioning */
      overflow-y: auto;
      backdrop-filter: blur(14px);
    }

    [popover]:popover-open,
    [popover][data-open="true"] {
      display: block;
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

    .menu-btn[aria-expanded="true"] {
      color: var(--pf-color-text-main);
      background-color: var(--pf-color-bg-hover);
    }

    @media (max-width: 520px) {
      :host {
        gap: 8px;
      }

      .brand {
        flex: 0 0 auto;
      }

      .brand-text,
      .project-name {
        display: none;
      }

      .menu-btn {
        padding-inline: 8px;
      }
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
    document.addEventListener("pointerdown", this.handleDocumentPointerDown);
    document.addEventListener("keydown", this.handleDocumentKeyDown);
    window.addEventListener("resize", this.positionActiveMenu);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(
      "shortcuts-visibility-changed",
      this.handleShortcutsVisibilityChanged
    );
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown);
    document.removeEventListener("keydown", this.handleDocumentKeyDown);
    window.removeEventListener("resize", this.positionActiveMenu);
    this.closeActiveMenu();
  }

  private handleShortcutsVisibilityChanged = (e: Event) => {
    const event = e as CustomEvent<{ visible: boolean }>;
    this.shortcutsVisible = event.detail.visible;
  };

  private handleMenuButtonClick(menuId: MenuId) {
    if (this.activeMenu === menuId) {
      this.closeActiveMenu();
      return;
    }

    this.openMenu(menuId);
  }

  private handleMenuButtonPointerEnter(menuId: MenuId) {
    if (this.activeMenu && this.activeMenu !== menuId) {
      this.openMenu(menuId);
    }
  }

  private handleMenuPanelClick(event: Event) {
    const target = event.target as Element;
    if (target.closest(".menu-item")) {
      this.closeActiveMenu();
    }
  }

  private handleDocumentPointerDown = (event: PointerEvent) => {
    if (!this.activeMenu) return;
    if (event.composedPath().includes(this)) return;

    this.closeActiveMenu();
  };

  private handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (!this.activeMenu || event.key !== "Escape") return;

    event.preventDefault();
    this.closeActiveMenu();
  };

  private handlePopoverToggle(event: Event, menuId: MenuId) {
    const toggleEvent = event as ToggleEvent;
    const panel = event.currentTarget as HTMLElement;

    if (toggleEvent.newState === "closed") {
      panel.removeAttribute("data-open");
      if (this.activeMenu === menuId) {
        this.activeMenu = null;
      }
    }
  }

  private openMenu(menuId: MenuId) {
    if (this.activeMenu && this.activeMenu !== menuId) {
      this.hideMenuPanel(this.activeMenu);
    }

    const panel = this.getMenuPanel(menuId);
    if (!panel) return;

    this.activeMenu = menuId;
    this.showMenuPanel(panel);
    this.positionMenu(menuId);

    requestAnimationFrame(() => {
      if (this.activeMenu === menuId) {
        this.positionMenu(menuId);
      }
    });
  }

  private closeActiveMenu() {
    if (!this.activeMenu) return;

    const menuId = this.activeMenu;
    this.activeMenu = null;
    this.hideMenuPanel(menuId);
  }

  private hideMenuPanel(menuId: MenuId) {
    const panel = this.getMenuPanel(menuId);
    if (!panel) return;

    panel.removeAttribute("data-open");

    try {
      panel.hidePopover();
    } catch {
      // The fallback data attribute already handled the closed state.
    }
  }

  private showMenuPanel(panel: HTMLElement) {
    try {
      panel.showPopover();
    } catch {
      // Older test/browser environments may not implement the Popover API.
    }

    panel.setAttribute("data-open", "true");
  }

  private positionActiveMenu = () => {
    if (this.activeMenu) {
      this.positionMenu(this.activeMenu);
    }
  };

  private positionMenu(menuId: MenuId) {
    const button = this.getMenuButton(menuId);
    const panel = this.getMenuPanel(menuId);
    if (!button || !panel) return;

    const buttonRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const panelWidth = panelRect.width || panel.offsetWidth || FALLBACK_MENU_WIDTH;
    const maxPanelHeight = Math.max(0, window.innerHeight - MENU_MARGIN * 2);
    const measuredPanelHeight =
      panelRect.height || panel.offsetHeight || FALLBACK_MENU_HEIGHT;
    const panelHeight = Math.min(measuredPanelHeight, maxPanelHeight);

    let left = buttonRect.left;
    let top = buttonRect.bottom + MENU_GAP;

    if (left + panelWidth > window.innerWidth - MENU_MARGIN) {
      left = buttonRect.right - panelWidth;
    }

    if (top + panelHeight > window.innerHeight - MENU_MARGIN) {
      top = window.innerHeight - panelHeight - MENU_MARGIN;
    }

    panel.style.left = `${this.clampToViewport(left, panelWidth, window.innerWidth)}px`;
    panel.style.top = `${this.clampToViewport(top, panelHeight, window.innerHeight)}px`;
    panel.style.maxHeight = `${maxPanelHeight}px`;
  }

  private clampToViewport(value: number, size: number, viewportSize: number) {
    const maxValue = Math.max(MENU_MARGIN, viewportSize - size - MENU_MARGIN);
    return Math.max(MENU_MARGIN, Math.min(value, maxValue));
  }

  private getMenuButton(menuId: MenuId) {
    return this.shadowRoot?.querySelector<HTMLElement>(`#btn-${menuId}`) ?? null;
  }

  private getMenuPanel(menuId: MenuId) {
    return this.shadowRoot?.querySelector<HTMLElement>(`#menu-${menuId}`) ?? null;
  }

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
          const project = JSON.parse(decompressed) as ProjectFileInput;
          await projectStore.loadProject(project);
        } else {
          // JSON format (uncompressed)
          const text = await file.text();
          const project = JSON.parse(text) as ProjectFileInput;
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

  showCheckerSettingsDialog() {
    window.dispatchEvent(new CustomEvent("show-checker-settings-dialog"));
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
        <button
          id="btn-file"
          class="menu-btn"
          type="button"
          aria-controls="menu-file"
          aria-expanded=${String(this.activeMenu === "file")}
          @click=${() => this.handleMenuButtonClick("file")}
          @pointerenter=${() => this.handleMenuButtonPointerEnter("file")}
        >
          File
        </button>
        <div
          id="menu-file"
          popover="manual"
          @click=${this.handleMenuPanelClick}
          @toggle=${(event: Event) => this.handlePopoverToggle(event, "file")}
        >
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

        <button
          id="btn-edit"
          class="menu-btn"
          type="button"
          aria-controls="menu-edit"
          aria-expanded=${String(this.activeMenu === "edit")}
          @click=${() => this.handleMenuButtonClick("edit")}
          @pointerenter=${() => this.handleMenuButtonPointerEnter("edit")}
        >
          Edit
        </button>
        <div
          id="menu-edit"
          popover="manual"
          @click=${this.handleMenuPanelClick}
          @toggle=${(event: Event) => this.handlePopoverToggle(event, "edit")}
        >
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

        <button
          id="btn-view"
          class="menu-btn"
          type="button"
          aria-controls="menu-view"
          aria-expanded=${String(this.activeMenu === "view")}
          @click=${() => this.handleMenuButtonClick("view")}
          @pointerenter=${() => this.handleMenuButtonPointerEnter("view")}
        >
          View
        </button>
        <div
          id="menu-view"
          popover="manual"
          @click=${this.handleMenuPanelClick}
          @toggle=${(event: Event) => this.handlePopoverToggle(event, "view")}
        >
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
          <div class="menu-item" @click=${this.showCheckerSettingsDialog}>
            Transparency Checker...
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

        <button
          id="btn-image"
          class="menu-btn"
          type="button"
          aria-controls="menu-image"
          aria-expanded=${String(this.activeMenu === "image")}
          @click=${() => this.handleMenuButtonClick("image")}
          @pointerenter=${() => this.handleMenuButtonPointerEnter("image")}
        >
          Image
        </button>
        <div
          id="menu-image"
          popover="manual"
          @click=${this.handleMenuPanelClick}
          @toggle=${(event: Event) => this.handlePopoverToggle(event, "image")}
        >
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
