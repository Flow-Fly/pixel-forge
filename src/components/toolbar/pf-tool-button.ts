import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { toolStore, type ToolType } from "../../stores/tools";
import { setLastSelectedTool } from "../../stores/tool-groups";
import { getToolMeta, getToolIcon } from "../../tools/tool-registry";
import "./pf-tool-options-popover";
import "./pf-tool-group-menu";

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
  @property({ type: Boolean, reflect: true, attribute: "has-group" }) hasGroup =
    false;

  @state() private showGroupMenu = false;
  @state() private menuX = 0;
  @state() private menuY = 0;
  // @state() private anchorRect?: DOMRect;

  private documentClickHandler = (e: MouseEvent) => {
    if (this.showGroupMenu && !this.contains(e.target as Node)) {
      this.showGroupMenu = false;
      document.removeEventListener("click", this.documentClickHandler);
    }
  };

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("groupTools")) {
      this.hasGroup = this.groupTools.length > 1;
    }
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
          @click=${this.handleContextMenu}
        >
          <img class="icon" src="${getToolIcon(this.tool)}" alt="${toolName}" />
        </button>
        ${this.hasGroup ? html`<div class="group-indicator"></div>` : ""}
      </div>

      ${this.hasGroup && this.showGroupMenu
        ? html`
            <pf-tool-group-menu
              .tools=${this.groupTools}
              .x=${this.menuX}
              .y=${this.menuY}
              @tool-selected=${this.handleToolSelected}
            ></pf-tool-group-menu>
          `
        : ""}
    `;
  }

  private handleContextMenu(e: MouseEvent) {
    e.preventDefault();

    // Show group menu for tool groups
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuX = rect.right + 4;
    this.menuY = rect.top;
    this.showGroupMenu = true;

    // Close on outside click
    setTimeout(() => {
      document.addEventListener("click", this.documentClickHandler);
    }, 0);
  }

  private handleToolSelected(e: CustomEvent<{ tool: ToolType }>) {
    const tool = e.detail.tool;

    // Remember selection for this group
    if (this.groupId) {
      setLastSelectedTool(this.groupId, tool);
    }

    // Select the tool
    toolStore.setActiveTool(tool);

    // Close menu
    this.showGroupMenu = false;
    document.removeEventListener("click", this.documentClickHandler);

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
    document.removeEventListener("click", this.documentClickHandler);
  }
}
