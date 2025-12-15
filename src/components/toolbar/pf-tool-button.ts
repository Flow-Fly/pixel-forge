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
      width: 32px;
      height: 32px;
      margin: 4px auto;
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
      border-radius: 2px;
      color: var(--pf-color-text-muted);
      transition: all 0.1s;
      cursor: pointer;
      font-size: 16px;
    }

    button:hover {
      background-color: var(--pf-color-bg-surface);
      color: var(--pf-color-text-main);
    }

    :host([active]) button {
      background-color: var(--pf-color-bg-surface);
      border-color: var(--pf-color-accent);
      color: var(--pf-color-accent);
      box-shadow: var(--pf-shadow-glow);
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

    // .gear-icon {
    //   position: absolute;
    //   bottom: 0;
    //   right: 0;
    //   width: 12px;
    //   height: 12px;
    //   font-size: 8px;
    //   background: var(--pf-color-bg-panel, #141414);
    //   border: 1px solid var(--pf-color-border, #333);
    //   border-radius: 2px;
    //   color: var(--pf-color-text-muted, #808080);
    //   cursor: pointer;
    //   display: flex;
    //   align-items: center;
    //   justify-content: center;
    //   opacity: 0;
    //   transition: opacity 0.15s ease;
    // }

    // .button-container:hover .gear-icon {
    //   opacity: 1;
    // }

    // .gear-icon:hover {
    //   background: var(--pf-color-bg-surface, #1e1e1e);
    //   color: var(--pf-color-text-main, #e0e0e0);
    // }

    // /* Hide gear icon when showing group indicator */
    // :host([has-group]) .gear-icon {
    //   display: none;
    // }
  `;

  @property({ type: String }) tool: ToolType = "pencil";
  @property({ type: String }) icon = "";
  @property({ type: String }) shortcut = "";
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Array }) groupTools: ToolType[] = [];
  @property({ type: String }) groupId = "";
  @property({ type: Boolean, reflect: true, attribute: "has-group" }) hasGroup =
    false;

  @state() private showOptions = false;
  @state() private showGroupMenu = false;
  @state() private menuX = 0;
  @state() private menuY = 0;
  @state() private anchorRect?: DOMRect;

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
            ? " - Right-click for more tools"
            : ""}"
          @contextmenu=${this.handleContextMenu}
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

    if (this.hasGroup) {
      // Show group menu for tool groups
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      this.menuX = rect.right + 4;
      this.menuY = rect.top;
      this.showGroupMenu = true;

      // Close on outside click
      setTimeout(() => {
        document.addEventListener("click", this.documentClickHandler);
      }, 0);
    } else {
      // Show options popover for single tools
      this.openOptionsPopover(e.currentTarget as HTMLElement);
    }
  }

  private handleGearClick(e: MouseEvent) {
    e.stopPropagation();
    this.openOptionsPopover(e.currentTarget as HTMLElement);
  }

  private openOptionsPopover(anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    this.anchorRect = rect;
    this.showOptions = !this.showOptions;
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
