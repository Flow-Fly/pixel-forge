import { html, css, nothing } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { historyStore, type Command } from '../../stores/history';
import { historyHighlightStore } from '../../stores/history-highlight';
import { isDrawableCommand } from '../../commands/index';
import { layerStore } from '../../stores/layers';
import { projectStore } from '../../stores/project';
import './pf-history-diff-tooltip';
import "./";

@customElement('pf-undo-history')
export class PFUndoHistory extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }

    .item {
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      color: var(--pf-color-text-muted);
      position: relative;
    }

    .item:hover {
      background-color: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
    }

    .item.active {
      color: var(--pf-color-text-main);
    }

    .item.future {
      color: var(--pf-color-text-disabled);
      font-style: italic;
    }

    .item.highlighted {
      background-color: var(--pf-color-bg-hover);
    }

    .item.expanded {
      background-color: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      margin: 4px;
      padding: 8px;
    }

    .item-name {
      font-weight: 500;
    }

    .expanded-content {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--pf-color-border);
    }

    .diff-container {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    .diff-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .diff-label {
      font-size: 10px;
      color: var(--pf-color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .canvas-wrapper {
      border: 1px solid var(--pf-color-border);
      background-image: linear-gradient(45deg, #404040 25%, transparent 25%),
        linear-gradient(-45deg, #404040 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #404040 75%),
        linear-gradient(-45deg, transparent 75%, #404040 75%);
      background-size: 8px 8px;
      background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
      background-color: #2a2a2a;
    }

    .diff-canvas {
      display: block;
      image-rendering: pixelated;
      width: 80px;
      height: 80px;
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .text-description {
      font-size: 11px;
      color: var(--pf-color-text-muted);
      margin-bottom: 8px;
      font-style: italic;
    }

    .warning-message {
      font-size: 10px;
      color: var(--pf-color-text-muted);
      font-style: italic;
      margin-bottom: 8px;
    }
  `;

  @state() private hoverTimeout: number | null = null;
  @state() private tooltipAnchorRect: DOMRect | null = null;
  @state() private allPixelsOverwritten = false;

  @query('.tooltip-anchor') tooltipAnchor!: HTMLElement;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleKeyDown);
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      historyHighlightStore.clear();
    }
  };

  private handleMouseEnter(cmd: Command, event: MouseEvent) {
    // Clear any pending timeout
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
    }

    // Debounce hover by 100ms
    this.hoverTimeout = window.setTimeout(() => {
      // Don't update highlight if we have an expanded item
      if (historyHighlightStore.expandedCommandId.value === null) {
        historyHighlightStore.setHighlight(cmd);
      }

      // Get anchor rect for tooltip
      const target = event.currentTarget as HTMLElement;
      this.tooltipAnchorRect = target.getBoundingClientRect();
    }, 100);
  }

  private handleMouseLeave() {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    // Only clear highlight if not expanded
    if (historyHighlightStore.expandedCommandId.value === null) {
      historyHighlightStore.setHighlight(null);
      this.tooltipAnchorRect = null;
    }
  }

  private handleClick(cmd: Command, index: number, type: 'undo' | 'redo') {
    // Toggle expanded state
    historyHighlightStore.toggleExpanded(cmd);

    // Check if all pixels are overwritten (for patch button state)
    if (isDrawableCommand(cmd)) {
      this.checkPixelsOverwritten(cmd, index, type);
    }
  }

  private checkPixelsOverwritten(cmd: Command, _index: number, _type: 'undo' | 'redo') {
    // For now, assume not all pixels are overwritten
    // The actual check happens during patch execution
    void cmd; // cmd is kept for future implementation
    this.allPixelsOverwritten = false;
  }

  private async revertToHere(index: number, type: 'undo' | 'redo') {
    if (type === 'undo') {
      const undoStack = historyStore.undoStack.value;
      const stepsToUndo = undoStack.length - 1 - index;

      for (let i = 0; i < stepsToUndo; i++) {
        await historyStore.undo();
      }
    } else {
      const stepsToRedo = index + 1;
      for (let i = 0; i < stepsToRedo; i++) {
        await historyStore.redo();
      }
    }

    // Clear expanded state
    historyHighlightStore.clear();
  }

  private async patchThisOut(cmd: Command, index: number) {
    if (!isDrawableCommand(cmd)) return;

    // Import patch service dynamically to avoid circular dependency
    const { computeSafePixels, applyPatch } = await import('../../services/patch-service');
    const { PatchCommand } = await import('../../commands/patch-command');

    const undoStack = historyStore.undoStack.value;
    const subsequentCommands = undoStack.slice(index + 1);
    const canvasWidth = projectStore.width.value;

    // Compute safe pixels
    const safePixels = computeSafePixels(cmd, subsequentCommands, canvasWidth);

    if (safePixels.size === 0) {
      this.allPixelsOverwritten = true;
      return;
    }

    // Apply patch
    const patchData = applyPatch(cmd.drawLayerId, cmd, safePixels, canvasWidth);
    if (!patchData) {
      this.allPixelsOverwritten = true;
      return;
    }

    // Create and execute patch command
    const patchCommand = new PatchCommand(
      cmd.drawLayerId,
      patchData.bounds,
      patchData.beforeData,
      patchData.afterData,
      cmd.name
    );

    await historyStore.execute(patchCommand);

    // Clear expanded state
    historyHighlightStore.clear();
  }

  private isLayerDeleted(cmd: Command): boolean {
    if (!isDrawableCommand(cmd)) return false;
    const layerId = cmd.drawLayerId;
    const layer = layerStore.layers.value.find(l => l.id === layerId);
    return !layer;
  }

  private renderExpandedContent(cmd: Command, index: number, type: 'undo' | 'redo') {
    const isDrawable = isDrawableCommand(cmd);
    const layerDeleted = isDrawable && this.isLayerDeleted(cmd);
    const canPatch = type === 'undo' && isDrawable && !layerDeleted && !this.allPixelsOverwritten;

    return html`
      <div class="expanded-content">
        ${isDrawable && !layerDeleted
          ? html`
              <div class="diff-container">
                <div class="diff-panel">
                  <span class="diff-label">Before</span>
                  <div class="canvas-wrapper">
                    <canvas
                      class="diff-canvas"
                      id="before-${cmd.id}"
                      @firstUpdated=${() => this.renderDiffCanvas(cmd, 'before')}
                    ></canvas>
                  </div>
                </div>
                <div class="diff-panel">
                  <span class="diff-label">After</span>
                  <div class="canvas-wrapper">
                    <canvas
                      class="diff-canvas"
                      id="after-${cmd.id}"
                      @firstUpdated=${() => this.renderDiffCanvas(cmd, 'after')}
                    ></canvas>
                  </div>
                </div>
              </div>
            `
          : layerDeleted
            ? html`<div class="warning-message">Layer has been deleted</div>`
            : html`<div class="text-description">${cmd.name}</div>`
        }

        ${this.allPixelsOverwritten
          ? html`<div class="warning-message">Changes were overwritten by subsequent actions</div>`
          : nothing
        }

        <div class="actions">
          <pf-button
            variant="primary"
            size="sm"
            @click=${(e: Event) => { e.stopPropagation(); this.revertToHere(index, type); }}
          >
            Revert to here
          </pf-button>
          <pf-button
            size="sm"
            ?disabled=${!canPatch}
            @click=${(e: Event) => { e.stopPropagation(); this.patchThisOut(cmd, index); }}
            title=${!canPatch ? (type === 'redo' ? 'Cannot patch redo items' : 'Cannot patch this command') : 'Remove only this change'}
          >
            Patch this out
          </pf-button>
        </div>
      </div>
    `;
  }

  updated() {
    // Render diff canvases after DOM update
    const expandedCmd = historyHighlightStore.expandedCommand.value;
    if (expandedCmd && isDrawableCommand(expandedCmd)) {
      this.renderDiffCanvas(expandedCmd, 'before');
      this.renderDiffCanvas(expandedCmd, 'after');
    }
  }

  private renderDiffCanvas(cmd: Command, type: 'before' | 'after') {
    if (!isDrawableCommand(cmd)) return;

    const canvasId = `${type}-${cmd.id}`;
    const canvas = this.shadowRoot?.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bounds = cmd.drawBounds;
    const data = type === 'before' ? cmd.drawPreviousData : cmd.drawNewData;

    canvas.width = bounds.width;
    canvas.height = bounds.height;

    const imageData = new ImageData(
      new Uint8ClampedArray(data),
      bounds.width,
      bounds.height
    );
    ctx.putImageData(imageData, 0, 0);
  }

  render() {
    const undoStack = historyStore.undoStack.value;
    const redoStack = historyStore.redoStack.value;
    const highlightedId = historyHighlightStore.highlightedCommandId.value;
    const expandedId = historyHighlightStore.expandedCommandId.value;
    const highlightedCmd = historyHighlightStore.highlightedCommand.value;

    // Show tooltip only when hovering (not expanded) and have an anchor
    const showTooltip = highlightedId !== null &&
                        expandedId === null &&
                        this.tooltipAnchorRect !== null;

    return html`
      <div class="list">
        ${undoStack.map((cmd, i) => {
          const isHighlighted = cmd.id === highlightedId;
          const isExpanded = cmd.id === expandedId;

          return html`
            <div
              class="item active ${isHighlighted ? 'highlighted' : ''} ${isExpanded ? 'expanded' : ''}"
              @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(cmd, e)}
              @mouseleave=${this.handleMouseLeave}
              @click=${() => this.handleClick(cmd, i, 'undo')}
            >
              <span class="item-name">${cmd.name}</span>
              ${isExpanded ? this.renderExpandedContent(cmd, i, 'undo') : nothing}
            </div>
          `;
        })}
        ${[...redoStack].reverse().map((cmd, i) => {
          const isHighlighted = cmd.id === highlightedId;
          const isExpanded = cmd.id === expandedId;

          return html`
            <div
              class="item future ${isHighlighted ? 'highlighted' : ''} ${isExpanded ? 'expanded' : ''}"
              @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(cmd, e)}
              @mouseleave=${this.handleMouseLeave}
              @click=${() => this.handleClick(cmd, i, 'redo')}
            >
              <span class="item-name">${cmd.name}</span>
              ${isExpanded ? this.renderExpandedContent(cmd, i, 'redo') : nothing}
            </div>
          `;
        })}
      </div>

      <pf-history-diff-tooltip
        .command=${highlightedCmd}
        .anchorRect=${this.tooltipAnchorRect}
        ?open=${showTooltip}
      ></pf-history-diff-tooltip>
    `;
  }
}
