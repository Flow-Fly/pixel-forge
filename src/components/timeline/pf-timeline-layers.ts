import { html, css } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { layerStore } from "../../stores/layers";
import { animationStore } from "../../stores/animation";
import { projectStore } from "../../stores/project";
import { historyStore } from "../../stores/history";
import {
  AddLayerCommand,
  DuplicateLayerCommand,
  RemoveLayerCommand,
  UpdateLayerCommand,
} from "../../commands/layer-commands";
import "./pf-timeline-tooltip";
import type { PFTimelineTooltip } from "./pf-timeline-tooltip";
import "@pixel-forge/ui";
import type { PFContextMenu, ContextMenuItem } from "@pixel-forge/ui";

@customElement("pf-timeline-layers")
export class PFTimelineLayers extends BaseComponent {
  static styles = css`
    :host {
      display: block;
    }

    .toolbar {
      display: flex;
      gap: 2px;
      padding: 4px;
      border-bottom: 1px solid var(--pf-color-border);
      background: var(--pf-color-bg-surface);
    }

    .toolbar button {
      background: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 3px;
      color: var(--pf-color-text-muted);
      font-size: 12px;
      width: 24px;
      height: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .toolbar button:hover {
      background: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
    }

    .toolbar button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .layer-list {
      /* Renders at natural height - parent scroll container handles overflow */
    }

    .layer-row {
      height: 32px;
      display: flex;
      align-items: center;
      padding: 0 4px;
      border-bottom: 1px solid var(--pf-color-border);
      font-size: 12px;
      color: var(--pf-color-text-muted);
      cursor: pointer;
      gap: 4px;
    }

    .layer-row:hover {
      background-color: var(--pf-color-bg-hover);
    }

    .layer-row.active {
      background-color: var(--pf-color-bg-selected, rgba(74, 158, 255, 0.2));
      color: var(--pf-color-text-main);
    }

    .layer-row.dragging {
      opacity: 0.5;
    }

    .layer-row.drag-over {
      border-top: 2px solid var(--pf-color-accent);
    }

    .icon-btn {
      background: none;
      border: none;
      color: var(--pf-color-text-muted);
      cursor: pointer;
      padding: 2px;
      font-size: 14px;
      opacity: 0.7;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
    }

    .icon-btn:hover {
      opacity: 1;
      color: var(--pf-color-text-main);
    }

    .icon-btn.active {
      opacity: 1;
      color: var(--pf-color-accent);
    }

    .icon-btn.hidden-layer {
      opacity: 0.3;
    }

    .icon-btn.locked-layer {
      color: var(--pf-color-accent-yellow, #ffc107);
    }

    .icon-btn.continuous-layer {
      color: var(--pf-color-accent-green, #22c55e);
    }

    .icon-btn.not-continuous {
      opacity: 0.3;
    }

    .layer-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 2px 4px;
      border-radius: 2px;
    }

    .layer-name:hover {
      background: var(--pf-color-bg-surface);
    }

    .opacity-control {
      display: flex;
      align-items: center;
      font-size: 10px;
      color: var(--pf-color-text-muted);
      margin-left: auto;
      padding-right: 4px;
    }

    .opacity-value {
      cursor: ew-resize;
      padding: 2px 4px;
      border-radius: 2px;
      min-width: 32px;
      text-align: right;
      user-select: none;
    }

    .opacity-value:hover {
      background: var(--pf-color-bg-hover);
    }

    .opacity-value.scrubbing {
      background: var(--pf-color-primary-muted, rgba(74, 158, 255, 0.3));
    }

    .opacity-input {
      width: 40px;
      padding: 2px 4px;
      background: var(--pf-color-bg-dark);
      border: 1px solid var(--pf-color-border);
      border-radius: 2px;
      color: var(--pf-color-text-main);
      font-size: 10px;
      text-align: right;
    }

    .opacity-input:focus {
      outline: none;
      border-color: var(--pf-color-accent);
    }

    .layer-type-badge {
      font-size: 9px;
      font-weight: bold;
      padding: 1px 3px;
      border-radius: 2px;
      margin-right: 4px;
      background: var(--pf-color-accent-cyan, #22d3ee);
      color: var(--pf-color-bg-dark);
    }

    .layer-name-input {
      flex: 1;
      background: var(--pf-color-bg-surface);
      border: 1px solid var(--pf-color-accent);
      border-radius: 2px;
      color: var(--pf-color-text-main);
      font-size: 12px;
      padding: 2px 4px;
      outline: none;
    }

    .drag-handle {
      cursor: grab;
      opacity: 0.5;
      font-size: 10px;
    }

    .drag-handle:hover {
      opacity: 1;
    }
  `;

