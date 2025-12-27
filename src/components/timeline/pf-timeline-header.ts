import { html, css } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { animationStore } from "../../stores/animation";
import { projectStore } from "../../stores/project";
import { historyStore } from "../../stores/history";
import {
  SetFrameDurationCommand,
  AddFrameCommand,
  DeleteFrameCommand,
} from "../../commands/animation-commands";
import { compositeFrame } from "../../utils/canvas-utils";
import "./pf-timeline-tooltip";
import "./pf-tag-preview";
import "@pixel-forge/ui";
import "./timeline-header/pf-timeline-tag-bars";
import "./timeline-header/pf-timeline-frame-cells";
import "./timeline-header/pf-timeline-resize-preview";
import type { PFTimelineTooltip } from "./pf-timeline-tooltip";
import type { PFTagPreview } from "./pf-tag-preview";
import type { PFContextMenu, ContextMenuItem } from "@pixel-forge/ui";
import type { PFTimelineResizePreview } from "./timeline-header/pf-timeline-resize-preview";

const DURATION_UNIT_KEY = "pf-timeline-duration-unit";
const TAG_COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e91e63",
  "#00bcd4",
  "#ff5722",
  "#607d8b",
  "#795548",
  "#8bc34a",
];

@customElement("pf-timeline-header")
export class PFTimelineHeader extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      align-items: flex-end;
      height: 48px;
      background-color: var(--pf-color-bg-surface);
      border-bottom: 1px solid var(--pf-color-border);
      position: relative;
    }
  `;

  @state() private durationUnit: "ms" | "fps" = "ms";

  // Tag resize state
  @state() private resizingTagId: string | null = null;
  @state() private resizingEdge: "left" | "right" | null = null;
  @state() private resizePreviewIndex: number | null = null;

  // Pending tag creation state
  @state() private pendingTagName: string = "";
  @state() private pendingTagColor: string = "";
  @state() private pendingTagFrameIndex: number = -1;

  private menuAnchorElement: HTMLElement | null = null;

  @query("pf-timeline-tooltip") private tooltip!: PFTimelineTooltip;
  @query("pf-context-menu") private contextMenu!: PFContextMenu;
  @query("pf-tag-preview") private tagPreview!: PFTagPreview;
  @query("pf-timeline-resize-preview") private resizePreview!: PFTimelineResizePreview;

  connectedCallback() {
    super.connectedCallback();
    const saved = localStorage.getItem(DURATION_UNIT_KEY);
    if (saved === "fps" || saved === "ms") {
      this.durationUnit = saved;
    }
    this.updateTagsCollapsedClass();
  }

  protected updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    this.updateTagsCollapsedClass();
  }

  private updateTagsCollapsedClass() {
    const tagsExpanded = animationStore.tagsExpanded.value;
    this.classList.toggle("tags-collapsed", !tagsExpanded);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("mousemove", this.handleTagResizeMove);
    window.removeEventListener("mouseup", this.handleTagResizeEnd);
  }

  /** Set duration unit - called externally from playback controls */
  setDurationUnit(unit: "ms" | "fps") {
    this.durationUnit = unit;
    localStorage.setItem(DURATION_UNIT_KEY, unit);
  }

  // ==========================================
  // Frame hover handlers
  // ==========================================

  private handleFrameHoverStart(e: CustomEvent) {
    const { frameId, frameIndex, target } = e.detail;
    const frame = animationStore.frames.value.find((f) => f.id === frameId);
    if (!frame || !this.tooltip) return;

    const durationText =
      this.durationUnit === "fps"
        ? `${Math.round(1000 / frame.duration)}fps`
        : `${frame.duration}ms`;
    const tags = animationStore.getTagsForFrame(frameIndex);
    const tagText = tags.length > 0 ? tags.map((t) => t.name).join(", ") : "";

    this.tooltip.primaryText = `Frame ${frameIndex + 1} · ${durationText}`;
    this.tooltip.secondaryText = tagText;
    this.tooltip.canvasWidth = projectStore.width.value;
    this.tooltip.canvasHeight = projectStore.height.value;

    this.tooltip.show(target);
    requestAnimationFrame(() => {
      const ctx = this.tooltip.getContext();
      if (ctx) {
        compositeFrame(frameId, ctx);
      }
    });
  }

  private handleFrameHoverEnd() {
    if (this.tooltip) {
      this.tooltip.hide();
    }
  }

  // ==========================================
  // Frame context menu
  // ==========================================

  private handleFrameContextMenu(e: CustomEvent) {
    const { frameId, frameIndex, anchor } = e.detail;
    const frames = animationStore.frames.value;
    const frame = frames[frameIndex];
    if (!frame) return;

    this.menuAnchorElement = anchor;
    const existingTags = animationStore.getTagsForFrame(frameIndex);
    const originalDuration = frame.duration;

    const items: ContextMenuItem[] = [
      {
        type: "slider",
        label: this.durationUnit === "fps" ? "Frame Rate (FPS)" : "Duration",
        min: this.durationUnit === "fps" ? 1 : 10,
        max: this.durationUnit === "fps" ? 60 : 2000,
        step: this.durationUnit === "fps" ? 1 : 10,
        value:
          this.durationUnit === "fps"
            ? Math.round(1000 / frame.duration)
            : frame.duration,
        onSliderChange: (value: number) => {
          const durationMs =
            this.durationUnit === "fps" ? Math.round(1000 / value) : value;
          animationStore.setFrameDuration(frameId, durationMs);
        },
        onSliderCommit: (value: number) => {
          const durationMs =
            this.durationUnit === "fps" ? Math.round(1000 / value) : value;
          if (durationMs !== originalDuration) {
            historyStore.execute(
              new SetFrameDurationCommand(frameId, durationMs, originalDuration)
            );
          }
        },
      },
      { type: "divider" },
      {
        type: "item",
        label: "📋 Duplicate Frame",
        action: () => {
          historyStore.execute(new AddFrameCommand(true, frameId));
        },
      },
      {
        type: "item",
        label: "🗑 Delete Frame",
        disabled: frames.length <= 1,
        action: () => {
          historyStore.execute(new DeleteFrameCommand(frameId));
        },
      },
      { type: "divider" },
    ];

    if (existingTags.length > 0) {
      const tag = existingTags[0];
      items.push(
        {
          type: "item",
          label: `✏️ Edit Tag "${tag.name}"`,
          keepOpen: true,
          action: () => {
            setTimeout(() => this.showTagEditMenu(tag.id), 50);
          },
        },
        {
          type: "item",
          label: "🏷️ Remove from Tag",
          action: () => {
            if (tag.startFrameIndex === tag.endFrameIndex) {
              animationStore.removeFrameTag(tag.id);
            } else if (frameIndex === tag.startFrameIndex) {
              animationStore.updateFrameTag(tag.id, {
                startFrameIndex: tag.startFrameIndex + 1,
              });
            } else if (frameIndex === tag.endFrameIndex) {
              animationStore.updateFrameTag(tag.id, {
                endFrameIndex: tag.endFrameIndex - 1,
              });
            }
          },
        }
      );
    } else {
      items.push({
        type: "item",
        label: "🏷️ Add Tag",
        keepOpen: true,
        action: () => {
          setTimeout(() => this.showAddTagMenu(frameIndex), 50);
        },
      });
    }

    this.contextMenu.show(anchor, items);
  }

  // ==========================================
  // Tag context menu
  // ==========================================

  private handleTagContextMenu(e: CustomEvent) {
    const { tagId, anchor } = e.detail;
    const tag = animationStore.tags.value.find((t) => t.id === tagId);
    if (!tag) return;

    const isActiveLoop = animationStore.activeTagId.value === tagId;
    this.menuAnchorElement = anchor;
    const totalFrames = animationStore.frames.value.length;

    const items: ContextMenuItem[] = [
      {
        type: "input",
        label: "Tag Name",
        inputValue: tag.name,
        placeholder: "Enter tag name",
        onInputSubmit: (name: string) => {
          if (name.trim()) {
            animationStore.updateFrameTag(tagId, { name: name.trim() });
          }
        },
      },
      {
        type: "color-picker",
        label: "Tag Color",
        colors: TAG_COLORS,
        selectedColor: tag.color,
        onColorSelect: (color: string) => {
          animationStore.updateFrameTag(tagId, { color });
        },
      },
      { type: "divider" },
      {
        type: "input",
        inputType: "number",
        label: "Start Frame",
        inputValue: String(tag.startFrameIndex + 1),
        inputMin: 1,
        inputMax: totalFrames,
        onNumberChange: (value: number) => {
          const newStart = value - 1;
          if (newStart >= 0 && newStart <= tag.endFrameIndex) {
            animationStore.updateFrameTag(tagId, { startFrameIndex: newStart });
          }
        },
      },
      {
        type: "input",
        inputType: "number",
        label: "End Frame",
        inputValue: String(tag.endFrameIndex + 1),
        inputMin: 1,
        inputMax: totalFrames,
        onNumberChange: (value: number) => {
          const newEnd = value - 1;
          if (newEnd >= tag.startFrameIndex && newEnd < totalFrames) {
            animationStore.updateFrameTag(tagId, { endFrameIndex: newEnd });
          }
        },
      },
      { type: "divider" },
      {
        type: "item",
        label: isActiveLoop ? "⏹ Stop Loop" : "🔁 Loop This Tag",
        action: () => {
          if (isActiveLoop) {
            animationStore.setPlaybackMode("all");
          } else {
            animationStore.setPlaybackMode("tag", tagId);
          }
        },
      },
      { type: "divider" },
      {
        type: "item",
        label: "🗑 Delete Tag",
        action: () => animationStore.removeFrameTag(tagId),
      },
    ];

    this.contextMenu.show(anchor, items);
  }

  private showTagEditMenu(tagId: string) {
    const tag = animationStore.tags.value.find((t) => t.id === tagId);
    if (!tag || !this.menuAnchorElement) return;

    const items: ContextMenuItem[] = [
      {
        type: "input",
        label: "Tag Name",
        inputValue: tag.name,
        placeholder: "Enter tag name",
        onInputSubmit: (name: string) => {
          if (name.trim()) {
            animationStore.updateFrameTag(tagId, { name: name.trim() });
          }
        },
      },
      {
        type: "color-picker",
        label: "Tag Color",
        colors: TAG_COLORS,
        selectedColor: tag.color,
        onColorSelect: (color: string) => {
          animationStore.updateFrameTag(tagId, { color });
        },
      },
      { type: "divider" },
      {
        type: "item",
        label: "🗑 Delete Tag",
        action: () => animationStore.removeFrameTag(tagId),
      },
    ];

    this.contextMenu.show(this.menuAnchorElement, items);
  }

  private showAddTagMenu(frameIndex: number) {
    if (!this.menuAnchorElement) return;

    this.pendingTagName = "New Tag";
    this.pendingTagColor = TAG_COLORS[0];
    this.pendingTagFrameIndex = frameIndex;

    const items: ContextMenuItem[] = [
      {
        type: "input",
        label: "Tag Name",
        inputValue: "New Tag",
        placeholder: "Enter tag name",
        onInputChange: (name: string) => {
          this.pendingTagName = name;
        },
      },
      {
        type: "color-picker",
        label: "Tag Color",
        colors: TAG_COLORS,
        selectedColor: TAG_COLORS[0],
        onColorSelect: (color: string) => {
          this.pendingTagColor = color;
        },
      },
      { type: "divider" },
      {
        type: "item",
        label: "✓ Create Tag",
        action: () => {
          const name = this.pendingTagName.trim() || "New Tag";
          animationStore.addFrameTag(
            name,
            this.pendingTagColor,
            this.pendingTagFrameIndex,
            this.pendingTagFrameIndex
          );
          this.pendingTagName = "";
          this.pendingTagColor = "";
          this.pendingTagFrameIndex = -1;
        },
      },
    ];

    this.contextMenu.show(this.menuAnchorElement, items);
  }

  // ==========================================
  // Tag hover handlers (for collapsed tags)
  // ==========================================

  private handleTagHoverStart(e: CustomEvent) {
    const { tagId, target } = e.detail;
    const rect = (target as HTMLElement).getBoundingClientRect();

    if (this.tagPreview) {
      this.tagPreview.showWithDelay(tagId, rect.left + rect.width / 2, rect.top);
    }
  }

  private handleTagHoverEnd() {
    if (this.tagPreview) {
      this.tagPreview.hide();
    }
  }

  // ==========================================
  // Tag resize handlers
  // ==========================================

  private handleTagResizeStart(e: CustomEvent) {
    const { tagId, edge } = e.detail;
    this.resizingTagId = tagId;
    this.resizingEdge = edge;

    window.addEventListener("mousemove", this.handleTagResizeMove);
    window.addEventListener("mouseup", this.handleTagResizeEnd);
  }

  private handleTagResizeMove = (e: MouseEvent) => {
    if (!this.resizingTagId || !this.resizingEdge) return;

    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frameWidth = 32;
    const frameIndex = Math.floor(x / frameWidth);

    const maxFrameIndex = animationStore.frames.value.length - 1;
    const clampedIndex = Math.max(0, Math.min(maxFrameIndex, frameIndex));

    this.resizePreviewIndex = clampedIndex;

    const tag = animationStore.tags.value.find((t) => t.id === this.resizingTagId);
    if (tag) {
      const previewStart =
        this.resizingEdge === "left"
          ? Math.min(clampedIndex, tag.endFrameIndex)
          : tag.startFrameIndex;
      const previewEnd =
        this.resizingEdge === "right"
          ? Math.max(clampedIndex, tag.startFrameIndex)
          : tag.endFrameIndex;
      animationStore.setTagResizePreview(this.resizingTagId, previewStart, previewEnd);

      // Update resize preview component
      if (this.resizePreview) {
        this.resizePreview.tagId = this.resizingTagId;
        this.resizePreview.edge = this.resizingEdge;
        this.resizePreview.previewIndex = clampedIndex;
        this.resizePreview.headerRect = rect;
      }
    }
  };

  private handleTagResizeEnd = () => {
    if (this.resizingTagId && this.resizingEdge && this.resizePreviewIndex !== null) {
      const tag = animationStore.tags.value.find((t) => t.id === this.resizingTagId);
      if (tag) {
        if (this.resizingEdge === "left") {
          const newStart = Math.min(this.resizePreviewIndex, tag.endFrameIndex);
          if (newStart !== tag.startFrameIndex) {
            animationStore.updateFrameTag(this.resizingTagId, {
              startFrameIndex: newStart,
            });
          }
        } else {
          const newEnd = Math.max(this.resizePreviewIndex, tag.startFrameIndex);
          if (newEnd !== tag.endFrameIndex) {
            animationStore.updateFrameTag(this.resizingTagId, {
              endFrameIndex: newEnd,
            });
          }
        }
      }
    }

    animationStore.setTagResizePreview(null);
    this.resizingTagId = null;
    this.resizingEdge = null;
    this.resizePreviewIndex = null;

    if (this.resizePreview) {
      this.resizePreview.tagId = null;
      this.resizePreview.edge = null;
      this.resizePreview.previewIndex = null;
      this.resizePreview.hide();
    }

    window.removeEventListener("mousemove", this.handleTagResizeMove);
    window.removeEventListener("mouseup", this.handleTagResizeEnd);
  };

  render() {
    return html`
      <pf-timeline-tag-bars
        .resizingTagId=${this.resizingTagId}
        @tag-context-menu=${this.handleTagContextMenu}
        @tag-hover-start=${this.handleTagHoverStart}
        @tag-hover-end=${this.handleTagHoverEnd}
        @tag-resize-start=${this.handleTagResizeStart}
      ></pf-timeline-tag-bars>

      <pf-timeline-frame-cells
        @frame-context-menu=${this.handleFrameContextMenu}
        @frame-hover-start=${this.handleFrameHoverStart}
        @frame-hover-end=${this.handleFrameHoverEnd}
      ></pf-timeline-frame-cells>

      <pf-timeline-resize-preview></pf-timeline-resize-preview>

      <pf-timeline-tooltip></pf-timeline-tooltip>
      <pf-context-menu></pf-context-menu>
      <pf-tag-preview></pf-tag-preview>
    `;
  }
}
