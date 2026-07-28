import { html, css } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { defaultProjectContext } from '../../stores/project-context';
import { AddLayerCommand, RemoveLayerCommand } from '../../commands/layer-commands';
import { scrollbarStyles } from '../../styles/scrollbar-styles';
import './pf-playback-controls';
import './pf-onion-skin-controls';
import './pf-timeline-header';
import './pf-timeline-layers';
import './pf-timeline-grid';
import type { PFTimelineHeader } from './pf-timeline-header';

@customElement('pf-timeline')
export class PFTimeline extends BaseComponent {
  static styles = css`
    ${scrollbarStyles}

    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: linear-gradient(180deg, rgba(15, 18, 24, 0.94), rgba(8, 10, 14, 0.96));
      border-top: 1px solid var(--pf-color-border);
      overflow: hidden;
      color: var(--pf-color-text-secondary);
    }

    .controls-area {
      display: flex;
      align-items: center;
      padding: 7px 10px;
      border-bottom: 1px solid var(--pf-color-border);
      background: rgba(255, 255, 255, 0.025);
      flex-shrink: 0;
    }

    /* Header row: layer toolbar + frame numbers */
    .header-row {
      display: flex;
      flex-shrink: 0;
      border-bottom: 1px solid var(--pf-color-border);
      background: rgba(255, 255, 255, 0.018);
    }

    .layers-toolbar {
      width: 200px;
      display: flex;
      gap: 2px;
      padding: 4px;
      border-right: 1px solid var(--pf-color-border);
      box-sizing: border-box;
    }

    .layers-toolbar button {
      background: var(--pf-color-bg-input);
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
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

    .layers-toolbar button:hover:not(:disabled) {
      background: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
      border-color: var(--pf-color-border-strong);
    }

    .layers-toolbar button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .header-frames {
      flex: 1;
      overflow-x: scroll;
      overflow-y: hidden;
      /* Hide scrollbar but keep scrollability */
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE/Edge */
    }

    .header-frames::-webkit-scrollbar {
      display: none; /* Chrome/Safari/Opera */
    }

    /* Scroll container for synchronized scrolling */
    .scroll-container {
      flex: 1;
      min-height: 0; /* Allow shrinking below content size for proper overflow */
      display: flex;
      overflow: auto;
      background:
        linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px) 0 0 / 32px 32px,
        var(--pf-color-bg-dark);

    }

    .layers-column {
      width: 200px;
      flex-shrink: 0;
      border-right: 1px solid var(--pf-color-border);
      background-color: rgba(10, 13, 18, 0.66);
    }

    .grid-column {
      flex: 1;
      min-width: 0;
    }

    /* Grab-to-pan cursor states */
    .scroll-container.can-pan {
      cursor: grab;
    }

    .scroll-container.panning {
      cursor: grabbing;
      user-select: none;
    }
  `;

  @query('.scroll-container') scrollContainer!: HTMLElement;
  @query('.header-frames') headerFrames!: HTMLElement;
  @query('pf-timeline-header') timelineHeader!: PFTimelineHeader;