  @property({ type: Boolean, attribute: "no-toolbar" }) noToolbar = false;

  @state() private editingLayerId: string | null = null;
  @state() private editingName: string = "";
  @state() private draggedLayerId: string | null = null;
  @state() private dragOverLayerId: string | null = null;
  @state() private scrubbingLayerId: string | null = null;
  @state() private editingOpacityLayerId: string | null = null;

  @query("pf-timeline-tooltip") private tooltip!: PFTimelineTooltip;
  @query("pf-context-menu") private contextMenu!: PFContextMenu;

  // Track original opacity for undo/redo
  private contextMenuOriginalOpacity: number = 255;
  private scrubStartX = 0;
  private scrubStartOpacity = 0;
  private scrubOriginalOpacity = 0;

  private handleLayerMouseEnter(
    e: MouseEvent,
    layerId: string,
    layerName: string
  ) {
    const target = e.currentTarget as HTMLElement;
    if (!this.tooltip) return;

    const currentFrameId = animationStore.currentFrameId.value;

    // For large canvases, use a capped preview size for performance
    const MAX_PREVIEW_SIZE = 128;
    const width = projectStore.width.value;
    const height = projectStore.height.value;
    const maxDim = Math.max(width, height);
    const previewScale = maxDim > MAX_PREVIEW_SIZE ? MAX_PREVIEW_SIZE / maxDim : 1;
    const previewWidth = Math.round(width * previewScale);
    const previewHeight = Math.round(height * previewScale);

    // Update tooltip - layer preview doesn't need secondary text
    this.tooltip.primaryText = layerName;
    this.tooltip.secondaryText = "";
    this.tooltip.canvasWidth = previewWidth;
    this.tooltip.canvasHeight = previewHeight;

    // Render the layer preview at scaled size
    this.tooltip.show(target);
    requestAnimationFrame(() => {
      const ctx = this.tooltip.getContext();
      if (ctx) {
        ctx.clearRect(0, 0, previewWidth, previewHeight);

        // Get the layer's cel canvas and draw it scaled
        const cels = animationStore.cels.value;
        const key = `${layerId}:${currentFrameId}`;
        const cel = cels.get(key);
        const layer = layerStore.layers.value.find(l => l.id === layerId);
        const canvasToUse = cel?.canvas ?? layer?.canvas;

        if (canvasToUse) {
          ctx.drawImage(canvasToUse, 0, 0, previewWidth, previewHeight);
        }
      }
    });
  }

  private handleLayerMouseLeave() {
    if (this.tooltip) {
      this.tooltip.hide();
    }
  }

  private addLayer() {
    historyStore.execute(new AddLayerCommand());
  }

  private deleteLayer() {
    const activeId = layerStore.activeLayerId.value;
    if (activeId && layerStore.layers.value.length > 1) {
      historyStore.execute(new RemoveLayerCommand(activeId));
    }
  }

  private moveLayer(direction: "up" | "down") {
    const activeId = layerStore.activeLayerId.value;
    if (activeId) {
      layerStore.reorderLayer(activeId, direction);
    }
  }

  private selectLayer(id: string) {
    layerStore.setActiveLayer(id);
  }

  private toggleVisibility(id: string, e: Event) {
    e.stopPropagation();
    layerStore.toggleVisibility(id);
  }

  private toggleLock(id: string, e: Event) {
    e.stopPropagation();
    layerStore.toggleLock(id);
  }

  private toggleContinuous(id: string, e: Event) {
    e.stopPropagation();
    layerStore.toggleContinuous(id);
  }

