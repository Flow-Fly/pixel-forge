import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { toolStore } from "../../stores/tools";
import { selectionStore } from "../../stores/selection";
import { getToolMeta } from "../../tools/tool-registry";
import { formatShortcut } from "../../utils/platform";
import type { ToolShortcut } from "../../types/tool-meta";

const STORAGE_KEY = "pf-shortcuts-visible";
const POSITION_STORAGE_KEY = "pf-shortcuts-position";

/**
 * Context-aware shortcuts that appear based on application state
 */
const contextShortcuts: Record<string, ToolShortcut[]> = {
  // When there's an active selection
  selectionActive: [
    { key: "mod+d", action: "Deselect" },
    { key: "mod+shift+i", action: "Invert" },
    { key: "delete", action: "Clear" },
    { key: "mod+x", action: "Cut" },
    { key: "mod+c", action: "Copy" },
  ],

  // When there's a floating selection
  floatingSelection: [
    { key: "enter", action: "Commit" },
    { key: "escape", action: "Cancel" },
    { key: "up", action: "Nudge up" },
    { key: "down", action: "Nudge down" },
    { key: "left", action: "Nudge left" },
    { key: "right", action: "Nudge right" },
  ],

  // Global shortcuts always available
  global: [
    { key: "mod+z", action: "Undo" },
    { key: "mod+shift+z", action: "Redo" },
    { key: "space", action: "Pan" },
  ],
};