  // Pan state
  @state() private isPanning = false;
  private isPotentialPan = false; // Mousedown occurred, waiting to see if it's a pan or click
  private panStartX = 0;
  private panStartY = 0;
  private scrollStartX = 0;
  private scrollStartY = 0;
  private static readonly PAN_THRESHOLD = 3; // Pixels of movement before pan starts
  private context = defaultProjectContext;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.requestUpdate();
    });
    // Add global listeners for pan end (in case mouse leaves component)
    window.addEventListener('mouseup', this.handlePanEnd);
    window.addEventListener('mousemove', this.handlePanMove);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mouseup', this.handlePanEnd);
    window.removeEventListener('mousemove', this.handlePanMove);
  }

  private handlePanStart = (e: MouseEvent) => {
    // Only pan with left mouse button
    if (e.button !== 0) return;

    // Mark potential pan start - actual panning starts when threshold is exceeded
    this.isPotentialPan = true;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
    this.scrollStartX = this.scrollContainer?.scrollLeft ?? 0;
    this.scrollStartY = this.scrollContainer?.scrollTop ?? 0;
  };

  private handlePanMove = (e: MouseEvent) => {
    if (!this.isPotentialPan || !this.scrollContainer) return;

    const deltaX = e.clientX - this.panStartX;
    const deltaY = e.clientY - this.panStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Start panning if threshold exceeded
    if (!this.isPanning && distance >= PFTimeline.PAN_THRESHOLD) {
      this.isPanning = true;
    }

    if (this.isPanning) {
      // Scroll in opposite direction of mouse movement (like grabbing and dragging)
      this.scrollContainer.scrollLeft = this.scrollStartX - deltaX;
      this.scrollContainer.scrollTop = this.scrollStartY - deltaY;
    }
  };

  private handlePanEnd = () => {
    this.isPotentialPan = false;
    this.isPanning = false;
  };

  private handleWheel = (e: WheelEvent) => {
    if (!this.scrollContainer) return;

    // Prevent the wheel event from bubbling to the canvas viewport
    e.stopPropagation();

    // Determine scroll direction
    // deltaX: horizontal scroll (from trackpad or horizontal wheel)
    // deltaY: vertical scroll (from regular wheel)
    // Shift+wheel: treat vertical as horizontal

    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Horizontal scroll
      const delta = e.shiftKey ? e.deltaY : e.deltaX;
      this.scrollContainer.scrollLeft += delta;
    } else {
      // Vertical scroll (scroll through layers)
      this.scrollContainer.scrollTop += e.deltaY;
    }

    e.preventDefault();
  };

  private handleUnitChange = (e: CustomEvent<{ unit: 'ms' | 'fps' }>) => {
    if (this.timelineHeader) {
      this.timelineHeader.setDurationUnit(e.detail.unit);
    }
  };

  private addLayer() {
    if (this.context.guidedDrawing.active) return;
    void this.context.history.execute(new AddLayerCommand(this.context));
  }

  private deleteLayer() {
    if (this.context.guidedDrawing.active) return;
    const activeId = this.context.layers.activeLayerId.value;
    if (activeId && this.context.layers.layers.value.length > 1) {
      void this.context.history.execute(new RemoveLayerCommand(activeId, this.context));
    }
  }

  private moveLayer(direction: 'up' | 'down') {
    if (this.context.guidedDrawing.active) return;
    const activeId = this.context.layers.activeLayerId.value;
    if (activeId) {
      this.context.layers.reorderLayer(activeId, direction);
    }
  }

  private handleScroll = () => {
    // Sync horizontal scroll to timeline header
    // Using scrollLeft on the scrollable .header-frames container (not transform)
    // This avoids creating a new containing block that breaks fixed positioning
    if (this.scrollContainer && this.headerFrames) {
      this.headerFrames.scrollLeft = this.scrollContainer.scrollLeft;
    }
  };

  render() {
    // Access signals for reactivity
    const layerStore = this.context.layers;
    const layers = layerStore.layers.value;
    const activeLayerId = layerStore.activeLayerId.value;
    const canDelete = layers.length > 1;

    // Check if we can move up/down
    const activeIndex = layers.findIndex((l) => l.id === activeLayerId);
    const canMoveUp = activeIndex < layers.length - 1;
    const canMoveDown = activeIndex > 0;
    const guidedProject = this.context.guidedDrawing.active;

    return html`
      <div class="controls-area">
        <pf-playback-controls @unit-change=${this.handleUnitChange}></pf-playback-controls>
        <pf-onion-skin-controls></pf-onion-skin-controls>
      </div>
      <div class="header-row">
        <div class="layers-toolbar">
          <button
            @click=${this.addLayer}
            title=${guidedProject ? 'Guided projects keep one painting layer' : 'Add Layer'}
            ?disabled=${guidedProject}
          >+</button>
          <button
            @click=${this.deleteLayer}
            title=${guidedProject ? 'Guided projects keep one painting layer' : 'Delete Layer'}
            ?disabled=${guidedProject || !canDelete}
          >-</button>
          <button
            @click=${() => this.moveLayer('up')}
            title=${guidedProject ? 'Guided projects keep the painting layer fixed' : 'Move Up'}
            ?disabled=${guidedProject || !canMoveUp}
          >
            ↑
          </button>
          <button
            @click=${() => this.moveLayer('down')}
            title=${guidedProject ? 'Guided projects keep the painting layer fixed' : 'Move Down'}
            ?disabled=${guidedProject || !canMoveDown}
          >
            ↓
          </button>
        </div>
        <div class="header-frames">
          <pf-timeline-header></pf-timeline-header>
        </div>
      </div>
      <div
        class="scroll-container can-pan ${this.isPanning ? 'panning' : ''}"
        data-scrollbar="both"
        @scroll=${this.handleScroll}
        @mousedown=${this.handlePanStart}
        @wheel=${this.handleWheel}
      >
        <div class="layers-column">
          <pf-timeline-layers></pf-timeline-layers>
        </div>
        <div class="grid-column">
          <pf-timeline-grid></pf-timeline-grid>
        </div>
      </div>
    `;
  }
}
