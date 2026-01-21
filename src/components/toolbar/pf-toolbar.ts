import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { toolStore, type ToolType } from "../../stores/tools";
import {
  toolGroups,
  tilemapToolGroups,
  getActiveToolForGroup,
  setLastSelectedTool,
  getToolGroup,
} from "../../stores/tool-groups";
import { getToolShortcutKey } from "../../tools/tool-registry";
import { modeStore } from "../../stores/mode";
import { tilemapStore } from "../../stores/tilemap";
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
      /* Story 5-4 Task 1.5: Transition animation for toolbar swap */
      animation: toolbar-fade-in 200ms ease-out;
    }

    /* Story 5-4 Task 1.5: Fade-in animation for toolbar swap */
    @keyframes toolbar-fade-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Story 5-4 Task 1.6: Respect prefers-reduced-motion */
    @media (prefers-reduced-motion: reduce) {
      .tools-section {
        animation: none;
      }
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

  // Track previous map tool for restoration on hero edit exit
  // Story 5-4 Task 1.3
  private previousMapTool: ToolType | null = null;

  // Track hero edit state to detect transitions
  // Story 5-4 Task 1.4
  private wasHeroEditActive: boolean = false;

  connectedCallback() {
    super.connectedCallback();
    // Initialize display tools from art mode groups
    toolGroups.forEach((group) => {
      this.groupDisplayTools.set(group.id, getActiveToolForGroup(group));
    });
    // Initialize display tools from tilemap mode groups
    tilemapToolGroups.forEach((group) => {
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

  /**
   * Get the previous map tool that was active before hero edit
   * Story 5-4 Task 7.2: Used for restoring tool on hero edit exit
   */
  getPreviousMapTool(): ToolType | null {
    return this.previousMapTool;
  }

  /**
   * Clear the stored previous map tool
   * Story 5-4 Task 7.2: Called after tool restoration
   */
  clearPreviousMapTool(): void {
    this.previousMapTool = null;
  }

  render() {
    // Access mode signal to trigger re-render on mode change
    const currentMode = modeStore.mode.value;

    // Story 5-4 Task 1.1-1.4: Detect hero edit mode and transition state
    const heroEditActive = tilemapStore.heroEditActive;
    const heroEditIdle = tilemapStore.heroEditTransition.value === 'idle';

    // Story 5-4 Task 1.3: Store current map tool when entering hero edit
    if (currentMode === 'map' && heroEditActive && !this.wasHeroEditActive) {
      this.previousMapTool = toolStore.activeTool.value;
      // Story 5-4 Task 1.4: Set pencil as default tool on hero edit entry
      toolStore.setActiveTool('pencil');
    }

    // Track hero edit state for next render
    this.wasHeroEditActive = heroEditActive;

    // Story 5-4 Task 1.2: Show art toolbar when hero edit is active AND idle
    if (currentMode === 'map' && heroEditActive && heroEditIdle) {
      return this.renderArtModeToolbar();
    }

    if (currentMode === 'map') {
      return this.renderMapModeToolbar();
    }

    return this.renderArtModeToolbar();
  }

  private renderArtModeToolbar() {
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

  private renderMapModeToolbar() {
    return html`
      <div class="tools-section">
        <!-- Tilemap Drawing Tools -->
        ${this.renderToolGroup("tile-brush", tilemapToolGroups)}
        ${this.renderToolGroup("tile-eraser", tilemapToolGroups)}
        ${this.renderToolGroup("tile-fill", tilemapToolGroups)}

        <div class="separator"></div>

        <!-- Tilemap Selection -->
        ${this.renderToolGroup("tile-select", tilemapToolGroups)}

        <div class="separator"></div>

        <!-- Navigation Tools (shared) -->
        ${this.renderToolGroup("navigation", tilemapToolGroups)}
      </div>

      <div class="spacer"></div>
    `;
  }

  private renderToolGroup(groupId: string, groups = toolGroups) {
    const group = groups.find((g) => g.id === groupId);
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