  private startRename(id: string, currentName: string, e: Event) {
    e.stopPropagation();
    this.editingLayerId = id;
    this.editingName = currentName;
    // Focus the input after render
    this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector(
        ".layer-name-input"
      ) as HTMLInputElement;
      input?.focus();
      input?.select();
    });
  }

  private handleRenameInput(e: Event) {
    this.editingName = (e.target as HTMLInputElement).value;
  }

  private finishRename() {
    if (this.editingLayerId && this.editingName.trim()) {
      historyStore.execute(
        new UpdateLayerCommand(this.editingLayerId, {
          name: this.editingName.trim(),
        })
      );
    }
    this.editingLayerId = null;
    this.editingName = "";
  }

  private cancelRename() {
    this.editingLayerId = null;
    this.editingName = "";
  }

  private handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      this.finishRename();
    } else if (e.key === "Escape") {
      this.cancelRename();
    }
  }

  private handleLayerContextMenu(e: MouseEvent, layerId: string) {
    e.preventDefault();
    e.stopPropagation();

    const layer = layerStore.layers.value.find((l) => l.id === layerId);
    if (!layer) return;

    // Store for undo/redo
    this.contextMenuOriginalOpacity = layer.opacity;

    const currentOpacity = Math.round((layer.opacity / 255) * 100);

    const items: ContextMenuItem[] = [
      {
        type: "slider",
        label: "Opacity",
        min: 0,
        max: 100,
        value: currentOpacity,
        unit: "%",
        onSliderChange: (value: number) => {
          // Live preview
          layerStore.updateLayer(layerId, {
            opacity: Math.round((value / 100) * 255),
          });
        },
        onSliderCommit: (value: number) => {
          // Add to history for undo/redo
          const newOpacity = Math.round((value / 100) * 255);
          if (newOpacity !== this.contextMenuOriginalOpacity) {
            // First restore original, then execute command to record in history
            layerStore.updateLayer(layerId, {
              opacity: this.contextMenuOriginalOpacity,
            });
            historyStore.execute(
              new UpdateLayerCommand(layerId, { opacity: newOpacity })
            );
          }
        },
      },
      { type: "divider" },
      {
        type: "item",
        label: layer.continuous ? "◯ Make Non-Continuous" : "∞ Make Continuous",
        action: () => {
          layerStore.toggleContinuous(layerId);
        },
      },
      { type: "divider" },
      {
        type: "item",
        label: "📋 Duplicate Layer",
        action: () => {
          historyStore.execute(new DuplicateLayerCommand(layerId));
        },
      },
      {
        type: "item",
        label: "🗑️ Delete Layer",
        disabled: layerStore.layers.value.length <= 1,
        action: () => {
          historyStore.execute(new RemoveLayerCommand(layerId));
        },
      },
    ];

    this.contextMenu.show(e.clientX, e.clientY, items);
  }

  // Drag and drop handlers
  private handleDragStart(id: string, e: DragEvent) {
    this.draggedLayerId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }

  private handleDragEnd() {
    this.draggedLayerId = null;
    this.dragOverLayerId = null;
  }

  private handleDragOver(id: string, e: DragEvent) {
    e.preventDefault();
    if (this.draggedLayerId && this.draggedLayerId !== id) {
      this.dragOverLayerId = id;
    }
  }

  private handleDragLeave() {
    this.dragOverLayerId = null;
  }

  private handleDrop(targetId: string, e: DragEvent) {
    e.preventDefault();
    if (!this.draggedLayerId || this.draggedLayerId === targetId) return;

    const layers = [...layerStore.layers.value];
    const draggedIndex = layers.findIndex((l) => l.id === this.draggedLayerId);
    const targetIndex = layers.findIndex((l) => l.id === targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [draggedLayer] = layers.splice(draggedIndex, 1);
      layers.splice(targetIndex, 0, draggedLayer);
      layerStore.layers.value = layers;
    }

    this.draggedLayerId = null;
    this.dragOverLayerId = null;
  }

  // Opacity scrubbing handlers
  private handleOpacityScrubStart = (layerId: string, currentOpacity: number, e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    this.scrubbingLayerId = layerId;
    this.scrubStartX = e.clientX;
    this.scrubStartOpacity = Math.round((currentOpacity / 255) * 100);
    this.scrubOriginalOpacity = currentOpacity;

    window.addEventListener("mousemove", this.handleOpacityScrubMove);
    window.addEventListener("mouseup", this.handleOpacityScrubEnd);
  };

  private handleOpacityScrubMove = (e: MouseEvent) => {
    if (!this.scrubbingLayerId) return;

    const deltaX = e.clientX - this.scrubStartX;
    const deltaPercent = Math.round(deltaX / 2);
    const newPercent = Math.max(0, Math.min(100, this.scrubStartOpacity + deltaPercent));
    const newOpacity = Math.round((newPercent / 100) * 255);

    layerStore.updateLayer(this.scrubbingLayerId, { opacity: newOpacity });
  };

  private handleOpacityScrubEnd = () => {
    if (this.scrubbingLayerId) {
      const layer = layerStore.layers.value.find((l) => l.id === this.scrubbingLayerId);
      if (layer && layer.opacity !== this.scrubOriginalOpacity) {
        // Restore original value first so command captures correct old state
        layerStore.updateLayer(this.scrubbingLayerId, { opacity: this.scrubOriginalOpacity });
        historyStore.execute(
          new UpdateLayerCommand(this.scrubbingLayerId, { opacity: layer.opacity })
        );
      }
    }
    this.scrubbingLayerId = null;
    window.removeEventListener("mousemove", this.handleOpacityScrubMove);
    window.removeEventListener("mouseup", this.handleOpacityScrubEnd);
  };

  private handleOpacityDoubleClick = (layerId: string, e: MouseEvent) => {
    e.stopPropagation();
    const layer = layerStore.layers.value.find((l) => l.id === layerId);
    if (layer) {
      this.scrubOriginalOpacity = layer.opacity;
      this.editingOpacityLayerId = layerId;
      this.updateComplete.then(() => {
        const input = this.shadowRoot?.querySelector(".opacity-input") as HTMLInputElement;
        input?.focus();
        input?.select();
      });
    }
  };

  private handleOpacityInputKeyDown = (layerId: string, e: KeyboardEvent) => {
    if (e.key === "Enter") {
      this.commitOpacityInput(layerId, e.target as HTMLInputElement);
    } else if (e.key === "Escape") {
      this.editingOpacityLayerId = null;
    }
    e.stopPropagation();
  };

  private handleOpacityInputBlur = (layerId: string, e: FocusEvent) => {
    this.commitOpacityInput(layerId, e.target as HTMLInputElement);
  };

  private commitOpacityInput(layerId: string, input: HTMLInputElement) {
    const value = parseInt(input.value, 10);
    if (!isNaN(value)) {
      const clampedPercent = Math.max(0, Math.min(100, value));
      const newOpacity = Math.round((clampedPercent / 100) * 255);
      if (newOpacity !== this.scrubOriginalOpacity) {
        historyStore.execute(
          new UpdateLayerCommand(layerId, { opacity: newOpacity })
        );
      }
    }
    this.editingOpacityLayerId = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("mousemove", this.handleOpacityScrubMove);
    window.removeEventListener("mouseup", this.handleOpacityScrubEnd);
  }

  render() {
    // Render layers in reverse order (top layer at top of list)
    const layers = [...layerStore.layers.value].reverse();
    const activeLayerId = layerStore.activeLayerId.value;
    const canDelete = layerStore.layers.value.length > 1;

    // Check if we can move up/down
    const activeIndex = layerStore.layers.value.findIndex(
      (l) => l.id === activeLayerId
    );
    const canMoveUp = activeIndex < layerStore.layers.value.length - 1;
    const canMoveDown = activeIndex > 0;

    return html`
      ${!this.noToolbar
        ? html`
            <div class="toolbar">
              <button @click=${this.addLayer} title="Add Layer">+</button>
              <button
                @click=${this.deleteLayer}
                title="Delete Layer"
                ?disabled=${!canDelete}
              >
                -
              </button>
              <button
                @click=${() => this.moveLayer("up")}
                title="Move Up"
                ?disabled=${!canMoveUp}
              >
                ↑
              </button>
              <button
                @click=${() => this.moveLayer("down")}
                title="Move Down"
                ?disabled=${!canMoveDown}
              >
                ↓
              </button>
            </div>
          `
        : ""}
      <div class="layer-list">
        ${layers.map(
          (layer) => html`
            <div
              class="layer-row ${layer.id === activeLayerId
                ? "active"
                : ""} ${this.draggedLayerId === layer.id
                ? "dragging"
                : ""} ${this.dragOverLayerId === layer.id ? "drag-over" : ""}"
              @click=${() => this.selectLayer(layer.id)}
              @contextmenu=${(e: MouseEvent) =>
                this.handleLayerContextMenu(e, layer.id)}
              @mouseenter=${(e: MouseEvent) =>
                this.handleLayerMouseEnter(e, layer.id, layer.name)}
              @mouseleave=${this.handleLayerMouseLeave}
              draggable="true"
              @dragstart=${(e: DragEvent) => this.handleDragStart(layer.id, e)}
              @dragend=${this.handleDragEnd}
              @dragover=${(e: DragEvent) => this.handleDragOver(layer.id, e)}
              @dragleave=${this.handleDragLeave}
              @drop=${(e: DragEvent) => this.handleDrop(layer.id, e)}
            >
              <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
              <button
                class="icon-btn ${!layer.visible ? "hidden-layer" : ""}"
                @click=${(e: Event) => this.toggleVisibility(layer.id, e)}
                title="${layer.visible ? "Hide" : "Show"} layer"
              >
                ${layer.visible ? "👁" : "👁"}
              </button>
              <button
                class="icon-btn ${layer.locked ? "locked-layer" : ""}"
                @click=${(e: Event) => this.toggleLock(layer.id, e)}
                title="${layer.locked ? "Unlock" : "Lock"} layer"
              >
                ${layer.locked ? "🔒" : "🔓"}
              </button>
              <button
                class="icon-btn ${layer.continuous ? "continuous-layer" : "not-continuous"}"
                @click=${(e: Event) => this.toggleContinuous(layer.id, e)}
                title="${layer.continuous ? "Continuous (linked new cels)" : "Non-continuous (empty new cels)"}"
              >
                ∞
              </button>
              ${this.editingLayerId === layer.id
                ? html`
                    <input
                      class="layer-name-input"
                      type="text"
                      .value=${this.editingName}
                      @input=${this.handleRenameInput}
                      @blur=${this.finishRename}
                      @keydown=${this.handleRenameKeydown}
                      @click=${(e: Event) => e.stopPropagation()}
                    />
                  `
                : html`
                    <span
                      class="layer-name"
                      @dblclick=${(e: Event) =>
                        this.startRename(layer.id, layer.name, e)}
                    >
                      ${layer.type === "text" ? html`<span class="layer-type-badge">T</span>` : ""}${layer.name}
                    </span>
                  `}
              <div class="opacity-control" @click=${(e: Event) => e.stopPropagation()}>
                ${this.editingOpacityLayerId === layer.id
                  ? html`
                      <input
                        type="number"
                        class="opacity-input"
                        min="0"
                        max="100"
                        .value=${String(Math.round((layer.opacity / 255) * 100))}
                        @keydown=${(e: KeyboardEvent) => this.handleOpacityInputKeyDown(layer.id, e)}
                        @blur=${(e: FocusEvent) => this.handleOpacityInputBlur(layer.id, e)}
                        @click=${(e: Event) => e.stopPropagation()}
                      />
                    `
                  : html`
                      <span
                        class="opacity-value ${this.scrubbingLayerId === layer.id ? "scrubbing" : ""}"
                        @mousedown=${(e: MouseEvent) => this.handleOpacityScrubStart(layer.id, layer.opacity, e)}
                        @dblclick=${(e: MouseEvent) => this.handleOpacityDoubleClick(layer.id, e)}
                        title="Drag to adjust, double-click to edit"
                      >
                        ${Math.round((layer.opacity / 255) * 100)}%
                      </span>
                    `}
              </div>
            </div>
          `
        )}
      </div>
      <pf-timeline-tooltip></pf-timeline-tooltip>
      <pf-context-menu></pf-context-menu>
    `;
  }
}
