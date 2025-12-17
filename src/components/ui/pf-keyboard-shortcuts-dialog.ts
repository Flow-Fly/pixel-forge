import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { toolRegistry } from "../../tools/tool-registry";
import { formatShortcut } from "../../utils/platform";
import type { ToolShortcut, ToolMeta } from "../../types/tool-meta";
import type { ToolType } from "../../stores/tools";
import {
  globalShortcutCategories,
  animationShortcutCategories,
} from "../../services/keyboard/shortcut-definitions";

type TabId = "tools" | "global" | "animation";

/**
 * Tool groups for organized display
 */
const toolGroups: Array<{ name: string; group: ToolMeta["group"] }> = [
  { name: "Drawing", group: "drawing" },
  { name: "Selection", group: "selection" },
  { name: "Shape", group: "shape" },
  { name: "Fill", group: "fill" },
  { name: "Navigation", group: "navigation" },
  { name: "Utility", group: "utility" },
];

@customElement("pf-keyboard-shortcuts-dialog")
export class PfKeyboardShortcutsDialog extends BaseComponent {
  static styles = css`
    :host {
      display: none;
    }

    :host([open]) {
      display: block;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dialog {
      background-color: var(--pf-color-bg-panel, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 6px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      width: 500px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--pf-color-border, #333);
    }

    .title {
      font-weight: 600;
      font-size: 14px;
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .close-btn {
      background: transparent;
      border: 1px solid var(--pf-color-border, #333);
      color: var(--pf-color-text-main, #e0e0e0);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
    }

    .close-btn:hover {
      background-color: var(--pf-color-bg-hover, #2a2a2a);
    }

    .tabs {
      display: flex;
      gap: 0;
      padding: 0 16px;
      border-bottom: 1px solid var(--pf-color-border, #333);
    }

    .tab {
      background: none;
      border: none;
      padding: 10px 16px;
      font-size: 12px;
      color: var(--pf-color-text-muted, #888);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }

    .tab:hover {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .tab.active {
      color: var(--pf-color-accent, #4a9eff);
      border-bottom-color: var(--pf-color-accent, #4a9eff);
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .group {
      margin-bottom: 16px;
    }

    .group:last-child {
      margin-bottom: 0;
    }

    .group-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--pf-color-text-muted, #888);
      margin-bottom: 8px;
      font-weight: 600;
    }

    .tool-section {
      background: var(--pf-color-bg-secondary, #252525);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      margin-bottom: 8px;
      overflow: hidden;
    }

    .tool-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--pf-color-bg-tertiary, #2a2a2a);
      border-bottom: 1px solid var(--pf-color-border, #333);
    }

    .tool-name {
      font-size: 12px;
      font-weight: 500;
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .tool-key {
      background: var(--pf-color-bg-panel, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 10px;
      color: var(--pf-color-text-secondary, #aaa);
      font-family: system-ui, -apple-system, sans-serif;
    }

    .shortcuts-list {
      padding: 6px 10px;
    }

    .shortcut-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
    }

    .shortcut-row:not(:last-child) {
      border-bottom: 1px solid var(--pf-color-border-subtle, #2a2a2a);
    }

    .key {
      background: var(--pf-color-bg-tertiary, #2a2a2a);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      padding: 2px 6px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 11px;
      color: var(--pf-color-text-primary, #fff);
      min-width: 24px;
      text-align: center;
    }

    .action {
      color: var(--pf-color-text-secondary, #aaa);
      font-size: 11px;
      text-align: right;
    }

    .category-section {
      background: var(--pf-color-bg-secondary, #252525);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      margin-bottom: 8px;
      overflow: hidden;
    }

    .category-header {
      padding: 8px 10px;
      background: var(--pf-color-bg-tertiary, #2a2a2a);
      border-bottom: 1px solid var(--pf-color-border, #333);
      font-size: 12px;
      font-weight: 500;
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .no-shortcuts {
      color: var(--pf-color-text-muted, #888);
      font-size: 11px;
      font-style: italic;
      padding: 4px 0;
    }
  `;