@customElement("pf-shortcuts-overlay")
export class PfShortcutsOverlay extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      z-index: 100;
      user-select: none;
    }

    .overlay {
      background: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 11px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      opacity: 0.9;
      min-width: 140px;
      max-width: 200px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--pf-color-border);
      cursor: grab;
    }

    .header:active {
      cursor: grabbing;
    }

    .title {
      font-weight: 600;
      color: var(--pf-color-text-muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--pf-color-text-muted);
      cursor: pointer;
      padding: 2px;
      font-size: 12px;
      line-height: 1;
      opacity: 0.7;
    }

    .close-btn:hover {
      opacity: 1;
      color: var(--pf-color-text-primary);
    }

    .section {
      margin-bottom: 8px;
    }

    .section:last-child {
      margin-bottom: 0;
    }

    .section-title {
      font-size: 9px;
      text-transform: uppercase;
      color: var(--pf-color-text-muted);
      margin-bottom: 4px;
      letter-spacing: 0.3px;
    }

    .shortcut-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2px 0;
    }

    .key {
      background: var(--pf-color-bg-tertiary);
      border: 1px solid var(--pf-color-border);
      border-radius: 3px;
      padding: 1px 4px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 10px;
      color: var(--pf-color-text-primary);
      min-width: 20px;
      text-align: center;
    }

    .action {
      color: var(--pf-color-text-secondary);
      margin-left: 8px;
      flex: 1;
      text-align: right;
    }

    .toggle-btn {
      position: fixed;
      bottom: 16px;
      right: 16px;
      background: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 10px;
      color: var(--pf-color-text-muted);
      cursor: pointer;
      pointer-events: auto;
      z-index: 100;
    }

    .toggle-btn:hover {
      background: var(--pf-color-bg-hover);
      color: var(--pf-color-text-primary);
    }
  `;

  @state() private visible = true;
  @state() private posX = 0;
  @state() private posY = 0;
  @state() private isDragging = false;

  private dragOffsetX = 0;
  private dragOffsetY = 0;

  connectedCallback() {
    super.connectedCallback();
    this.loadState();
    // Listen for external toggle events (from View menu)
    window.addEventListener("toggle-shortcuts-overlay", this.handleExternalToggle);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up event listeners
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
    window.removeEventListener("toggle-shortcuts-overlay", this.handleExternalToggle);
  }

  firstUpdated() {
    // Set default position (bottom-right) if not loaded from storage
    if (this.posX === 0 && this.posY === 0) {
      const parent = this.parentElement;
      if (parent) {
        this.posX = parent.clientWidth - 180;
        this.posY = parent.clientHeight - 200;
      }
    }
  }

  private loadState() {
    // Load visibility preference from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      this.visible = stored === "true";
    }

    // Load position from localStorage
    const storedPosition = localStorage.getItem(POSITION_STORAGE_KEY);
    if (storedPosition) {
      try {
        const { x, y } = JSON.parse(storedPosition);
        this.posX = x;
        this.posY = y;
      } catch {
        // Invalid JSON, use default position
      }
    }
  }

  private savePosition() {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify({ x: this.posX, y: this.posY }));
  }

  private handleExternalToggle = () => {
    this.toggleVisibility();
  };

  private handleHeaderMouseDown = (e: MouseEvent) => {
    // Don't start drag if clicking the close button
    if ((e.target as HTMLElement).classList.contains("close-btn")) return;

    this.isDragging = true;
    this.dragOffsetX = e.clientX - this.posX;
    this.dragOffsetY = e.clientY - this.posY;

    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;

    this.posX = e.clientX - this.dragOffsetX;
    this.posY = e.clientY - this.dragOffsetY;

    // Keep within bounds
    const parent = this.parentElement;
    if (parent) {
      const maxX = parent.clientWidth - 140;
      const maxY = parent.clientHeight - 50;
      this.posX = Math.max(0, Math.min(this.posX, maxX));
      this.posY = Math.max(0, Math.min(this.posY, maxY));
    }
  };

  private handleMouseUp = () => {
    this.isDragging = false;
    this.savePosition();
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
  };

  private toggleVisibility() {
    this.visible = !this.visible;
    localStorage.setItem(STORAGE_KEY, String(this.visible));
    // Dispatch event so menu can update its checkmark
    window.dispatchEvent(new CustomEvent("shortcuts-visibility-changed", { detail: { visible: this.visible } }));
  }

  private getToolShortcuts(): ToolShortcut[] {
    const tool = toolStore.activeTool.value;
    const meta = getToolMeta(tool);
    return meta?.shortcuts || [];
  }

  private getContextShortcuts(): { title: string; shortcuts: ToolShortcut[] }[] {
    const sections: { title: string; shortcuts: ToolShortcut[] }[] = [];

    // Check for floating selection first (more specific)
    if (selectionStore.isFloating) {
      sections.push({
        title: "Float",
        shortcuts: contextShortcuts.floatingSelection,
      });
    } else if (selectionStore.isActive) {
      // Regular selection active
      sections.push({
        title: "Selection",
        shortcuts: contextShortcuts.selectionActive,
      });
    }

    return sections;
  }

  render() {
    if (!this.visible) {
      return html`
        <button
          class="toggle-btn"
          @click=${this.toggleVisibility}
          title="Show shortcuts (View > Shortcuts Preview)"
        >?</button>
      `;
    }

    const toolShortcuts = this.getToolShortcuts();
    const contextSections = this.getContextShortcuts();
    const tool = toolStore.activeTool.value;
    const meta = getToolMeta(tool);

    return html`
      <div
        class="overlay"
        style="transform: translate(${this.posX}px, ${this.posY}px)"
      >
        <div class="header" @mousedown=${this.handleHeaderMouseDown}>
          <span class="title">Shortcuts</span>
          <button class="close-btn" @click=${this.toggleVisibility} title="Hide (View > Shortcuts Preview)">\u00d7</button>
        </div>

        ${toolShortcuts.length > 0
          ? html`
              <div class="section">
                <div class="section-title">${meta?.name || tool}</div>
                ${toolShortcuts.map(
                  (s) => html`
                    <div class="shortcut-row">
                      <span class="key">${formatShortcut(s.key)}</span>
                      <span class="action">${s.action}</span>
                    </div>
                  `
                )}
              </div>
            `
          : ""}
        ${contextSections.map(
          (section) => html`
            <div class="section">
              <div class="section-title">${section.title}</div>
              ${section.shortcuts.map(
                (s) => html`
                  <div class="shortcut-row">
                    <span class="key">${formatShortcut(s.key)}</span>
                    <span class="action">${s.action}</span>
                  </div>
                `
              )}
            </div>
          `
        )}

        <div class="section">
          <div class="section-title">Global</div>
          ${contextShortcuts.global.map(
            (s) => html`
              <div class="shortcut-row">
                <span class="key">${formatShortcut(s.key)}</span>
                <span class="action">${s.action}</span>
              </div>
            `
          )}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-shortcuts-overlay": PfShortcutsOverlay;
  }
}
