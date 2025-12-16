import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { BaseComponent } from "../../../core/base-component";
import { animationStore } from "../../../stores/animation";
import type { FrameTag } from "../../../types/animation";

const FRAME_WIDTH = 32;

@customElement("pf-timeline-tag-bars")
export class PFTimelineTagBars extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 20px;
      pointer-events: none;
      z-index: 5;
      display: flex;
      align-items: flex-end;
    }

    .tag-bar {
      position: absolute;
      height: 16px;
      min-width: 64px;
      pointer-events: auto;
      cursor: pointer;
      display: flex;
      align-items: center;
      border-radius: 8px;
      transition: transform 0.1s, box-shadow 0.1s;
    }

    .tag-bar:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .tag-bar.active-loop {
      box-shadow: 0 0 0 2px var(--pf-color-accent),
        0 0 8px var(--pf-color-accent);
    }

    .tag-bar.resizing {
      opacity: 0.7;
    }

    .tag-chevron {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.8);
      cursor: pointer;
      flex-shrink: 0;
      transition: transform 0.15s;
    }

    .tag-chevron:hover {
      color: white;
    }

    .tag-bar.collapsed .tag-chevron {
      transform: rotate(-90deg);
    }

    .tag-label {
      flex: 1;
      font-size: 9px;
      font-weight: 500;
      color: white;
      text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
      padding-right: 4px;
    }

    .tag-bar.collapsed .tag-label {
      padding-right: 8px;
    }

    .tag-drag-handle {
      position: absolute;
      width: 8px;
      height: 100%;
      top: 0;
      cursor: ew-resize;
      z-index: 10;
    }

    .tag-drag-handle.left {
      left: 0;
      border-radius: 8px 0 0 8px;
    }

    .tag-drag-handle.right {
      right: 0;
      border-radius: 0 8px 8px 0;
    }

    .tag-drag-handle:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .tag-bar.collapsed {
      min-width: 32px;
      justify-content: center;
    }

    .tag-bar.collapsed .tag-drag-handle {
      display: none;
    }
  `;

  @property({ type: String }) resizingTagId: string | null = null;

  /**
   * Calculate positions for tags, accounting for collapsed tags.
   */
  private calculateTagPositions(
    tags: FrameTag[]
  ): Map<string, { left: number; width: number; visualStartIndex: number }> {
    const positions = new Map<
      string,
      { left: number; width: number; visualStartIndex: number }
    >();

    const sortedTags = [...tags].sort(
      (a, b) => a.startFrameIndex - b.startFrameIndex
    );

    let visualOffset = 0;

    for (const tag of sortedTags) {
      if (tag.collapsed) {
        const left = (tag.startFrameIndex + visualOffset) * FRAME_WIDTH;
        positions.set(tag.id, {
          left,
          width: FRAME_WIDTH,
          visualStartIndex: tag.startFrameIndex + visualOffset,
        });
        visualOffset -= tag.endFrameIndex - tag.startFrameIndex;
      } else {
        const left = (tag.startFrameIndex + visualOffset) * FRAME_WIDTH;
        const width =
          (tag.endFrameIndex - tag.startFrameIndex + 1) * FRAME_WIDTH;
        positions.set(tag.id, {
          left,
          width,
          visualStartIndex: tag.startFrameIndex + visualOffset,
        });
      }
    }

    return positions;
  }

  private handleTagClick(tag: FrameTag, e: MouseEvent) {
    e.stopPropagation();
    const target = e.target as HTMLElement;

    // Don't process if clicking on chevron
    if (target.classList.contains("tag-chevron")) return;

    if (tag.collapsed) {
      animationStore.toggleTagCollapsed(tag.id);
    } else {
      const currentActiveTag = animationStore.activeTagId.value;
      if (currentActiveTag === tag.id) {
        animationStore.setPlaybackMode("all");
      } else {
        animationStore.setPlaybackMode("tag", tag.id);
      }
    }
  }

  private handleChevronClick(tagId: string, e: MouseEvent) {
    e.stopPropagation();
    animationStore.toggleTagCollapsed(tagId);
  }

  private handleContextMenu(tagId: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent("tag-context-menu", {
      detail: { tagId, anchor: e.currentTarget, event: e },
      bubbles: true,
      composed: true,
    }));
  }

  private handleMouseEnter(tag: FrameTag, e: MouseEvent) {
    if (!tag.collapsed) return;
    this.dispatchEvent(new CustomEvent("tag-hover-start", {
      detail: { tagId: tag.id, target: e.currentTarget },
      bubbles: true,
      composed: true,
    }));
  }

  private handleMouseLeave() {
    this.dispatchEvent(new CustomEvent("tag-hover-end", {
      bubbles: true,
      composed: true,
    }));
  }

  private handleResizeStart(tagId: string, edge: "left" | "right", e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent("tag-resize-start", {
      detail: { tagId, edge },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const tags = animationStore.tags.value;
    const activeTagId = animationStore.activeTagId.value;
    const positions = this.calculateTagPositions(tags);

    return html`
      ${tags.map((tag) => {
        const isActiveLoop = tag.id === activeTagId;
        const isResizing = this.resizingTagId === tag.id;
        const frameCount = tag.endFrameIndex - tag.startFrameIndex + 1;

        const pos = positions.get(tag.id);
        const left = pos?.left ?? tag.startFrameIndex * FRAME_WIDTH;
        const width = tag.collapsed ? FRAME_WIDTH : frameCount * FRAME_WIDTH;
        const label = tag.collapsed ? `${tag.name} (${frameCount})` : tag.name;

        return html`
          <div
            class="tag-bar ${isActiveLoop ? "active-loop" : ""} ${isResizing ? "resizing" : ""} ${tag.collapsed ? "collapsed" : ""}"
            style="left: ${left}px; width: ${width}px; background-color: ${tag.color};"
            @click=${(e: MouseEvent) => this.handleTagClick(tag, e)}
            @contextmenu=${(e: MouseEvent) => this.handleContextMenu(tag.id, e)}
            @mouseenter=${(e: MouseEvent) => this.handleMouseEnter(tag, e)}
            @mouseleave=${this.handleMouseLeave}
            title="${tag.name}${isActiveLoop ? " (looping)" : ""}${tag.collapsed ? " - Click to expand" : ""}"
          >
            <span
              class="tag-chevron"
              @click=${(e: MouseEvent) => this.handleChevronClick(tag.id, e)}
              title="${tag.collapsed ? "Expand" : "Collapse"}"
            >
              ▼
            </span>
            <span class="tag-label">${label}</span>
            ${!tag.collapsed ? html`
              <div
                class="tag-drag-handle left"
                @mousedown=${(e: MouseEvent) => this.handleResizeStart(tag.id, "left", e)}
              ></div>
              <div
                class="tag-drag-handle right"
                @mousedown=${(e: MouseEvent) => this.handleResizeStart(tag.id, "right", e)}
              ></div>
            ` : ""}
          </div>
        `;
      })}
    `;
  }
}
