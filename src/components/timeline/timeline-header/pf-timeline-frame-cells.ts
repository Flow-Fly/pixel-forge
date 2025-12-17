import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../../core/base-component";
import { animationStore } from "../../../stores/animation";
import { historyStore } from "../../../stores/history";
import { ReorderFrameCommand } from "../../../commands/animation-commands";
import type { FrameTag } from "../../../types/animation";

@customElement("pf-timeline-frame-cells")
export class PFTimelineFrameCells extends BaseComponent {
  static styles = css`
    :host {
      display: contents;
    }

    .frame-cell {
      width: 32px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: var(--pf-color-text-muted);
      border-right: 1px solid var(--pf-color-border);
      cursor: pointer;
      position: relative;
      box-sizing: border-box;
      flex-shrink: 0;
    }

    .frame-cell:hover {
      background-color: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
    }

    .frame-cell.active {
      background-color: var(--pf-color-primary-muted);
      color: var(--pf-color-primary);
    }

    .frame-cell.active .frame-number {
      font-weight: bold;
    }

    .frame-number {
      font-size: 11px;
    }

    /* Tag column tinting */
    .frame-cell.tag-tinted {
      position: relative;
    }

    .frame-cell.tag-tinted::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.15;
      background-color: var(--tag-tint-color);
    }

    /* Drag and drop styles */
    .frame-cell.dragging {
      opacity: 0.5;
    }

    .frame-cell.drag-over-left {
      border-left: 2px solid var(--pf-color-accent);
    }

    .frame-cell.drag-over-right {
      border-right: 2px solid var(--pf-color-accent);
    }
  `;

  @state() private draggedFrameIndex: number | null = null;
  @state() private dragOverFrameIndex: number | null = null;

  private selectFrame(frameId: string) {
    // Clear cel selection when clicking a frame header
    animationStore.clearCelSelection();
    animationStore.goToFrame(frameId);
  }

  private handleContextMenu(e: MouseEvent, frameId: string, frameIndex: number) {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent("frame-context-menu", {
      detail: { frameId, frameIndex, anchor: e.currentTarget, event: e },
      bubbles: true,
      composed: true,
    }));
  }

  private handleMouseEnter(e: MouseEvent, frameId: string, frameIndex: number) {
    this.dispatchEvent(new CustomEvent("frame-hover-start", {
      detail: { frameId, frameIndex, target: e.currentTarget },
      bubbles: true,
      composed: true,
    }));
  }

  private handleMouseLeave() {
    this.dispatchEvent(new CustomEvent("frame-hover-end", {
      bubbles: true,
      composed: true,
    }));
  }

  // Drag-drop handlers
  private handleDragStart(index: number, e: DragEvent) {
    this.draggedFrameIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    }
    // Hide tooltip during drag
    this.dispatchEvent(new CustomEvent("frame-hover-end", {
      bubbles: true,
      composed: true,
    }));
  }

  private handleDragEnd() {
    this.draggedFrameIndex = null;
    this.dragOverFrameIndex = null;
  }

  private handleDragOver(index: number, e: DragEvent) {
    e.preventDefault();
    if (this.draggedFrameIndex !== null && this.draggedFrameIndex !== index) {
      this.dragOverFrameIndex = index;
    }
  }

  private handleDragLeave() {
    this.dragOverFrameIndex = null;
  }

  private handleDrop(targetIndex: number, e: DragEvent) {
    e.preventDefault();
    if (
      this.draggedFrameIndex === null ||
      this.draggedFrameIndex === targetIndex
    )
      return;

    historyStore.execute(
      new ReorderFrameCommand(this.draggedFrameIndex, targetIndex)
    );

    this.draggedFrameIndex = null;
    this.dragOverFrameIndex = null;
  }

  private getDragOverClass(index: number): string {
    if (this.dragOverFrameIndex === null || this.draggedFrameIndex === null)
      return "";
    if (this.dragOverFrameIndex !== index) return "";

    return this.draggedFrameIndex < index
      ? "drag-over-right"
      : "drag-over-left";
  }

  /**
   * Check if a frame index is hidden (inside a collapsed tag but not the first frame).
   */
  private isFrameHidden(frameIndex: number, tags: FrameTag[]): boolean {
    for (const tag of tags) {
      if (
        tag.collapsed &&
        frameIndex > tag.startFrameIndex &&
        frameIndex <= tag.endFrameIndex
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the tag color for a frame index (for column tinting).
   */
  private getTagColorForFrame(
    frameIndex: number,
    tags: FrameTag[]
  ): string | null {
    for (const tag of tags) {
      if (
        frameIndex >= tag.startFrameIndex &&
        frameIndex <= tag.endFrameIndex
      ) {
        return tag.color;
      }
    }
    return null;
  }

  render() {
    const frames = animationStore.frames.value;
    const currentFrameId = animationStore.currentFrameId.value;
    const tags = animationStore.tags.value;

    return html`
      ${frames.map((frame, index) => {
        // Skip frames that are hidden (inside collapsed tags)
        if (this.isFrameHidden(index, tags)) {
          return "";
        }

        const isDragging = this.draggedFrameIndex === index;
        const dragOverClass = this.getDragOverClass(index);
        const tagColor = this.getTagColorForFrame(index, tags);
        const hasTint = tagColor !== null;

        return html`
          <div
            class="frame-cell ${frame.id === currentFrameId ? "active" : ""} ${isDragging ? "dragging" : ""} ${dragOverClass} ${hasTint ? "tag-tinted" : ""}"
            style="${hasTint ? `--tag-tint-color: ${tagColor}` : ""}"
            @click=${() => this.selectFrame(frame.id)}
            @contextmenu=${(e: MouseEvent) => this.handleContextMenu(e, frame.id, index)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(e, frame.id, index)}
            @mouseleave=${this.handleMouseLeave}
            draggable="true"
            @dragstart=${(e: DragEvent) => this.handleDragStart(index, e)}
            @dragend=${this.handleDragEnd}
            @dragover=${(e: DragEvent) => this.handleDragOver(index, e)}
            @dragleave=${this.handleDragLeave}
            @drop=${(e: DragEvent) => this.handleDrop(index, e)}
          >
            <span class="frame-number">${index + 1}</span>
          </div>
        `;
      })}
    `;
  }
}