  @property({ type: Boolean, reflect: true }) open = false;
  @state() private activeTab: TabId = "tools";

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("show-keyboard-shortcuts-dialog", this.handleShow);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("show-keyboard-shortcuts-dialog", this.handleShow);
  }

  private handleShow = () => {
    this.open = true;
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.open && e.key === "Escape") {
      e.preventDefault();
      this.close();
    }
  };

  private handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      this.close();
    }
  };

  private close() {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent("pf-close", { bubbles: true, composed: true })
    );
  }

  private setTab(tab: TabId) {
    this.activeTab = tab;
  }

  private getToolsByGroup(group: ToolMeta["group"]): Array<[ToolType, ToolMeta]> {
    return Object.entries(toolRegistry)
      .filter(([_, meta]) => meta.group === group) as Array<[ToolType, ToolMeta]>;
  }

  private renderToolsTab() {
    return html`
      ${toolGroups.map(({ name, group }) => {
        const tools = this.getToolsByGroup(group);
        if (tools.length === 0) return "";

        return html`
          <div class="group">
            <div class="group-title">${name}</div>
            ${tools.map(([toolId, meta]) => html`
              <div class="tool-section">
                <div class="tool-header">
                  <span class="tool-name">${meta.name}</span>
                  ${meta.shortcutKey
                    ? html`<span class="tool-key">${formatShortcut(meta.shortcutKey)}</span>`
                    : ""}
                </div>
                <div class="shortcuts-list">
                  ${meta.shortcuts.length > 0
                    ? meta.shortcuts.map(
                        (s: ToolShortcut) => html`
                          <div class="shortcut-row">
                            <span class="key">${formatShortcut(s.key)}</span>
                            <span class="action">${s.action}</span>
                          </div>
                        `
                      )
                    : html`<div class="no-shortcuts">No modifiers</div>`}
                </div>
              </div>
            `)}
          </div>
        `;
      })}
    `;
  }

  private renderGlobalTab() {
    return html`
      ${globalShortcutCategories.map(
        (category) => html`
          <div class="category-section">
            <div class="category-header">${category.name}</div>
            <div class="shortcuts-list">
              ${category.shortcuts.map(
                (s) => html`
                  <div class="shortcut-row">
                    <span class="key">${formatShortcut(s.key)}</span>
                    <span class="action">${s.action}</span>
                  </div>
                `
              )}
            </div>
          </div>
        `
      )}
    `;
  }

  private renderAnimationTab() {
    return html`
      ${animationShortcutCategories.map(
        (category) => html`
          <div class="category-section">
            <div class="category-header">${category.name}</div>
            <div class="shortcuts-list">
              ${category.shortcuts.map(
                (s) => html`
                  <div class="shortcut-row">
                    <span class="key">${formatShortcut(s.key)}</span>
                    <span class="action">${s.action}</span>
                  </div>
                `
              )}
            </div>
          </div>
        `
      )}
    `;
  }

  render() {
    if (!this.open) return "";

    return html`
      <div class="overlay" @click=${this.handleBackdropClick}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <div class="header">
            <span class="title">Keyboard Shortcuts</span>
            <button class="close-btn" @click=${this.close}>✕</button>
          </div>

          <div class="tabs">
            <button
              class="tab ${this.activeTab === "tools" ? "active" : ""}"
              @click=${() => this.setTab("tools")}
            >
              Tools
            </button>
            <button
              class="tab ${this.activeTab === "global" ? "active" : ""}"
              @click=${() => this.setTab("global")}
            >
              Global
            </button>
            <button
              class="tab ${this.activeTab === "animation" ? "active" : ""}"
              @click=${() => this.setTab("animation")}
            >
              Animation
            </button>
          </div>

          <div class="content">
            ${this.activeTab === "tools"
              ? this.renderToolsTab()
              : this.activeTab === "global"
              ? this.renderGlobalTab()
              : this.renderAnimationTab()}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-keyboard-shortcuts-dialog": PfKeyboardShortcutsDialog;
  }
}
