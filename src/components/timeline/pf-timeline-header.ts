import { html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { animationStore } from '../../stores/animation';
import { historyStore } from '../../stores/history';
import { projectStore } from '../../stores/project';
import { SetFrameDurationCommand, ReorderFrameCommand, AddFrameCommand, DeleteFrameCommand } from '../../commands/animation-commands';
import { compositeFrame } from '../../utils/canvas-utils';
import './pf-timeline-tooltip';
import './pf-tag-preview';
import '../ui/pf-context-menu';
import type { PFTimelineTooltip } from './pf-timeline-tooltip';
import type { PFTagPreview } from './pf-tag-preview';
import type { PFContextMenu, ContextMenuItem } from '../ui/pf-context-menu';
import type { FrameTag } from '../../types/animation';

const DURATION_UNIT_KEY = 'pf-timeline-duration-unit';
const TAG_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e91e63', '#00bcd4', '#ff5722', '#607d8b', '#795548', '#8bc34a'];

@customElement('pf-timeline-header')
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
      content: '';
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

    /* Tag container - hybrid rounded bar style */
    .tag-bars-container {
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

    /* Hybrid rounded bar tag */
    .tag-bar {
      position: absolute;
      height: 16px;
      min-width: 64px; /* At least 2 cells wide for readability */
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
      box-shadow: 0 0 0 2px var(--pf-color-accent), 0 0 8px var(--pf-color-accent);
    }

    .tag-bar.resizing {
      opacity: 0.7;
    }

    /* Chevron for collapsing individual tags */
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

    /* Tag label */
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

    /* Drag handles for resizing tags */
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

    /* Collapsed tag (single column) */
    .tag-bar.collapsed {
      min-width: 32px;
      justify-content: center;
    }

    /* Hide drag handles on collapsed tags */
    .tag-bar.collapsed .tag-drag-handle {
      display: none;
    }
  `;

  @state() private durationUnit: 'ms' | 'fps' = 'ms';
  @state() private draggedFrameIndex: number | null = null;
  @state() private dragOverFrameIndex: number | null = null;
  @state() private pendingTagName: string = '';
  @state() private pendingTagColor: string = '';
  @state() private pendingTagFrameIndex: number = -1;
  // Tag resize state
  @state() private resizingTagId: string | null = null;
  @state() private resizingEdge: 'left' | 'right' | null = null;
  @state() private resizePreviewIndex: number | null = null;
  // Hover preview state
  @state() private hoverPreviewTagId: string | null = null;

  // Store anchor element for submenus
  private menuAnchorElement: HTMLElement | null = null;

  @query('pf-timeline-tooltip') private tooltip!: PFTimelineTooltip;
  @query('pf-context-menu') private contextMenu!: PFContextMenu;
  @query('pf-tag-preview') private tagPreview!: PFTagPreview;

  connectedCallback() {
    super.connectedCallback();
    // Load saved preference
    const saved = localStorage.getItem(DURATION_UNIT_KEY);
    if (saved === 'fps' || saved === 'ms') {
      this.durationUnit = saved;
    }
    // Set initial collapsed class
    this.updateTagsCollapsedClass();
  }

  protected updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    // Update collapsed class when tagsExpanded changes
    this.updateTagsCollapsedClass();
  }

  private updateTagsCollapsedClass() {
    const tagsExpanded = animationStore.tagsExpanded.value;
    this.classList.toggle('tags-collapsed', !tagsExpanded);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up any resize listeners
    window.removeEventListener('mousemove', this.handleTagResizeMove);
    window.removeEventListener('mouseup', this.handleTagResizeEnd);
  }

  private handleFrameMouseEnter(e: MouseEvent, frameId: string, frameIndex: number) {
    const target = e.currentTarget as HTMLElement;
    const frame = animationStore.frames.value.find(f => f.id === frameId);
    if (!frame || !this.tooltip) return;

    // Update tooltip text
    const durationText = this.durationUnit === 'fps'
      ? `${Math.round(1000 / frame.duration)}fps`
      : `${frame.duration}ms`;
    const tags = animationStore.getTagsForFrame(frameIndex);
    const tagText = tags.length > 0 ? tags.map(t => t.name).join(', ') : '';

    this.tooltip.primaryText = `Frame ${frameIndex + 1} · ${durationText}`;
    this.tooltip.secondaryText = tagText;
    this.tooltip.canvasWidth = projectStore.width.value;
    this.tooltip.canvasHeight = projectStore.height.value;

    // Render the frame preview
    this.tooltip.show(target);
    requestAnimationFrame(() => {
      const ctx = this.tooltip.getContext();
      if (ctx) {
        compositeFrame(frameId, ctx);
      }
    });
  }

  private handleFrameMouseLeave() {
    if (this.tooltip) {
      this.tooltip.hide();
    }
  }

  // Frame drag-and-drop handlers
  private handleFrameDragStart(index: number, e: DragEvent) {
    this.draggedFrameIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
    // Hide tooltip during drag
    if (this.tooltip) {
      this.tooltip.hide(0);
    }
  }

  private handleFrameDragEnd() {
    this.draggedFrameIndex = null;
    this.dragOverFrameIndex = null;
  }

  private handleFrameDragOver(index: number, e: DragEvent) {
    e.preventDefault();
    if (this.draggedFrameIndex !== null && this.draggedFrameIndex !== index) {
      this.dragOverFrameIndex = index;
    }
  }

  private handleFrameDragLeave() {
    this.dragOverFrameIndex = null;
  }

  private handleFrameDrop(targetIndex: number, e: DragEvent) {
    e.preventDefault();
    if (this.draggedFrameIndex === null || this.draggedFrameIndex === targetIndex) return;

    // Use command for undo support
    historyStore.execute(new ReorderFrameCommand(this.draggedFrameIndex, targetIndex));

    this.draggedFrameIndex = null;
    this.dragOverFrameIndex = null;
  }

  private getDragOverClass(index: number): string {
    if (this.dragOverFrameIndex === null || this.draggedFrameIndex === null) return '';
    if (this.dragOverFrameIndex !== index) return '';

    // Show indicator on left or right side depending on drag direction
    return this.draggedFrameIndex < index ? 'drag-over-right' : 'drag-over-left';
  }

  private handleTagClick(tagId: string, e: MouseEvent) {
    e.stopPropagation();
    // Don't process click if we were resizing
    if (this.resizingTagId) return;

    const currentActiveTag = animationStore.activeTagId.value;

    if (currentActiveTag === tagId) {
      // Click on active tag clears the loop
      animationStore.setPlaybackMode('all');
    } else {
      // Click on tag sets it as the loop target
      animationStore.setPlaybackMode('tag', tagId);
    }
  }

  // Tag resize handlers
  private handleTagResizeStart(tagId: string, edge: 'left' | 'right', e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    this.resizingTagId = tagId;
    this.resizingEdge = edge;

    // Add listeners for mousemove and mouseup
    window.addEventListener('mousemove', this.handleTagResizeMove);
    window.addEventListener('mouseup', this.handleTagResizeEnd);
  }

  private handleTagResizeMove = (e: MouseEvent) => {
    if (!this.resizingTagId || !this.resizingEdge) return;

    // Calculate which frame the mouse is over
    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frameWidth = 32;
    const frameIndex = Math.floor(x / frameWidth);

    // Clamp to valid range
    const maxFrameIndex = animationStore.frames.value.length - 1;
    const clampedIndex = Math.max(0, Math.min(maxFrameIndex, frameIndex));

    this.resizePreviewIndex = clampedIndex;
  };

  private handleTagResizeEnd = () => {
    if (this.resizingTagId && this.resizingEdge && this.resizePreviewIndex !== null) {
      const tag = animationStore.tags.value.find(t => t.id === this.resizingTagId);
      if (tag) {
        if (this.resizingEdge === 'left') {
          // Don't allow left edge to go past right edge
          const newStart = Math.min(this.resizePreviewIndex, tag.endFrameIndex);
          if (newStart !== tag.startFrameIndex) {
            animationStore.updateFrameTag(this.resizingTagId, { startFrameIndex: newStart });
          }
        } else {
          // Don't allow right edge to go past left edge
          const newEnd = Math.max(this.resizePreviewIndex, tag.startFrameIndex);
          if (newEnd !== tag.endFrameIndex) {
            animationStore.updateFrameTag(this.resizingTagId, { endFrameIndex: newEnd });
          }
        }
      }
    }

    // Clean up
    this.resizingTagId = null;
    this.resizingEdge = null;
    this.resizePreviewIndex = null;
    window.removeEventListener('mousemove', this.handleTagResizeMove);
    window.removeEventListener('mouseup', this.handleTagResizeEnd);
  };

  private handleTagContextMenu(tagId: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const tag = animationStore.tags.value.find(t => t.id === tagId);
    if (!tag) return;

    const isActiveLoop = animationStore.activeTagId.value === tagId;
    const anchor = e.currentTarget as HTMLElement;
    this.menuAnchorElement = anchor;
    const totalFrames = animationStore.frames.value.length;

    const items: ContextMenuItem[] = [
      {
        type: 'input',
        label: 'Tag Name',
        inputValue: tag.name,
        placeholder: 'Enter tag name',
        onInputSubmit: (name: string) => {
          if (name.trim()) {
            animationStore.updateFrameTag(tagId, { name: name.trim() });
          }
        }
      },
      {
        type: 'color-picker',
        label: 'Tag Color',
        colors: TAG_COLORS,
        selectedColor: tag.color,
        onColorSelect: (color: string) => {
          animationStore.updateFrameTag(tagId, { color });
        }
      },
      { type: 'divider' },
      // Range inputs (1-indexed for display)
      {
        type: 'input',
        inputType: 'number',
        label: 'Start Frame',
        inputValue: String(tag.startFrameIndex + 1),
        inputMin: 1,
        inputMax: totalFrames,
        onNumberChange: (value: number) => {
          const newStart = value - 1; // Convert to 0-indexed
          if (newStart >= 0 && newStart <= tag.endFrameIndex) {
            animationStore.updateFrameTag(tagId, { startFrameIndex: newStart });
          }
        }
      },
      {
        type: 'input',
        inputType: 'number',
        label: 'End Frame',
        inputValue: String(tag.endFrameIndex + 1),
        inputMin: 1,
        inputMax: totalFrames,
        onNumberChange: (value: number) => {
          const newEnd = value - 1; // Convert to 0-indexed
          if (newEnd >= tag.startFrameIndex && newEnd < totalFrames) {
            animationStore.updateFrameTag(tagId, { endFrameIndex: newEnd });
          }
        }
      },
      { type: 'divider' },
      {
        type: 'item',
        label: isActiveLoop ? '⏹ Stop Loop' : '🔁 Loop This Tag',
        action: () => {
          if (isActiveLoop) {
            animationStore.setPlaybackMode('all');
          } else {
            animationStore.setPlaybackMode('tag', tagId);
          }
        }
      },
      { type: 'divider' },
      {
        type: 'item',
        label: '🗑 Delete Tag',
        action: () => animationStore.removeFrameTag(tagId)
      }
    ];

    this.contextMenu.show(anchor, items);
  }

  /** Set duration unit - called externally from playback controls */
  setDurationUnit(unit: 'ms' | 'fps') {
    this.durationUnit = unit;
    localStorage.setItem(DURATION_UNIT_KEY, unit);
  }

  selectFrame(frameId: string) {
    animationStore.goToFrame(frameId);
  }

  handleContextMenu(e: MouseEvent, frameId: string) {
    e.preventDefault();
    const frames = animationStore.frames.value;
    const frameIndex = frames.findIndex(f => f.id === frameId);
    if (frameIndex === -1) return;

    const frame = frames[frameIndex];
    const anchor = e.currentTarget as HTMLElement;
    this.menuAnchorElement = anchor;

    // Check if this frame is already in a tag
    const existingTags = animationStore.getTagsForFrame(frameIndex);

    // Store original duration for undo
    const originalDuration = frame.duration;

    const items: ContextMenuItem[] = [
      // Duration slider
      {
        type: 'slider',
        label: this.durationUnit === 'fps' ? 'Frame Rate (FPS)' : 'Duration',
        min: this.durationUnit === 'fps' ? 1 : 10,
        max: this.durationUnit === 'fps' ? 60 : 2000,
        step: this.durationUnit === 'fps' ? 1 : 10,
        value: this.durationUnit === 'fps' ? Math.round(1000 / frame.duration) : frame.duration,
        // Live preview - directly update frame duration without history
        onSliderChange: (value: number) => {
          const durationMs = this.durationUnit === 'fps' ? Math.round(1000 / value) : value;
          animationStore.setFrameDuration(frameId, durationMs);
        },
        // Commit on release - add to history for undo support
        onSliderCommit: (value: number) => {
          const durationMs = this.durationUnit === 'fps' ? Math.round(1000 / value) : value;
          // Only add to history if value actually changed
          if (durationMs !== originalDuration) {
            historyStore.execute(new SetFrameDurationCommand(frameId, durationMs, originalDuration));
          }
        }
      },
      { type: 'divider' },
      // Frame operations
      {
        type: 'item',
        label: '📋 Duplicate Frame',
        action: () => {
          // Pass the frameId directly to avoid signal timing issues
          historyStore.execute(new AddFrameCommand(true, frameId));
        }
      },
      {
        type: 'item',
        label: '🗑 Delete Frame',
        disabled: frames.length <= 1,
        action: () => {
          historyStore.execute(new DeleteFrameCommand(frameId));
        }
      },
      { type: 'divider' }
    ];

    // Tag options
    if (existingTags.length > 0) {
      const tag = existingTags[0];
      items.push(
        {
          type: 'item',
          label: `✏️ Edit Tag "${tag.name}"`,
          keepOpen: true,
          action: () => {
            // Show tag edit menu (reuse same anchor)
            setTimeout(() => this.showTagEditMenu(tag.id), 50);
          }
        },
        {
          type: 'item',
          label: '🏷️ Remove from Tag',
          action: () => {
            // If tag spans only this frame, delete it. Otherwise shrink it.
            if (tag.startFrameIndex === tag.endFrameIndex) {
              animationStore.removeFrameTag(tag.id);
            } else if (frameIndex === tag.startFrameIndex) {
              animationStore.updateFrameTag(tag.id, { startFrameIndex: tag.startFrameIndex + 1 });
            } else if (frameIndex === tag.endFrameIndex) {
              animationStore.updateFrameTag(tag.id, { endFrameIndex: tag.endFrameIndex - 1 });
            }
          }
        }
      );
    } else {
      items.push({
        type: 'item',
        label: '🏷️ Add Tag',
        keepOpen: true,
        action: () => {
          // Show add tag submenu (reuse same anchor)
          setTimeout(() => this.showAddTagMenu(frameIndex), 50);
        }
      });
    }

    this.contextMenu.show(anchor, items);
  }

  private showTagEditMenu(tagId: string) {
    const tag = animationStore.tags.value.find(t => t.id === tagId);
    if (!tag || !this.menuAnchorElement) return;

    const items: ContextMenuItem[] = [
      {
        type: 'input',
        label: 'Tag Name',
        inputValue: tag.name,
        placeholder: 'Enter tag name',
        onInputSubmit: (name: string) => {
          if (name.trim()) {
            animationStore.updateFrameTag(tagId, { name: name.trim() });
          }
        }
      },
      {
        type: 'color-picker',
        label: 'Tag Color',
        colors: TAG_COLORS,
        selectedColor: tag.color,
        onColorSelect: (color: string) => {
          animationStore.updateFrameTag(tagId, { color });
        }
      },
      { type: 'divider' },
      {
        type: 'item',
        label: '🗑 Delete Tag',
        action: () => animationStore.removeFrameTag(tagId)
      }
    ];

    this.contextMenu.show(this.menuAnchorElement, items);
  }

  private showAddTagMenu(frameIndex: number) {
    if (!this.menuAnchorElement) return;

    // Initialize pending state with defaults
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
        }
      },
      {
        type: 'color-picker',
        label: 'Tag Color',
        colors: TAG_COLORS,
        selectedColor: TAG_COLORS[0],
        onColorSelect: (color: string) => {
          this.pendingTagColor = color;
        }
      },
      { type: 'divider' },
      {
        type: 'item',
        label: '✓ Create Tag',
        action: () => {
          const name = this.pendingTagName.trim() || 'New Tag';
          animationStore.addFrameTag(name, this.pendingTagColor, this.pendingTagFrameIndex, this.pendingTagFrameIndex);
          // Reset pending state
          this.pendingTagName = '';
          this.pendingTagColor = '';
          this.pendingTagFrameIndex = -1;
        }
      }
    ];

    this.contextMenu.show(this.menuAnchorElement, items);
  }

  private handleToggleTagsExpanded() {
    animationStore.toggleTagsExpanded();
  }

  private handleTagChevronClick(tagId: string, e: MouseEvent) {
    e.stopPropagation();
    animationStore.toggleTagCollapsed(tagId);
  }

  private handleCollapsedTagMouseEnter(tag: FrameTag, e: MouseEvent) {
    if (!tag.collapsed) return;

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    // Show preview with delay
    if (this.tagPreview) {
      this.tagPreview.showWithDelay(tag.id, rect.left + rect.width / 2, rect.top);
    }
    this.hoverPreviewTagId = tag.id;
  }

  private handleCollapsedTagMouseLeave() {
    if (this.tagPreview) {
      this.tagPreview.hide();
    }
    this.hoverPreviewTagId = null;
  }

  private handleCollapsedTagClick(tag: FrameTag, e: MouseEvent) {
    e.stopPropagation();
    // If clicking on the tag bar (not chevron), expand it
    const target = e.target as HTMLElement;
    if (!target.classList.contains('tag-chevron')) {
      animationStore.toggleTagCollapsed(tag.id);
    }
  }

  /**
   * Calculate positions for tags, accounting for collapsed tags.
   * Returns a map of tagId -> { left, width, effectiveStartIndex }
   */
  private calculateTagPositions(tags: FrameTag[], frameWidth: number): Map<string, { left: number; width: number; visualStartIndex: number }> {
    const positions = new Map<string, { left: number; width: number; visualStartIndex: number }>();

    // Sort tags by start index
    const sortedTags = [...tags].sort((a, b) => a.startFrameIndex - b.startFrameIndex);

    let visualOffset = 0;

    for (const tag of sortedTags) {
      if (tag.collapsed) {
        // Collapsed tag takes 1 column
        const left = (tag.startFrameIndex + visualOffset) * frameWidth;
        positions.set(tag.id, { left, width: frameWidth, visualStartIndex: tag.startFrameIndex + visualOffset });
        // Next tags shift left by the collapsed frames (minus 1 for the collapsed column)
        visualOffset -= (tag.endFrameIndex - tag.startFrameIndex);
      } else {
        // Expanded tag spans its full range
        const left = (tag.startFrameIndex + visualOffset) * frameWidth;
        const width = (tag.endFrameIndex - tag.startFrameIndex + 1) * frameWidth;
        positions.set(tag.id, { left, width, visualStartIndex: tag.startFrameIndex + visualOffset });
      }
    }

    return positions;
  }

  private renderTags(tags: FrameTag[], activeTagId: string | null, frameWidth: number) {
    // Calculate visual positions accounting for collapsed tags
    const positions = this.calculateTagPositions(tags, frameWidth);

    return tags.map(tag => {
      const isActiveLoop = tag.id === activeTagId;
      const isResizing = this.resizingTagId === tag.id;
      const frameCount = tag.endFrameIndex - tag.startFrameIndex + 1;

      // Get calculated position (accounts for collapsed tags shifting positions)
      const pos = positions.get(tag.id);
      const left = pos?.left ?? tag.startFrameIndex * frameWidth;
      const width = tag.collapsed ? frameWidth : frameCount * frameWidth;

      // Label: show count when collapsed
      const label = tag.collapsed ? `${tag.name} (${frameCount})` : tag.name;

      return html`
        <div
          class="tag-bar ${isActiveLoop ? 'active-loop' : ''} ${isResizing ? 'resizing' : ''} ${tag.collapsed ? 'collapsed' : ''}"
          style="left: ${left}px; width: ${width}px; background-color: ${tag.color};"
          @click=${(e: MouseEvent) => tag.collapsed ? this.handleCollapsedTagClick(tag, e) : this.handleTagClick(tag.id, e)}
          @contextmenu=${(e: MouseEvent) => this.handleTagContextMenu(tag.id, e)}
          @mouseenter=${(e: MouseEvent) => this.handleCollapsedTagMouseEnter(tag, e)}
          @mouseleave=${this.handleCollapsedTagMouseLeave}
          title="${tag.name}${isActiveLoop ? ' (looping)' : ''}${tag.collapsed ? ' - Click to expand' : ''}"
        >
          <span
            class="tag-chevron"
            @click=${(e: MouseEvent) => this.handleTagChevronClick(tag.id, e)}
            title="${tag.collapsed ? 'Expand' : 'Collapse'}"
          >
            ▼
          </span>
          <span class="tag-label">${label}</span>
          ${!tag.collapsed ? html`
            <div
              class="tag-drag-handle left"
              @mousedown=${(e: MouseEvent) => this.handleTagResizeStart(tag.id, 'left', e)}
            ></div>
            <div
              class="tag-drag-handle right"
              @mousedown=${(e: MouseEvent) => this.handleTagResizeStart(tag.id, 'right', e)}
            ></div>
          ` : ''}
        </div>
      `;
    });
  }

  /**
   * Check if a frame index is hidden (inside a collapsed tag but not the first frame).
   */
  private isFrameHidden(frameIndex: number, tags: FrameTag[]): boolean {
    for (const tag of tags) {
      if (tag.collapsed && frameIndex > tag.startFrameIndex && frameIndex <= tag.endFrameIndex) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the tag color for a frame index (for column tinting).
   * Returns null if frame is not in any tag.
   */
  private getTagColorForFrame(frameIndex: number, tags: FrameTag[]): string | null {
    for (const tag of tags) {
      if (frameIndex >= tag.startFrameIndex && frameIndex <= tag.endFrameIndex) {
        return tag.color;
      }
    }
    return null;
  }

  render() {
    const frames = animationStore.frames.value;
    const currentFrameId = animationStore.currentFrameId.value;
    const tags = animationStore.tags.value;
    const activeTagId = animationStore.activeTagId.value;
    const frameWidth = 32; // Must match .frame-cell width

    return html`
      <!-- Tag container -->
      <div class="tag-bars-container">
        ${this.renderTags(tags, activeTagId, frameWidth)}
      </div>

      <!-- Frame cells -->
      ${frames.map((frame, index) => {
        // Skip frames that are hidden (inside collapsed tags)
        if (this.isFrameHidden(index, tags)) {
          return '';
        }

        const isDragging = this.draggedFrameIndex === index;
        const dragOverClass = this.getDragOverClass(index);
        const tagColor = this.getTagColorForFrame(index, tags);
        const hasTint = tagColor !== null;

        return html`
          <div
            class="frame-cell ${frame.id === currentFrameId ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${dragOverClass} ${hasTint ? 'tag-tinted' : ''}"
            style="${hasTint ? `--tag-tint-color: ${tagColor}` : ''}"
            @click=${() => this.selectFrame(frame.id)}
            @contextmenu=${(e: MouseEvent) => this.handleContextMenu(e, frame.id)}
            @mouseenter=${(e: MouseEvent) => this.handleFrameMouseEnter(e, frame.id, index)}
            @mouseleave=${this.handleFrameMouseLeave}
            draggable="true"
            @dragstart=${(e: DragEvent) => this.handleFrameDragStart(index, e)}
            @dragend=${this.handleFrameDragEnd}
            @dragover=${(e: DragEvent) => this.handleFrameDragOver(index, e)}
            @dragleave=${this.handleFrameDragLeave}
            @drop=${(e: DragEvent) => this.handleFrameDrop(index, e)}
          >
            <span class="frame-number">${index + 1}</span>
          </div>
        `;
      })}
      <pf-timeline-tooltip></pf-timeline-tooltip>
      <pf-context-menu></pf-context-menu>
      <pf-tag-preview></pf-tag-preview>
    `;
  }
}
