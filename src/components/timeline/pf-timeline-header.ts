import { html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { defaultProjectContext } from '../../stores/project-context';
import {
  SetFrameDurationCommand,
  AddFrameCommand,
  DeleteFrameCommand,
} from '../../commands/animation-commands';
import { compositeFrame } from '../../utils/canvas-utils';
import './pf-timeline-tooltip';
import './pf-tag-preview';
import '../ui/pf-context-menu';
import './timeline-header/pf-timeline-tag-bars';
import './timeline-header/pf-timeline-frame-cells';
import './timeline-header/pf-timeline-resize-preview';
import type { PFTimelineTooltip } from './pf-timeline-tooltip';
import type { PFTagPreview } from './pf-tag-preview';
import type { PFContextMenu, ContextMenuItem } from '../ui/pf-context-menu';
import type { PFTimelineResizePreview } from './timeline-header/pf-timeline-resize-preview';

const DURATION_UNIT_KEY = 'pf-timeline-duration-unit';
const TAG_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e91e63',
  '#00bcd4',
  '#ff5722',
  '#607d8b',
  '#795548',
  '#8bc34a',
];

@customElement('pf-timeline-header')
export class PFTimelineHeader extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      align-items: flex-end;
      height: 48px;
      background-color: rgba(255, 255, 255, 0.018);
      border-bottom: 1px solid var(--pf-color-border);
      position: relative;
      text-transform: uppercase;
      letter-spacing: 0;
    }
  `;

  @state() private durationUnit: 'ms' | 'fps' = 'ms';

  // Tag resize state
  @state() private resizingTagId: string | null = null;
  @state() private resizingEdge: 'left' | 'right' | null = null;
  @state() private resizePreviewIndex: number | null = null;

  // Pending tag creation state
  @state() private pendingTagName: string = '';
  @state() private pendingTagColor: string = '';
  @state() private pendingTagFrameIndex: number = -1;

  private menuAnchorElement: HTMLElement | null = null;
  private context = defaultProjectContext;
  private resizeContext = defaultProjectContext;

  @query('pf-timeline-tooltip') private tooltip!: PFTimelineTooltip;
  @query('pf-context-menu') private contextMenu!: PFContextMenu;
  @query('pf-tag-preview') private tagPreview!: PFTagPreview;
  @query('pf-timeline-resize-preview') private resizePreview!: PFTimelineResizePreview;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.requestUpdate();
    });
    const saved = localStorage.getItem(DURATION_UNIT_KEY);
    if (saved === 'fps' || saved === 'ms') {
      this.durationUnit = saved;
    }
    this.updateTagsCollapsedClass();
  }

  protected updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    this.updateTagsCollapsedClass();
  }

  private updateTagsCollapsedClass() {
    const tagsExpanded = this.context.animation.tagsExpanded.value;
    this.classList.toggle('tags-collapsed', !tagsExpanded);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousemove', this.handleTagResizeMove);
    window.removeEventListener('mouseup', this.handleTagResizeEnd);
  }

  /** Set duration unit - called externally from playback controls */
  setDurationUnit(unit: 'ms' | 'fps') {
    this.durationUnit = unit;
    localStorage.setItem(DURATION_UNIT_KEY, unit);
  }

  // ==========================================
  // Frame hover handlers
  // ==========================================

  private handleFrameHoverStart(e: CustomEvent) {
    const { frameId, frameIndex, target } = e.detail;
    const context = this.context;
    const frame = context.animation.frames.value.find((f) => f.id === frameId);
    if (!frame || !this.tooltip) return;

    const durationText =
      this.durationUnit === 'fps'
        ? `${Math.round(1000 / frame.duration)}fps`
        : `${frame.duration}ms`;
    const tags = context.animation.getTagsForFrame(frameIndex);
    const tagText = tags.length > 0 ? tags.map((t) => t.name).join(', ') : '';

    this.tooltip.primaryText = `Frame ${frameIndex + 1} · ${durationText}`;
    this.tooltip.secondaryText = tagText;
    this.tooltip.canvasWidth = context.project.width.value;
    this.tooltip.canvasHeight = context.project.height.value;

    this.tooltip.show(target);
    requestAnimationFrame(() => {
      const ctx = this.tooltip.getContext();
      if (ctx) {
        compositeFrame(frameId, ctx, { context });
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
    const context = this.context;
    const animation = context.animation;
    const frames = animation.frames.value;
    const frame = frames[frameIndex];
    if (!frame) return;

    this.menuAnchorElement = anchor;
    const existingTags = animation.getTagsForFrame(frameIndex);
    const originalDuration = frame.duration;

    const items: ContextMenuItem[] = [
      {
        type: 'slider',
        label: this.durationUnit === 'fps' ? 'Frame Rate (FPS)' : 'Duration',
        min: this.durationUnit === 'fps' ? 1 : 10,
        max: this.durationUnit === 'fps' ? 60 : 2000,
        step: this.durationUnit === 'fps' ? 1 : 10,
        value: this.durationUnit === 'fps' ? Math.round(1000 / frame.duration) : frame.duration,
        onSliderChange: (value: number) => {
          const durationMs = this.durationUnit === 'fps' ? Math.round(1000 / value) : value;
          animation.setFrameDuration(frameId, durationMs);
        },
        onSliderCommit: (value: number) => {
          const durationMs = this.durationUnit === 'fps' ? Math.round(1000 / value) : value;
          if (durationMs !== originalDuration) {
            void context.history.execute(
              new SetFrameDurationCommand(frameId, durationMs, originalDuration, context)
            );
          }
        },
      },
      { type: 'divider' },
      {
        type: 'item',
        label: '📋 Duplicate Frame',
        action: () => {
          void context.history.execute(new AddFrameCommand(true, frameId, context));
        },
      },
      {
        type: 'item',
        label: '🗑 Delete Frame',
        disabled: frames.length <= 1,
        action: () => {
          void context.history.execute(new DeleteFrameCommand(frameId, context));
        },
      },
      { type: 'divider' },
    ];

    if (existingTags.length > 0) {
      const tag = existingTags[0];
      items.push(
        {
          type: 'item',
          label: `✏️ Edit Tag "${tag.name}"`,
          keepOpen: true,
          action: () => this.showTagEditMenu(tag.id, context),
        },
        {
          type: 'item',
          label: '🏷️ Remove from Tag',
          action: () => {
            if (tag.startFrameIndex === tag.endFrameIndex) {
              animation.removeFrameTag(tag.id);
            } else if (frameIndex === tag.startFrameIndex) {
              animation.updateFrameTag(tag.id, {
                startFrameIndex: tag.startFrameIndex + 1,
              });
            } else if (frameIndex === tag.endFrameIndex) {
              animation.updateFrameTag(tag.id, {
                endFrameIndex: tag.endFrameIndex - 1,
              });
            }
          },
        }
      );
    } else {
      items.push({
        type: 'item',
        label: '🏷️ Add Tag',
        keepOpen: true,
        action: () => this.showAddTagMenu(frameIndex, context),
      });
    }

    this.contextMenu.show(anchor, items);
  }

  // ==========================================
  // Tag context menu
  // ==========================================

  private handleTagContextMenu(e: CustomEvent) {
    const { tagId, anchor } = e.detail;
    const context = this.context;
    const animation = context.animation;
    const tag = animation.tags.value.find((t) => t.id === tagId);
    if (!tag) return;

    const isActiveLoop = animation.activeTagId.value === tagId;
    this.menuAnchorElement = anchor;
    const totalFrames = animation.frames.value.length;

    const items: ContextMenuItem[] = [
      {
        type: 'input',
        label: 'Tag Name',
        inputValue: tag.name,
        placeholder: 'Enter tag name',
        onInputSubmit: (name: string) => {
          if (name.trim()) {
            animation.updateFrameTag(tagId, { name: name.trim() });
          }
        },
      },
      {
        type: 'color-picker',
        label: 'Tag Color',
        colors: TAG_COLORS,
        selectedColor: tag.color,
        onColorSelect: (color: string) => {
          animation.updateFrameTag(tagId, { color });
        },
      },
      { type: 'divider' },
      {
        type: 'input',
        inputType: 'number',
        label: 'Start Frame',
        inputValue: String(tag.startFrameIndex + 1),
        inputMin: 1,
        inputMax: totalFrames,
        onNumberChange: (value: number) => {
          const newStart = value - 1;
          if (newStart >= 0 && newStart <= tag.endFrameIndex) {
            animation.updateFrameTag(tagId, { startFrameIndex: newStart });
          }
        },
      },
      {
        type: 'input',
        inputType: 'number',
        label: 'End Frame',
        inputValue: String(tag.endFrameIndex + 1),
        inputMin: 1,
        inputMax: totalFrames,
        onNumberChange: (value: number) => {
          const newEnd = value - 1;
          if (newEnd >= tag.startFrameIndex && newEnd < totalFrames) {
            animation.updateFrameTag(tagId, { endFrameIndex: newEnd });
          }
        },
      },
      { type: 'divider' },
      {
        type: 'item',
        label: isActiveLoop ? '⏹ Stop Loop' : '🔁 Loop This Tag',
        action: () => {
          if (isActiveLoop) {
            animation.setPlaybackMode('all');
          } else {
            animation.setPlaybackMode('tag', tagId);
          }
        },
      },
      { type: 'divider' },
      {
        type: 'item',
        label: '🗑 Delete Tag',
        action: () => animation.removeFrameTag(tagId),
      },
    ];

    this.contextMenu.show(anchor, items);
  }

  private showTagEditMenu(tagId: string, context = this.context) {
    const animation = context.animation;
    const tag = animation.tags.value.find((t) => t.id === tagId);
    if (!tag || !this.menuAnchorElement) return;

    const items: ContextMenuItem[] = [
      {
        type: 'input',
        label: 'Tag Name',
        inputValue: tag.name,
        placeholder: 'Enter tag name',
        onInputSubmit: (name: string) => {
          if (name.trim()) {
            animation.updateFrameTag(tagId, { name: name.trim() });
          }
        },
      },
      {
        type: 'color-picker',
        label: 'Tag Color',
        colors: TAG_COLORS,
        selectedColor: tag.color,
        onColorSelect: (color: string) => {
          animation.updateFrameTag(tagId, { color });
        },
      },
      { type: 'divider' },
      {
        type: 'item',
        label: '🗑 Delete Tag',
        action: () => animation.removeFrameTag(tagId),
      },
    ];

    this.contextMenu.show(this.menuAnchorElement, items);
  }

  private showAddTagMenu(frameIndex: number, context = this.context) {
    if (!this.menuAnchorElement) return;
    const animation = context.animation;

    this.pendingTagName = 'New Tag';
    this.pendingTagColor = TAG_COLORS[0];
    this.pendingTagFrameIndex = frameIndex;

    const items: ContextMenuItem[] = [
      {
        type: 'input',
        label: 'Tag Name',
        inputValue: 'New Tag',
        placeholder: 'Enter tag name',
        onInputChange: (name: string) => {
          this.pendingTagName = name;
        },
      },
      {
        type: 'color-picker',
        label: 'Tag Color',
        colors: TAG_COLORS,
        selectedColor: TAG_COLORS[0],
        onColorSelect: (color: string) => {
          this.pendingTagColor = color;
        },
      },
      { type: 'divider' },
      {
        type: 'item',
        label: '✓ Create Tag',
        action: () => {
          const name = this.pendingTagName.trim() || 'New Tag';
          animation.addFrameTag(
            name,
            this.pendingTagColor,
            this.pendingTagFrameIndex,
            this.pendingTagFrameIndex
          );
          this.pendingTagName = '';
          this.pendingTagColor = '';
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
    this.resizeContext = this.context;

    window.addEventListener('mousemove', this.handleTagResizeMove);
    window.addEventListener('mouseup', this.handleTagResizeEnd);
  }

  private handleTagResizeMove = (e: MouseEvent) => {
    if (!this.resizingTagId || !this.resizingEdge) return;
    const animation = this.resizeContext.animation;

    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frameWidth = 32;
    const frameIndex = Math.floor(x / frameWidth);

    const maxFrameIndex = animation.frames.value.length - 1;
    const clampedIndex = Math.max(0, Math.min(maxFrameIndex, frameIndex));

    this.resizePreviewIndex = clampedIndex;

    const tag = animation.tags.value.find((t) => t.id === this.resizingTagId);
    if (tag) {
      const previewStart =
        this.resizingEdge === 'left'
          ? Math.min(clampedIndex, tag.endFrameIndex)
          : tag.startFrameIndex;
      const previewEnd =
        this.resizingEdge === 'right'
          ? Math.max(clampedIndex, tag.startFrameIndex)
          : tag.endFrameIndex;
      animation.setTagResizePreview(this.resizingTagId, previewStart, previewEnd);

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
      const animation = this.resizeContext.animation;
      const tag = animation.tags.value.find((t) => t.id === this.resizingTagId);
      if (tag) {
        if (this.resizingEdge === 'left') {
          const newStart = Math.min(this.resizePreviewIndex, tag.endFrameIndex);
          if (newStart !== tag.startFrameIndex) {
            animation.updateFrameTag(this.resizingTagId, {
              startFrameIndex: newStart,
            });
          }
        } else {
          const newEnd = Math.max(this.resizePreviewIndex, tag.startFrameIndex);
          if (newEnd !== tag.endFrameIndex) {
            animation.updateFrameTag(this.resizingTagId, {
              endFrameIndex: newEnd,
            });
          }
        }
      }
    }

    this.resizeContext.animation.setTagResizePreview(null);
    this.resizingTagId = null;
    this.resizingEdge = null;
    this.resizePreviewIndex = null;

    if (this.resizePreview) {
      this.resizePreview.tagId = null;
      this.resizePreview.edge = null;
      this.resizePreview.previewIndex = null;
      this.resizePreview.hide();
    }

    window.removeEventListener('mousemove', this.handleTagResizeMove);
    window.removeEventListener('mouseup', this.handleTagResizeEnd);
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
