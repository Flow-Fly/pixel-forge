import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { toolStore, type ToolType } from "../../stores/tools";
import { setLastSelectedTool } from "../../stores/tool-groups";
import { getToolMeta, getToolIcon } from "../../tools/tool-registry";
import "./pf-tool-options-popover";
import "./pf-tool-group-menu";
import type { PFToolGroupMenu } from "./pf-tool-group-menu";

@customElement("pf-tool-button")
export class PFToolButton extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      width: 40px;
      height: 40px;
      margin: 5px auto;
      position: relative;
    }

    .button-container {
      position: relative;
      width: 100%;
      height: 100%;
    }

    button {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: transparent;
      border: 1px solid transparent;
      border-radius: var(--pf-radius-sm);
      color: var(--pf-color-text-muted);
      transition: background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
      cursor: pointer;
      font-size: 16px;
      opacity: 0.82;
    }

    button:hover {
      background-color: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
      border-color: var(--pf-color-border);
      opacity: 1;
    }

    :host([active]) button {
      background-color: var(--pf-color-primary-transparent);
      border-color: var(--pf-color-accent);
      color: var(--pf-color-accent);
      box-shadow: var(--pf-shadow-glow);
      opacity: 1;
    }

    .icon {
      max-width: 21px;
      max-height: 21px;
      object-fit: contain;
      opacity: 0.78;
      filter: grayscale(1) contrast(1.15) brightness(1.25);
    }

    button:hover .icon,
    :host([active]) .icon {
      opacity: 1;
      filter: grayscale(0.25) contrast(1.12) brightness(1.12);
    }

    /* Triangle indicator for tool groups */
    .group-indicator {
      position: absolute;
      bottom: 2px;
      right: 2px;
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-bottom: 4px solid var(--pf-color-text-muted);
    }

    :host([active]) .group-indicator {
      border-bottom-color: var(--pf-color-accent);
    }
  `;

  @property({ type: String }) tool: ToolType = "pencil";
  @property({ type: String }) icon = "";
  @property({ type: String }) shortcut = "";
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Array }) groupTools: ToolType[] = [];
  @property({ type: String }) groupId = "";

  private showGroupMenu = false;
  private menuElement: PFToolGroupMenu | null = null;

  private documentMouseDownHandler = (e: MouseEvent) => {
    const target = e.target as Node | null;
    if (!target) return;

    if (
      this.showGroupMenu &&
      !this.contains(target) &&
      !this.menuElement?.contains(target)
    ) {
      this.closeGroupMenu();
    }
  };

  private documentKeyDownHandler = (e: KeyboardEvent) => {
    if (this.showGroupMenu && e.key === "Escape") {
      this.closeGroupMenu();
    }
  };

  private menuToolSelectedHandler = (e: Event) => {
    this.handleToolSelected(e as CustomEvent<{ tool: ToolType }>);
  };

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("groupTools")) {
      if (this.hasGroup) {
        this.updateOpenMenu();
      } else {
        this.closeGroupMenu();
      }
    }
  }

  private get hasGroup() {
    return this.groupTools.length > 1;
  }

  render() {
    const meta = getToolMeta(this.tool);
    const toolName = meta?.name || this.tool;

    return html`
      <div class="button-container">
        <button
          title="${toolName} (${this.shortcut})${this.hasGroup
            ? " - Click for more tools"
            : ""}"
          @click=${this.handleButtonClick}
        >
          <img class="icon" src="${getToolIcon(this.tool)}" alt="${toolName}" />
        </button>
        ${this.hasGroup ? html`<div class="group-indicator"></div>` : ""}
      </div>
    `;
  }

  private handleButtonClick(e: MouseEvent) {
    if (!this.hasGroup) return;

    e.preventDefault();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.openGroupMenu(rect);
  }

  private openGroupMenu(anchorRect: DOMRect) {
    this.closeGroupMenu();

    const menu = document.createElement("pf-tool-group-menu") as PFToolGroupMenu;
    menu.tools = this.groupTools;
    menu.x = anchorRect.right + 4;
    menu.y = anchorRect.top;
    menu.addEventListener("tool-selected", this.menuToolSelectedHandler);

    document.body.append(menu);
    this.menuElement = menu;
    this.showGroupMenu = true;
    document.addEventListener("mousedown", this.documentMouseDownHandler);
    document.addEventListener("keydown", this.documentKeyDownHandler);
  }

  private updateOpenMenu() {
    if (!this.menuElement) return;
    this.menuElement.tools = this.groupTools;
  }

  private closeGroupMenu() {
    if (this.menuElement) {
      this.menuElement.removeEventListener(
        "tool-selected",
        this.menuToolSelectedHandler
      );
      this.menuElement.remove();
      this.menuElement = null;
    }

    this.showGroupMenu = false;
    document.removeEventListener("mousedown", this.documentMouseDownHandler);
    document.removeEventListener("keydown", this.documentKeyDownHandler);
  }

  private handleToolSelected(e: CustomEvent<{ tool: ToolType }>) {
    const tool = e.detail.tool;

    // Remember selection for this group
    if (this.groupId) {
      setLastSelectedTool(this.groupId, tool);
    }

    // Select the tool
    toolStore.setActiveTool(tool);

    this.closeGroupMenu();

    // Dispatch event for parent to update displayed tool
    this.dispatchEvent(
      new CustomEvent("group-tool-changed", {
        detail: { tool, groupId: this.groupId },
        bubbles: true,
        composed: true,
      })
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.closeGroupMenu();
  }
}
