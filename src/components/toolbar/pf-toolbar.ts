import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { toolStore, type ToolType } from "../../stores/tools";
import {
  toolGroups,
  getActiveToolForGroup,
  setLastSelectedTool,
  getToolGroup,
} from "../../stores/tool-groups";
import { getToolShortcutKey } from "../../tools/tool-registry";
import "./pf-tool-button";
import "../color/pf-color-selector-compact";

@customElement("pf-toolbar")
export class PFToolbar extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      padding: var(--pf-spacing-1) 0;
      height: 100%;
    }

    .tools-section {
      display: flex;
      flex-direction: column;
    }

    .separator {
      height: 1px;
      margin: var(--pf-spacing-1) var(--pf-spacing-2);
      background: var(--pf-color-border);
    }

    .spacer {
      flex: 1;
    }

    .color-section {
      padding: var(--pf-spacing-2) 0;
      border-top: 1px solid var(--pf-color-border);
      display: flex;
      justify-content: center;
    }
  `;

  // Track which tool is displayed for each group
  @state() private groupDisplayTools: Map<string, ToolType> = new Map();

  // Track last seen active tool to detect changes
  private lastSeenActiveTool: ToolType | null = null;

  connectedCallback() {
    super.connectedCallback();
    // Initialize display tools from groups
    toolGroups.forEach((group) => {
      this.groupDisplayTools.set(group.id, getActiveToolForGroup(group));
    });
  }

  willUpdate() {
    // Sync groupDisplayTools when active tool changes (e.g., via keyboard shortcut)
    const activeTool = toolStore.activeTool.value;
    if (activeTool !== this.lastSeenActiveTool) {
      this.lastSeenActiveTool = activeTool;
      const group = getToolGroup(activeTool);
      if (group && this.groupDisplayTools.get(group.id) !== activeTool) {
        setLastSelectedTool(group.id, activeTool);
        this.groupDisplayTools.set(group.id, activeTool);
      }
    }
  }

  private selectTool(tool: ToolType) {
    toolStore.setActiveTool(tool);

    // Update the display tool for the group
    const group = getToolGroup(tool);
    if (group) {
      setLastSelectedTool(group.id, tool);
      this.groupDisplayTools = new Map(
        this.groupDisplayTools.set(group.id, tool)
      );
    }
  }

  private handleGroupToolChanged(
    e: CustomEvent<{ tool: ToolType; groupId: string }>
  ) {
    const { tool, groupId } = e.detail;
    this.groupDisplayTools = new Map(this.groupDisplayTools.set(groupId, tool));
  }

  render() {
    return html`
      <div class="tools-section">
        <!-- Drawing Tools -->
        ${this.renderToolGroup("pencil")} ${this.renderToolGroup("eraser")}
        ${this.renderToolGroup("eyedropper")}

        <div class="separator"></div>

        <!-- Selection Tools -->
        ${this.renderToolGroup("selection")}

        <div class="separator"></div>

        <!-- Shape Tools -->
        ${this.renderToolGroup("shapes")} ${this.renderToolGroup("fill")}

        <div class="separator"></div>

        <!-- Text Tools -->
        ${this.renderToolGroup("text")}

        <div class="separator"></div>

        <!-- Utility Tools -->
        ${this.renderToolGroup("transform")}
        ${this.renderToolGroup("navigation")}
      </div>

      <div class="spacer"></div>

      <div class="color-section">
        <pf-color-selector-compact></pf-color-selector-compact>
      </div>
    `;
  }

  private renderToolGroup(groupId: string) {
    const group = toolGroups.find((g) => g.id === groupId);
    if (!group) return "";

    const activeTool = toolStore.activeTool.value;
    const isActive = group.tools.includes(activeTool);

    // If active tool is in this group, show it; otherwise use stored preference or default
    const displayTool = isActive
      ? activeTool
      : this.groupDisplayTools.get(groupId) || group.defaultTool;

    // Get shortcut from the displayed tool via registry
    const shortcut = getToolShortcutKey(displayTool);

    return html`
      <pf-tool-button
        .tool=${displayTool}
        .groupTools=${group.tools}
        .groupId=${groupId}
        shortcut=${shortcut}
        ?active=${isActive}
        @click=${() => this.selectTool(displayTool)}
        @group-tool-changed=${this.handleGroupToolChanged}
      ></pf-tool-button>
    `;
  }
}
