import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { toolStore, type ToolType } from "../../stores/tools";
import { BaseComponent } from "../../core/base-component";
import {
  getToolMeta,
  getToolIcon,
  getToolShortcutKey,
} from "../../tools/tool-registry";

/**
 * Popover menu showing all tools in a group
 * Appears when a grouped tool button opens its alternatives
 */
@customElement("pf-tool-group-menu")
export class PFToolGroupMenu extends BaseComponent {
  static styles = css`
    :host {
      position: fixed;
      z-index: 10000;
      box-sizing: border-box;
      background: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      padding: 4px;
      min-width: 120px;
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 16px);
      overflow-y: auto;
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      color: var(--pf-color-text-main);
      background: none;
      border: none;
      width: 100%;
      text-align: left;
    }

    .menu-item:hover {
      background: var(--pf-color-bg-surface);
    }

    .menu-item:focus-visible {
      outline: 2px solid var(--pf-color-accent);
      outline-offset: -2px;
    }

    .menu-item.active {
      background: var(--pf-color-primary-muted);
    }

    .tool-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }

    .tool-name {
      flex: 1;
    }

    .shortcut {
      color: var(--pf-color-text-muted);
      font-size: 10px;
    }
  `;

  @property({ type: Array }) tools: ToolType[] = [];
  @property({ type: Number }) x = 0;
  @property({ type: Number }) y = 0;

  private formatShortcut(shortcutKey: string): string {
    // Convert shortcut key format for display (e.g., "shift+Q" -> "⇧Q")
    if (shortcutKey.toLowerCase().startsWith("shift+")) {
      return "⇧" + shortcutKey.slice(6);
    }
    return shortcutKey;
  }

  private selectTool(tool: ToolType) {
    this.dispatchEvent(
      new CustomEvent("tool-selected", {
        detail: { tool },
        bubbles: true,
        composed: true,
      })
    );
  }

  updated(changedProperties: Map<string, unknown>) {
    if (
      changedProperties.has("x") ||
      changedProperties.has("y") ||
      changedProperties.has("tools")
    ) {
      this.placeMenu();
    }
  }

  private placeMenu() {
    this.style.left = `${this.x}px`;
    this.style.top = `${this.y}px`;

    requestAnimationFrame(() => this.clampToViewport());
  }

  private clampToViewport() {
    const margin = 8;
    const rect = this.getBoundingClientRect();

    let left = this.x;
    let top = this.y;

    if (rect.right > window.innerWidth - margin) {
      left = window.innerWidth - rect.width - margin;
    }

    if (rect.bottom > window.innerHeight - margin) {
      top = window.innerHeight - rect.height - margin;
    }

    left = Math.max(margin, left);
    top = Math.max(margin, top);

    this.style.left = `${left}px`;
    this.style.top = `${top}px`;
  }

  render() {
    const activeTool = toolStore.activeTool.value;
    return html`
      ${this.tools.map((tool) => {
        const meta = getToolMeta(tool);
        const name = meta?.name || tool;
        const isActive = tool === activeTool;
        const shortcut = this.formatShortcut(getToolShortcutKey(tool));

        return html`
          <button
            class="menu-item ${isActive ? "active" : ""}"
            @click=${() => this.selectTool(tool)}
          >
            <img class="tool-icon" src="${getToolIcon(tool)}" alt="${name}" />
            <span class="tool-name">${name}</span>
            <span class="shortcut">${shortcut}</span>
          </button>
        `;
      })}
    `;
  }
}
